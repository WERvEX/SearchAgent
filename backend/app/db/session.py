from typing import Optional

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import inspect, text

from app.core.paths import get_db_path
from app.db.base import Base
import app.db.models  # noqa: F401  ensure all models are registered on Base


engine: Optional[Engine] = None
SessionLocal: Optional[sessionmaker] = None


def _build_url(url: Optional[str]) -> str:
    if url is not None:
        return url
    return f"sqlite:///{get_db_path()}"


def init_db(url: Optional[str] = None) -> Engine:
    """Create the engine + session factory and create all tables.

    Pass an explicit url (e.g. 'sqlite:///:memory:') in tests.
    """
    global engine, SessionLocal

    engine = create_engine(
        _build_url(url), connect_args={"check_same_thread": False}
    )

    if engine.dialect.name == "sqlite":
        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    SessionLocal = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False
    )
    Base.metadata.create_all(engine)
    _apply_additive_sqlite_schema(engine)
    return engine


def _apply_additive_sqlite_schema(db_engine: Engine) -> None:
    """Apply additive schema changes for databases created by earlier releases."""
    if db_engine.dialect.name != "sqlite":
        return
    inspector = inspect(db_engine)
    with db_engine.begin() as connection:
        project_columns = {item["name"] for item in inspector.get_columns("research_projects")}
        for name, ddl in {
            "workflow_mode": "ALTER TABLE research_projects ADD COLUMN workflow_mode VARCHAR DEFAULT 'research'",
            "problem_definition_json": "ALTER TABLE research_projects ADD COLUMN problem_definition_json JSON",
            "output_modes_json": "ALTER TABLE research_projects ADD COLUMN output_modes_json JSON",
        }.items():
            if name not in project_columns:
                connection.execute(text(ddl))
        connection.execute(text("UPDATE research_projects SET workflow_mode = 'research' WHERE workflow_mode IS NULL"))
        report_columns = {item["name"] for item in inspector.get_columns("reports")}
        if "content_text" not in report_columns:
            connection.execute(text("ALTER TABLE reports ADD COLUMN content_text TEXT"))
