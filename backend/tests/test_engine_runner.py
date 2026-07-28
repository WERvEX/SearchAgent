import asyncio

import pytest


class _FakeRunnerLLM:
    def bind_tools(self, tools):
        return self

    def invoke(self, prompt):
        class _R:
            tool_calls = []

        r = _R()
        text = str(prompt).lower()
        if "use the available tools" in text:
            r.content = ""
            r.tool_calls = [{"name": "search_web", "args": {"query": "renewable energy"}}]
        elif "plan" in text:
            r.content = (
                '{"summary": "计划摘要", "options": [{"id": "A", "label": "全面"}, '
                '{"id": "B", "label": "聚焦"}]}'
            )
        elif "steps" in text:
            r.content = '[{"seq": 1, "title": "搜索", "description": "d", "status": "pending"}]'
        else:
            r.content = "OBJECTIVE: 可再生能源趋势"
        return r


class _ClarifyingRunnerLLM:
    def bind_tools(self, tools):
        return self

    def invoke(self, prompt):
        class _R:
            tool_calls = []

        r = _R()
        text = str(prompt)
        if "Clarify" in text:
            r.content = "请说明要研究的地区和时间范围。" if "中国，2024 年" not in text else "OBJECTIVE: 中国 2024 年可再生能源趋势"
        elif "plan" in text.lower():
            r.content = '{"summary": "计划摘要", "options": [{"id": "A", "label": "全面"}]}'
        elif "steps" in text.lower():
            r.content = '[{"seq": 1, "title": "搜索", "description": "d", "status": "pending"}]'
        else:
            r.content = "ok"
        return r


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    app_home.mkdir(parents=True, exist_ok=True)
    engine = db.init_db(f"sqlite:///{(app_home / 'runner-test.db').as_posix()}")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_start_and_resume_research_runs_to_report_and_publishes_lifecycle_events(session, monkeypatch):
    from sqlalchemy import select

    from app.db.models import Conversation, Message, Report, ResearchProject
    from app.engine.runner import resume_research, start_research
    from app.engine import nodes, runner
    from app.core.events import EventBus
    from app.tools import registry

    bus = EventBus()
    monkeypatch.setattr(runner, "get_event_bus", lambda: bus)
    monkeypatch.setattr(nodes, "get_event_bus", lambda: bus)

    class _FakeSearchTool:
        name = "search_web"

        def invoke(self, args):
            return [{"title": "Source", "url": "https://example.com", "snippet": "Evidence"}]

    async def fake_get_research_tools(_session):
        return {"tools": [_FakeSearchTool()], "errors": []}

    monkeypatch.setattr(registry, "get_research_tools", fake_get_research_tools)

    conv = Conversation(title="c")
    session.add(conv)
    session.commit()

    started = asyncio.run(
        start_research(
            session,
            conversation_id=conv.id,
            profile_id=1,
            user_message="研究可再生能源趋势",
            llm_factory=lambda: _FakeRunnerLLM(),
        )
    )

    assert started["thread_id"]
    assert started["interrupted"] is True
    assert started["interrupt_payload"]["plan"]["summary"] == "计划摘要"

    messages = session.scalars(select(Message).order_by(Message.id)).all()
    projects = session.scalars(select(ResearchProject).order_by(ResearchProject.id)).all()
    assert messages[0].content == "研究可再生能源趋势"
    assert projects[0].status == "awaiting_execution"

    resumed = asyncio.run(
        resume_research(
            session,
            thread_id=started["thread_id"],
            decision={"approved": True, "chosen_option": "A"},
            profile_id=1,
            llm_factory=lambda: _FakeRunnerLLM(),
        )
    )

    assert resumed["interrupted"] is False
    assert resumed["state"]["approved"] is True
    assert isinstance(resumed["state"]["report_id"], int)
    assert resumed["state"]["report_md"].startswith("# 研究报告")

    session.refresh(projects[0])
    session.refresh(conv)
    reports = session.scalars(select(Report).order_by(Report.id)).all()
    assert projects[0].status == "done"
    assert conv.status == "completed"
    assert len(reports) == 1
    assert reports[0].id == resumed["state"]["report_id"]

    subscriber = bus.subscribe(replay_limit=20)
    events = list(bus._history)
    event_types = [event["type"] for event in events]
    assert event_types[0] == "research.started"
    assert "research.plan_ready" in event_types
    assert "research.execution_started" in event_types
    assert "research.step_started" in event_types
    assert "research.step_completed" in event_types
    assert "research.tool_started" in event_types
    assert "research.source_collected" in event_types
    assert "research.tool_completed" in event_types
    assert event_types[-1] == "research.completed"
    assert all(event["data"]["thread_id"] == started["thread_id"] for event in events)
    assert next(event for event in events if event["type"] == "research.report_ready")["data"]["report_id"] == resumed["state"]["report_id"]


