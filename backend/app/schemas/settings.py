from typing import Any

from pydantic import BaseModel


class LLMProfileCreate(BaseModel):
    name: str
    provider: str
    base_url: str | None = None
    model: str
    api_key: str | None = None
    params: dict[str, Any] | None = None
    is_default: bool = False


class PreferenceValue(BaseModel):
    value: Any
