from typing import Any

from sqlalchemy.orm import Session

from app.tools.fetch import fetch_page
from app.tools.mcp_client import load_mcp_tools


async def get_research_tools(session: Session) -> dict[str, Any]:
    """Aggregate the local fallback fetch tool with any configured MCP tools.

    The fetch_page fallback is always included first so research can
    proceed even if every configured MCP server is unavailable. MCP load
    errors are returned (not raised) so the caller can surface them to the
    user without failing the whole research run.
    """
    mcp_tools, errors = await load_mcp_tools(session)
    return {"tools": [fetch_page, *mcp_tools], "errors": errors}
