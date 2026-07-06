import pytest


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
