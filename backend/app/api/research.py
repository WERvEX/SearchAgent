from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.models import Conversation, LLMProfile
from app.engine import runner
from app.schemas.research import (
    ResearchResumeRequest,
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
    return await runner.start_research(
        session,
        conversation_id=payload.conversation_id,
        profile_id=payload.profile_id,
        user_message=payload.user_message,
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
    )


@router.get("/active/{conversation_id}", response_model=ResearchRunResponse | None)
async def active_research_endpoint(
    conversation_id: int,
    session: Session = Depends(get_db),
):
    if session.get(Conversation, conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return await runner.get_active_research(session, conversation_id=conversation_id)
