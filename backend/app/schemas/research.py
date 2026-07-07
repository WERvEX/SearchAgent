from typing import Any

from pydantic import BaseModel


class ResearchStartRequest(BaseModel):
    conversation_id: int
    profile_id: int
    user_message: str


class ResearchResumeRequest(BaseModel):
    profile_id: int = 1
    decision: dict[str, Any]


class ResearchRunResponse(BaseModel):
    thread_id: str
    state: dict[str, Any]
    interrupted: bool
    interrupt_payload: dict[str, Any] | None
