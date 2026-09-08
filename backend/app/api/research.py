from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.models import AgentTask, Conversation, LLMProfile, Message, RepositorySnapshot, ResearchProject, Source, Step, ToolApproval, ToolCall
from app.engine import runner
from app.schemas.research import (
    ResearchResumeRequest,
    ResearchFollowUpRequest,
    ResearchFollowUpResponse,
    ResearchRunResponse,
    ResearchStartRequest,
)

router = APIRouter(prefix="/research", tags=["research"])


@router.post("/start", response_model=ResearchRunResponse)
async def start_research_endpoint(
    payload: ResearchStartRequest,
    session: Session = Depends(get_db),
):
    if session.get(Conversation, payload.conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if session.get(LLMProfile, payload.profile_id) is None:
        raise HTTPException(status_code=404, detail="LLM profile not found")
    kwargs = {
        "conversation_id": payload.conversation_id,
        "profile_id": payload.profile_id,
        "user_message": payload.user_message,
        "response_language": payload.response_language,
    }
    if payload.workflow_mode != "research":
        kwargs["workflow_mode"] = payload.workflow_mode
    return await runner.start_research(
        session,
        **kwargs,
    )


@router.post("/{thread_id}/resume", response_model=ResearchRunResponse)
async def resume_research_endpoint(
    thread_id: str,
    payload: ResearchResumeRequest,
    session: Session = Depends(get_db),
):
    return await runner.resume_research(
        session,
        thread_id=thread_id,
        decision=payload.decision,
        profile_id=payload.profile_id,
        response_language=payload.response_language,
    )


def _project_id_for_thread(session: Session, thread_id: str) -> int | None:
    for message in session.query(Message).order_by(Message.id.desc()):
        meta = message.meta_json or {}
        if meta.get("research_thread_id") == thread_id and isinstance(meta.get("research_project_id"), int):
            return meta["research_project_id"]
    return None


@router.get("/{thread_id}/repository-snapshot")
def repository_snapshot(thread_id: str, session: Session = Depends(get_db)):
    project_id = _project_id_for_thread(session, thread_id)
    project = session.get(ResearchProject, project_id) if project_id else None
    snapshot = session.get(RepositorySnapshot, project.repository_snapshot_id) if project and project.repository_snapshot_id else None
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Repository snapshot not found")
    result = dict(snapshot.snapshot_json or {})
    result["snapshot_id"] = snapshot.id
    return result


@router.post("/{thread_id}/repository/rescan", response_model=ResearchRunResponse)
async def rescan_repository(thread_id: str, payload: ResearchResumeRequest, session: Session = Depends(get_db)):
    decision = {**payload.decision, "kind": "repository_review", "confirmed": False}
    return await runner.resume_research(
        session, thread_id=thread_id, decision=decision, profile_id=payload.profile_id,
        response_language=payload.response_language,
    )


@router.post("/follow-up", response_model=ResearchFollowUpResponse)
async def follow_up_research_endpoint(
    payload: ResearchFollowUpRequest,
    session: Session = Depends(get_db),
):
    if session.get(Conversation, payload.conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if session.get(LLMProfile, payload.profile_id) is None:
        raise HTTPException(status_code=404, detail="LLM profile not found")
    try:
        return await runner.follow_up_research(
            session,
            conversation_id=payload.conversation_id,
            project_id=payload.project_id,
            profile_id=payload.profile_id,
            message=payload.message,
            response_language=payload.response_language,
            route_override=payload.route_override,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/projects/{project_id}/execution")
def project_execution_detail(
    project_id: int,
    session: Session = Depends(get_db),
):
    project = session.get(ResearchProject, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Research project not found")
    project_completed = project.status in {"done", "completed"} and bool(project.reports)
    return {
        "project_id": project.id,
        "status": project.status,
        "steps": [
            {
                "id": step.id,
                "seq": step.seq,
                "title": step.title,
                "description": step.description,
                    "status": (
                        "completed"
                        if project_completed and step.status in {"pending", "running"}
                        else step.status
                    ),
                "result_summary": step.result_summary,
            }
            for step in session.query(Step).filter(Step.project_id == project.id).order_by(Step.seq)
        ],
        "sources": [
            {
                "id": source.id,
                "title": source.title,
                "url": source.url,
                "snippet": source.snippet,
                "tool_name": source.tool_name,
            }
            for source in session.query(Source).filter(Source.project_id == project.id).order_by(Source.id)
        ],
        "reports": [
            {
                "id": report.id,
                "version": report.version,
                "created_at": report.created_at.isoformat(),
            }
            for report in sorted(project.reports, key=lambda item: (item.version, item.id))
        ],
        "artifacts": [
            {"id": artifact.id, "plan_version": artifact.plan_version, "artifact_kind": artifact.artifact_kind,
             "format": artifact.format, "created_at": artifact.created_at.isoformat()}
            for artifact in sorted(project.artifacts, key=lambda item: item.id)
        ],
        "agent_tasks": [
            {"id": task.id, "role": task.role, "title": task.title, "status": task.status,
             "input": task.input_json, "output": task.output_json}
            for task in session.query(AgentTask).filter(AgentTask.project_id == project.id).order_by(AgentTask.id)
        ],
        "tool_calls": [
            {"id": call.id, "task_id": call.task_id, "agent_role": call.agent_role,
             "tool_name": call.tool_name, "status": call.status, "result_summary": call.result_summary,
             "error": call.error}
            for call in session.query(ToolCall).filter(ToolCall.project_id == project.id).order_by(ToolCall.id)
        ],
        "approvals": [
            {"id": approval.id, "agent_role": approval.agent_role, "tool_name": approval.tool_name,
             "decision": approval.decision, "args_fingerprint": approval.args_fingerprint}
            for approval in session.query(ToolApproval).filter(ToolApproval.project_id == project.id).order_by(ToolApproval.id)
        ],
    }


@router.get("/active/{conversation_id}", response_model=ResearchRunResponse | None)
async def active_research_endpoint(
    conversation_id: int,
    session: Session = Depends(get_db),
):
    if session.get(Conversation, conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return await runner.get_active_research(session, conversation_id=conversation_id)
