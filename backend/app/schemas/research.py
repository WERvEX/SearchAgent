from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


class ResearchStartRequest(BaseModel):
    conversation_id: int = Field(gt=0)
    profile_id: int = Field(gt=0)
    user_message: str = Field(min_length=1, max_length=10_000)

    @field_validator("user_message")
    @classmethod
    def strip_user_message(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("user_message must not be blank")
        return stripped


class ResearchResumeRequest(BaseModel):
    profile_id: int = Field(default=1, gt=0)
    decision: dict[str, Any]

    @model_validator(mode="after")
    def validate_decision(self):
        kind = self.decision.get("kind")
        if kind == "clarification":
            answer = self.decision.get("answer")
            if not isinstance(answer, str) or not answer.strip():
                raise ValueError("decision.answer must be a non-empty string for clarification")
            self.decision["answer"] = answer.strip()
            return self
        if kind not in (None, "plan_approval"):
            raise ValueError("decision.kind must be clarification or plan_approval")
        approved = self.decision.get("approved")
        if not isinstance(approved, bool):
            raise ValueError("decision.approved must be a boolean")
        if approved and not isinstance(self.decision.get("chosen_option"), str):
            raise ValueError("decision.chosen_option is required when approving")
        if kind is None:
            self.decision["kind"] = "plan_approval"
        return self


class ResearchRunResponse(BaseModel):
    thread_id: str
    state: dict[str, Any]
    interrupted: bool
    interrupt_payload: dict[str, Any] | None
