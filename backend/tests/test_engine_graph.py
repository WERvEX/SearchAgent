import pytest
from langgraph.types import Command


class _FakeGraphLLM:
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
            r.content = "OBJECTIVE: renewable energy trends"
        return r


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_compile_graph_has_interrupt_after_plan(session):
    from app.engine.graph import compile_research_graph
    from app.engine.context import EngineContext

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _FakeGraphLLM())
    graph = compile_research_graph(ctx)

    assert graph is not None
    assert hasattr(graph, "invoke")


def test_evidence_gate_route_allows_at_most_one_supplemental_round():
    from app.engine.graph import _route_after_evidence_gate

    assert _route_after_evidence_gate({
        "research_round": 1,
        "allow_supplemental_research": True,
        "evidence_gate": {"needs_supplement": True},
    }) == "execute_research"
    assert _route_after_evidence_gate({
        "research_round": 2,
        "allow_supplemental_research": True,
        "evidence_gate": {"needs_supplement": True},
    }) == "write_report"
    assert _route_after_evidence_gate({
        "research_round": 1,
        "allow_supplemental_research": False,
        "evidence_gate": {"needs_supplement": True},
    }) == "write_report"


def test_graph_pauses_at_plan_interrupt(session, monkeypatch):
    from app.db.models import Conversation, ResearchProject
    from app.engine.graph import compile_research_graph
    from app.engine.context import EngineContext
    from app.engine import checkpointer
    from app.tools import registry

    class _FakeSearchTool:
        name = "search_web"

        def invoke(self, args):
            return [{"title": "Source", "url": "https://example.com", "snippet": "Evidence"}]

    async def fake_get_research_tools(_session):
        return {"tools": [_FakeSearchTool()], "errors": []}

    monkeypatch.setattr(registry, "get_research_tools", fake_get_research_tools)

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

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _FakeGraphLLM())
    cp = checkpointer.create_checkpointer()
    graph = compile_research_graph(ctx, checkpointer=cp)

    config = {"configurable": {"thread_id": "test-thread-1"}}
    initial = {
        "conversation_id": conv.id,
        "project_id": project.id,
        "messages": [],
        "objective": "Study renewable energy trends",
        "plan": None,
        "approved": False,
        "steps": [],
        "findings": [],
        "report_md": None,
    }

    result = graph.invoke(initial, config)
    assert result.get("plan") is not None
    assert result.get("approved") is False

    resumed = graph.invoke(Command(resume={"approved": True, "chosen_option": "A"}), config)
    assert resumed.get("approved") is True
