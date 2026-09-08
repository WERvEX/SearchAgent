from fastapi import APIRouter

from app.api import artifacts, conversations, events, health, mcp, observability, reports, research, settings

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(conversations.router)
api_router.include_router(research.router)
api_router.include_router(settings.router)
api_router.include_router(mcp.router)
api_router.include_router(reports.router)
api_router.include_router(artifacts.router)
api_router.include_router(events.router)
api_router.include_router(observability.router)
