from fastapi import FastAPI

from app.api.router import api_router
from app.db.session import init_db


def create_app() -> FastAPI:
    init_db()
    app = FastAPI(title="StartSpec", version="0.1.0")
    app.include_router(api_router)
    return app


app = create_app()
