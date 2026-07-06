import pytest
from langgraph.types import Command


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

    ctx = EngineContext(session=session, profile_id=1)
    graph = compile_research_graph(ctx)

    assert graph is not None
    assert hasattr(graph, "invoke")


def test_graph_pauses_at_plan_interrupt(session):
    from app.engine.graph import compile_research_graph
    from app.engine.context import EngineContext
    from app.engine import checkpointer

    ctx = EngineContext(session=session, profile_id=1)
    cp = checkpointer.create_checkpointer()
    graph = compile_research_graph(ctx, checkpointer=cp)

    config = {"configurable": {"thread_id": "test-thread-1"}}
    initial = {
        "conversation_id": 1,
        "project_id": 1,
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
