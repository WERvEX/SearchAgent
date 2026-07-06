from typing import Optional

# Providers exposing an OpenAI-compatible API are driven through the
# langchain "openai" integration with a custom base_url.
PROVIDER_ALIASES = {
    "openai_compatible": "openai",
    "compatible": "openai",
}


def resolve_provider(provider: str) -> str:
    return PROVIDER_ALIASES.get(provider, provider)


def resolve_init_kwargs(
    *,
    provider: str,
    model: str,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    params: Optional[dict] = None,
) -> dict:
    """Build the keyword arguments passed to langchain.init_chat_model.

    None/empty base_url and api_key are omitted so provider defaults apply.
    `params` (e.g. temperature) are flattened into the kwargs.
    """
    kwargs: dict = {
        "model": model,
        "model_provider": resolve_provider(provider),
    }
    if base_url:
        kwargs["base_url"] = base_url
    if api_key:
        kwargs["api_key"] = api_key
    if params:
        kwargs.update(params)
    return kwargs
