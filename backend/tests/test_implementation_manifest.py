import json

import pytest

from app.schemas.artifacts import ImplementationManifest
from app.services.implementation_manifest import build_manifest, manifest_json, manifest_markdown


def _state():
    return {
        "workflow_mode": "development_start",
        "problem_definition": {"goal": "Add repository analysis", "confirmed": True},
        "repository_summary": {
            "repository_name": "demo", "branch": "main", "head_sha": "abc", "fingerprint": "fp",
            "scan_status": "complete", "files": [{"id": "repo_0001", "path": "app.py", "sha256": "hash"}],
            "relevant_files": [{"id": "repo_0001", "path": "app.py"}], "test_commands": ["pytest"],
        },
        "candidate_decisions": [],
        "plan": {
            "change_map": [{"id": "change_01", "action": "modify", "path": "app.py", "purpose": "Add endpoint", "evidence_refs": ["repo_0001"]}],
            "steps": [{"id": "task_01", "title": "Implement", "change_ids": ["change_01"], "acceptance_criteria": ["Endpoint works"], "test_commands": ["pytest"]}],
        },
        "findings": [],
    }


def test_manifest_has_stable_references_and_formats():
    manifest = build_manifest(_state())
    assert manifest.change_map[0].path_status == "observed"
    assert manifest.tasks[0].change_ids == ["change_01"]
    assert json.loads(manifest_json(manifest))["artifact"] == "implementation_manifest"
    assert "`modify` `app.py`" in manifest_markdown(manifest)


def test_manifest_rejects_dependency_cycles():
    with pytest.raises(ValueError, match="cycle"):
        ImplementationManifest.model_validate({
            "tasks": [
                {"id": "a", "title": "A", "depends_on": ["b"], "acceptance_criteria": ["ok"]},
                {"id": "b", "title": "B", "depends_on": ["a"], "acceptance_criteria": ["ok"]},
            ]
        })


def test_nonexistent_modified_path_is_uncertain():
    state = _state()
    state["plan"]["change_map"][0]["path"] = "missing.py"
    manifest = build_manifest(state)
    assert manifest.change_map[0].path_status == "uncertain"
