from sqlalchemy.orm import Session

from app.services import settings_service as svc

# langchain-mcp-adapters expects "streamable_http" as the transport literal
# for remote HTTP servers; accept the shorter "http" as a user-facing alias.
_TRANSPORT_ALIASES = {"http": "streamable_http"}

BOCHA_SERVER_NAME = "bocha"
BOCHA_NPM_PACKAGE = "@humansean/mcp-bocha"


def _normalize_transport(transport: str) -> str:
    return _TRANSPORT_ALIASES.get(transport, transport)


def build_mcp_connections(session: Session) -> dict[str, dict]:
    """Build langchain-mcp-adapters connection configs for enabled MCP servers.

    Only enabled servers are included. Secrets are decrypted here (not the
    masked form returned by settings_service.list_mcp_servers).
    """
    connections: dict[str, dict] = {}
    for server in svc.list_mcp_servers(session):
        if not server["enabled"]:
            continue

        transport = _normalize_transport(server["transport"])
        if transport == "stdio":
            connections[server["name"]] = {
                "transport": "stdio",
                "command": server["command"],
                "args": server["args"] or [],
                "env": svc.get_mcp_server_env(session, server["id"]),
            }
        else:
            connections[server["name"]] = {
                "transport": transport,
                "url": server["url"],
            }
    return connections


def ensure_default_bocha_server(session: Session, api_key: str) -> None:
    """Register the default Bocha MCP server if it isn't configured yet.

    Idempotent and non-destructive: if a "bocha" server already exists
    (e.g. the user customized it), it is left untouched.
    """
    existing_names = {s["name"] for s in svc.list_mcp_servers(session)}
    if BOCHA_SERVER_NAME in existing_names:
        return

    svc.create_mcp_server(
        session,
        name=BOCHA_SERVER_NAME,
        transport="stdio",
        command="npx",
        args=["-y", BOCHA_NPM_PACKAGE],
        env={"BOCHA_API_KEY": api_key},
    )
