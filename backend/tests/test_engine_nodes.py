import pytest
import asyncio


class _FakeLLM:
    def invoke(self, prompt):
        class _R:
            pass

        r = _R()
        if "clarify" in str(prompt).lower() or "objective" in str(prompt).lower():
            r.content = "OBJECTIVE: 可再生能源趋势"
        elif "plan" in str(prompt).lower():
            r.content = (
                '{"summary": "计划摘要", "options": [{"id": "A", "label": "全面"}, '
                '{"id": "B", "label": "聚焦"}]}'
            )
        elif "steps" in str(prompt).lower():
            r.content = '[{"seq": 1, "title": "搜索", "description": "d", "status": "pending"}]'
        else:
            r.content = "ok"
        return r


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_clarify_sets_objective_from_llm(session):
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _FakeLLM())
    nodes = make_nodes(ctx)
    out = nodes["clarify_intent"](
        {
            "conversation_id": 1,
            "project_id": 1,
            "messages": [{"role": "user", "content": "研究新能源"}],
            "objective": "",
            "plan": None,
            "approved": False,
            "steps": [],
            "findings": [],
            "report_md": None,
        }
    )
    assert out.get("objective") == "可再生能源趋势"


def test_generate_plan_parses_json(session):
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _FakeLLM())
    nodes = make_nodes(ctx)
    out = nodes["generate_plan"](
        {
            "conversation_id": 1,
            "project_id": 1,
            "messages": [],
            "objective": "可再生能源",
            "plan": None,
            "approved": False,
            "steps": [],
            "findings": [],
            "report_md": None,
        }
    )
    assert out["plan"]["summary"] == "计划摘要"
    assert len(out["plan"]["options"]) == 2


def test_derive_steps_parses_json(session):
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _FakeLLM())
    nodes = make_nodes(ctx)
    out = nodes["derive_steps"](
        {
            "conversation_id": 1,
            "project_id": 1,
            "messages": [],
            "objective": "可再生能源",
            "plan": {"summary": "s"},
            "approved": True,
            "steps": [],
            "findings": [],
            "report_md": None,
        }
    )
    assert out["steps"][0]["title"] == "搜索"
    assert out["steps"][0]["status"] == "pending"


def test_execute_research_calls_tools_respects_source_limit_and_persists_sources(
    session, monkeypatch
):
    from sqlalchemy import select

    from app.db.models import Conversation, ResearchProject, Source
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext
    from app.services.settings_service import set_preference
    from app.tools import registry

    conv = Conversation(title="c")
    session.add(conv)
    session.flush()
    project = ResearchProject(
        conversation_id=conv.id,
        topic="renewable energy",
        objective="Study renewable energy trends",
    )
    session.add(project)
    session.commit()

    set_preference(session, "max_sources", {"value": 1})

    class _FakeTool:
        name = "search_web"

        def __init__(self):
            self.calls = []

        def invoke(self, args):
            self.calls.append(args)
            return [
                {
                    "title": "First source",
                    "url": "https://example.com/1",
                    "snippet": "first snippet",
                },
                {
                    "title": "Second source",
                    "url": "https://example.com/2",
                    "snippet": "second snippet",
                },
            ]

    fake_tool = _FakeTool()

    async def fake_get_research_tools(_session):
        return {"tools": [fake_tool], "errors": []}

    monkeypatch.setattr(registry, "get_research_tools", fake_get_research_tools)

    class _ToolCallResponse:
        content = ""
        tool_calls = [
            {
                "name": "search_web",
                "args": {"query": "renewable energy market 2026"},
            }
        ]

    class _ToolCallingLLM:
        def bind_tools(self, tools):
            self.bound_tools = tools
            return self

        def invoke(self, prompt):
            self.prompt = prompt
            return _ToolCallResponse()

    llm = _ToolCallingLLM()
    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: llm)
    nodes = make_nodes(ctx)

    out = nodes["execute_research"](
        {
            "conversation_id": conv.id,
            "project_id": project.id,
            "messages": [],
            "objective": "Study renewable energy trends",
            "plan": {"summary": "plan"},
            "approved": True,
            "steps": [{"seq": 1, "title": "Search", "status": "pending"}],
            "findings": [],
            "report_md": None,
        }
    )

    assert fake_tool.calls == [{"query": "renewable energy market 2026"}]
    assert out["findings"] == [
        {
            "title": "First source",
            "url": "https://example.com/1",
            "snippet": "first snippet",
            "tool_name": "search_web",
        }
    ]
    sources = session.scalars(select(Source).order_by(Source.id)).all()
    assert len(sources) == 1
    assert sources[0].project_id == project.id
    assert sources[0].url == "https://example.com/1"
    assert sources[0].tool_name == "search_web"


