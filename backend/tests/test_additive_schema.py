import sqlite3
from sqlalchemy import inspect


def test_additive_sqlite_schema_upgrades_existing_core_tables(tmp_path):
    from app.db import session as db

    path = tmp_path / "old.db"
    connection = sqlite3.connect(path)
    connection.executescript("""
        CREATE TABLE research_projects (id INTEGER PRIMARY KEY);
        CREATE TABLE reports (id INTEGER PRIMARY KEY);
        CREATE TABLE plans (id INTEGER PRIMARY KEY);
    """)
    connection.close()

    engine = db.init_db(f"sqlite:///{path.as_posix()}")
    inspector = inspect(engine)
    project_columns = {item["name"] for item in inspector.get_columns("research_projects")}
    assert {"workflow_mode", "problem_definition_json", "output_modes_json", "repository_mode", "repository_snapshot_id"}.issubset(project_columns)
    assert "content_text" in {item["name"] for item in inspector.get_columns("reports")}
    assert "plan_json" in {item["name"] for item in inspector.get_columns("plans")}
    assert {"repository_snapshots", "project_artifacts"}.issubset(set(inspector.get_table_names()))
    engine.dispose()
