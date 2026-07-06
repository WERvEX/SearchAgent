import pytest


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_create_and_list_llm_profile_masks_key(session):
    from app.services import settings_service as svc

    profile = svc.create_llm_profile(
        session,
        name="openai-main",
        provider="openai",
        base_url="https://api.openai.com/v1",
        model="gpt-4o",
        api_key="sk-secret-1234567890",
        is_default=True,
    )
    assert profile.id is not None
    assert profile.api_key_encrypted != "sk-secret-1234567890"

    listed = svc.list_llm_profiles(session)
    assert len(listed) == 1
    assert listed[0]["name"] == "openai-main"
    assert listed[0]["api_key"] == "sk-s****"
    assert listed[0]["is_default"] is True


def test_get_decrypted_api_key(session):
    from app.services import settings_service as svc

    p = svc.create_llm_profile(
        session,
        name="p1",
        provider="openai",
        base_url=None,
        model="gpt-4o-mini",
        api_key="sk-abcdefghij",
    )

    assert svc.get_decrypted_api_key(session, p.id) == "sk-abcdefghij"


def test_only_one_default_profile(session):
    from app.services import settings_service as svc

    svc.create_llm_profile(
        session, name="a", provider="openai", base_url=None,
        model="m", api_key="k1", is_default=True,
    )
    b = svc.create_llm_profile(
        session, name="b", provider="anthropic", base_url=None,
        model="claude", api_key="k2", is_default=True,
    )

    defaults = [p for p in svc.list_llm_profiles(session) if p["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["id"] == b.id


def test_delete_llm_profile(session):
    from app.services import settings_service as svc

    p = svc.create_llm_profile(
        session, name="temp", provider="openai", base_url=None,
        model="m", api_key="k",
    )
    svc.delete_llm_profile(session, p.id)

    assert svc.list_llm_profiles(session) == []


def test_mcp_server_create_and_list(session):
    from app.services import settings_service as svc

    svc.create_mcp_server(
        session,
        name="bocha",
        transport="stdio",
        command="npx",
        args=["-y", "bocha-mcp"],
        env={"BOCHA_API_KEY": "bk-123"},
    )
    servers = svc.list_mcp_servers(session)

    assert len(servers) == 1
    assert servers[0]["name"] == "bocha"
    assert servers[0]["enabled"] is True
    assert servers[0]["env"]["BOCHA_API_KEY"] == "bk-1****"


def test_preferences_roundtrip(session):
    from app.services import settings_service as svc

    svc.set_preference(session, "report_language", {"value": "zh"})
    svc.set_preference(session, "max_sources", {"value": 20})

    assert svc.get_preference(session, "report_language") == {"value": "zh"}
    assert svc.get_preference(session, "missing") is None
    svc.set_preference(session, "max_sources", {"value": 30})
    assert svc.get_preference(session, "max_sources") == {"value": 30}


def test_get_mcp_server_env_returns_decrypted(session):
    from app.services import settings_service as svc

    server = svc.create_mcp_server(
        session,
        name="bocha",
        transport="stdio",
        command="npx",
        args=["-y", "bocha-mcp"],
        env={"BOCHA_API_KEY": "bk-123"},
    )

    assert svc.get_mcp_server_env(session, server.id) == {"BOCHA_API_KEY": "bk-123"}
    assert svc.get_mcp_server_env(session, 99999) == {}
