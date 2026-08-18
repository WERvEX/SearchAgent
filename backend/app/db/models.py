import datetime as dt
from typing import Optional

from sqlalchemy import ForeignKey, JSON, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(default="Untitled")
    status: Mapped[str] = mapped_column(default="active")
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(default=_now, onupdate=_now)

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )
    projects: Mapped[list["ResearchProject"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column()
    content: Mapped[str] = mapped_column(Text)
    meta_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")


class ResearchProject(Base):
    __tablename__ = "research_projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE")
    )
    topic: Mapped[str] = mapped_column()
    objective: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(default="draft")
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    conversation: Mapped["Conversation"] = relationship(back_populates="projects")
    plans: Mapped[list["Plan"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    steps: Mapped[list["Step"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    acceptance_criteria: Mapped[list["AcceptanceCriterion"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    sources: Mapped[list["Source"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    reports: Mapped[list["Report"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("research_projects.id", ondelete="CASCADE")
    )
    version: Mapped[int] = mapped_column(default=1)
    summary: Mapped[str] = mapped_column(Text, default="")
    options_json: Mapped[Optional[list]] = mapped_column(JSON, default=None)
    chosen_option: Mapped[Optional[str]] = mapped_column(default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    project: Mapped["ResearchProject"] = relationship(back_populates="plans")


class Step(Base):
    __tablename__ = "steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("research_projects.id", ondelete="CASCADE")
    )
    seq: Mapped[int] = mapped_column()
    title: Mapped[str] = mapped_column()
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(default="pending")
    result_summary: Mapped[Optional[str]] = mapped_column(Text, default=None)

    project: Mapped["ResearchProject"] = relationship(back_populates="steps")


class AcceptanceCriterion(Base):
    __tablename__ = "acceptance_criteria"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("research_projects.id", ondelete="CASCADE")
    )
    description: Mapped[str] = mapped_column(Text)
    met: Mapped[bool] = mapped_column(Boolean, default=False)
    evidence_ref: Mapped[Optional[str]] = mapped_column(default=None)

    project: Mapped["ResearchProject"] = relationship(
        back_populates="acceptance_criteria"
    )


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("research_projects.id", ondelete="CASCADE")
    )
    step_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("steps.id", ondelete="SET NULL"), default=None
    )
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(default="")
    snippet: Mapped[Optional[str]] = mapped_column(Text, default=None)
    tool_name: Mapped[str] = mapped_column(default="")
    retrieved_at: Mapped[dt.datetime] = mapped_column(default=_now)

    project: Mapped["ResearchProject"] = relationship(back_populates="sources")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("research_projects.id", ondelete="CASCADE")
    )
    version: Mapped[int] = mapped_column(default=1)
    format: Mapped[str] = mapped_column(default="md")
    content_md: Mapped[str] = mapped_column(Text, default="")
    file_path: Mapped[Optional[str]] = mapped_column(default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    project: Mapped["ResearchProject"] = relationship(back_populates="reports")


class LLMProfile(Base):
    __tablename__ = "llm_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    provider: Mapped[str] = mapped_column()
    base_url: Mapped[Optional[str]] = mapped_column(default=None)
    model: Mapped[str] = mapped_column()
    api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, default=None)
    params_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class MCPServer(Base):
    __tablename__ = "mcp_servers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    transport: Mapped[str] = mapped_column(default="stdio")  # stdio | http | sse
    command: Mapped[Optional[str]] = mapped_column(default=None)
    args_json: Mapped[Optional[list]] = mapped_column(JSON, default=None)
    env_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    url: Mapped[Optional[str]] = mapped_column(default=None)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class AppPreference(Base):
    __tablename__ = "app_preferences"

    key: Mapped[str] = mapped_column(primary_key=True)
    value_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)


class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("research_projects.id", ondelete="CASCADE"))
    trace_id: Mapped[str] = mapped_column(index=True)
    role: Mapped[str] = mapped_column()
    title: Mapped[str] = mapped_column()
    status: Mapped[str] = mapped_column(default="pending")
    input_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    output_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)
    started_at: Mapped[Optional[dt.datetime]] = mapped_column(default=None)
    completed_at: Mapped[Optional[dt.datetime]] = mapped_column(default=None)


class ToolPolicy(Base):
    __tablename__ = "tool_policies"

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(default=1)
    agent_role: Mapped[str] = mapped_column(index=True)
    tool_name: Mapped[str] = mapped_column(index=True)
    allowed_domains_json: Mapped[Optional[list]] = mapped_column(JSON, default=None)
    require_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class ToolApproval(Base):
    __tablename__ = "tool_approvals"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("research_projects.id", ondelete="CASCADE"))
    trace_id: Mapped[str] = mapped_column(index=True)
    agent_role: Mapped[str] = mapped_column()
    tool_name: Mapped[str] = mapped_column()
    args_fingerprint: Mapped[str] = mapped_column(index=True)
    decision: Mapped[str] = mapped_column(default="approved")
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class ToolCall(Base):
    __tablename__ = "tool_calls"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("research_projects.id", ondelete="CASCADE"))
    trace_id: Mapped[str] = mapped_column(index=True)
    task_id: Mapped[Optional[int]] = mapped_column(ForeignKey("agent_tasks.id", ondelete="SET NULL"), default=None)
    agent_role: Mapped[str] = mapped_column()
    tool_name: Mapped[str] = mapped_column()
    args_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    status: Mapped[str] = mapped_column(default="started")
    result_summary: Mapped[Optional[str]] = mapped_column(Text, default=None)
    error: Mapped[Optional[str]] = mapped_column(Text, default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)
    completed_at: Mapped[Optional[dt.datetime]] = mapped_column(default=None)


