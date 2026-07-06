from pathlib import Path


def test_app_home_uses_env_override(app_home):
    import app.core.paths as paths

    result = paths.get_app_home()

    assert result == Path(app_home)
    assert result.exists()


def test_db_key_reports_paths_are_under_home(app_home):
    import app.core.paths as paths

    assert paths.get_db_path() == Path(app_home) / "searchagent.db"
    assert paths.get_key_path() == Path(app_home) / "secret.key"

    reports = paths.get_reports_dir()
    assert reports == Path(app_home) / "reports"
    assert reports.exists()
