import pytest


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_build_chat_model_passes_resolved_kwargs(monkeypatch):
    from app.llm import factory

    captured = {}

    def fake_init_chat_model(**kwargs):
        captured.update(kwargs)
        return "FAKE_MODEL"

    monkeypatch.setattr(factory, "init_chat_model", fake_init_chat_model)

    model = factory.build_chat_model(
        provider="openai_compatible",
        model="qwen-max",
        base_url="https://dashscope.example/v1",
        api_key="sk-123",
        params={"temperature": 0.1},
    )

    assert model == "FAKE_MODEL"
    assert captured == {
        "model": "qwen-max",
        "model_provider": "openai",
        "base_url": "https://dashscope.example/v1",
        "api_key": "sk-123",
        "temperature": 0.1,
    }


def test_build_chat_model_from_profile_uses_decrypted_key(session, monkeypatch):
    from app.llm import factory
    from app.services import settings_service as svc

    profile = svc.create_llm_profile(
        session,
        name="main",
        provider="openai",
        base_url="https://api.openai.com/v1",
        model="gpt-4o",
        api_key="sk-plaintext-secret",
        params={"temperature": 0.0},
    )

    captured = {}

    def fake_init_chat_model(**kwargs):
        captured.update(kwargs)
        return "FAKE_MODEL"

    monkeypatch.setattr(factory, "init_chat_model", fake_init_chat_model)

    model = factory.build_chat_model_from_profile(session, profile.id)

    assert model == "FAKE_MODEL"
    assert captured["api_key"] == "sk-plaintext-secret"
    assert captured["model"] == "gpt-4o"
    assert captured["model_provider"] == "openai"
    assert captured["base_url"] == "https://api.openai.com/v1"
    assert captured["temperature"] == 0.0


def test_build_chat_model_from_profile_missing_raises(session):
    from app.llm import factory

    with pytest.raises(ValueError):
        factory.build_chat_model_from_profile(session, 99999)
