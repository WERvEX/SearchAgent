from app.engine.state import ResearchState


def test_research_state_typed_dict_keys():
    annotations = ResearchState.__annotations__
    expected = {
        "conversation_id", "project_id", "messages", "objective",
        "plan", "approved", "replan_feedback", "clarification_question", "steps", "findings", "report_md", "report_id",
        "run_id", "plan_version", "plan_ready", "planner_message", "planner_questions", "response_language",
        "workflow_mode", "problem_definition", "candidate_decisions", "candidates", "output_modes",
        "framing_round", "development_phase", "candidate_selection_done",
    }
    assert expected == set(annotations.keys())
