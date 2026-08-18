import asyncio
import uuid
from typing import Any, Callable, Optional

from langgraph.types import Command
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.events import get_event_bus
from app.db.models import Conversation, Message, Report, ResearchProject, Source
from app.engine.checkpointer import create_checkpointer
from app.engine.context import EngineContext
from app.engine.graph import compile_research_graph
from app.services.report_markdown import normalize_report_markdown
from app.services.tracing_service import finish_trace, start_trace
from app.tools.policy import ensure_default_policies


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
        "planning": "planning",
        "awaiting_execution": "awaiting_execution",
        "awaiting_approval": "awaiting_approval",
        "executing": "executing",
        "revising_report": "revising_report",
        "done": "completed",
        "failed": "failed",
    }.get(status, "running")
    if state.get("objective"):
        project.objective = state["objective"]
    session.commit()


def _message_meta(
    *,
    thread_id: str,
    project_id: int,
    profile_id: int,
    kind: str,
    interrupt_id: str | None = None,
    interaction: dict | None = None,
) -> dict:
    meta = {
        "research_thread_id": thread_id,
        "research_project_id": project_id,
        "research_profile_id": profile_id,
        "research_kind": kind,
    }
    if interrupt_id:
        meta["research_interrupt_id"] = interrupt_id
    if interaction:
        meta["research_interaction"] = interaction
    return meta


def _planning_answer_message(expected: dict, answers: list[dict]) -> str:
    questions = expected.get("questions")
    if not isinstance(questions, list) or not questions:
        raise ValueError("The current planning prompt does not accept structured answers")
    question_by_id = {
        str(question.get("id")): question
        for question in questions
        if isinstance(question, dict) and question.get("id")
    }
    answer_by_id: dict[str, dict] = {}
    for answer in answers:
        question_id = str(answer.get("question_id") or "")
        if question_id not in question_by_id or question_id in answer_by_id:
            raise ValueError("Planning answers contain an unknown or duplicate question")
        answer_by_id[question_id] = answer
    if set(answer_by_id) != set(question_by_id):
        raise ValueError("Every planning question must be answered")

    lines: list[str] = []
    for question_id, question in question_by_id.items():
        answer = answer_by_id[question_id]
        options = {
            str(option.get("id")): option
            for option in question.get("options", [])
            if isinstance(option, dict) and option.get("id")
        }
        option_id = answer.get("option_id")
        if option_id is not None:
            option = options.get(str(option_id))
            if option is None:
                raise ValueError("A selected planning option is no longer available")
            value = str(option.get("label") or "").strip()
        else:
            if not question.get("allow_custom", True):
                raise ValueError("This planning question does not allow a custom answer")
            value = str(answer.get("text") or "").strip()
            if not value:
                raise ValueError("Custom planning answers must not be blank")
        lines.append(f"{question.get('prompt')}: {value}")
    return "\n".join(lines)


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
    if payload and payload.get("kind") == "tool_approval":
        return "awaiting_approval"
    if payload and payload.get("kind") in {"planning_input", "clarification"}:
        return "planning"
    return "awaiting_execution"


def _waiting_event(payload: dict) -> str:
    if payload.get("kind") == "tool_approval":
        return "research.tool_approval_required"
    if payload.get("kind") in {"planning_input", "clarification"}:
        return "research.planning_message"
    return "research.plan_ready"


def _persist_waiting_message(
    session: Session, *, thread_id: str, state: dict, profile_id: int, payload: Optional[dict]
) -> None:
    if not payload or payload.get("kind") == "tool_approval" or payload.get("kind") not in {
        "planning_input",
        "plan_ready",
        "clarification",
        "plan_approval",
        "tool_approval",
    }:
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
            kind="plan_ready" if payload.get("kind") in {"plan_ready", "plan_approval"} else "planning_response",
            interrupt_id=str(payload.get("id") or ""),
            interaction={
                "kind": payload.get("kind"),
                "questions": payload.get("questions") or [],
            } if payload.get("questions") else None,
        ),
    )


