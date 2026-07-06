from app.engine.state import ResearchState


def test_research_state_typed_dict_keys():
    annotations = ResearchState.__annotations__
    expected = {
        "conversation_id", "project_id", "messages", "objective",
        "plan", "approved", "steps", "findings", "report_md",
    }
    assert expected == set(annotations.keys())