def test_execute_research_can_load_tools_inside_running_event_loop(session, monkeypatch):
    from app.db.models import Conversation, ResearchProject
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext
    from app.tools import registry

    conv = Conversation(title="c")
    session.add(conv)
    session.flush()
    project = ResearchProject(
        conversation_id=conv.id,
        topic="renewable energy",
        objective="Study renewable energy trends",
    )
    session.add(project)
    session.commit()

    async def fake_get_research_tools(_session):
        return {"tools": [], "errors": []}

    monkeypatch.setattr(registry, "get_research_tools", fake_get_research_tools)

    class _NoToolCallResponse:
        content = ""
        tool_calls = []

    class _NoToolLLM:
        def bind_tools(self, tools):
            return self

        def invoke(self, prompt):
            return _NoToolCallResponse()

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _NoToolLLM())
    nodes = make_nodes(ctx)

    async def run_node():
        return nodes["execute_research"](
            {
                "conversation_id": conv.id,
                "project_id": project.id,
                "messages": [],
                "objective": "Study renewable energy trends",
                "plan": {"summary": "plan"},
                "approved": True,
                "steps": [],
                "findings": [],
                "report_md": None,
            }
        )

    assert asyncio.run(run_node()) == {"findings": []}


def test_aggregate_evidence_deduplicates_findings_and_marks_criteria(session):
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _FakeLLM())
    nodes = make_nodes(ctx)

    out = nodes["aggregate_evidence"](
        {
            "conversation_id": 1,
            "project_id": 1,
            "messages": [],
            "objective": "Study renewable energy trends",
            "plan": {"summary": "plan"},
            "approved": True,
            "steps": [
                {
                    "seq": 1,
                    "title": "Search",
                    "status": "pending",
                    "acceptance_criteria": ["market data"],
                }
            ],
            "findings": [
                {
                    "title": "Market report",
                    "url": "https://example.com/report",
                    "snippet": "market data for renewable energy",
                    "tool_name": "search_web",
                },
                {
                    "title": "Duplicate report",
                    "url": "https://example.com/report",
                    "snippet": "duplicate",
                    "tool_name": "search_web",
                },
            ],
            "report_md": None,
        }
    )

    assert out["findings"] == [
        {
            "title": "Market report",
            "url": "https://example.com/report",
            "snippet": "market data for renewable energy",
            "tool_name": "search_web",
        }
    ]
    assert out["steps"][0]["acceptance_criteria"] == [
        {
            "description": "market data",
            "met": True,
            "evidence_ref": "https://example.com/report",
        }
    ]


def test_write_report_generates_cited_markdown_and_persists_report(session):
    from sqlalchemy import select

    from app.db.models import Conversation, ResearchProject, Report
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext

    conv = Conversation(title="c")
    session.add(conv)
    session.flush()
    project = ResearchProject(
        conversation_id=conv.id,
        topic="renewable energy",
        objective="Study renewable energy trends",
    )
    session.add(project)
    session.commit()

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _FakeLLM())
    nodes = make_nodes(ctx)

    out = nodes["write_report"](
        {
            "conversation_id": conv.id,
            "project_id": project.id,
            "messages": [],
            "objective": "Study renewable energy trends",
            "plan": {"summary": "plan"},
            "approved": True,
            "steps": [{"seq": 1, "title": "Search", "status": "done"}],
            "findings": [
                {
                    "title": "Market report",
                    "url": "https://example.com/report",
                    "snippet": "market data for renewable energy",
                    "tool_name": "search_web",
                }
            ],
            "report_md": None,
        }
    )

    assert out["report_md"].startswith("# 研究报告")
    assert "[^1]" in out["report_md"]
    assert "https://example.com/report" in out["report_md"]

    reports = session.scalars(select(Report).order_by(Report.id)).all()
    assert len(reports) == 1
    assert reports[0].project_id == project.id
    assert reports[0].content_md == out["report_md"]