def test_replan_interrupts_again_without_generating_a_report(session):
    from sqlalchemy import select

    from app.db.models import Conversation, Report, ResearchProject
    from app.engine.runner import resume_research, start_research

    conv = Conversation(title="c")
    session.add(conv)
    session.commit()

    started = asyncio.run(
        start_research(
            session,
            conversation_id=conv.id,
            profile_id=1,
            user_message="研究可再生能源趋势",
            llm_factory=lambda: _FakeRunnerLLM(),
        )
    )
    replanned = asyncio.run(
        resume_research(
            session,
            thread_id=started["thread_id"],
            decision={"approved": False, "feedback": "需要更广的覆盖范围"},
            profile_id=1,
            llm_factory=lambda: _FakeRunnerLLM(),
        )
    )

    assert replanned["interrupted"] is True
    assert replanned["state"]["approved"] is False
    assert replanned["interrupt_payload"]["plan"]["summary"] == "计划摘要"
    assert session.scalars(select(Report)).all() == []
    project = session.scalars(select(ResearchProject)).one()
    assert project.status == "awaiting_execution"


def test_start_marks_project_failed_when_llm_setup_fails(session):
    from sqlalchemy import select

    from app.db.models import Conversation, ResearchProject
    from app.engine.runner import start_research

    conv = Conversation(title="c")
    session.add(conv)
    session.commit()

    def missing_profile():
        raise ValueError("LLM profile 999 not found")

    with pytest.raises(ValueError, match="profile 999"):
        asyncio.run(
            start_research(
                session,
                conversation_id=conv.id,
                profile_id=999,
                user_message="研究一个明确且足够长的主题",
                llm_factory=missing_profile,
            )
        )

    project = session.scalars(select(ResearchProject)).one()
    assert project.status == "failed"


def test_clarification_waits_persists_messages_and_can_resume_after_recovery(session):
    from sqlalchemy import select

    from app.core.events import EventBus
    from app.db.models import Conversation, Message, Report, ResearchProject
    from app.engine import nodes, runner
    from app.engine.runner import get_active_research, resume_research, start_research

    bus = EventBus()
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(runner, "get_event_bus", lambda: bus)
    monkeypatch.setattr(nodes, "get_event_bus", lambda: bus)
    try:
        conv = Conversation(title="Untitled")
        session.add(conv)
        session.commit()
        started = asyncio.run(start_research(
            session, conversation_id=conv.id, profile_id=1, user_message="新能源？", llm_factory=lambda: _ClarifyingRunnerLLM()
        ))
        assert started["interrupt_payload"]["kind"] == "planning_input"
        session.refresh(conv)
        assert conv.title == "新能源"
        assert session.scalars(select(ResearchProject)).one().status == "planning"
        assert session.scalars(select(Report)).all() == []
        active = asyncio.run(get_active_research(session, conversation_id=conv.id))
        assert active and active["thread_id"] == started["thread_id"]
        assert active["interrupt_payload"]["kind"] == "planning_input"
        messages = session.scalars(select(Message).order_by(Message.id)).all()
        assert [message.role for message in messages] == ["user", "assistant"]

        resumed = asyncio.run(resume_research(
            session,
            thread_id=started["thread_id"],
            decision={"kind": "clarification", "answer": "中国，2024 年"},
            profile_id=1,
            llm_factory=lambda: _ClarifyingRunnerLLM(),
        ))
        assert resumed["thread_id"] == started["thread_id"]
        assert resumed["interrupt_payload"]["kind"] == "plan_ready"
        assert session.scalars(select(ResearchProject)).one().status == "awaiting_execution"
        assert [message.role for message in session.scalars(select(Message).order_by(Message.id)).all()] == ["user", "assistant", "user", "assistant"]
        assert [event["type"] for event in bus._history if event["type"] == "research.completed"] == []
    finally:
        monkeypatch.undo()


def test_execute_rejects_a_stale_plan_version(session):
    from app.db.models import Conversation
    from app.engine.runner import resume_research, start_research

    conv = Conversation(title="c")
    session.add(conv)
    session.commit()
    started = asyncio.run(start_research(
        session,
        conversation_id=conv.id,
        profile_id=1,
        user_message="研究可再生能源趋势",
        llm_factory=lambda: _FakeRunnerLLM(),
    ))
    current_version = started["interrupt_payload"]["plan_version"]

    with pytest.raises(ValueError, match="no longer current"):
        asyncio.run(resume_research(
            session,
            thread_id=started["thread_id"],
            decision={"kind": "execute_plan", "plan_version": current_version + 1},
            profile_id=1,
            llm_factory=lambda: _FakeRunnerLLM(),
        ))


def test_follow_up_can_create_a_report_only_revision(session):
    from sqlalchemy import select

    from app.db.models import Conversation, Message, Report, ResearchProject
    from app.engine.persistence import persist_report
    from app.engine.runner import follow_up_research

    conv = Conversation(title="c", status="completed")
    session.add(conv)
    session.flush()
    project = ResearchProject(
        conversation_id=conv.id,
        topic="renewable energy",
        objective="Study renewable energy",
        status="done",
    )
    session.add(project)
    session.commit()
    persist_report(session, project_id=project.id, content_md="# Original")

    class _RevisionLLM:
        def invoke(self, prompt):
            class _R:
                content = "# Revised\n\nA clearer summary."
            return _R()

    result = asyncio.run(follow_up_research(
        session,
        conversation_id=conv.id,
        project_id=project.id,
        profile_id=1,
        message="请润色摘要并调整结构",
        llm_factory=lambda: _RevisionLLM(),
    ))

    assert result["route"] == "report_revision"
    assert result["report_id"] is not None
    assert [report.version for report in session.scalars(select(Report).order_by(Report.version))] == [1, 2]
    assert [message.role for message in session.scalars(select(Message).order_by(Message.id))] == ["user", "assistant"]
