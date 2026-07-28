import asyncio
import uuid
from typing import Any, Callable, Optional

from langgraph.types import Command
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.events import get_event_bus
from app.db.models import Conversation, Message, ResearchProject
from app.engine.checkpointer import create_checkpointer
from app.engine.context import EngineContext
from app.engine.graph import compile_research_graph


def _config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}}


def _conversation_title(user_message: str, *, limit: int = 36) -> str:
    title = " ".join(user_message.split()).strip(" \t\r\n。！？!?，,")
    if not title:
        return "Untitled"
    if len(title) <= limit:
        return title
    return title[:limit].rstrip() + "…"


def _state_without_interrupt(result: dict) -> dict:
    return {key: value for key, value in result.items() if key != "__interrupt__"}


def _interrupt_payload(result: dict, graph: Any, config: dict) -> Optional[dict]:
    interrupts = result.get("__interrupt__") or ()
    if not interrupts:
        interrupts = getattr(graph.get_state(config), "interrupts", ()) or ()
    if not interrupts:
        return None

    interrupt = interrupts[0]
    value = getattr(interrupt, "value", {})
    payload = dict(value) if isinstance(value, dict) else {"value": value}
    interrupt_id = getattr(interrupt, "id", None)
    if interrupt_id is not None:
        payload["id"] = interrupt_id
    return payload


def _update_project_status(session: Session, state: dict, status: str) -> None:
    project_id = state.get("project_id")
    if project_id is None:
        return
    project = session.get(ResearchProject, project_id)
    if project is None:
        return
    project.status = status
    project.conversation.status = {
        "awaiting_clarification": "awaiting_clarification",
        "awaiting_approval": "awaiting_approval",
        "done": "completed",
        "failed": "failed",
    }.get(status, "running")
    if state.get("objective"):
        project.objective = state["objective"]
    session.commit()


def _message_meta(*, thread_id: str, project_id: int, profile_id: int, kind: str, interrupt_id: str | None = None) -> dict:
    meta = {
        "research_thread_id": thread_id,
        "research_project_id": project_id,
        "research_profile_id": profile_id,
        "research_kind": kind,
    }
    if interrupt_id:
        meta["research_interrupt_id"] = interrupt_id
    return meta


def _record_message_once(
    session: Session,
    *,
    conversation_id: int,
    role: str,
    content: str,
    meta: dict,
) -> None:
    interrupt_id = meta.get("research_interrupt_id")
    for existing in session.scalars(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.id.desc())
    ):
        existing_meta = existing.meta_json or {}
        if (
            existing.role == role
            and existing_meta.get("research_thread_id") == meta["research_thread_id"]
            and existing_meta.get("research_interrupt_id") == interrupt_id
            and existing_meta.get("research_kind") == meta["research_kind"]
        ):
            return
    session.add(Message(conversation_id=conversation_id, role=role, content=content, meta_json=meta))
    session.commit()


def _waiting_status(payload: Optional[dict]) -> str:
    return "awaiting_clarification" if payload and payload.get("kind") == "clarification" else "awaiting_approval"


def _waiting_event(payload: dict) -> str:
    return "research.awaiting_clarification" if payload.get("kind") == "clarification" else "research.awaiting_approval"


def _persist_clarification_question(
    session: Session, *, thread_id: str, state: dict, profile_id: int, payload: Optional[dict]
) -> None:
    if not payload or payload.get("kind") != "clarification":
        return
    question = str(payload.get("message") or "").strip()
    conversation_id = state.get("conversation_id")
    project_id = state.get("project_id")
    if not question or not isinstance(conversation_id, int) or not isinstance(project_id, int):
        return
    _record_message_once(
        session,
        conversation_id=conversation_id,
        role="assistant",
        content=question,
        meta=_message_meta(
            thread_id=thread_id,
            project_id=project_id,
            profile_id=profile_id,
            kind="clarification_question",
            interrupt_id=str(payload.get("id") or ""),
        ),
    )


