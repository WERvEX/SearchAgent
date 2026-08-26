import shutil

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.paths import get_reports_dir
from app.db.models import Conversation
from app.engine.checkpointer import create_checkpointer
from app.schemas.conversations import (
    ConversationCreate,
    ConversationDetail,
    ConversationRead,
    ConversationUpdate,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("", response_model=ConversationRead)
def create_conversation(
    payload: ConversationCreate, session: Session = Depends(get_db)
):
    conv = Conversation(title=payload.title, status="idle")
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return conv


@router.get("", response_model=list[ConversationRead])
def list_conversations(session: Session = Depends(get_db)):
    return session.scalars(select(Conversation).order_by(Conversation.id)).all()


@router.put("/{conversation_id}", response_model=ConversationRead)
def update_conversation(
    conversation_id: int,
    payload: ConversationUpdate,
    session: Session = Depends(get_db),
):
    conv = session.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv.title = payload.title
    session.commit()
    session.refresh(conv)
    return conv


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: int,
    session: Session = Depends(get_db),
):
    conv = session.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    thread_ids = {
        str(meta["research_thread_id"])
        for message in conv.messages
        if (meta := message.meta_json or {}).get("research_thread_id")
    }
    project_ids = [project.id for project in conv.projects]

    checkpointer = create_checkpointer()
    try:
        for thread_id in thread_ids:
            checkpointer.delete_thread(thread_id)
    finally:
        checkpointer.conn.close()

    session.delete(conv)
    session.commit()

    reports_root = get_reports_dir().resolve()
    for project_id in project_ids:
        project_dir = (reports_root / str(project_id)).resolve()
        if project_dir.parent == reports_root and project_dir.exists():
            shutil.rmtree(project_dir)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "meta": m.meta_json,
                "created_at": m.created_at.isoformat(),
            }
            for m in conv.messages
        ],
        projects=[
            {
                "id": p.id,
                "topic": p.topic,
                "objective": p.objective,
                "status": p.status,
                "workflow_mode": p.workflow_mode,
                "problem_definition": p.problem_definition_json,
                "output_modes": p.output_modes_json or ["human"],
                "candidates": [
                    {
                        "candidate_key": candidate.candidate_key,
                        "source_type": candidate.source_type,
                        "title": candidate.title,
                        "url": candidate.url,
                        "description": candidate.description,
                        "license": candidate.license,
                        "version_or_branch": candidate.version_or_branch,
                        "activity": candidate.activity,
                        "decision": candidate.decision,
                    }
                    for candidate in p.candidates
                ],
                "created_at": p.created_at.isoformat(),
                "latest_report_id": latest_report.id if latest_report else None,
                "latest_report_version": latest_report.version if latest_report else None,
                "plans": [
                    {
                        "id": plan.id,
                        "project_id": p.id,
                        "version": plan.version,
                        "summary": plan.summary,
                        "steps": plan.options_json or [],
                        "created_at": plan.created_at.isoformat(),
                    }
                    for plan in sorted(p.plans, key=lambda item: (item.version, item.id))
                ],
                "reports": [
                    {
                        "id": report.id,
                        "project_id": p.id,
                        "version": report.version,
                        "created_at": report.created_at.isoformat(),
                    }
                    for report in sorted(p.reports, key=lambda item: (item.version, item.id))
                ],
            }
            for p in conv.projects
            for latest_report in [
                max(p.reports, key=lambda report: (report.version, report.id), default=None)
            ]
        ],
    )
