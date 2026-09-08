from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import subprocess
import time
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import urlsplit, urlunsplit


DEFAULT_EXCLUDED_DIRS = {
    ".git", ".hg", ".svn", ".idea", ".vscode", ".venv", "venv", "env",
    "node_modules", "dist", "build", "coverage", ".next", ".nuxt", ".pytest_cache",
    "__pycache__", "target", "vendor",
}
SENSITIVE_NAMES = {
    ".env", ".env.local", ".env.production", "id_rsa", "id_ed25519",
    "credentials", "credentials.json", "secrets.json", "secret.key",
}
SENSITIVE_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".crt", ".cer"}
TEXT_SUFFIXES = {
    ".py", ".pyi", ".js", ".jsx", ".ts", ".tsx", ".json", ".toml", ".yaml",
    ".yml", ".md", ".txt", ".ini", ".cfg", ".conf", ".xml", ".html", ".css",
    ".scss", ".sql", ".sh", ".ps1", ".bat", ".java", ".kt", ".go", ".rs",
    ".rb", ".php", ".cs", ".cpp", ".c", ".h", ".hpp", ".vue", ".svelte",
}
IMPORTANT_NAMES = {
    "dockerfile", "makefile", "package.json", "pyproject.toml", "requirements.txt",
    "poetry.lock", "uv.lock", "pnpm-lock.yaml", "package-lock.json", "yarn.lock",
    "cargo.toml", "go.mod", "pom.xml", "build.gradle", "readme.md", "agents.md",
    "contributing.md", "openapi.yaml", "openapi.json",
}


@dataclass(frozen=True)
class ScanLimits:
    max_files: int = 5_000
    max_file_bytes: int = 256 * 1024
    max_sample_bytes: int = 2 * 1024 * 1024
    timeout_seconds: float = 10.0


class RepositoryScanError(ValueError):
    pass


def _is_sensitive(path: Path) -> bool:
    name = path.name.lower()
    return (
        name in SENSITIVE_NAMES
        or name.startswith(".env.")
        or path.suffix.lower() in SENSITIVE_SUFFIXES
        or any(token in name for token in ("private_key", "access_token", "api_key"))
    )


def _is_text_candidate(path: Path) -> bool:
    return path.suffix.lower() in TEXT_SUFFIXES or path.name.lower() in IMPORTANT_NAMES


def _safe_git(root: Path, *args: str) -> str | None:
    try:
        completed = subprocess.run(
            ["git", "-C", str(root), *args], capture_output=True, text=True,
            timeout=2, check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return completed.stdout.strip() if completed.returncode == 0 else None


def _sanitize_remote(value: str | None) -> str | None:
    if not value:
        return None
    if "://" not in value:
        return value
    parsed = urlsplit(value)
    hostname = parsed.hostname or ""
    if parsed.port:
        hostname = f"{hostname}:{parsed.port}"
    return urlunsplit((parsed.scheme, hostname, parsed.path, "", ""))


def _tokens(value: str) -> set[str]:
    tokens = {
        token.lower() for token in re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}", value)
        if token.lower() not in {"the", "and", "with", "this", "that"}
    }
    for sequence in re.findall(r"[\u4e00-\u9fff]{2,}", value):
        tokens.update(sequence[index:index + 2] for index in range(len(sequence) - 1))
    return tokens - {"一个", "功能", "项目"}


def _symbols(path: Path, content: str) -> list[str]:
    if path.suffix.lower() == ".py":
        try:
            tree = ast.parse(content)
            return [node.name for node in ast.walk(tree) if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))][:40]
        except SyntaxError:
            return []
    if path.suffix.lower() in {".js", ".jsx", ".ts", ".tsx"}:
        matches = re.findall(
            r"(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)",
            content,
        )
        return list(dict.fromkeys(matches))[:40]
    return []


