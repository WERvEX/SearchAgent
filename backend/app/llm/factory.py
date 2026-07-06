from typing import Optional

from langchain.chat_models import init_chat_model
from sqlalchemy.orm import Session

from app.db.models import LLMProfile
from app.llm.providers import resolve_init_kwargs
from app.services.settings_service import get_decrypted_api_key


def build_chat_model(
    *,
    provider: str,
    model: str,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    params: Optional[dict] = None,
):
    """Build a LangChain chat model from explicit (plaintext) config."""
    kwargs = resolve_init_kwargs(
        provider=provider,
        model=model,
        base_url=base_url,
        api_key=api_key,
        params=params,
    )
    return init_chat_model(**kwargs)


def build_chat_model_from_profile(session: Session, profile_id: int):
    """Load an LLM profile from the DB and build its chat model.

    Decrypts the stored API key for actual use.
    """
    profile = session.get(LLMProfile, profile_id)
    if profile is None:
        raise ValueError(f"LLM profile {profile_id} not found")

    api_key = get_decrypted_api_key(session, profile_id)
    return build_chat_model(
        provider=profile.provider,
        model=profile.model,
        base_url=profile.base_url,
        api_key=api_key,
        params=profile.params_json,
    )
