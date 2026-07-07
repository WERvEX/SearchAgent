from html import escape
from pathlib import Path

from markdown_it import MarkdownIt
from playwright.async_api import async_playwright

from app.core.paths import get_reports_dir
from app.db.models import Report


def _report_dir(report: Report) -> Path:
    path = get_reports_dir() / str(report.project_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def export_markdown(report: Report) -> Path:
    path = _report_dir(report) / f"report-v{report.version}.md"
    path.write_text(report.content_md, encoding="utf-8")
    return path


def render_report_html(markdown: str) -> str:
    body = MarkdownIt("commonmark", {"html": False}).enable("table").render(markdown)
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<style>body{font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.6;"
        "max-width:860px;margin:40px auto;color:#111} a{color:#0645ad}</style>"
        "</head><body>"
        f"{body if body else '<pre>' + escape(markdown) + '</pre>'}"
        "</body></html>"
    )


async def export_pdf(report: Report) -> Path:
    path = _report_dir(report) / f"report-v{report.version}.pdf"
    html = render_report_html(report.content_md)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            context = await browser.new_context(java_script_enabled=False)
            try:
                page = await context.new_page()
                await page.route("**/*", lambda route: route.abort())
                await page.set_content(html, wait_until="networkidle")
                await page.pdf(path=str(path), format="A4", print_background=True)
            finally:
                await context.close()
        finally:
            await browser.close()
    return path
