import httpx


def _client_with_handler(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_fetch_url_extracts_visible_text():
    from app.tools import fetch

    html = (
        "<html><head><style>body{color:red}</style>"
        "<script>var x=1;</script></head>"
        "<body><h1>Hello World</h1><p>This is a test page.</p></body></html>"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=html)

    result = fetch.fetch_url("https://example.com", client=_client_with_handler(handler))

    assert "Hello World" in result
    assert "This is a test page." in result
    assert "color:red" not in result
    assert "var x=1" not in result


def test_fetch_url_truncates_to_max_chars():
    from app.tools import fetch

    html = f"<html><body>{'A' * 100}</body></html>"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=html)

    result = fetch.fetch_url(
        "https://example.com", max_chars=10, client=_client_with_handler(handler)
    )

    assert result == "A" * 10


def test_fetch_url_returns_error_string_on_http_error():
    from app.tools import fetch

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Server Error")

    result = fetch.fetch_url("https://example.com/broken", client=_client_with_handler(handler))

    assert result.startswith("Error fetching https://example.com/broken:")


def test_fetch_url_returns_error_string_on_connection_error():
    from app.tools import fetch

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    result = fetch.fetch_url("https://unreachable.example", client=_client_with_handler(handler))

    assert result.startswith("Error fetching https://unreachable.example:")


def test_fetch_page_tool_delegates_to_fetch_url(monkeypatch):
    from app.tools import fetch

    captured = {}

    def fake_fetch_url(url, **kwargs):
        captured["url"] = url
        return "FAKE_PAGE_TEXT"

    monkeypatch.setattr(fetch, "fetch_url", fake_fetch_url)

    result = fetch.fetch_page.invoke("https://example.com/page")

    assert result == "FAKE_PAGE_TEXT"
    assert captured["url"] == "https://example.com/page"
