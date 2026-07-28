import ipaddress
import re
import socket
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
from langchain_core.tools import tool

DEFAULT_MAX_CHARS = 20000
DEFAULT_TIMEOUT = 10.0
DEFAULT_MAX_RESPONSE_BYTES = 2_000_000  # 2 MB; guards against huge/pathological pages
DEFAULT_CHUNK_SIZE = 64 * 1024
MAX_REDIRECTS = 5
_FAKE_IP_NETWORK = ipaddress.ip_network("198.18.0.0/15")
_DOH_URL = "https://dns.google/resolve"

_SCRIPT_STYLE_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


def _extract_text(html: str) -> str:
    without_scripts = _SCRIPT_STYLE_RE.sub(" ", html)
    without_tags = _TAG_RE.sub(" ", without_scripts)
    return _WHITESPACE_RE.sub(" ", without_tags).strip()


def _resolve_with_doh(hostname: str) -> set[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    addresses: set[ipaddress.IPv4Address | ipaddress.IPv6Address] = set()
    for record_type in ("A", "AAAA"):
        response = httpx.get(
            _DOH_URL,
            params={"name": hostname, "type": record_type},
            timeout=DEFAULT_TIMEOUT,
        )
        response.raise_for_status()
        for answer in response.json().get("Answer", []):
            if answer.get("type") not in (1, 28):
                continue
            try:
                addresses.add(ipaddress.ip_address(answer.get("data", "")))
            except ValueError:
                continue
    return addresses


def _validate_public_url(url: str) -> None:
    """Reject non-web and non-public network destinations before fetching."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("only HTTP(S) URLs are allowed")
    if parsed.username or parsed.password:
        raise ValueError("URLs with embedded credentials are not allowed")
    if not parsed.hostname:
        raise ValueError("URL must include a hostname")
    if parsed.hostname.lower() == "localhost":
        raise ValueError("URL must resolve only to public addresses")

    try:
        literal_address = ipaddress.ip_address(parsed.hostname)
        addresses = {literal_address}
    except ValueError:
        literal_address = None
        try:
            addresses = {
                ipaddress.ip_address(result[4][0])
                for result in socket.getaddrinfo(parsed.hostname, parsed.port or 443)
            }
        except socket.gaierror as exc:
            raise ValueError(f"could not resolve hostname: {exc}") from exc

    if (
        literal_address is None
        and addresses
        and all(address in _FAKE_IP_NETWORK for address in addresses)
    ):
        try:
            addresses = _resolve_with_doh(parsed.hostname)
        except Exception as exc:  # noqa: BLE001 - fail closed when public validation is unavailable
            raise ValueError(f"could not validate proxy-resolved hostname: {exc}") from exc

    if not addresses or any(not address.is_global for address in addresses):
        raise ValueError("URL must resolve only to public addresses")


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
    http_client = client or httpx.Client(timeout=DEFAULT_TIMEOUT, follow_redirects=False)
    try:
        current_url = url
        for _ in range(MAX_REDIRECTS + 1):
            _validate_public_url(current_url)
            with http_client.stream("GET", current_url, follow_redirects=False) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        return f"Error fetching {url}: redirect response has no Location header"
                    current_url = urljoin(current_url, location)
                    continue

                response.raise_for_status()
                content = bytearray()
                for chunk in response.iter_bytes(chunk_size=DEFAULT_CHUNK_SIZE):
                    content.extend(chunk)
                    if len(content) > DEFAULT_MAX_RESPONSE_BYTES:
                        return f"Error fetching {url}: response too large (> {DEFAULT_MAX_RESPONSE_BYTES} bytes)"
                encoding = response.encoding or "utf-8"
                text = _extract_text(content.decode(encoding, errors="replace"))
                return text[:max_chars]
        return f"Error fetching {url}: too many redirects"
    except Exception as exc:  # noqa: BLE001 - surface any fetch error to the caller
        return f"Error fetching {url}: {exc}"
    finally:
        if owns_client:
            http_client.close()


@tool
def fetch_page(url: str) -> str:
    """Fetch a web page by URL and return its extracted plain-text content."""
    return fetch_url(url)
