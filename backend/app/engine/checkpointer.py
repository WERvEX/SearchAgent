import sqlite3

from langgraph.checkpoint.sqlite import SqliteSaver

from app.core.paths import get_db_path


def create_checkpointer() -> SqliteSaver:
    """Return a SQLite checkpointer backed by the app database file.

    LangGraph manages its own checkpoint tables in the same DB file.
    """
    conn = sqlite3.connect(str(get_db_path()), check_same_thread=False)
    return SqliteSaver(conn)
