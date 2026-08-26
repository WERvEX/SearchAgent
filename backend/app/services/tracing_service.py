"""Local, redacted tracing helpers for research runs."""

import datetime as dt
import re
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import TraceRun, TraceSpan


_SECRET_KEYS = re.compile(r"(api[_-]?key|token|password|secret|authorization)", re.I)


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


def redact(value: Any, *, limit: int = 1200) -> str:
    if isinstance(value, dict):
        value = {str(k): "[redacted]" if _SECRET_KEYS.search(str(k)) else v for k, v in value.items()}
    text = str(value)
    return text[:limit]


def start_trace(session: Session, project_id: int) -> str:
    trace_id = f"trace-{uuid.uuid4().hex}"
    session.add(TraceRun(id=trace_id, project_id=project_id))
    session.commit()
    return trace_id


def finish_trace(session: Session, trace_id: str, status: str) -> None:
    trace = session.get(TraceRun, trace_id)
    if trace is not None:
        trace.status = status
        trace.completed_at = _now()
        session.commit()


def start_span(session: Session, trace_id: str, name: str, *, kind: str = "internal", parent_id: str | None = None, attributes: dict | None = None, input_value: Any = None) -> str:
    span_id = f"span-{uuid.uuid4().hex}"
    session.add(TraceSpan(id=span_id, trace_id=trace_id, parent_id=parent_id, name=name, kind=kind, attributes_json=attributes, input_summary=redact(input_value) if input_value is not None else None))
    session.commit()
    return span_id


def finish_span(session: Session, span_id: str, *, status: str = "ok", output_value: Any = None, error: Exception | str | None = None) -> None:
    span = session.get(TraceSpan, span_id)
    if span is not None:
        span.status = status
        span.output_summary = redact(output_value) if output_value is not None else None
        span.error = redact(error) if error is not None else None
        span.ended_at = _now()
        session.commit()


def list_trace(session: Session, project_id: int) -> dict:
    runs = session.query(TraceRun).filter(TraceRun.project_id == project_id).order_by(TraceRun.created_at.desc()).all()
    traces = []
    for run in runs:
        spans = session.query(TraceSpan).filter(TraceSpan.trace_id == run.id).order_by(TraceSpan.started_at).all()
        traces.append({"id": run.id, "status": run.status, "created_at": run.created_at.isoformat(), "completed_at": run.completed_at.isoformat() if run.completed_at else None, "spans": [{"id": span.id, "parent_id": span.parent_id, "name": span.name, "kind": span.kind, "status": span.status, "attributes": span.attributes_json, "input_summary": span.input_summary, "output_summary": span.output_summary, "error": span.error, "started_at": span.started_at.isoformat(), "ended_at": span.ended_at.isoformat() if span.ended_at else None} for span in spans]})
    return {"project_id": project_id, "traces": traces}
