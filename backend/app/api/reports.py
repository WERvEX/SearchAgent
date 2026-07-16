from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
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
        content=path.read_text(encoding="utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{path.name}"'},
    )


@router.post("/{report_id}/export.pdf")
async def export_pdf(report_id: int, session: Session = Depends(get_db)):
    report = _get_report_or_404(session, report_id)
    path = await report_export.export_pdf(report)
    report.file_path = str(path)
    session.commit()
    return {"format": "pdf", "file_path": str(path)}


@router.get("/{report_id}/download.pdf")
async def download_pdf(report_id: int, session: Session = Depends(get_db)):
    report = _get_report_or_404(session, report_id)
    path = await report_export.export_pdf(report)
    report.file_path = str(path)
    session.commit()
    return FileResponse(path, media_type="application/pdf", filename=path.name)
