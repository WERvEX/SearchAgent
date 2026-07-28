from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.crypto import encrypt, decrypt, mask_secret
from app.db.models import LLMProfile, MCPServer, AppPreference


# ---------- LLM Profiles ----------

def create_llm_profile(
    session: Session,
    *,
    name: str,
    provider: str,
    base_url: Optional[str],
    model: str,
    api_key: Optional[str],
    params: Optional[dict] = None,
    is_default: bool = False,
) -> LLMProfile:
    if is_default:
        _clear_default_profiles(session)

    profile = LLMProfile(
        name=name,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key_encrypted=encrypt(api_key) if api_key else None,
        params_json=params,
        is_default=is_default,
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


def update_llm_profile(
    session: Session,
    *,
    profile_id: int,
    name: str,
    provider: str,
    base_url: Optional[str],
    model: str,
    api_key: Optional[str],
    params: Optional[dict] = None,
    is_default: bool = False,
) -> LLMProfile | None:
    profile = session.get(LLMProfile, profile_id)
    if profile is None:
        return None
    if is_default:
        _clear_default_profiles(session)
    profile.name = name
    profile.provider = provider
    profile.base_url = base_url
    profile.model = model
    profile.params_json = params
    profile.is_default = is_default
    if api_key:
        profile.api_key_encrypted = encrypt(api_key)
    session.commit()
    session.refresh(profile)
    return profile


def _clear_default_profiles(session: Session) -> None:
    for p in session.scalars(
        select(LLMProfile).where(LLMProfile.is_default.is_(True))
    ):
        p.is_default = False
    session.flush()


def list_llm_profiles(session: Session) -> list[dict]:
    profiles = session.scalars(select(LLMProfile).order_by(LLMProfile.id)).all()
    result = []
    for p in profiles:
        masked = ""
        if p.api_key_encrypted:
            masked = mask_secret(decrypt(p.api_key_encrypted))
        result.append(
            {
                "id": p.id,
                "name": p.name,
                "provider": p.provider,
                "base_url": p.base_url,
                "model": p.model,
                "api_key": masked,
                "params": p.params_json,
                "is_default": p.is_default,
            }
        )
    return result


def get_decrypted_api_key(session: Session, profile_id: int) -> Optional[str]:
    profile = session.get(LLMProfile, profile_id)
    if profile is None or not profile.api_key_encrypted:
        return None
    return decrypt(profile.api_key_encrypted)


def delete_llm_profile(session: Session, profile_id: int) -> None:
    profile = session.get(LLMProfile, profile_id)
    if profile is not None:
        session.delete(profile)
        session.commit()


# ---------- MCP Servers ----------

def create_mcp_server(
    session: Session,
    *,
    name: str,
    transport: str = "stdio",
    command: Optional[str] = None,
    args: Optional[list] = None,
    env: Optional[dict] = None,
    url: Optional[str] = None,
    enabled: bool = True,
) -> MCPServer:
    server = MCPServer(
        name=name,
        transport=transport,
        command=command,
        args_json=args,
        env_json={k: encrypt(str(v)) for k, v in env.items()} if env else None,
        url=url,
        enabled=enabled,
    )
    session.add(server)
    session.commit()
    session.refresh(server)
    return server


def update_mcp_server(
    session: Session,
    *,
    server_id: int,
    name: str,
    transport: str,
    command: Optional[str] = None,
    args: Optional[list] = None,
    env: Optional[dict] = None,
    url: Optional[str] = None,
    enabled: bool = True,
) -> MCPServer | None:
    server = session.get(MCPServer, server_id)
    if server is None:
        return None
    server.name = name
    server.transport = transport
    server.command = command
    server.args_json = args
    server.url = url
    server.enabled = enabled
    if env is not None:
        server.env_json = {k: encrypt(str(v)) for k, v in env.items()} or None
    session.commit()
    session.refresh(server)
    return server


def list_mcp_servers(session: Session) -> list[dict]:
    servers = session.scalars(select(MCPServer).order_by(MCPServer.id)).all()
    result = []
    for s in servers:
        masked_env = None
        if s.env_json:
            masked_env = {k: mask_secret(decrypt(v)) for k, v in s.env_json.items()}
        result.append(
            {
                "id": s.id,
                "name": s.name,
                "transport": s.transport,
                "command": s.command,
                "args": s.args_json,
                "env": masked_env,
                "url": s.url,
                "enabled": s.enabled,
            }
        )
    return result


def get_mcp_server_env(session: Session, server_id: int) -> dict:
    """Return decrypted env for actually launching the MCP server."""
    server = session.get(MCPServer, server_id)
    if server is None or not server.env_json:
        return {}
    return {k: decrypt(v) for k, v in server.env_json.items()}


# ---------- Preferences ----------

def set_preference(session: Session, key: str, value: dict[str, Any]) -> None:
    pref = session.get(AppPreference, key)
    if pref is None:
        session.add(AppPreference(key=key, value_json=value))
    else:
        pref.value_json = value
    session.commit()


def get_preference(session: Session, key: str) -> Optional[dict]:
    pref = session.get(AppPreference, key)
    return pref.value_json if pref is not None else None