def _manifest_info(path: Path, content: str) -> dict | None:
    name = path.name.lower()
    if name == "package.json":
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            return {"path": path.as_posix(), "type": "npm", "parse_error": True}
        dependency_versions = {**(data.get("dependencies") or {}), **(data.get("devDependencies") or {})}
        deps = sorted(dependency_versions.keys())
        scripts = data.get("scripts") or {}
        return {"path": path.as_posix(), "type": "npm", "dependencies": deps[:150], "dependency_versions": {key: dependency_versions[key] for key in deps[:150]}, "scripts": scripts}
    if name == "pyproject.toml":
        try:
            data = tomllib.loads(content)
        except (tomllib.TOMLDecodeError, ValueError):
            return {"path": path.as_posix(), "type": "python", "parse_error": True}
        raw_dependencies = list((data.get("project") or {}).get("dependencies") or [])
        for group in ((data.get("project") or {}).get("optional-dependencies") or {}).values():
            if isinstance(group, list):
                raw_dependencies.extend(group)
        poetry_dependencies = (((data.get("tool") or {}).get("poetry") or {}).get("dependencies") or {})
        raw_dependencies.extend(poetry_dependencies.keys())
        dependencies = sorted({
            match.group(1) for value in raw_dependencies
            if (match := re.match(r"\s*([A-Za-z0-9_.-]+)", str(value)))
        })[:150]
        return {"path": path.as_posix(), "type": "python", "dependencies": dependencies}
    if name in {"requirements.txt", "poetry.lock", "uv.lock"}:
        dependencies = sorted(set(re.findall(r"(?m)^\s*([A-Za-z0-9_.-]+)\s*(?:[<>=~!]|$)", content)))[:150]
        return {"path": path.as_posix(), "type": "python", "dependencies": dependencies}
    if name in {"cargo.toml", "go.mod", "pom.xml", "build.gradle"}:
        return {"path": path.as_posix(), "type": name.split(".")[0]}
    return None


def _frameworks(manifests: Iterable[dict]) -> list[str]:
    deps = {str(dep).lower() for manifest in manifests for dep in manifest.get("dependencies", [])}
    known = {
        "react": "React", "next": "Next.js", "vue": "Vue", "vite": "Vite",
        "fastapi": "FastAPI", "django": "Django", "flask": "Flask", "pytest": "pytest",
        "vitest": "Vitest", "jest": "Jest", "langgraph": "LangGraph", "sqlalchemy": "SQLAlchemy",
    }
    return [label for key, label in known.items() if key in deps]


