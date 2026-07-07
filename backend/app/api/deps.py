from collections.abc import Iterator

from sqlalchemy.orm import Session

from app.db.session import SessionLocal


def get_db() -> Iterator[Session]:
    if SessionLocal is None:
        raise RuntimeError("Database has not been initialized")
    with SessionLocal() as session:
        yield session
