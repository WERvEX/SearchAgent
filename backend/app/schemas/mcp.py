from urllib.parse import urlparse

from pydantic import BaseModel, Field, model_validator


class MCPServerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    transport: str = "stdio"
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    url: str | None = None
    enabled: bool = True

    @model_validator(mode="after")
    def validate_transport_config(self):
        if self.transport not in {"stdio", "sse", "http", "streamable_http"}:
            raise ValueError("transport must be stdio, sse, http, or streamable_http")

        if self.transport == "stdio":
            if not self.command or not self.command.strip():
                raise ValueError("command is required for stdio transport")
            if self.url is not None:
                raise ValueError("url is only valid for remote MCP transports")
            return self

        if not self.url:
            raise ValueError("url is required for remote MCP transports")
        parsed = urlparse(self.url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("url must be an HTTP(S) URL")
        if self.command is not None or self.args is not None:
            raise ValueError("command and args are only valid for stdio transport")
        return self
