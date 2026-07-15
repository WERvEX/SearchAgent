from fastapi.testclient import TestClient


def test_render_report_html_escapes_raw_html():
    from app.services.report_export import render_report_html

    html = render_report_html("# Title\n\n<script>alert('x')</script>\n\n<img src='https://x.test/a.png'>")

    assert "<script>" not in html
    assert "<img" not in html
    assert "&lt;script&gt;" in html
    assert "&lt;img" in html


def test_report_read_and_markdown_download(app_home):
    from app.db import session as db
    from app.db.models import Conversation, Report, ResearchProject
    from app.main import create_app

    client = TestClient(create_app())
    with db.SessionLocal() as session:
        conv = Conversation(title="c")
        session.add(conv)
        session.flush()
        project = ResearchProject(conversation_id=conv.id, topic="t", objective="o")
        session.add(project)
        session.flush()
        report = Report(project_id=project.id, version=1, format="md", content_md="# Report")
        session.add(report)
        session.commit()
        report_id = report.id

    read = client.get(f"/reports/{report_id}").json()
    assert read["content_md"] == "# Report"

    downloaded = client.get(f"/reports/{report_id}/download.md")
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"].startswith("text/markdown")
    assert downloaded.text == "# Report"


def test_report_markdown_download_persists_file_path(app_home):
    from pathlib import Path

    from app.db import session as db
    from app.db.models import Conversation, Report, ResearchProject
    from app.main import create_app

    client = TestClient(create_app())
    with db.SessionLocal() as session:
        conv = Conversation(title="c")
        session.add(conv)
        session.flush()
        project = ResearchProject(conversation_id=conv.id, topic="t", objective="o")
        session.add(project)
        session.flush()
        report = Report(project_id=project.id, version=1, format="md", content_md="# Report")
        session.add(report)
        session.commit()
        report_id = report.id

    downloaded = client.get(f"/reports/{report_id}/download.md")
    assert downloaded.status_code == 200

    with db.SessionLocal() as session:
        report = session.get(Report, report_id)
        assert report.file_path is not None
        path = Path(report.file_path)
        assert path.suffix == ".md"
        assert path.exists()


def test_report_pdf_export_uses_service(app_home, monkeypatch):
    from pathlib import Path

    from app.db import session as db
    from app.db.models import Conversation, Report, ResearchProject
    from app.main import create_app
    from app.services import report_export

    async def fake_export_pdf(report):
        path = Path(app_home) / "reports" / str(report.project_id) / "report.pdf"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"%PDF-test")
        return path

    monkeypatch.setattr(report_export, "export_pdf", fake_export_pdf)

    client = TestClient(create_app())
    with db.SessionLocal() as session:
        conv = Conversation(title="c")
        session.add(conv)
        session.flush()
        project = ResearchProject(conversation_id=conv.id, topic="t", objective="o")
        session.add(project)
        session.flush()
        report = Report(project_id=project.id, version=1, format="md", content_md="# Report")
        session.add(report)
        session.commit()
        report_id = report.id

    exported = client.post(f"/reports/{report_id}/export.pdf").json()
    assert exported["format"] == "pdf"
    assert exported["file_path"].endswith("report.pdf")

    downloaded = client.get(f"/reports/{report_id}/download.pdf")
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"] == "application/pdf"
    assert downloaded.headers["content-disposition"] == 'attachment; filename="report.pdf"'
    assert downloaded.content == b"%PDF-test"
