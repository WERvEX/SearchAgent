import pytest


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


class _OkModel:
    def invoke(self, _input):
        class _Msg:
            content = "pong"
        return _Msg()


class _FailModel:
    def invoke(self, _input):
        raise RuntimeError("401 Unauthorized")


def test_check_connection_ok():
    from app.llm import connectivity

    result = connectivity.check_connection(_OkModel())

    assert result["ok"] is True
    assert result["error"] is None


def test_check_connection_error_captures_message():
    from app.llm import connectivity

    result = connectivity.check_connection(_FailModel())

    assert result["ok"] is False
    assert "401 Unauthorized" in result["error"]


def test_check_profile_connection_build_failure(session, monkeypatch):
    from app.llm import connectivity

    def boom(*args, **kwargs):
        raise ValueError("no such profile")

    monkeypatch.setattr(connectivity, "build_chat_model_from_profile", boom)

    result = connectivity.check_profile_connection(session, 12345)

    assert result["ok"] is False
    assert "no such profile" in result["error"]


def test_check_profile_connection_ok(session, monkeypatch):
    from app.llm import connectivity

    monkeypatch.setattr(
        connectivity, "build_chat_model_from_profile",
        lambda s, pid: _OkModel(),
    )

    result = connectivity.check_profile_connection(session, 1)

    assert result["ok"] is True
    assert result["error"] is None
