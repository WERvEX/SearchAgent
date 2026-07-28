from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class ResearchStartRequest(BaseModel):
    conversation_id: int = Field(gt=0)
    profile_id: int = Field(gt=0)
    user_message: str = Field(min_length=1, max_length=10_000)
    response_language: Literal["en", "zh-CN"] = "zh-CN"

    @field_validator("user_message")
    @classmethod
    def strip_user_message(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("user_message must not be blank")
        return stripped


class ResearchResumeRequest(BaseModel):
    profile_id: int = Field(default=1, gt=0)
    response_language: Literal["en", "zh-CN"] | None = None
    decision: dict[str, Any]

    @model_validator(mode="after")
    def validate_decision(self):
        kind = self.decision.get("kind")
        if kind == "planning_message":
            message = self.decision.get("message")
            if not isinstance(message, str) or not message.strip():
                raise ValueError("decision.message must be a non-empty string")
            self.decision["message"] = message.strip()
            return self
        if kind == "planning_answers":
            answers = self.decision.get("answers")
            if not isinstance(answers, list) or not answers:
                raise ValueError("decision.answers must be a non-empty list")
            for answer in answers:
                if not isinstance(answer, dict) or not isinstance(answer.get("question_id"), str):
                    raise ValueError("each planning answer requires question_id")
                option_id = answer.get("option_id")
                text = answer.get("text")
                if option_id is None and (not isinstance(text, str) or not text.strip()):
                    raise ValueError("each planning answer requires option_id or non-empty text")
                if option_id is not None and not isinstance(option_id, str):
                    raise ValueError("answer.option_id must be a string")
                if isinstance(text, str):
                    answer["text"] = text.strip()
            return self
        if kind == "execute_plan":
            if not isinstance(self.decision.get("plan_version"), int):
                raise ValueError("decision.plan_version is required when executing")
            return self
        if kind == "clarification":
            answer = self.decision.get("answer")
            if not isinstance(answer, str) or not answer.strip():
                raise ValueError("decision.answer must be a non-empty string for clarification")
            self.decision["answer"] = answer.strip()
            return self
        if kind not in (None, "plan_approval"):
            raise ValueError(
                "decision.kind must be planning_message, planning_answers, execute_plan, "
                "clarification, or plan_approval"
            )
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


class ResearchFollowUpRequest(BaseModel):
    conversation_id: int = Field(gt=0)
    project_id: int = Field(gt=0)
    profile_id: int = Field(gt=0)
    message: str = Field(min_length=1, max_length=10_000)
    response_language: Literal["en", "zh-CN"] = "zh-CN"
    route_override: str | None = None

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("message must not be blank")
        return stripped

    @field_validator("route_override")
    @classmethod
    def validate_route(cls, value: str | None) -> str | None:
        if value not in (None, "replan", "report_revision"):
            raise ValueError("route_override must be replan or report_revision")
        return value


class ResearchFollowUpResponse(BaseModel):
    route: str
    reason: str
    run: ResearchRunResponse | None = None
    report_id: int | None = None
