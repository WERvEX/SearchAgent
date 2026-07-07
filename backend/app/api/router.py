from fastapi import APIRouter

from app.api import conversations, health, mcp, research, settings

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(conversations.router)
api_router.include_router(research.router)
api_router.include_router(settings.router)
api_router.include_router(mcp.router)
