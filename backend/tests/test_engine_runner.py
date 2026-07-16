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
        if "plan" in text:
            r.content = (
                '{"summary": "计划摘要", "options": [{"id": "A", "label": "全面"}, '
                '{"id": "B", "label": "聚焦"}]}'
            )
        elif "steps" in text:
            r.content = '[{"seq": 1, "title": "搜索", "description": "d", "status": "pending"}]'
        else:
            r.content = "OBJECTIVE: 可再生能源趋势"
        return r


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_start_and_resume_research_runs_to_report_and_publishes_lifecycle_events(session, monkeypatch):
    from sqlalchemy import select

    from app.db.models import Conversation, Message, Report, ResearchProject
    from app.engine.runner import resume_research, start_research
    from app.engine import nodes, runner
    from app.core.events import EventBus

    bus = EventBus()
    monkeypatch.setattr(runner, "get_event_bus", lambda: bus)
    monkeypatch.setattr(nodes, "get_event_bus", lambda: bus)

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
    assert projects[0].status == "awaiting_approval"

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
    reports = session.scalars(select(Report).order_by(Report.id)).all()
    assert projects[0].status == "done"
    assert len(reports) == 1
    assert reports[0].id == resumed["state"]["report_id"]

    subscriber = bus.subscribe(replay_limit=20)
    events = [next(subscriber) for _ in range(7)]
    assert [event["type"] for event in events] == [
        "research.started",
        "research.plan_ready",
        "research.awaiting_approval",
        "research.resumed",
        "research.sources_collected",
        "research.report_ready",
        "research.completed",
    ]
    assert all(event["data"]["thread_id"] == started["thread_id"] for event in events)
    assert events[-2]["data"]["report_id"] == resumed["state"]["report_id"]
