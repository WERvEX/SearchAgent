from fastapi import APIRouter, Depends, HTTPException
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


@router.put("/servers/{server_id}")
def update_mcp_server(
    server_id: int,
    payload: MCPServerCreate,
    session: Session = Depends(get_db),
):
    server = settings_service.update_mcp_server(
        session,
        server_id=server_id,
        name=payload.name,
        transport=payload.transport,
        command=payload.command,
        args=payload.args,
        env=payload.env,
        url=payload.url,
        enabled=payload.enabled,
    )
    if server is None:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return next(
        item for item in settings_service.list_mcp_servers(session) if item["id"] == server.id
    )
