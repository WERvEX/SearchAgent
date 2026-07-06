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
    secret_encrypted: Mapped[Optional[str]] = mapped_column(Text, default=None)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class AppPreference(Base):
    __tablename__ = "app_preferences"

    key: Mapped[str] = mapped_column(primary_key=True)
    value_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
