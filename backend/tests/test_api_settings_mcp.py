from fastapi.testclient import TestClient


def test_llm_profile_api_masks_keys_and_tests_connection(app_home, monkeypatch):
    from app.llm import connectivity
    from app.main import create_app

    monkeypatch.setattr(
        connectivity,
        "check_profile_connection",
        lambda session, profile_id: {"ok": True, "error": None},
    )

    client = TestClient(create_app())
    created = client.post(
        "/settings/llm-profiles",
        json={
            "name": "local",
            "provider": "openai_compatible",
            "base_url": "http://localhost:11434/v1",
            "model": "qwen",
            "api_key": "sk-secret",
            "params": {"temperature": 0},
            "is_default": True,
        },
    ).json()

    assert created["name"] == "local"
    assert created["api_key"] == "sk-s****"

    listed = client.get("/settings/llm-profiles").json()
    assert listed[0]["api_key"] == "sk-s****"

    checked = client.post(f"/settings/llm-profiles/{created['id']}/test").json()
    assert checked == {"ok": True, "error": None}


def test_preferences_and_mcp_server_api(app_home):
    from app.main import create_app

    client = TestClient(create_app())

    pref = client.put("/settings/preferences/max_sources", json={"value": 12}).json()
    assert pref == {"key": "max_sources", "value": {"value": 12}}
    assert client.get("/settings/preferences/max_sources").json() == pref

    server = client.post(
        "/mcp/servers",
        json={
            "name": "bocha",
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@humansean/mcp-bocha"],
            "env": {"BOCHA_API_KEY": "secret"},
            "enabled": True,
        },
    ).json()
    assert server["name"] == "bocha"
    assert server["env"] == {"BOCHA_API_KEY": "secr****"}
    assert client.get("/mcp/servers").json()[0]["name"] == "bocha"
