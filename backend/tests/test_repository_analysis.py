from pathlib import Path

import pytest

from app.services.repository_analysis import RepositoryScanError, ScanLimits, scan_repository


def test_repository_scan_is_read_only_and_excludes_secrets(tmp_path: Path):
    (tmp_path / "package.json").write_text('{"dependencies":{"react":"18"},"scripts":{"test":"vitest"}}', encoding="utf-8")
    source = tmp_path / "src"
    source.mkdir()
    code = source / "feature.ts"
    code.write_text("export function buildFeature() { return true }", encoding="utf-8")
    (tmp_path / ".env").write_text("API_KEY=must-not-leak", encoding="utf-8")
    outside = tmp_path.parent / "outside-secret.txt"
    outside.write_text("outside", encoding="utf-8")
    link = tmp_path / "linked.txt"
    try:
        link.symlink_to(outside)
    except OSError:
        pass
    before = code.read_bytes()

    result = scan_repository(str(tmp_path), objective="build feature")

    assert result["scan_status"] == "complete"
    assert "React" in result["frameworks"]
    assert "vitest" in result["test_commands"]
    paths = {item["path"] for item in result["files"]}
    assert "src/feature.ts" in paths
    assert ".env" not in paths
    assert "linked.txt" not in paths
    assert code.read_bytes() == before


def test_repository_scan_parses_pyproject_dependencies(tmp_path: Path):
    (tmp_path / "pyproject.toml").write_text(
        '[project]\nname="demo"\ndependencies=["fastapi>=0.100", "pytest"]\n', encoding="utf-8"
    )
    result = scan_repository(str(tmp_path))
    assert "FastAPI" in result["frameworks"]
    assert "pytest" in result["frameworks"]


def test_repository_scan_marks_limits_as_partial(tmp_path: Path):
    for index in range(3):
        (tmp_path / f"file{index}.py").write_text(f"def f{index}(): pass", encoding="utf-8")
    result = scan_repository(str(tmp_path), limits=ScanLimits(max_files=1))
    assert result["scan_status"] == "partial"
    assert result["warnings"] == ["max_files_reached"]


def test_repository_scan_rejects_missing_path(tmp_path: Path):
    with pytest.raises(RepositoryScanError, match="does not exist"):
        scan_repository(str(tmp_path / "missing"))


def test_repository_remote_redacts_embedded_credentials(tmp_path: Path, monkeypatch):
    from app.services import repository_analysis
    monkeypatch.setattr(repository_analysis, "_safe_git", lambda _root, *args: "https://secret-token@github.com/example/repo.git" if args[:3] == ("remote", "get-url", "origin") else None)
    (tmp_path / "app.py").write_text("pass", encoding="utf-8")
    result = scan_repository(str(tmp_path))
    assert result["remote"] == "https://github.com/example/repo.git"
    assert "secret-token" not in str(result)
