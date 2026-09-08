from __future__ import annotations

import json
from typing import Any

from app.schemas.artifacts import ImplementationManifest


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item not in (None, "")]


def _records(value: Any) -> list[dict]:
    if not isinstance(value, list):
        return []
    return [item if isinstance(item, dict) else {"description": str(item)} for item in value if item not in (None, "")]


def _repository_evidence(snapshot: dict) -> list[dict]:
    return [
        {
            "id": item["id"],
            "kind": "repository_file",
            "path": item["path"],
            "sha256": next((file.get("sha256") for file in snapshot.get("files", []) if file.get("id") == item["id"]), None),
        }
        for item in snapshot.get("relevant_files", [])
    ]


def build_manifest(state: dict[str, Any]) -> ImplementationManifest:
    plan = state.get("plan") or {}
    snapshot = state.get("repository_summary") or {}
    evidence = _repository_evidence(snapshot)
    evidence.extend(
        {
            "id": f"src_{index:03d}",
            "kind": "web_source",
            "title": item.get("title") or item.get("url"),
            "url": item.get("url"),
            "verified": bool(item.get("verified")),
        }
        for index, item in enumerate(state.get("verified_findings") or state.get("findings") or [], start=1)
        if item.get("url")
    )
    evidence_ids = {item["id"] for item in evidence}
    observed = {item.get("path"): item for item in snapshot.get("files", [])}

    raw_changes = plan.get("change_map") if isinstance(plan.get("change_map"), list) else []
    change_map = []
    change_id_map: dict[str, str] = {}
    for index, raw in enumerate(raw_changes, start=1):
        if not isinstance(raw, dict) or not raw.get("path"):
            continue
        path = str(raw["path"]).replace("\\", "/").lstrip("/")
        action = raw.get("action") if raw.get("action") in {"create", "modify", "delete"} else ("modify" if path in observed else "create")
        status = "observed" if path in observed else "proposed" if action == "create" else "uncertain"
        refs = [str(ref) for ref in raw.get("evidence_refs", []) if str(ref) in evidence_ids]
        if path in observed and observed[path].get("id") not in refs:
            refs.append(observed[path]["id"])
        stable_id = f"change_{index:02d}"
        change_id_map[str(raw.get("id") or stable_id)] = stable_id
        change_map.append({
            "id": stable_id, "action": action, "path": path,
            "path_status": status, "symbols": _strings(raw.get("symbols")),
            "purpose": str(raw.get("purpose") or raw.get("description") or "Implement the planned change"),
            "affected_components": _strings(raw.get("affected_components")),
            "dependencies": _strings(raw.get("dependencies")),
            "acceptance_criteria": _strings(raw.get("acceptance_criteria")),
            "risk": raw.get("risk"), "evidence_refs": refs,
        })

    plan_steps = plan.get("steps") or state.get("steps") or []
    tasks = []
    raw_task_ids = [str(step.get("id") or f"task_{index:02d}") for index, step in enumerate(plan_steps, start=1) if isinstance(step, dict)]
    task_id_map = {raw_id: f"task_{index:02d}" for index, raw_id in enumerate(raw_task_ids, start=1)}
    for index, step in enumerate(plan_steps, start=1):
        if not isinstance(step, dict):
            continue
        step_changes = [change_id_map[str(item)] for item in step.get("change_ids", []) if str(item) in change_id_map]
        raw_criteria = step.get("acceptance_criteria")
        criteria = [str(item.get("description") if isinstance(item, dict) else item) for item in raw_criteria if item] if isinstance(raw_criteria, list) else []
        criteria = criteria or [f"Complete: {step.get('title') or f'Task {index}'}"]
        risks = _strings(step.get("risks"))
        raw_task_id = str(step.get("id") or f"task_{index:02d}")
        tasks.append({
            "id": task_id_map[raw_task_id], "title": str(step.get("title") or f"Task {index}"),
            "depends_on": [task_id_map[str(item)] for item in step.get("depends_on", []) if str(item) in task_id_map], "change_ids": step_changes,
            "steps": [str(step.get("description"))] if step.get("description") else [],
            "acceptance_criteria": criteria or ["Task result is reviewed"],
            "test_commands": _strings(step.get("test_commands")),
            "evidence_refs": [str(item) for item in step.get("evidence_refs", []) if str(item) in evidence_ids] if isinstance(step.get("evidence_refs"), list) else [],
            "risks": risks, "rollback": _strings(step.get("rollback")) or (["Revert the task-specific changes"] if risks else []),
            "status": "pending",
        })
    task_ids = {task["id"] for task in tasks}
    for task in tasks:
        task["depends_on"] = [item for item in task["depends_on"] if item in task_ids and item != task["id"]]

    repository = {
        key: snapshot.get(key) for key in (
            "repository_name", "branch", "head_sha", "fingerprint", "scan_status", "frameworks", "test_commands", "warnings"
        ) if snapshot.get(key) not in (None, [], "")
    }
    if state.get("repository_snapshot_id") is not None:
        repository["snapshot_id"] = state["repository_snapshot_id"]
    return ImplementationManifest.model_validate({
        "problem": state.get("problem_definition") or {"goal": state.get("objective", "")},
        "repository": repository,
        "decisions": _records(state.get("candidate_decisions")),
        "change_map": change_map,
        "interfaces": _records(plan.get("interfaces")),
        "data_changes": _records(plan.get("data_changes")),
        "tasks": tasks,
        "validation": _records(plan.get("verification_tasks")),
        "rollback": _strings(plan.get("rollback")),
        "unresolved_decisions": _records(plan.get("unresolved_decisions")),
        "evidence": evidence,
    })


