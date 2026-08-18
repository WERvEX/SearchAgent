import pytest


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    app_home.mkdir(parents=True, exist_ok=True)
    engine = db.init_db(f"sqlite:///{(app_home / 'observability.db').as_posix()}")
    with db.SessionLocal() as current:
        yield current
    engine.dispose()


def test_policy_fingerprint_is_stable_and_redacts_secrets():
    from app.services.tracing_service import redact
    from app.tools.policy import args_fingerprint

    assert args_fingerprint({"url": "https://example.com", "q": "x"}) == args_fingerprint({"q": "x", "url": "https://example.com"})
    assert "secret-value" not in redact({"api_key": "secret-value", "url": "https://example.com"})


def test_policy_domain_matching_and_approval(session):
    from app.db.models import Conversation, ResearchProject
    from app.tools.policy import create_policy, decide

    conversation = Conversation(title="policy")
    session.add(conversation)
    session.flush()
    project = ResearchProject(conversation_id=conversation.id, topic="policy", objective="policy")
    session.add(project)
    session.commit()

    create_policy(session, agent_role="retriever", tool_name="fetch_page", allowed_domains=["example.com"], require_approval=True)
    allowed = decide(session, project_id=project.id, trace_id="trace-1", agent_role="retriever", tool_name="fetch_page", args={"url": "https://example.com/a"})
    blocked = decide(session, project_id=project.id, trace_id="trace-1", agent_role="retriever", tool_name="fetch_page", args={"url": "https://other.example/a"})
    assert allowed.action == "approval_required"
    assert blocked.action == "deny"
