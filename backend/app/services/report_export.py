from html import escape
from pathlib import Path
import re

from markdown_it import MarkdownIt
from playwright.async_api import Error as PlaywrightError, async_playwright

from app.core.paths import get_reports_dir
from app.db.models import Report
from app.services.report_markdown import prepare_report_html


def _report_dir(report: Report) -> Path:
    path = get_reports_dir() / str(report.project_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def export_markdown(report: Report) -> Path:
    path = _report_dir(report) / f"report-v{report.version}.md"
    path.write_text(report.content_md, encoding="utf-8")
    return path


def render_report_html(markdown: str) -> str:
    renderable_markdown, references_html = prepare_report_html(markdown)
    body = MarkdownIt("commonmark", {"html": False}).enable("table").render(renderable_markdown)
    body = re.sub(
        r'<a href="#source-(\d+)">(\d+)</a>',
        r'<sup class="citation"><a href="#source-\1">\2</a></sup>',
        body,
    )
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<style>"
        "@page{size:A4;margin:18mm 16mm}*{box-sizing:border-box}"
        "body{font-family:'Microsoft YaHei','Noto Sans CJK SC',Arial,sans-serif;"
        "line-height:1.75;max-width:860px;margin:0 auto;color:#18181b;font-size:11pt}"
        "h1{font-size:24pt;margin:0 0 24px;border-bottom:2px solid #0f766e;padding-bottom:12px}"
        "h2{font-size:16pt;margin:28px 0 12px;break-after:avoid;color:#134e4a}"
        "h3{font-size:13pt;margin:22px 0 8px;break-after:avoid}"
        "p,li{orphans:3;widows:3}table{width:100%;border-collapse:collapse;font-size:9.5pt}"
        "th,td{border:1px solid #d4d4d8;padding:7px;vertical-align:top}"
        "th{background:#f4f4f5}a{color:#0f766e;text-decoration:none}"
        ".citation{font-size:.72em;line-height:0;margin-left:2px}"
        ".references{border-top:1px solid #d4d4d8;margin-top:32px;padding-top:8px}"
        ".references ol{padding-left:0;list-style:none}.references li{margin:8px 0;display:flex;gap:8px}"
        ".source-number{color:#71717a;min-width:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}"
        "</style>"
        "</head><body>"
        f"{body if body else '<pre>' + escape(markdown) + '</pre>'}{references_html}"
        "</body></html>"
    )


async def export_pdf(report: Report) -> Path:
    path = _report_dir(report) / f"report-v{report.version}.pdf"
    html = render_report_html(report.content_md)
    async with async_playwright() as p:
        try:
            browser = await p.chromium.launch()
        except PlaywrightError as bundled_error:
            browser = None
            for channel in ("chrome", "msedge"):
                try:
                    browser = await p.chromium.launch(channel=channel)
                    break
                except PlaywrightError:
                    continue
            if browser is None:
                raise bundled_error
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
