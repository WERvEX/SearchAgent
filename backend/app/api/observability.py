import asyncio
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.models import Conversation, EvaluationCase, EvaluationDataset, EvaluationRun, EvaluationScore, LLMProfile, ResearchProject
from app.engine.runner import resume_research, start_research
from app.llm.factory import build_chat_model_from_profile
from app.schemas.observability import EvaluationCasePayload, EvaluationDatasetPayload, EvaluationRunPayload, ToolApprovalPayload, ToolPolicyPayload
from app.services.tracing_service import list_trace
from app.tools import policy

router = APIRouter(tags=["observability"])


@router.post("/research/{thread_id}/tool-approval")
async def approve_tool_call(thread_id: str, payload: ToolApprovalPayload, session: Session = Depends(get_db)):
    from app.engine.runner import resume_research

    return await resume_research(
        session,
        thread_id=thread_id,
        profile_id=payload.profile_id,
        decision={"kind": "tool_approval", "approved": payload.approved, "agent_role": payload.agent_role, "tool_name": payload.tool_name, "args_fingerprint": payload.args_fingerprint},
    )


@router.get("/tool-policies")
def list_tool_policies(session: Session = Depends(get_db)):
    return policy.list_policies(session)


@router.post("/tool-policies")
def create_tool_policy(payload: ToolPolicyPayload, session: Session = Depends(get_db)):
    return policy.create_policy(session, **payload.model_dump())


@router.put("/tool-policies/{policy_id}")
def update_tool_policy(policy_id: int, payload: ToolPolicyPayload, session: Session = Depends(get_db)):
    result = policy.update_policy(session, policy_id, **payload.model_dump())
    if result is None:
        raise HTTPException(status_code=404, detail="Tool policy not found")
    return result


@router.delete("/tool-policies/{policy_id}", status_code=204)
def delete_tool_policy(policy_id: int, session: Session = Depends(get_db)):
    if not policy.delete_policy(session, policy_id):
        raise HTTPException(status_code=404, detail="Tool policy not found")


@router.get("/research/projects/{project_id}/traces")
def get_project_traces(project_id: int, session: Session = Depends(get_db)):
    if session.get(ResearchProject, project_id) is None:
        raise HTTPException(status_code=404, detail="Research project not found")
    return list_trace(session, project_id)


@router.post("/evaluation/datasets")
def create_dataset(payload: EvaluationDatasetPayload, session: Session = Depends(get_db)):
    if payload.judge_profile_id and session.get(LLMProfile, payload.judge_profile_id) is None:
        raise HTTPException(status_code=404, detail="Judge profile not found")
    item = EvaluationDataset(**payload.model_dump())
    session.add(item)
    session.commit()
    return _dataset(item, session)


@router.get("/evaluation/datasets")
def list_datasets(session: Session = Depends(get_db)):
    return [_dataset(item, session) for item in session.query(EvaluationDataset).order_by(EvaluationDataset.id.desc())]


@router.post("/evaluation/datasets/{dataset_id}/cases")
def create_case(dataset_id: int, payload: EvaluationCasePayload, session: Session = Depends(get_db)):
    if session.get(EvaluationDataset, dataset_id) is None:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")
    item = EvaluationCase(dataset_id=dataset_id, input_text=payload.input_text, expected_json=payload.expected)
    session.add(item)
    session.commit()
    return {"id": item.id, "dataset_id": item.dataset_id, "input_text": item.input_text, "expected": item.expected_json}