def manifest_json(manifest: ImplementationManifest) -> str:
    data = manifest.model_dump(exclude_none=True)
    payload = {key: data[key] for key in ("schema_version", "artifact", "workflow", "problem")}
    for key in ("repository", "decisions", "change_map", "interfaces", "data_changes", "tasks", "validation", "rollback", "unresolved_decisions", "evidence"):
        if data.get(key) not in (None, [], {}, ""):
            payload[key] = data[key]
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=False)


def manifest_markdown(manifest: ImplementationManifest) -> str:
    data = manifest.model_dump(exclude_none=True)
    problem = data["problem"]
    lines = ["# STARTSPEC", "", "## 问题定义", "", str(problem.get("goal") or problem)]
    for key, label in (("users", "用户/场景"), ("constraints", "约束"), ("non_goals", "非目标"), ("success_criteria", "成功标准"), ("assumptions", "待验证假设")):
        value = problem.get(key)
        if value:
            rendered = "、".join(map(str, value)) if isinstance(value, list) else str(value)
            lines.append(f"- {label}：{rendered}")
    if data["repository"]:
        repository = data["repository"]
        lines += ["", "## 仓库上下文", "", f"- 仓库：{repository.get('repository_name', '未命名')}", f"- 分支：{repository.get('branch', '未知')}", f"- HEAD：{repository.get('head_sha', '未知')}", f"- 扫描状态：{repository.get('scan_status', '未知')}"]
    lines += ["", "## 候选决策", ""]
    lines += [f"- `{item.get('decision', 'reference')}` `{item.get('candidate_key', 'unknown')}`" for item in data["decisions"]] or ["- 无"]
    lines += ["", "## 代码变更图", ""]
    lines += [f"- `{item['action']}` `{item['path']}`（{item['path_status']}）：{item['purpose']}" for item in data["change_map"]] or ["- 未指定文件级变更，编码前需进一步确认。"]
    lines += ["", "## 实施任务", ""]
    for task in data["tasks"]:
        lines += [f"### {task['id']} · {task['title']}", ""]
        if task["depends_on"]:
            lines.append(f"依赖：{', '.join(task['depends_on'])}")
        lines += ["", "验收标准：", *[f"- {item}" for item in task["acceptance_criteria"]]]
        if task["test_commands"]:
            lines += ["", "建议验证命令：", *[f"- `{item}`" for item in task["test_commands"]]]
        if task["risks"]:
            lines += ["", "风险：", *[f"- {item}" for item in task["risks"]], "", "回滚：", *[f"- {item}" for item in task["rollback"]]]
    if data["interfaces"]:
        lines += ["", "## 接口变化", "", *[f"- {item.get('description') or item}" for item in data["interfaces"]]]
    if data["data_changes"]:
        lines += ["", "## 数据变化", "", *[f"- {item.get('description') or item}" for item in data["data_changes"]]]
    lines += ["", "## 验证计划", ""]
    lines += [f"- {item.get('title') or item.get('description') or item}" for item in data["validation"]] or ["- 按各任务验收标准执行验证。"]
    if data["rollback"]:
        lines += ["", "## 全局回滚策略", "", *[f"- {item}" for item in data["rollback"]]]
    lines += ["", "## 未决问题", ""]
    lines += [f"- {item.get('question') or item.get('description') or item}" for item in data["unresolved_decisions"]] or ["- 无"]
    lines += ["", "## 证据索引", ""]
    for item in data["evidence"]:
        target = item.get("path") or item.get("url") or ""
        lines.append(f"- `{item.get('id')}` {item.get('kind')}：{target}")
    lines += ["", "## 安全边界", "", "StartSpec 仅生成计划与工程契约，不会执行命令、安装依赖或修改目标仓库。", ""]
    return "\n".join(lines)
