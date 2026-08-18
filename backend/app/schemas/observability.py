from typing import Any

from pydantic import BaseModel, Field


class ToolPolicyPayload(BaseModel):
    agent_role: str = Field(min_length=1, max_length=80)
    tool_name: str = Field(min_length=1, max_length=160)
    allowed_domains: list[str] = Field(default_factory=list)
    require_approval: bool = False
    enabled: bool = True


class ToolApprovalPayload(BaseModel):
    approved: bool
    profile_id: int = Field(default=1, gt=0)
    agent_role: str = Field(min_length=1)
    tool_name: str = Field(min_length=1)
    args_fingerprint: str = Field(min_length=16)


class EvaluationDatasetPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    judge_profile_id: int | None = Field(default=None, gt=0)


class EvaluationCasePayload(BaseModel):
    input_text: str = Field(min_length=1, max_length=10_000)
    expected: dict[str, Any] | None = None


class EvaluationRunPayload(BaseModel):
    profile_id: int = Field(gt=0)
    judge_profile_id: int | None = Field(default=None, gt=0)