def _validate_resume_payload(expected: Optional[dict], decision: dict) -> dict:
    if not expected:
        raise ValueError("Research run is not waiting for input")
    expected_kind = expected.get("kind", "plan_approval")
    actual_kind = decision.get("kind")
    if actual_kind is None and expected_kind in {"plan_approval", "plan_ready"}:
        decision = {**decision, "kind": "plan_approval"}
        actual_kind = "plan_approval"
    compatible = {
        "planning_input": {"planning_message", "planning_answers", "clarification"},
        "plan_ready": {"planning_message", "execute_plan", "plan_approval"},
        "clarification": {"clarification", "planning_message"},
        "plan_approval": {"plan_approval", "planning_message", "execute_plan"},
        "tool_approval": {"tool_approval"},
    }
    if actual_kind not in compatible.get(expected_kind, {expected_kind}):
        raise ValueError(f"Expected a response for {expected_kind}")
    if actual_kind == "planning_answers":
        decision = {
            **decision,
            "message": _planning_answer_message(expected, decision.get("answers") or []),
        }
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
    response_language: str = "zh-CN",
    llm_factory: Optional[Callable[[], Any]] = None,
) -> dict:
    conversation = session.get(Conversation, conversation_id)
    prior_messages = [
        {"role": item.role, "content": item.content}
        for item in (conversation.messages[-12:] if conversation is not None else [])
    ]
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
    ensure_default_policies(session)
    trace_id = start_trace(session, project.id)

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
        "trace_id": trace_id,
        "conversation_id": conversation_id,
        "project_id": project.id,
        "response_language": response_language,
        "messages": [*prior_messages, {"role": "user", "content": user_message}],
        "objective": "",
        "plan": None,
        "plan_version": None,
        "plan_ready": False,
        "planner_message": None,
        "planner_questions": [],
        "approved": False,
        "replan_feedback": None,
        "clarification_question": None,
        "steps": [],
        "findings": [],
        "report_md": None,
        "report_id": None,
        "agent_tasks": [],
        "verified_findings": [],
    }
    _publish_lifecycle("research.started", thread_id=thread_id, state=initial_state)
    try:
        result = await asyncio.to_thread(graph.invoke, initial_state, config)
    except Exception as exc:
        _update_project_status(session, initial_state, "failed")
        finish_trace(session, trace_id, "failed")
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
    _persist_waiting_message(session, thread_id=thread_id, state=state, profile_id=profile_id, payload=payload)
    _update_project_status(session, state, _waiting_status(payload) if payload is not None else "done")
    if payload is not None:
        _publish_lifecycle(
            _waiting_event(payload),
            thread_id=thread_id,
            state=state,
            plan_version=state.get("plan_version"),
            step_count=len(state.get("steps") or []),
            interrupt_payload=payload,
        )
    else:
        finish_trace(session, trace_id, "completed")
        _publish_lifecycle(
            "research.completed",
            thread_id=thread_id,
            state=state,
            report_id=state.get("report_id"),
        )

    return {
        "thread_id": thread_id,
        "trace_id": trace_id,
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
    response_language: str | None = None,
    llm_factory: Optional[Callable[[], Any]] = None,
) -> dict:
    config = _config(thread_id)
    ctx = EngineContext(session=session, profile_id=profile_id, llm_factory=llm_factory)
    graph = compile_research_graph(ctx, checkpointer=create_checkpointer())

    graph_state = await asyncio.to_thread(graph.get_state, config)
    state_before = dict(getattr(graph_state, "values", {}) or {})
    if response_language is not None:
        state_before["response_language"] = response_language
        decision = {**decision, "response_language": response_language}
    expected_payload = _interrupt_payload({}, graph, config)
    decision = _validate_resume_payload(expected_payload, decision)
    if decision["kind"] in {"clarification", "planning_message", "planning_answers"}:
        answer = str(decision.get("answer") or decision.get("message") or "").strip()
        if not answer:
            raise ValueError("A non-empty planning message is required")
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
                    kind="planning_message",
                    interrupt_id=str(expected_payload.get("id") or ""),
                    interaction={
                        "kind": "planning_answers",
                        "answers": decision.get("answers") or [],
                    } if decision["kind"] == "planning_answers" else None,
                ),
            )
    if decision["kind"] in {"execute_plan", "plan_approval"} and decision.get("approved", True):
        _update_project_status(session, state_before, "executing")
        _publish_lifecycle(
            "research.execution_started",
            thread_id=thread_id,
            state=state_before,
            plan_version=state_before.get("plan_version"),
        )
    _publish_lifecycle("research.resumed", thread_id=thread_id, state=state_before)
    try:
        result = await asyncio.to_thread(graph.invoke, Command(resume=decision), config)
    except Exception as exc:
        _update_project_status(session, state_before, "failed")
        if state_before.get("trace_id"):
            finish_trace(session, state_before["trace_id"], "failed")
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
    _persist_waiting_message(session, thread_id=thread_id, state=state, profile_id=profile_id, payload=payload)
    _update_project_status(session, state, _waiting_status(payload) if payload is not None else "done")
    if payload is not None:
        _publish_lifecycle(
            _waiting_event(payload),
            thread_id=thread_id,
            state=state,
            plan_version=state.get("plan_version"),
            step_count=len(state.get("steps") or []),
            interrupt_payload=payload,
        )
    else:
        if state.get("trace_id"):
            finish_trace(session, state["trace_id"], "completed")
        _publish_lifecycle(
            "research.completed",
            thread_id=thread_id,
            state=state,
            report_id=state.get("report_id"),
        )

    return {
        "thread_id": thread_id,
        "trace_id": state.get("trace_id"),
        "state": state,
        "interrupted": payload is not None,
        "interrupt_payload": payload,
    }