def scan_repository(
    repository_path: str,
    *,
    objective: str = "",
    exclude_patterns: list[str] | None = None,
    limits: ScanLimits | None = None,
) -> dict:
    limits = limits or ScanLimits()
    if os.name == "nt" and repository_path.strip().startswith("\\\\"):
        raise RepositoryScanError("UNC repository paths are not supported")
    raw_root = Path(repository_path).expanduser()
    if not raw_root.is_absolute():
        raise RepositoryScanError("Repository path must be absolute")
    if not raw_root.exists():
        raise RepositoryScanError("Repository path does not exist")
    if not raw_root.is_dir():
        raise RepositoryScanError("Repository path is not a directory")
    try:
        root = raw_root.resolve(strict=True)
        next(root.iterdir(), None)
    except PermissionError as exc:
        raise RepositoryScanError("Repository path is not readable") from exc

    started = time.monotonic()
    head_before = _safe_git(root, "rev-parse", "HEAD")
    excludes = DEFAULT_EXCLUDED_DIRS | {value.strip("/\\").lower() for value in (exclude_patterns or []) if value.strip()}
    objective_tokens = _tokens(objective)
    files: list[dict] = []
    manifests: list[dict] = []
    warnings: list[str] = []
    sampled = 0
    truncated = False

    for current, dirs, names in os.walk(root, followlinks=False):
        current_path = Path(current)
        safe_dirs = []
        for dirname in sorted(dirs):
            child = current_path / dirname
            if dirname.lower() in excludes or child.is_symlink():
                continue
            try:
                child.resolve(strict=False).relative_to(root)
            except ValueError:
                continue
            safe_dirs.append(dirname)
        dirs[:] = safe_dirs
        for name in sorted(names):
            if time.monotonic() - started > limits.timeout_seconds:
                warnings.append("scan_timeout")
                truncated = True
                break
            path = current_path / name
            if path.is_symlink() or _is_sensitive(path) or not _is_text_candidate(path):
                continue
            try:
                relative = path.resolve(strict=True).relative_to(root)
                size = path.stat().st_size
            except (OSError, ValueError):
                continue
            if len(files) >= limits.max_files:
                warnings.append("max_files_reached")
                truncated = True
                break
            entry = {"id": f"repo_{len(files) + 1:04d}", "path": relative.as_posix(), "size": size}
            content = ""
            if size <= limits.max_file_bytes and sampled < limits.max_sample_bytes:
                try:
                    remaining = limits.max_sample_bytes - sampled
                    raw = path.read_bytes()[: min(limits.max_file_bytes, remaining)]
                    if b"\x00" not in raw:
                        content = raw.decode("utf-8", errors="replace")
                        sampled += len(raw)
                except OSError:
                    pass
            try:
                hash_input = path.read_bytes() if size <= limits.max_file_bytes else f"{size}:{relative}".encode()
            except OSError:
                hash_input = f"unreadable:{size}:{relative}".encode()
            entry["sha256"] = hashlib.sha256(hash_input).hexdigest()
            symbols = _symbols(path, content)
            if symbols:
                entry["symbols"] = symbols
            haystack = f"{relative.as_posix()} {' '.join(symbols)} {content[:4000]}".lower()
            relevance = sum(1 for token in objective_tokens if token in haystack)
            if relevance:
                entry["relevance"] = relevance
            manifest = _manifest_info(relative, content)
            if manifest:
                manifests.append(manifest)
            files.append(entry)
        if truncated:
            break

    digest = hashlib.sha256()
    for item in files:
        digest.update(f"{item['path']}:{item['sha256']}\n".encode())
    suffix_counts: dict[str, int] = {}
    for item in files:
        suffix = Path(item["path"]).suffix.lower() or "[no extension]"
        suffix_counts[suffix] = suffix_counts.get(suffix, 0) + 1
    relevant = sorted(
        (item for item in files if item.get("relevance")),
        key=lambda item: (-int(item["relevance"]), item["path"]),
    )[:30]
    module_counts: dict[str, int] = {}
    for item in files:
        parts = Path(item["path"]).parts
        module = parts[0] if len(parts) > 1 else "[root]"
        module_counts[module] = module_counts.get(module, 0) + 1
    lower_paths = {str(item["path"]).lower() for item in files}
    conventions = []
    for path, label in {
        "agents.md": "AGENTS.md instructions",
        "contributing.md": "contribution guide",
        "pyproject.toml": "Python project configuration",
        "package.json": "Node package scripts",
    }.items():
        if path in lower_paths:
            conventions.append({"path": path, "kind": label})
    conventions.extend(
        {"path": path, "kind": "CI workflow"}
        for path in sorted(lower_paths)
        if path.startswith(".github/workflows/")
    )
    detected_frameworks = _frameworks(manifests)
    test_commands = {
        command for manifest in manifests for name, command in (manifest.get("scripts") or {}).items()
        if name in {"test", "build", "lint", "typecheck"}
    }
    if "pytest" in detected_frameworks or any(item["path"].startswith("tests/") and item["path"].endswith(".py") for item in files):
        test_commands.add("python -m pytest")
    branch = _safe_git(root, "branch", "--show-current")
    head_after = _safe_git(root, "rev-parse", "HEAD")
    if head_before and head_after and head_before != head_after:
        warnings.append("repository_changed_during_scan")
        truncated = True
    result = {
        "repository_name": root.name,
        "branch": branch,
        "head_sha": head_before or head_after,
        "remote": _sanitize_remote(_safe_git(root, "remote", "get-url", "origin")),
        "fingerprint": digest.hexdigest(),
        "scan_status": "partial" if truncated else "complete",
        "languages": [{"extension": key, "files": value} for key, value in sorted(suffix_counts.items(), key=lambda item: (-item[1], item[0]))],
        "frameworks": detected_frameworks,
        "manifests": manifests,
        "conventions": conventions,
        "test_commands": sorted(test_commands),
        "files": files,
        "modules": [{"path": key, "files": value} for key, value in sorted(module_counts.items(), key=lambda item: (-item[1], item[0]))],
        "relevant_files": [{key: item[key] for key in ("id", "path", "symbols", "relevance") if key in item} for item in relevant],
        "warnings": list(dict.fromkeys(warnings)),
        "limits": {
            "max_files": limits.max_files, "max_file_bytes": limits.max_file_bytes,
            "max_sample_bytes": limits.max_sample_bytes, "timeout_seconds": limits.timeout_seconds,
        },
    }
    return result
