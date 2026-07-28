from app.llm import providers


def test_resolve_provider_passthrough():
    assert providers.resolve_provider("openai") == "openai"
    assert providers.resolve_provider("anthropic") == "anthropic"


def test_resolve_provider_aliases_compatible_to_openai():
    assert providers.resolve_provider("openai_compatible") == "openai"
    assert providers.resolve_provider("compatible") == "openai"


def test_resolve_init_kwargs_openai_full():
    kwargs = providers.resolve_init_kwargs(
        provider="openai",
        model="gpt-4o",
        base_url="https://api.openai.com/v1",
        api_key="sk-x",
        params={"temperature": 0.2},
    )
    assert kwargs == {
        "model": "gpt-4o",
        "model_provider": "openai",
        "base_url": "https://api.openai.com/v1",
        "api_key": "sk-x",
        "temperature": 0.2,
    }


def test_resolve_init_kwargs_drops_none_and_empty():
    kwargs = providers.resolve_init_kwargs(
        provider="anthropic",
        model="claude-3-5-sonnet-latest",
        base_url=None,
        api_key=None,
        params=None,
    )
    assert kwargs == {
        "model": "claude-3-5-sonnet-latest",
        "model_provider": "anthropic",
    }


def test_resolve_init_kwargs_compatible_provider_resolved():
    kwargs = providers.resolve_init_kwargs(
        provider="openai_compatible",
        model="qwen-max",
        base_url="https://dashscope.example/v1",
        api_key="key",
    )
    assert kwargs["model_provider"] == "openai"
    assert kwargs["base_url"] == "https://dashscope.example/v1"


def test_resolve_init_kwargs_normalizes_mimo_endpoint_to_api_root():
    from app.llm.providers import resolve_init_kwargs

    kwargs = resolve_init_kwargs(
        provider="openai_compatible",
        model="mimo-v2.5-pro",
        base_url="https://api.xiaomimimo.com/v1/responses",
    )

    assert kwargs["base_url"] == "https://api.xiaomimimo.com/v1"
