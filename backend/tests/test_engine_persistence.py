import pytest


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_sync_plan_and_steps_persists_business_tables(session):
    from sqlalchemy import select

    from app.db.models import (
        AcceptanceCriterion,
        Conversation,
        Plan,
        ResearchProject,
        Step,
    )
    from app.engine.persistence import sync_plan_and_steps

    conv = Conversation(title="c")
    session.add(conv)
    session.flush()
    project = ResearchProject(
        conversation_id=conv.id,
        topic="renewable energy",
        objective="Study renewable energy trends",
    )
    session.add(project)
    session.commit()

    sync_plan_and_steps(
        session,
        {
            "project_id": project.id,
            "plan": {
                "summary": "Plan summary",
                "options": [{"id": "A", "label": "Full review"}],
                "chosen_option": "A",
            },
            "steps": [
                {
                    "seq": 1,
                    "title": "Search",
                    "description": "Find sources",
                    "status": "pending",
                    "acceptance_criteria": ["market data"],
                }
            ],
        },
    )

    plans = session.scalars(select(Plan).order_by(Plan.id)).all()
    steps = session.scalars(select(Step).order_by(Step.id)).all()
    criteria = session.scalars(select(AcceptanceCriterion).order_by(AcceptanceCriterion.id)).all()

    assert len(plans) == 1
    assert plans[0].summary == "Plan summary"
    assert plans[0].chosen_option == "A"
    assert plans[0].options_json == [{"id": "A", "label": "Full review"}]

    assert len(steps) == 1
    assert steps[0].project_id == project.id
    assert steps[0].seq == 1
    assert steps[0].title == "Search"

    assert len(criteria) == 1
    assert criteria[0].project_id == project.id
    assert criteria[0].description == "market data"
