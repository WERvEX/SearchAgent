from pydantic import BaseModel


class MCPServerCreate(BaseModel):
    name: str
    transport: str = "stdio"
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    url: str | None = None
    enabled: bool = True
