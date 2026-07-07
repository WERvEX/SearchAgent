from collections.abc import Iterator

from sqlalchemy.orm import Session

from app.db import session as db_session


def get_db() -> Iterator[Session]:
    if db_session.SessionLocal is None:
        raise RuntimeError("Database has not been initialized")
    with db_session.SessionLocal() as session:
        yield session
