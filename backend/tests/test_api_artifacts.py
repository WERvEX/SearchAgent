from fastapi.testclient import TestClient


def test_artifact_list_read_and_download(app_home):
    from app.db import session as db
    from app.db.models import Conversation, ProjectArtifact, ResearchProject
    from app.main import create_app

    client = TestClient(create_app())
    with db.SessionLocal() as session:
        conversation = Conversation(title="c")
        session.add(conversation)
        session.flush()
        project = ResearchProject(conversation_id=conversation.id, topic="t", objective="o")
        session.add(project)
        session.flush()
        artifact = ProjectArtifact(
            project_id=project.id, plan_version=2, artifact_kind="implementation_manifest",
            schema_version="1.0", format="json", content_text='{"schema_version":"1.0"}',
        )
        session.add(artifact)
        session.commit()
        project_id, artifact_id = project.id, artifact.id

    listed = client.get(f"/projects/{project_id}/artifacts")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == artifact_id
    read = client.get(f"/artifacts/{artifact_id}")
    assert read.json()["content_text"] == '{"schema_version":"1.0"}'
    downloaded = client.get(f"/artifacts/{artifact_id}/download")
    assert downloaded.status_code == 200
    assert downloaded.headers["content-disposition"] == 'attachment; filename="plan.json"'
    assert downloaded.headers["content-type"].startswith("application/json")


def test_missing_artifact_returns_404(app_home):
    from app.main import create_app
    client = TestClient(create_app())
    assert client.get("/artifacts/999/download").status_code == 404