class TraceRun(Base):
    __tablename__ = "trace_runs"

    id: Mapped[str] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("research_projects.id", ondelete="CASCADE"), index=True)
    root_name: Mapped[str] = mapped_column(default="research")
    status: Mapped[str] = mapped_column(default="running")
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)
    completed_at: Mapped[Optional[dt.datetime]] = mapped_column(default=None)


class TraceSpan(Base):
    __tablename__ = "trace_spans"

    id: Mapped[str] = mapped_column(primary_key=True)
    trace_id: Mapped[str] = mapped_column(ForeignKey("trace_runs.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[Optional[str]] = mapped_column(ForeignKey("trace_spans.id", ondelete="SET NULL"), default=None)
    name: Mapped[str] = mapped_column()
    kind: Mapped[str] = mapped_column(default="internal")
    status: Mapped[str] = mapped_column(default="running")
    attributes_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    input_summary: Mapped[Optional[str]] = mapped_column(Text, default=None)
    output_summary: Mapped[Optional[str]] = mapped_column(Text, default=None)
    error: Mapped[Optional[str]] = mapped_column(Text, default=None)
    started_at: Mapped[dt.datetime] = mapped_column(default=_now)
    ended_at: Mapped[Optional[dt.datetime]] = mapped_column(default=None)


class EvaluationDataset(Base):
    __tablename__ = "evaluation_datasets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    version: Mapped[int] = mapped_column(default=1)
    description: Mapped[str] = mapped_column(Text, default="")
    judge_profile_id: Mapped[Optional[int]] = mapped_column(ForeignKey("llm_profiles.id", ondelete="SET NULL"), default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class EvaluationCase(Base):
    __tablename__ = "evaluation_cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("evaluation_datasets.id", ondelete="CASCADE"))
    input_text: Mapped[str] = mapped_column(Text)
    expected_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("evaluation_datasets.id", ondelete="CASCADE"))
    profile_id: Mapped[int] = mapped_column(ForeignKey("llm_profiles.id", ondelete="RESTRICT"))
    judge_profile_id: Mapped[Optional[int]] = mapped_column(ForeignKey("llm_profiles.id", ondelete="SET NULL"), default=None)
    status: Mapped[str] = mapped_column(default="completed")
    metrics_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class EvaluationScore(Base):
    __tablename__ = "evaluation_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("evaluation_runs.id", ondelete="CASCADE"))
    case_id: Mapped[int] = mapped_column(ForeignKey("evaluation_cases.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column()
    metrics_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)
