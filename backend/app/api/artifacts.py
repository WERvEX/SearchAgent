from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.models import ProjectArtifact, ResearchProject
from app.schemas.artifacts import ProjectArtifactRead

router = APIRouter(tags=["artifacts"])


@router.get("/projects/{project_id}/artifacts", response_model=list[ProjectArtifactRead])
def list_artifacts(project_id: int, session: Session = Depends(get_db)):
    if session.get(ResearchProject, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return session.scalars(
        select(ProjectArtifact).where(ProjectArtifact.project_id == project_id).order_by(ProjectArtifact.id.desc())
    ).all()


@router.get("/artifacts/{artifact_id}", response_model=ProjectArtifactRead)
def get_artifact(artifact_id: int, session: Session = Depends(get_db)):
    artifact = session.get(ProjectArtifact, artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return artifact


@router.get("/artifacts/{artifact_id}/download")
def download_artifact(artifact_id: int, session: Session = Depends(get_db)):
    artifact = session.get(ProjectArtifact, artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    is_json = artifact.format == "json"
    filename = "plan.json" if is_json else "STARTSPEC.md"
    return Response(
        content=artifact.content_text,
        media_type="application/json; charset=utf-8" if is_json else "text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
