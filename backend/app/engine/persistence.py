from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.models import AcceptanceCriterion, Plan, ProjectArtifact, Report, Step


def persist_plan_version(session: Session, state: dict) -> int:
    project_id = state["project_id"]
    plan = state.get("plan") or {}
    version = (
        session.scalar(select(func.max(Plan.version)).where(Plan.project_id == project_id))
        or 0
    ) + 1
    session.add(
        Plan(
            project_id=project_id,
            version=version,
            summary=str(plan.get("summary", "")),
            options_json=state.get("steps") or plan.get("steps") or plan.get("options") or [],
            chosen_option=None,
            plan_json=plan,
        )
    )
    session.commit()
    sync_plan_and_steps(session, {**state, "plan_version": version})
    return version


def sync_plan_and_steps(session: Session, state: dict) -> None:
    """Persist the current graph plan and steps into business tables."""
    project_id = state["project_id"]
    plan = state.get("plan") or {}

    if plan and not state.get("plan_version"):
        version = (
            session.scalar(
                select(func.max(Plan.version)).where(Plan.project_id == project_id)
            )
            or 0
        ) + 1
        session.add(
            Plan(
                project_id=project_id,
                version=version,
                summary=str(plan.get("summary", "")),
                options_json=state.get("steps") or plan.get("steps") or plan.get("options"),
                chosen_option=plan.get("chosen_option"),
                plan_json=plan,
            )
        )

    session.execute(delete(AcceptanceCriterion).where(AcceptanceCriterion.project_id == project_id))
    session.execute(delete(Step).where(Step.project_id == project_id))
    session.flush()

    for item in state.get("steps", []):
        step = Step(
            project_id=project_id,
            seq=int(item.get("seq", 0)),
            title=str(item.get("title", "")),
            description=str(item.get("description", "")),
            status=str(item.get("status", "pending")),
            result_summary=item.get("result_summary"),
        )
        session.add(step)
        criteria = item.get("acceptance_criteria") or []
        for criterion in criteria:
            if isinstance(criterion, dict):
                description = criterion.get("description", "")
                met = bool(criterion.get("met", False))
                evidence_ref = criterion.get("evidence_ref")
            else:
                description = str(criterion)
                met = False
                evidence_ref = None
            session.add(
                AcceptanceCriterion(
                    project_id=project_id,
                    description=str(description),
                    met=met,
                    evidence_ref=evidence_ref,
                )
            )

    session.commit()


def persist_report(
    session: Session,
    *,
    project_id: int,
    content_md: str = "",
    content_text: str | None = None,
    format: str = "md",
) -> Report:
    version = (
        session.scalar(select(func.max(Report.version)).where(Report.project_id == project_id))
        or 0
    ) + 1
    report = Report(
        project_id=project_id,
        version=version,
        format=format,
        content_md=content_md,
        content_text=content_text or content_md,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def persist_artifact(
    session: Session,
    *,
    project_id: int,
    plan_version: int,
    format: str,
    content_text: str,
) -> ProjectArtifact:
    artifact = ProjectArtifact(
        project_id=project_id,
        plan_version=plan_version,
        artifact_kind="implementation_manifest" if format == "json" else "startspec_spec",
        schema_version="1.0",
        format=format,
        content_text=content_text,
    )
    session.add(artifact)
    session.commit()
    session.refresh(artifact)
    return artifact
