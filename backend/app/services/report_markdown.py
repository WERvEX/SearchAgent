import re
from html import escape
from urllib.parse import urlsplit


_FOOTNOTE_DEFINITION = re.compile(
    r"^\[\^(\d+)\]:\s+\[([^\]]+)\]\(([^)]+)\)\s*$"
)
_FOOTNOTE_CITATION = re.compile(r"\[\^(\d+)\]")
_PLAIN_CITATION = re.compile(r"(?<!\^)\[(\d+)\](?!\()")


def normalize_report_markdown(markdown: str, source_count: int) -> str:
    lines: list[str] = []
    for line in str(markdown or "").splitlines():
        if _FOOTNOTE_DEFINITION.match(line.strip()):
            lines.append(line)
            continue

        def normalize_plain(match: re.Match[str]) -> str:
            source_id = int(match.group(1))
            return f"[^{source_id}]" if 1 <= source_id <= source_count else match.group(0)

        lines.append(_PLAIN_CITATION.sub(normalize_plain, line))
    return "\n".join(lines).strip()


def split_report_footnotes(markdown: str) -> tuple[str, list[dict]]:
    body_lines: list[str] = []
    references: list[dict] = []
    for line in str(markdown or "").splitlines():
        match = _FOOTNOTE_DEFINITION.match(line.strip())
        if match:
            references.append({
                "id": int(match.group(1)),
                "title": match.group(2).strip(),
                "url": match.group(3).strip(),
            })
        else:
            body_lines.append(line)
    references.sort(key=lambda item: item["id"])
    return "\n".join(body_lines).strip(), references


def prepare_report_html(markdown: str) -> tuple[str, str]:
    body, references = split_report_footnotes(markdown)
    valid_ids = {item["id"] for item in references}

    def citation_link(match: re.Match[str]) -> str:
        source_id = int(match.group(1))
        if source_id not in valid_ids:
            return f"[{source_id}]"
        return f"[{source_id}](#source-{source_id})"

    body = _FOOTNOTE_CITATION.sub(citation_link, body)
    reference_items: list[str] = []
    for item in references:
        parsed = urlsplit(item["url"])
        safe_url = item["url"] if parsed.scheme in {"http", "https"} else ""
        title = escape(item["title"])
        link = (
            f'<a href="{escape(safe_url, quote=True)}">{title}</a>'
            if safe_url
            else title
        )
        reference_items.append(
            f'<li id="source-{item["id"]}"><span class="source-number">'
            f'{item["id"]}</span>{link}</li>'
        )
    references_html = (
        '<section class="references"><h2>参考来源 / References</h2><ol>'
        + "".join(reference_items)
        + "</ol></section>"
        if reference_items
        else ""
    )
    return body, references_html
