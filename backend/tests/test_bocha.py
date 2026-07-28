import httpx


def test_bocha_search_tool_maps_official_api_results(monkeypatch):
    from app.tools import bocha

    captured = {}

    def fake_post(url, *, headers, json, timeout):
        captured.update(url=url, headers=headers, json=json, timeout=timeout)
        return httpx.Response(
            200,
            json={
                "code": 200,
                "data": {
                    "webPages": {
                        "value": [
                            {
                                "name": "Current result",
                                "url": "https://example.com/current",
                                "summary": "Useful summary",
                            }
                        ]
                    }
                },
            },
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(bocha.httpx, "post", fake_post)
    tool = bocha.create_bocha_search_tool("sk-secret")
    result = tool.invoke({"query": "AI chips", "freshness": "oneMonth", "count": 6})

    assert result == {
        "results": [
            {
                "title": "Current result",
                "url": "https://example.com/current",
                "snippet": "Useful summary",
            }
        ]
    }
    assert captured["url"] == bocha.BOCHA_SEARCH_URL
    assert captured["headers"]["Authorization"] == "Bearer sk-secret"
    assert captured["json"]["count"] == 6
