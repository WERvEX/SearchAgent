from fastapi.testclient import TestClient


def test_create_list_and_get_conversation(app_home):
    from app.main import create_app

    client = TestClient(create_app())

    created = client.post("/conversations", json={"title": "Renewable energy"}).json()
    assert created["id"] == 1
    assert created["title"] == "Renewable energy"
    assert created["status"] == "active"

    listed = client.get("/conversations").json()
    assert listed == [created]

    detail = client.get("/conversations/1").json()
    assert detail["id"] == 1
    assert detail["messages"] == []
    assert detail["projects"] == []


def test_research_start_and_resume_delegate_to_runner(app_home, monkeypatch):
    from app.engine import runner
    from app.main import create_app

    async def fake_start(session, *, conversation_id, profile_id, user_message):
        return {
            "thread_id": "thread-1",
            "state": {"conversation_id": conversation_id, "objective": user_message},
            "interrupted": True,
            "interrupt_payload": {"plan": {"summary": "p"}},
        }

    async def fake_resume(session, *, thread_id, decision, profile_id=1):
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

    started = client.post(
        "/research/start",
        json={
            "conversation_id": conv["id"],
            "profile_id": 7,
            "user_message": "研究可再生能源趋势",
        },
    ).json()
    assert started["thread_id"] == "thread-1"
    assert started["interrupted"] is True
    assert started["interrupt_payload"]["plan"]["summary"] == "p"

    resumed = client.post(
        "/research/thread-1/resume",
        json={"profile_id": 7, "decision": {"approved": True, "chosen_option": "A"}},
    ).json()
    assert resumed["interrupted"] is False
    assert resumed["state"]["report_md"] == "# R"
