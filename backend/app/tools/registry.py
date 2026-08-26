from typing import Any

from sqlalchemy.orm import Session

from app.tools.fetch import fetch_page
from app.tools.bocha import create_bocha_search_tool
from app.tools.mcp_client import load_mcp_tools
from app.tools.github import github_repository_search
from app.tools.official_docs import official_documentation_fetch
from app.services import settings_service as svc


async def get_research_tools(session: Session, *, include_development: bool = False) -> dict[str, Any]:
    """Aggregate the local fallback fetch tool with any configured MCP tools.

    The fetch_page fallback is always included first so research can
    proceed even if every configured MCP server is unavailable. MCP load
    errors are returned (not raised) so the caller can surface them to the
    user without failing the whole research run.
    """
    mcp_tools, errors = await load_mcp_tools(session)
    builtin_tools = []
    for server in svc.list_mcp_servers(session):
        if server["name"] != "bocha" or not server["enabled"]:
            continue
        api_key = svc.get_mcp_server_env(session, server["id"]).get("BOCHA_API_KEY")
        if api_key:
            builtin_tools.append(create_bocha_search_tool(api_key))
        break
    development_tools = [github_repository_search, official_documentation_fetch] if include_development else []
    return {
        "tools": [fetch_page, *development_tools, *builtin_tools, *mcp_tools],
        "errors": errors,
    }
