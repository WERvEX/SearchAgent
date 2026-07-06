from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

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
    SessionLocal = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False
    )
    Base.metadata.create_all(engine)
    return engine
