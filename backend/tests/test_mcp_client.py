import asyncio

import pytest


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_build_mcp_connections_only_includes_enabled(session):
    from app.tools import mcp_client
    from app.services import settings_service as svc

    svc.create_mcp_server(
        session, name="enabled-one", transport="stdio",
        command="npx", args=["-y", "some-mcp"], env={"KEY": "v1"},
        enabled=True,
    )
    svc.create_mcp_server(
        session, name="disabled-one", transport="stdio",
        command="npx", args=["-y", "other-mcp"], enabled=False,
    )

    connections = mcp_client.build_mcp_connections(session)

    assert list(connections.keys()) == ["enabled-one"]
    assert connections["enabled-one"] == {
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "some-mcp"],
        "env": {"KEY": "v1"},
    }


def test_build_mcp_connections_decrypts_env(session):
    from app.tools import mcp_client
    from app.services import settings_service as svc

    svc.create_mcp_server(
        session, name="secret-server", transport="stdio",
        command="python", args=["server.py"],
        env={"API_TOKEN": "plaintext-token-123"},
    )

    connections = mcp_client.build_mcp_connections(session)

    # Must be the real decrypted value, not the masked list_mcp_servers() form.
    assert connections["secret-server"]["env"] == {"API_TOKEN": "plaintext-token-123"}


def test_build_mcp_connections_normalizes_http_transport(session):
    from app.tools import mcp_client
    from app.services import settings_service as svc

    svc.create_mcp_server(
        session, name="remote", transport="http",
        url="https://example.com/mcp",
    )

    connections = mcp_client.build_mcp_connections(session)

    assert connections["remote"] == {
        "transport": "streamable_http",
        "url": "https://example.com/mcp",
    }


def test_build_mcp_connections_empty_when_no_servers(session):
    from app.tools import mcp_client

    assert mcp_client.build_mcp_connections(session) == {}


def test_ensure_default_bocha_server_creates_once(session):
    from app.tools import mcp_client
    from app.services import settings_service as svc

    mcp_client.ensure_default_bocha_server(session, "sk-test-key")
    mcp_client.ensure_default_bocha_server(session, "sk-test-key")  # idempotent

    servers = [s for s in svc.list_mcp_servers(session) if s["name"] == "bocha"]
    assert len(servers) == 1

    server = servers[0]
    assert server["transport"] == "stdio"
    assert server["command"] == "npx"
    assert server["args"] == ["-y", "@humansean/mcp-bocha"]
    assert server["enabled"] is True

    env = svc.get_mcp_server_env(session, server["id"])
    assert env == {"BOCHA_API_KEY": "sk-test-key"}
    assert mcp_client.build_mcp_connections(session) == {}


def test_ensure_default_bocha_server_does_not_overwrite_existing(session):
    from app.tools import mcp_client
    from app.services import settings_service as svc

    svc.create_mcp_server(
        session, name="bocha", transport="stdio",
        command="custom-command", args=["--custom"],
        env={"BOCHA_API_KEY": "user-configured-key"},
    )

    mcp_client.ensure_default_bocha_server(session, "sk-should-not-be-used")

    servers = [s for s in svc.list_mcp_servers(session) if s["name"] == "bocha"]
    assert len(servers) == 1
    assert servers[0]["command"] == "custom-command"


def test_load_mcp_tools_aggregates_across_servers(session, monkeypatch):
    from app.services import settings_service as svc
    from app.tools import mcp_client

    svc.create_mcp_server(
        session, name="server-a", transport="stdio",
        command="cmd-a", args=[],
    )
    svc.create_mcp_server(
        session, name="server-b", transport="stdio",
        command="cmd-b", args=[],
    )

    class FakeClient:
        def __init__(self, connections):
            assert len(connections) == 1
            self._server_name = next(iter(connections))

        async def get_tools(self):
            return [f"TOOL_FROM_{self._server_name}"]

    monkeypatch.setattr(mcp_client, "MultiServerMCPClient", FakeClient)

    tools, errors = asyncio.run(mcp_client.load_mcp_tools(session))

    assert sorted(tools) == ["TOOL_FROM_server-a", "TOOL_FROM_server-b"]
    assert errors == []


def test_load_mcp_tools_isolates_failing_server(session, monkeypatch):
    from app.services import settings_service as svc
    from app.tools import mcp_client

    svc.create_mcp_server(
        session, name="good-server", transport="stdio",
        command="cmd-good", args=[],
    )
    svc.create_mcp_server(
        session, name="bad-server", transport="stdio",
        command="cmd-bad", args=[],
    )

    class FakeClient:
        def __init__(self, connections):
            self._server_name = next(iter(connections))

        async def get_tools(self):
            if self._server_name == "bad-server":
                raise RuntimeError("connection refused")
            return ["GOOD_TOOL"]

    monkeypatch.setattr(mcp_client, "MultiServerMCPClient", FakeClient)

    tools, errors = asyncio.run(mcp_client.load_mcp_tools(session))

    assert tools == ["GOOD_TOOL"]
    assert errors == [{"server": "bad-server", "error": "connection refused"}]


def test_load_mcp_tools_no_servers_returns_empty(session):
    from app.tools import mcp_client

    tools, errors = asyncio.run(mcp_client.load_mcp_tools(session))

    assert tools == []
    assert errors == []
