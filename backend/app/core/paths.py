import os
from pathlib import Path


def get_app_home() -> Path:
    """Return the application data directory, creating it if needed.

    Overridable via the SEARCHAGENT_HOME env var (used by tests and for
    running multiple isolated instances).
    """
    override = os.environ.get("SEARCHAGENT_HOME")
    base = Path(override) if override else Path.home() / ".searchagent"
    base.mkdir(parents=True, exist_ok=True)
    return base


def get_db_path() -> Path:
    return get_app_home() / "searchagent.db"


def get_key_path() -> Path:
    return get_app_home() / "secret.key"


def get_reports_dir() -> Path:
    reports = get_app_home() / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    return reports
