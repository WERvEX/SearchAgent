import re
from typing import Optional

import httpx
from langchain_core.tools import tool

DEFAULT_MAX_CHARS = 20000
DEFAULT_TIMEOUT = 10.0
DEFAULT_MAX_RESPONSE_BYTES = 2_000_000  # 2 MB; guards against huge/pathological pages

_SCRIPT_STYLE_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


def _extract_text(html: str) -> str:
    without_scripts = _SCRIPT_STYLE_RE.sub(" ", html)
    without_tags = _TAG_RE.sub(" ", without_scripts)
    return _WHITESPACE_RE.sub(" ", without_tags).strip()


def fetch_url(
    url: str,
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    client: Optional[httpx.Client] = None,
) -> str:
    """Fetch a URL and return its extracted plain-text content.

    Never raises: network/HTTP errors are returned as an
    "Error fetching <url>: <reason>" string instead, so this is safe to
    expose directly as an agent tool.
    """
    owns_client = client is None
    http_client = client or httpx.Client(timeout=DEFAULT_TIMEOUT, follow_redirects=True)
    try:
        response = http_client.get(url)
        response.raise_for_status()
        if len(response.content) > DEFAULT_MAX_RESPONSE_BYTES:
            return f"Error fetching {url}: response too large (> {DEFAULT_MAX_RESPONSE_BYTES} bytes)"
        text = _extract_text(response.text)
        return text[:max_chars]
    except Exception as exc:  # noqa: BLE001 - surface any fetch error to the caller
        return f"Error fetching {url}: {exc}"
    finally:
        if owns_client:
            http_client.close()


@tool
def fetch_page(url: str) -> str:
    """Fetch a web page by URL and return its extracted plain-text content."""
    return fetch_url(url)
