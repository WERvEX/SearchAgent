from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.models import AgentTask, Conversation, LLMProfile, ResearchProject, Source, Step, ToolApproval, ToolCall
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
