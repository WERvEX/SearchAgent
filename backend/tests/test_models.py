import datetime as dt

import pytest
from sqlalchemy import inspect


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_all_tables_created(session):
    engine = session.get_bind()
    tables = set(inspect(engine).get_table_names())

    expected = {
        "conversations",
        "messages",
        "research_projects",
        "plans",
        "steps",
        "acceptance_criteria",
        "sources",
        "reports",
        "llm_profiles",
        "mcp_servers",
        "app_preferences",
    }
    assert expected.issubset(tables)


def test_conversation_message_relationship(session):
    from app.db.models import Conversation, Message

    conv = Conversation(title="Test topic")
    session.add(conv)
    session.flush()

    msg = Message(conversation_id=conv.id, role="user", content="hi")
    session.add(msg)
    session.commit()

    assert conv.id is not None
    assert isinstance(conv.created_at, dt.datetime)
    assert len(conv.messages) == 1
    assert conv.messages[0].content == "hi"


def test_project_plan_step_source_chain(session):
    from app.db.models import (
        Conversation,
        ResearchProject,
        Plan,
        Step,
        AcceptanceCriterion,
        Source,
        Report,
    )

    conv = Conversation(title="c")
    session.add(conv)
    session.flush()

    project = ResearchProject(
        conversation_id=conv.id, topic="t", objective="o", status="draft"
    )
    session.add(project)
    session.flush()

    session.add(Plan(project_id=project.id, version=1, summary="plan v1"))
    session.add(Step(project_id=project.id, seq=1, title="s1", status="pending"))
    session.add(
        AcceptanceCriterion(project_id=project.id, description="ac1", met=False)
    )
    session.add(
        Source(project_id=project.id, url="https://x", title="X", tool_name="bocha")
    )
    session.add(
        Report(project_id=project.id, version=1, format="md", content_md="# r")
    )
    session.commit()

    assert len(project.plans) == 1
    assert len(project.steps) == 1
    assert len(project.acceptance_criteria) == 1
    assert len(project.sources) == 1
    assert len(project.reports) == 1


def test_sqlite_foreign_keys_enforced(session):
    from sqlalchemy import text

    result = session.execute(text("PRAGMA foreign_keys")).scalar()
    assert result == 1


def test_created_at_is_naive_utc(session):
    from app.db.models import Conversation

    conv = Conversation(title="tz check")
    session.add(conv)
    session.commit()
    session.refresh(conv)

    # Stored/loaded datetime must be naive so comparisons never raise.
    assert conv.created_at.tzinfo is None
