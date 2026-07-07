from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.models import Conversation
from app.schemas.conversations import (
    ConversationCreate,
    ConversationDetail,
    ConversationRead,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("", response_model=ConversationRead)
def create_conversation(
    payload: ConversationCreate, session: Session = Depends(get_db)
):
    conv = Conversation(title=payload.title)
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return conv


@router.get("", response_model=list[ConversationRead])
def list_conversations(session: Session = Depends(get_db)):
    return session.scalars(select(Conversation).order_by(Conversation.id)).all()


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: int, session: Session = Depends(get_db)):
    conv = session.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationDetail(
        id=conv.id,
        title=conv.title,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[
            {"id": m.id, "role": m.role, "content": m.content, "meta": m.meta_json}
            for m in conv.messages
        ],
        projects=[
            {
                "id": p.id,
                "topic": p.topic,
                "objective": p.objective,
                "status": p.status,
                "created_at": p.created_at.isoformat(),
            }
            for p in conv.projects
        ],
    )
