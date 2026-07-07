from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
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
