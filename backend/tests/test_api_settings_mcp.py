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

    updated = client.put(
        f"/settings/llm-profiles/{created['id']}",
        json={
            "name": "local updated",
            "provider": "openai_compatible",
            "base_url": "http://localhost:11434/v1",
            "model": "qwen-next",
            "params": {"temperature": 0.2},
            "is_default": True,
        },
    ).json()
    assert updated["name"] == "local updated"
    assert updated["model"] == "qwen-next"
    assert updated["api_key"] == "sk-s****"


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

    updated = client.put(
        f"/mcp/servers/{server['id']}",
        json={
            "name": "bocha updated",
            "transport": "stdio",
            "command": "uvx",
            "args": ["bocha-search-mcp"],
            "env": None,
            "enabled": False,
        },
    ).json()
    assert updated["name"] == "bocha updated"
    assert updated["command"] == "uvx"
    assert updated["enabled"] is False
    assert updated["env"] == {"BOCHA_API_KEY": "secr****"}

    assert client.put(
        "/mcp/servers/9999",
        json={
            "name": "missing",
            "transport": "http",
            "url": "https://example.com/mcp",
        },
    ).status_code == 404


def test_mcp_server_api_rejects_invalid_transport_configuration(app_home):
    from app.main import create_app

    client = TestClient(create_app())

    assert client.post(
        "/mcp/servers",
        json={"name": "missing-command", "transport": "stdio"},
    ).status_code == 422
    assert client.post(
        "/mcp/servers",
        json={"name": "missing-url", "transport": "http"},
    ).status_code == 422
    assert client.post(
        "/mcp/servers",
        json={"name": "bad-url", "transport": "sse", "url": "not-a-url"},
    ).status_code == 422
