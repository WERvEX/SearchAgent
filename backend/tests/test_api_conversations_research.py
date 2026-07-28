from fastapi.testclient import TestClient


def test_create_list_and_get_conversation(app_home):
    from app.main import create_app

    client = TestClient(create_app())

    created = client.post("/conversations", json={"title": "Renewable energy"}).json()
    assert created["id"] == 1
    assert created["title"] == "Renewable energy"
    assert created["status"] == "idle"

    listed = client.get("/conversations").json()
    assert listed == [created]

    detail = client.get("/conversations/1").json()
    assert detail["id"] == 1
    assert detail["messages"] == []
    assert detail["projects"] == []

    renamed = client.put("/conversations/1", json={"title": "Updated title"}).json()
    assert renamed["title"] == "Updated title"
    assert client.put("/conversations/1", json={"title": "   "}).status_code == 422

    assert client.delete("/conversations/1").status_code == 204
    assert client.get("/conversations/1").status_code == 404
    assert client.get("/conversations").json() == []
    assert client.delete("/conversations/1").status_code == 404


def test_conversation_detail_includes_latest_report(app_home):
    from app.db import session as db
    from app.db.models import Report, ResearchProject
    from app.main import create_app

    client = TestClient(create_app())
    conversation = client.post("/conversations", json={"title": "Historical research"}).json()

    with db.SessionLocal() as session:
        project = ResearchProject(
            conversation_id=conversation["id"],
            topic="API pricing",
            objective="Compare API pricing",
            status="done",
        )
        session.add(project)
        session.flush()
        first_report = Report(project_id=project.id, version=1, content_md="# First")
        latest_report = Report(project_id=project.id, version=2, content_md="# Latest")
        session.add_all([first_report, latest_report])
        session.commit()
        latest_report_id = latest_report.id

    detail = client.get(f"/conversations/{conversation['id']}").json()
    assert detail["projects"][0]["latest_report_id"] == latest_report_id
    assert detail["projects"][0]["latest_report_version"] == 2


def test_research_start_and_resume_delegate_to_runner(app_home, monkeypatch):
    from app.engine import runner
    from app.main import create_app

    async def fake_start(
        session, *, conversation_id, profile_id, user_message, response_language
    ):
        return {
            "thread_id": "thread-1",
            "state": {
                "conversation_id": conversation_id,
                "objective": user_message,
                "response_language": response_language,
            },
            "interrupted": True,
            "interrupt_payload": {"plan": {"summary": "p"}},
        }

    async def fake_resume(
        session, *, thread_id, decision, profile_id=1, response_language=None
    ):
        return {
            "thread_id": thread_id,
            "state": {"approved": decision["approved"], "report_md": "# R"},
            "interrupted": False,
            "interrupt_payload": None,
        }

    monkeypatch.setattr(runner, "start_research", fake_start)
    monkeypatch.setattr(runner, "resume_research", fake_resume)

    client = TestClient(create_app())
    conv = client.post("/conversations", json={"title": "c"}).json()
    profile = client.post(
        "/settings/llm-profiles",
        json={"name": "test-profile", "provider": "openai", "model": "gpt-test"},
    ).json()

    started = client.post(
        "/research/start",
        json={
            "conversation_id": conv["id"],
            "profile_id": profile["id"],
            "user_message": "研究可再生能源趋势",
        },
    ).json()
    assert started["thread_id"] == "thread-1"
    assert started["interrupted"] is True
    assert started["interrupt_payload"]["plan"]["summary"] == "p"

    resumed = client.post(
        "/research/thread-1/resume",
        json={"profile_id": profile["id"], "decision": {"approved": True, "chosen_option": "A"}},
    ).json()
    assert resumed["interrupted"] is False
    assert resumed["state"]["report_md"] == "# R"


def test_research_start_validates_payload_and_references(app_home, monkeypatch):
    from app.engine import runner
    from app.main import create_app

    async def unexpected_start(*args, **kwargs):
        raise AssertionError("runner should not run for an invalid request")

    monkeypatch.setattr(runner, "start_research", unexpected_start)
    client = TestClient(create_app())

    assert client.post(
        "/research/start",
        json={"conversation_id": 1, "profile_id": 1, "user_message": "   "},
    ).status_code == 422

    missing_conversation = client.post(
        "/research/start",
        json={"conversation_id": 99, "profile_id": 1, "user_message": "research topic"},
    )
    assert missing_conversation.status_code == 404
    assert missing_conversation.json()["detail"] == "Conversation not found"

    conv = client.post("/conversations", json={"title": "c"}).json()
    missing_profile = client.post(
        "/research/start",
        json={"conversation_id": conv["id"], "profile_id": 99, "user_message": "research topic"},
    )
    assert missing_profile.status_code == 404
    assert missing_profile.json()["detail"] == "LLM profile not found"


def test_research_resume_validates_clarification_and_active_endpoint(app_home, monkeypatch):
    from app.engine import runner
    from app.main import create_app

    async def fake_active(session, *, conversation_id):
        return {"thread_id": "thread-1", "state": {}, "interrupted": True, "interrupt_payload": {"kind": "clarification", "message": "Which region?"}}

    monkeypatch.setattr(runner, "get_active_research", fake_active)
    client = TestClient(create_app())
    conv = client.post("/conversations", json={"title": "c"}).json()
    assert client.post(
        "/research/thread-1/resume",
        json={"decision": {"kind": "clarification", "answer": "   "}},
    ).status_code == 422
    active = client.get(f"/research/active/{conv['id']}")
    assert active.status_code == 200
    assert active.json()["interrupt_payload"]["kind"] == "clarification"


def test_follow_up_and_execution_detail_endpoints(app_home, monkeypatch):
    from app.db import session as db
    from app.db.models import Conversation, LLMProfile, Report, ResearchProject, Source, Step
    from app.engine import runner
    from app.main import create_app

    async def fake_follow_up(session, **kwargs):
        return {
            "route": kwargs.get("route_override") or "report_revision",
            "reason": "Formatting only",
            "run": None,
            "report_id": 9,
        }

    monkeypatch.setattr(runner, "follow_up_research", fake_follow_up)
    client = TestClient(create_app())
    with db.SessionLocal() as session:
        conversation = Conversation(title="c")
        profile = LLMProfile(name="p", provider="openai", model="m")
        session.add_all([conversation, profile])
        session.flush()
        project = ResearchProject(
            conversation_id=conversation.id,
            topic="t",
            objective="o",
            status="done",
        )
        session.add(project)
        session.flush()
        session.add(Step(project_id=project.id, seq=1, title="Search", status="pending"))
        session.add(Source(project_id=project.id, url="https://example.com", title="Example", tool_name="search"))
        session.add(Report(project_id=project.id, version=1, format="markdown", content_md="# Report"))
        session.commit()
        ids = conversation.id, project.id, profile.id

    response = client.post("/research/follow-up", json={
        "conversation_id": ids[0],
        "project_id": ids[1],
        "profile_id": ids[2],
        "message": "Rewrite the summary",
    })
    assert response.status_code == 200
    assert response.json()["route"] == "report_revision"

    execution = client.get(f"/research/projects/{ids[1]}/execution")
    assert execution.status_code == 200
    assert execution.json()["steps"][0]["title"] == "Search"
    assert execution.json()["steps"][0]["status"] == "completed"
    assert execution.json()["sources"][0]["url"] == "https://example.com"
