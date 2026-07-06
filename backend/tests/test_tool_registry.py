import asyncio

import pytest


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_get_research_tools_always_includes_fetch_page(session):
    from app.tools import registry

    result = asyncio.run(registry.get_research_tools(session))

    names = [getattr(t, "name", None) for t in result["tools"]]
    assert "fetch_page" in names
    assert result["errors"] == []


def test_get_research_tools_includes_mcp_tools_and_surfaces_errors(session, monkeypatch):
    from app.tools import registry

    async def fake_load_mcp_tools(_session):
        return (["FAKE_MCP_TOOL"], [{"server": "x", "error": "boom"}])

    monkeypatch.setattr(registry, "load_mcp_tools", fake_load_mcp_tools)

    result = asyncio.run(registry.get_research_tools(session))

    assert "FAKE_MCP_TOOL" in result["tools"]
    names = [getattr(t, "name", None) for t in result["tools"]]
    assert "fetch_page" in names
    assert result["errors"] == [{"server": "x", "error": "boom"}]
