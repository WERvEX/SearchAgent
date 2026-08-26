from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from playwright.async_api import Error as PlaywrightError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.models import Report
from app.schemas.reports import ReportRead
from app.services import report_export

router = APIRouter(prefix="/reports", tags=["reports"])


def _get_report_or_404(session: Session, report_id: int) -> Report:
    report = session.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("/{report_id}", response_model=ReportRead)
def get_report(report_id: int, session: Session = Depends(get_db)):
    return _get_report_or_404(session, report_id)


@router.get("/{report_id}/download.md")
def download_markdown(report_id: int, session: Session = Depends(get_db)):
    report = _get_report_or_404(session, report_id)
    path = report_export.export_markdown(report)
    report.file_path = str(path)
    session.commit()
    return Response(
        content=(report.content_text or path.read_text(encoding="utf-8")),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{path.name}"'},
    )


@router.get("/{report_id}/download.json")
def download_json(report_id: int, session: Session = Depends(get_db)):
    report = _get_report_or_404(session, report_id)
    if report.format != "json":
        report = session.scalars(
            select(Report).where(Report.project_id == report.project_id, Report.format == "json").order_by(Report.id.desc())
        ).first() or report
    content = report.content_text or report.content_md
    return Response(
        content=content,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="searchagent-report-{report.id}.json"'},
    )


@router.post("/{report_id}/export.pdf")
async def export_pdf(report_id: int, session: Session = Depends(get_db)):
    report = _get_report_or_404(session, report_id)
    try:
        path = await report_export.export_pdf(report)
    except PlaywrightError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "PDF rendering browser is unavailable. "
                "Install Chromium with `playwright install chromium` and retry."
            ),
        ) from exc
    report.file_path = str(path)
    session.commit()
    return {"format": "pdf", "file_path": str(path)}


@router.get("/{report_id}/download.pdf")
async def download_pdf(report_id: int, session: Session = Depends(get_db)):
    report = _get_report_or_404(session, report_id)
    try:
        path = await report_export.export_pdf(report)
    except PlaywrightError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "PDF rendering browser is unavailable. "
                "Install Chromium with `playwright install chromium` and retry."
            ),
        ) from exc
    report.file_path = str(path)
    session.commit()
    return FileResponse(path, media_type="application/pdf", filename=path.name)