def _validate_resume_payload(expected: Optional[dict], decision: dict) -> dict:
    if not expected:
        raise ValueError("Research run is not waiting for input")
    expected_kind = expected.get("kind", "plan_approval")
    actual_kind = decision.get("kind")
    if actual_kind is None and expected_kind == "plan_approval":
        decision = {**decision, "kind": "plan_approval"}
        actual_kind = "plan_approval"
    if actual_kind != expected_kind:
        raise ValueError(f"Expected a {expected_kind} response")
    return decision


def _publish_lifecycle(event_type: str, *, thread_id: str, state: dict, **details: Any) -> None:
    metadata = {
        "thread_id": thread_id,
        "run_id": state.get("run_id") or thread_id,
        "conversation_id": state.get("conversation_id"),
        "project_id": state.get("project_id"),
    }
    get_event_bus().publish(
        {
            "type": event_type,
            "data": {key: value for key, value in {**metadata, **details}.items() if value is not None},
        }
    )


async def start_research(
    session: Session,
    *,
    conversation_id: int,
    profile_id: int,
    user_message: str,
    llm_factory: Optional[Callable[[], Any]] = None,
) -> dict:
    conversation = session.get(Conversation, conversation_id)
    if conversation is not None:
        conversation.status = "running"
        if conversation.title.strip().lower() in {"untitled", "未命名"}:
            conversation.title = _conversation_title(user_message)
    message = Message(
        conversation_id=conversation_id,
        role="user",
        content=user_message,
    )
    project = ResearchProject(
        conversation_id=conversation_id,
        topic=user_message[:120],
        objective="",
        status="planning",
    )
    session.add_all([message, project])
    session.commit()
    session.refresh(project)

    thread_id = f"research-{project.id}-{uuid.uuid4().hex}"
    message.meta_json = _message_meta(
        thread_id=thread_id,
        project_id=project.id,
        profile_id=profile_id,
        kind="research_request",
    )
    session.commit()
    config = _config(thread_id)
    ctx = EngineContext(session=session, profile_id=profile_id, llm_factory=llm_factory)
    graph = compile_research_graph(ctx, checkpointer=create_checkpointer())

    initial_state = {
        "run_id": thread_id,
        "conversation_id": conversation_id,
        "project_id": project.id,
        "messages": [{"role": "user", "content": user_message}],
        "objective": "",
        "plan": None,
        "approved": False,
        "replan_feedback": None,
        "clarification_question": None,
        "steps": [],
        "findings": [],
        "report_md": None,
        "report_id": None,
    }
    _publish_lifecycle("research.started", thread_id=thread_id, state=initial_state)
    try:
        result = await asyncio.to_thread(graph.invoke, initial_state, config)
    except Exception as exc:
        _update_project_status(session, initial_state, "failed")
        message = str(exc) if str(exc).startswith("No usable sources") else "Research run failed."
        _publish_lifecycle(
            "research.failed",
            thread_id=thread_id,
            state=initial_state,
            message=message,
        )
        raise
    payload = _interrupt_payload(result, graph, config)
    state = _state_without_interrupt(result)
    _persist_clarification_question(session, thread_id=thread_id, state=state, profile_id=profile_id, payload=payload)
    _update_project_status(session, state, _waiting_status(payload) if payload is not None else "done")
    if payload is not None:
        _publish_lifecycle(
            _waiting_event(payload),
            thread_id=thread_id,
            state=state,
            option_count=len((state.get("plan") or {}).get("options", [])),
            interrupt_payload=payload,
        )
    else:
        _publish_lifecycle(
            "research.completed",
            thread_id=thread_id,
            state=state,
            report_id=state.get("report_id"),
        )

    return {
        "thread_id": thread_id,
        "state": state,
        "interrupted": payload is not None,
        "interrupt_payload": payload,
    }