@router.post("/evaluation/datasets/{dataset_id}/runs")
def run_dataset(dataset_id: int, payload: EvaluationRunPayload, session: Session = Depends(get_db)):
    dataset = session.get(EvaluationDataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")
    if session.get(LLMProfile, payload.profile_id) is None:
        raise HTTPException(status_code=404, detail="Research profile not found")
    judge_id = payload.judge_profile_id if payload.judge_profile_id is not None else dataset.judge_profile_id
    if judge_id is not None and session.get(LLMProfile, judge_id) is None:
        raise HTTPException(status_code=404, detail="Judge profile not found")
    started = time.perf_counter()
    cases = session.query(EvaluationCase).filter(EvaluationCase.dataset_id == dataset_id).all()
    run = EvaluationRun(dataset_id=dataset_id, profile_id=payload.profile_id, judge_profile_id=judge_id, status="completed")
    session.add(run)
    session.flush()
    for case in cases:
        metrics = {"input_nonempty": bool(case.input_text.strip()), "expected_present": case.expected_json is not None, "source_count": 0, "citation_complete": False, "permission_violations": 0, "interrupted": False}
        status = "failed"
        if metrics["input_nonempty"]:
            conversation = Conversation(title=f"Evaluation {dataset.name} #{case.id}")
            session.add(conversation)
            session.commit()
            try:
                result = asyncio.run(start_research(session, conversation_id=conversation.id, profile_id=payload.profile_id, user_message=case.input_text))
                metrics["interrupted"] = bool(result.get("interrupted"))
                if result.get("interrupted") and (result.get("interrupt_payload") or {}).get("kind") in {"plan_ready", "plan_approval"}:
                    version = (result.get("state") or {}).get("plan_version")
                    resumed = asyncio.run(resume_research(session, thread_id=result["thread_id"], profile_id=payload.profile_id, decision={"kind": "execute_plan", "plan_version": version}))
                    result = resumed
                state = result.get("state") or {}
                findings = state.get("verified_findings") or state.get("findings") or []
                metrics["source_count"] = len(findings)
                metrics["citation_complete"] = bool(state.get("report_md") and "[^" in str(state.get("report_md")))
                status = "passed" if state.get("report_id") else "blocked"
                if judge_id is not None and state.get("report_md"):
                    try:
                        judge = build_chat_model_from_profile(session, judge_id)
                        verdict = judge.invoke(
                            "Score this research report from 0 to 1 for whether it addresses the expected criteria. "
                            "Return only a number.\n"
                            f"Expected: {case.expected_json or {}}\nReport: {str(state['report_md'])[:6000]}"
                        )
                        metrics["judge_score"] = float(str(getattr(verdict, "content", verdict)).strip())
                    except Exception as exc:
                        metrics["judge_error"] = str(exc)[:300]
            except Exception as exc:
                metrics["error"] = str(exc)[:500]
                status = "failed"
        session.add(EvaluationScore(run_id=run.id, case_id=case.id, status=status, metrics_json=metrics))
    run.metrics_json = {"case_count": len(cases), "completed": len(cases), "latency_ms": round((time.perf_counter() - started) * 1000, 2), "judge_profile_id": judge_id}
    session.commit()
    return _run(run, session)


@router.get("/evaluation/runs")
def list_runs(session: Session = Depends(get_db)):
    return [_run(item, session) for item in session.query(EvaluationRun).order_by(EvaluationRun.id.desc())]


def _dataset(item: EvaluationDataset, session: Session) -> dict:
    cases = session.query(EvaluationCase).filter(EvaluationCase.dataset_id == item.id).all()
    return {"id": item.id, "name": item.name, "version": item.version, "description": item.description, "judge_profile_id": item.judge_profile_id, "case_count": len(cases), "created_at": item.created_at.isoformat()}


def _run(item: EvaluationRun, session: Session) -> dict:
    scores = session.query(EvaluationScore).filter(EvaluationScore.run_id == item.id).all()
    return {"id": item.id, "dataset_id": item.dataset_id, "profile_id": item.profile_id, "judge_profile_id": item.judge_profile_id, "status": item.status, "metrics": item.metrics_json, "scores": [{"case_id": score.case_id, "status": score.status, "metrics": score.metrics_json} for score in scores], "created_at": item.created_at.isoformat()}
