import json


def test_github_repository_result_is_normalized(monkeypatch):
    from app.tools import github

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"items": [{
                "full_name": "example/project",
                "html_url": "https://github.com/example/project",
                "description": "A project",
                "default_branch": "main",
                "license": {"spdx_id": "MIT"},
                "stargazers_count": 3,
            }]}

    monkeypatch.setattr(github.httpx, "get", lambda *args, **kwargs: Response())
    result = github.search_github_repositories("example", count=1)
    candidate = result["candidates"][0]
    assert candidate["source_type"] == "github"
    assert candidate["license"] == "MIT"
    assert candidate["version_or_branch"] == "main"


def test_ai_report_is_compact_and_references_sources():
    from app.engine.nodes import _build_ai_report

    payload = json.loads(_build_ai_report({
        "workflow_mode": "development_start",
        "objective": "Build a tool",
        "problem_definition": {"goal": "Build a tool"},
        "candidate_decisions": [{"candidate_key": "example/project", "decision": "adopt"}],
        "candidates": [{"candidate_key": "example/project", "url": "https://github.com/example/project"}],
        "plan": {"steps": [{"title": "Verify", "status": "pending"}]},
        "steps": [{"title": "Verify", "status": "pending"}],
        "verified_findings": [{"title": "Evidence", "url": "https://example.com", "snippet": "Short", "verified": True}],
    }))
    assert payload["schema_version"] == "1.0"
    assert payload["findings"][0]["source_ids"] == ["s1"]
    assert payload["sources"][0]["id"] == "s1"