async def resume_research(
    session: Session,
    *,
    thread_id: str,
    decision: dict,
    profile_id: int = 1,
    llm_factory: Optional[Callable[[], Any]] = None,
) -> dict:
    config = _config(thread_id)
    ctx = EngineContext(session=session, profile_id=profile_id, llm_factory=llm_factory)
    graph = compile_research_graph(ctx, checkpointer=create_checkpointer())

    graph_state = await asyncio.to_thread(graph.get_state, config)
    state_before = dict(getattr(graph_state, "values", {}) or {})
    expected_payload = _interrupt_payload({}, graph, config)
    decision = _validate_resume_payload(expected_payload, decision)
    if decision["kind"] == "clarification":
        answer = str(decision.get("answer") or "").strip()
        if not answer:
            raise ValueError("A non-empty clarification answer is required")
        conversation_id = state_before.get("conversation_id")
        project_id = state_before.get("project_id")
        if isinstance(conversation_id, int) and isinstance(project_id, int):
            _record_message_once(
                session,
                conversation_id=conversation_id,
                role="user",
                content=answer,
                meta=_message_meta(
                    thread_id=thread_id,
                    project_id=project_id,
                    profile_id=profile_id,
                    kind="clarification_answer",
                    interrupt_id=str(expected_payload.get("id") or ""),
                ),
            )
    _publish_lifecycle("research.resumed", thread_id=thread_id, state=state_before)
    try:
        result = await asyncio.to_thread(graph.invoke, Command(resume=decision), config)
    except Exception as exc:
        _update_project_status(session, state_before, "failed")
        message = str(exc) if str(exc).startswith("No usable sources") else "Research run failed."
        _publish_lifecycle(
            "research.failed",
            thread_id=thread_id,
            state=state_before,
            message=message,
        )
        raise
    payload = _interrupt_payload(result, graph, config)
    state = _state_without_interrupt(result)
    _persist_clarification_question(session, thread_id=thread_id, state=state, profile_id=profile_id, payload=payload)
    _update_project_status(session, state, _waiting_status(payload) if payload is not None else "done")
    if payload is not None:
        _publish_lifecycle(
            _waiting_event(payload),
            thread_id=thread_id,
            state=state,
            option_count=len((state.get("plan") or {}).get("options", [])),
            interrupt_payload=payload,
        )
    else:
        _publish_lifecycle(
            "research.completed",
            thread_id=thread_id,
            state=state,
            report_id=state.get("report_id"),
        )

    return {
        "thread_id": thread_id,
        "state": state,
        "interrupted": payload is not None,
        "interrupt_payload": payload,
    }


async def get_active_research(session: Session, *, conversation_id: int) -> Optional[dict]:
    projects = session.scalars(
        select(ResearchProject)
        .where(
            ResearchProject.conversation_id == conversation_id,
            ResearchProject.status.in_(("awaiting_clarification", "awaiting_approval")),
        )
        .order_by(ResearchProject.id.desc())
    ).all()
    for project in projects:
        for message in session.scalars(
            select(Message).where(Message.conversation_id == conversation_id).order_by(Message.id.desc())
        ):
            meta = message.meta_json or {}
            if meta.get("research_project_id") != project.id or not meta.get("research_thread_id"):
                continue
            thread_id = str(meta["research_thread_id"])
            profile_id = int(meta.get("research_profile_id") or 1)
            graph = compile_research_graph(
                EngineContext(session=session, profile_id=profile_id), checkpointer=create_checkpointer()
            )
            config = _config(thread_id)
            graph_state = await asyncio.to_thread(graph.get_state, config)
            state = dict(getattr(graph_state, "values", {}) or {})
            payload = _interrupt_payload({}, graph, config)
            if payload is not None:
                return {
                    "thread_id": thread_id,
                    "state": state,
                    "interrupted": True,
                    "interrupt_payload": payload,
                }
    return None
