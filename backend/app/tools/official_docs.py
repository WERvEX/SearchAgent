"""Helpers for identifying and normalizing official documentation sources."""

from typing import Any
from urllib.parse import urlparse

from langchain_core.tools import tool

from app.tools.fetch import fetch_url


def is_official_documentation_url(url: str, *, official_domains: list[str] | None = None) -> bool:
    hostname = (urlparse(url).hostname or "").lower().lstrip("www.")
    if not hostname:
        return False
    if official_domains:
        return any(hostname == domain.lstrip("www.").lower() or hostname.endswith("." + domain.lstrip("www.").lower()) for domain in official_domains)
    return hostname.endswith((".org", ".dev", ".io", ".com")) and any(part in hostname for part in ("docs", "developer", "api"))


def normalize_documentation_candidate(
    *, url: str, title: str | None = None, content: str | None = None, official: bool = True
) -> dict[str, Any]:
    return {
        "candidate_key": url,
        "source_type": "official_docs" if official else "web",
        "title": title or url,
        "url": url,
        "description": (content or "")[:600] or None,
        "license": None,
        "version_or_branch": None,
        "activity": None,
        "evidence_refs": [url],
    }


@tool("official_documentation_fetch")
def official_documentation_fetch(url: str, title: str = "") -> dict[str, Any]:
    """Fetch an official documentation page and return a compact candidate."""
    official = is_official_documentation_url(url)
    content = fetch_url(url, max_chars=4000)
    return {"candidates": [normalize_documentation_candidate(url=url, title=title or None, content=content, official=official)]}