async def get_active_research(session: Session, *, conversation_id: int) -> Optional[dict]:
    projects = session.scalars(
        select(ResearchProject)
        .where(
            ResearchProject.conversation_id == conversation_id,
            ResearchProject.status.in_((
                "planning",
                "awaiting_execution",
                "executing",
                "awaiting_clarification",
                "awaiting_approval",
            )),
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
            if project.status == "executing":
                return {
                    "thread_id": thread_id,
                    "state": {**state, "phase": "executing"},
                    "interrupted": False,
                    "interrupt_payload": None,
                }
    return None


def _follow_up_route(
    message: str,
    *,
    route_override: str | None = None,
    response_language: str = "zh-CN",
) -> tuple[str, str]:
    chinese = response_language == "zh-CN"
    if route_override:
        return route_override, (
            "用户已手动更改后续处理方式。"
            if chinese
            else "The user manually changed the follow-up route."
        )
    lowered = message.lower()
    research_markers = (
        "重新研究", "重新执行", "调整计划", "新增事实", "补充数据", "最新数据",
        "更多来源", "扩大范围", "换个范围", "investigate", "research", "new source",
    )
    revision_markers = (
        "润色", "改写", "格式", "结构", "摘要", "措辞", "翻译", "精简",
        "排版", "标题", "rewrite", "format", "summarize", "translate",
    )
    if any(marker in lowered for marker in research_markers):
        return "replan", (
            "请求涉及研究范围、证据或执行计划变化。"
            if chinese
            else "The request changes the research scope, evidence, or execution plan."
        )
    if any(marker in lowered for marker in revision_markers):
        return "report_revision", (
            "请求仅涉及现有报告的表达或结构调整。"
            if chinese
            else "The request only changes the wording or structure of the existing report."
        )
    return "replan", (
        "请求可能需要新增事实，默认进入重新规划以避免无证据改写。"
        if chinese
        else "The request may require new facts, so it defaults to replanning."
    )


async def follow_up_research(
    session: Session,
    *,
    conversation_id: int,
    project_id: int,
    profile_id: int,
    message: str,
    response_language: str = "zh-CN",
    route_override: str | None = None,
    llm_factory: Optional[Callable[[], Any]] = None,
) -> dict:
    project = session.get(ResearchProject, project_id)
    if project is None or project.conversation_id != conversation_id:
        raise ValueError("Research project not found in the conversation")
    route, reason = _follow_up_route(
        message,
        route_override=route_override,
        response_language=response_language,
    )
    if route == "replan":
        run = await start_research(
            session,
            conversation_id=conversation_id,
            profile_id=profile_id,
            user_message=message,
            response_language=response_language,
            llm_factory=llm_factory,
        )
        run["state"]["follow_up_route"] = route
        run["state"]["follow_up_reason"] = reason
        return {"route": route, "reason": reason, "run": run, "report_id": None}

    latest_report = max(project.reports, key=lambda report: (report.version, report.id), default=None)
    if latest_report is None:
        raise ValueError("No report is available to revise")

    followup_id = uuid.uuid4().hex
    thread_id = f"revision-{project.id}-{followup_id}"
    meta = _message_meta(
        thread_id=thread_id,
        project_id=project.id,
        profile_id=profile_id,
        kind="report_revision_request",
        interrupt_id=followup_id,
    )
    _record_message_once(
        session,
        conversation_id=conversation_id,
        role="user",
        content=message,
        meta=meta,
    )
    _update_project_status(session, {"project_id": project.id}, "revising_report")
    _publish_lifecycle(
        "research.report_revision_started",
        thread_id=thread_id,
        state={"conversation_id": conversation_id, "project_id": project.id},
        message=message,
    )

    evidence = [
        {"title": source.title, "url": source.url, "snippet": source.snippet}
        for source in session.scalars(
            select(Source).where(Source.project_id == project.id).order_by(Source.id)
        )
    ]
    prompt = (
        "Revise the existing Markdown research report according to the user request. "
        "Preserve factual claims and citations, use only the supplied report and evidence, "
        "and return the complete revised Markdown with no surrounding code fence.\n"
        f"Write the response in {'Simplified Chinese' if response_language == 'zh-CN' else 'English'}.\n"
        f"Request: {message}\n"
        f"Evidence: {evidence}\n"
        f"Existing report:\n{latest_report.content_md}"
    )
    try:
        if llm_factory is not None:
            llm = llm_factory()
        else:
            from app.llm.factory import build_chat_model_from_profile

            llm = build_chat_model_from_profile(session, profile_id)
        response = await asyncio.to_thread(llm.invoke, prompt)
        revised = str(getattr(response, "content", response) or "").strip()
    except Exception:
        revised = ""
    if not revised:
        raise RuntimeError("Report revision failed")
    revised = normalize_report_markdown(revised, len(evidence))

    from app.engine.persistence import persist_report

    report = persist_report(session, project_id=project.id, content_md=revised)
    _record_message_once(
        session,
        conversation_id=conversation_id,
        role="assistant",
        content=(
            "已根据你的要求生成新的报告版本。"
            if response_language == "zh-CN"
            else "A new report version has been generated from your request."
        ),
        meta=_message_meta(
            thread_id=thread_id,
            project_id=project.id,
            profile_id=profile_id,
            kind="report_revision_completed",
            interrupt_id=followup_id,
        ),
    )
    _update_project_status(session, {"project_id": project.id}, "done")
    _publish_lifecycle(
        "research.report_revised",
        thread_id=thread_id,
        state={"conversation_id": conversation_id, "project_id": project.id},
        report_id=report.id,
        report_version=report.version,
    )
    return {"route": route, "reason": reason, "run": None, "report_id": report.id}
