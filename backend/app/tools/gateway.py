"""The single execution point for agent tool calls."""

import datetime as dt
from typing import Any, Callable

from langgraph.types import interrupt
from sqlalchemy.orm import Session

from app.core.events import get_event_bus
from app.db.models import ToolCall
from app.services.tracing_service import finish_span, start_span
from app.tools.policy import decide, record_approval


def execute_tool(
    session: Session,
    *,
    project_id: int,
    trace_id: str,
    agent_role: str,
    tool_name: str,
    args: dict,
    tool: Any,
    invoke: Callable[[Any, dict], Any],
    publish: Callable[..., None],
) -> Any:
    decision = decide(session, project_id=project_id, trace_id=trace_id, agent_role=agent_role, tool_name=tool_name, args=args)
    if decision.action == "deny":
        publish("research.tool_denied", tool_name=tool_name, agent_role=agent_role, reason=decision.reason)
        raise PermissionError(decision.reason)
    if decision.action == "approval_required":
        publish("research.tool_approval_required", tool_name=tool_name, agent_role=agent_role, reason=decision.reason, agent_role_name=agent_role)
        response = interrupt({
            "kind": "tool_approval",
            "message": f"Agent {agent_role} requests permission to call {tool_name}.",
            "agent_role": agent_role,
            "tool_name": tool_name,
            "args": {key: value for key, value in args.items() if key not in {"api_key", "token", "password", "secret"}},
            "args_fingerprint": decision.fingerprint,
            "reason": decision.reason,
        })
        approved = isinstance(response, dict) and response.get("kind") == "tool_approval" and bool(response.get("approved")) and response.get("args_fingerprint") == decision.fingerprint
        record_approval(session, project_id=project_id, trace_id=trace_id, agent_role=agent_role, tool_name=tool_name, args_fingerprint=decision.fingerprint, approved=approved)
        if not approved:
            publish("research.tool_denied", tool_name=tool_name, agent_role=agent_role, reason="User denied the tool request.")
            raise PermissionError("User denied the tool request")
    span_id = start_span(session, trace_id, f"tool:{tool_name}", kind="tool", attributes={"agent_role": agent_role, "tool_name": tool_name}, input_value=args)
    call = ToolCall(project_id=project_id, trace_id=trace_id, agent_role=agent_role, tool_name=tool_name, args_json={key: value for key, value in args.items() if key not in {"api_key", "token", "password", "secret"}})
    session.add(call)
    session.commit()
    publish("research.tool_started", tool_name=tool_name, agent_role=agent_role)
    try:
        result = invoke(tool, args)
        call.status = "completed"
        call.result_summary = str(result)[:1200]
        call.completed_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
        session.commit()
        finish_span(session, span_id, output_value=result)
        publish("research.tool_completed", tool_name=tool_name, agent_role=agent_role)
        return result
    except Exception as exc:
        call.status = "failed"
        call.error = str(exc)[:1200]
        call.completed_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
        session.commit()
        finish_span(session, span_id, status="error", error=exc)
        publish("research.tool_completed", tool_name=tool_name, agent_role=agent_role, error=str(exc))
        raise
