from typing import Any

import httpx
from langchain_core.tools import tool

BOCHA_SEARCH_URL = "https://api.bochaai.com/v1/web-search"


def create_bocha_search_tool(api_key: str):
    @tool("bocha_web_search")
    def bocha_web_search(
        query: str,
        freshness: str = "noLimit",
        count: int = 10,
    ) -> dict[str, Any]:
        """Search the public web with Bocha and return current source results."""
        response = httpx.post(
            BOCHA_SEARCH_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "query": query,
                "freshness": freshness,
                "summary": True,
                "count": max(1, min(int(count), 50)),
            },
            timeout=20.0,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") not in (None, 200):
            raise RuntimeError(payload.get("msg") or f"Bocha API error {payload.get('code')}")
        search_response = payload.get("data") or payload
        values = (search_response.get("webPages") or {}).get("value") or []
        return {
            "results": [
                {
                    "title": item.get("name") or item.get("url"),
                    "url": item.get("url"),
                    "snippet": item.get("summary") or item.get("snippet"),
                }
                for item in values
                if isinstance(item, dict) and item.get("url")
            ]
        }

    return bocha_web_search
