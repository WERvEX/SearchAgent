from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.mcp import MCPServerCreate
from app.services import settings_service

router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.post("/servers")
def create_mcp_server(payload: MCPServerCreate, session: Session = Depends(get_db)):
    server = settings_service.create_mcp_server(
        session,
        name=payload.name,
        transport=payload.transport,
        command=payload.command,
        args=payload.args,
        env=payload.env,
        url=payload.url,
        enabled=payload.enabled,
    )
    return next(
        s for s in settings_service.list_mcp_servers(session) if s["id"] == server.id
    )


@router.get("/servers")
def list_mcp_servers(session: Session = Depends(get_db)):
    return settings_service.list_mcp_servers(session)
