"""Small, read-only GitHub connector for development-start research."""

from typing import Any

import httpx
from langchain_core.tools import tool

GITHUB_API = "https://api.github.com"


def _headers(token: str | None) -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "SearchAgent"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _repo_item(item: dict[str, Any]) -> dict[str, Any]:
    license_info = item.get("license") or {}
    return {
        "candidate_key": str(item.get("full_name") or item.get("html_url") or ""),
        "source_type": "github",
        "title": str(item.get("full_name") or item.get("name") or item.get("html_url")),
        "url": str(item.get("html_url") or ""),
        "description": item.get("description"),
        "license": license_info.get("spdx_id") or license_info.get("name"),
        "version_or_branch": item.get("default_branch"),
        "activity": {
            "stars": item.get("stargazers_count"),
            "forks": item.get("forks_count"),
            "updated_at": item.get("updated_at"),
            "pushed_at": item.get("pushed_at"),
        },
        "evidence_refs": [str(item.get("html_url") or "")],
    }


def search_github_repositories(query: str, *, count: int = 8, token: str | None = None) -> dict[str, Any]:
    response = httpx.get(
        f"{GITHUB_API}/search/repositories",
        params={"q": query, "per_page": max(1, min(int(count), 20)), "sort": "stars", "order": "desc"},
        headers=_headers(token),
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    return {"candidates": [_repo_item(item) for item in payload.get("items", []) if isinstance(item, dict)]}


@tool("github_repository_search")
def github_repository_search(query: str, count: int = 8) -> dict[str, Any]:
    """Search public GitHub repositories and return normalized candidates."""
    return search_github_repositories(query, count=count)


def get_github_repository(owner: str, repo: str, *, token: str | None = None) -> dict[str, Any]:
    response = httpx.get(f"{GITHUB_API}/repos/{owner}/{repo}", headers=_headers(token), timeout=20)
    response.raise_for_status()
    return {"candidates": [_repo_item(response.json())]}
