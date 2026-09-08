from typing import Annotated, Optional

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class ResearchState(TypedDict):
    run_id: Optional[str]
    trace_id: Optional[str]
    conversation_id: int
    project_id: int
    response_language: Optional[str]
    messages: Annotated[list, add_messages]
    objective: str
    plan: Optional[dict]
    plan_version: Optional[int]
    plan_ready: bool
    planner_message: Optional[str]
    planner_questions: list[dict]
    approved: bool
    replan_feedback: Optional[str]
    clarification_question: Optional[str]
    steps: list[dict]
    findings: list[dict]
    report_md: Optional[str]
    report_id: Optional[int]
    ai_report_id: Optional[int]
    workflow_mode: Optional[str]
    problem_definition: Optional[dict]
    candidate_decisions: list[dict]
    candidates: list[dict]
    output_modes: list[str]
    framing_round: int
    development_phase: Optional[str]
    candidate_selection_done: bool
    repository_mode: Optional[str]
    repository_path: Optional[str]
    repository_snapshot_id: Optional[int]
    repository_summary: Optional[dict]
    repository_selection_done: bool
    repository_confirmed: bool
    change_map: list[dict]
    artifact_ids: list[int]
    research_round: int
    evidence_gate: Optional[dict]
    allow_supplemental_research: bool
    agent_tasks: list[dict]
    verified_findings: list[dict]
