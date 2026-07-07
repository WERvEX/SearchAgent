from fastapi import APIRouter

from app.api import conversations, health, research

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(conversations.router)
api_router.include_router(research.router)
