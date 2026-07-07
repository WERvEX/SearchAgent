import uuid
from typing import Any, Callable, Optional

from langgraph.types import Command
from sqlalchemy.orm import Session

from app.db.models import Message, ResearchProject
from app.engine.checkpointer import create_checkpointer
from app.engine.context import EngineContext
from app.engine.graph import compile_research_graph


def _config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}}


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
    if state.get("objective"):
        project.objective = state["objective"]
    session.commit()


async def start_research(
    session: Session,
    *,
    conversation_id: int,
    profile_id: int,
    user_message: str,
    llm_factory: Optional[Callable[[], Any]] = None,
) -> dict:
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
    config = _config(thread_id)
    ctx = EngineContext(session=session, profile_id=profile_id, llm_factory=llm_factory)
    graph = compile_research_graph(ctx, checkpointer=create_checkpointer())

    initial_state = {
        "conversation_id": conversation_id,
        "project_id": project.id,
        "messages": [{"role": "user", "content": user_message}],
        "objective": "",
        "plan": None,
        "approved": False,
        "steps": [],
        "findings": [],
        "report_md": None,
    }
    result = graph.invoke(initial_state, config)
    payload = _interrupt_payload(result, graph, config)
    state = _state_without_interrupt(result)
    _update_project_status(
        session,
        state,
        "awaiting_approval" if payload is not None else "done",
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

    result = graph.invoke(Command(resume=decision), config)
    payload = _interrupt_payload(result, graph, config)
    state = _state_without_interrupt(result)
    _update_project_status(
        session,
        state,
        "awaiting_approval" if payload is not None else "done",
    )

    return {
        "thread_id": thread_id,
        "state": state,
        "interrupted": payload is not None,
        "interrupt_payload": payload,
    }
