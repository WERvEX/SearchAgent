import json
import re
import asyncio
import inspect
import threading
from typing import Any

from langgraph.types import interrupt

from app.db.models import Source
from app.engine.context import EngineContext
from app.engine.state import ResearchState
from app.services.settings_service import get_preference


def _get_llm(ctx: EngineContext) -> Any:
    if ctx.llm_factory is not None:
        return ctx.llm_factory()
    from app.llm.factory import build_chat_model_from_profile

    return build_chat_model_from_profile(ctx.session, ctx.profile_id)


def _parse_json_content(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text.strip())


def _llm_content(response: Any) -> str:
    content = getattr(response, "content", response)
    return str(content) if content is not None else ""


def _latest_user_message(messages: list) -> str:
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") == "user":
            return str(msg.get("content", ""))
    return ""


def _extract_objective(response_text: str, user_message: str) -> str | None:
    marker = "OBJECTIVE:"
    if marker in response_text:
        return response_text.split(marker, 1)[1].strip()
    if len(user_message) > 20:
        return user_message.strip()
    return None


def _fallback_plan(objective: str) -> dict:
    return {
        "summary": f"研究计划：{objective}",
        "options": [
            {"id": "A", "label": "全面综述"},
            {"id": "B", "label": "聚焦最新进展"},
        ],
    }


def _fallback_steps() -> list[dict]:
    return [
        {"seq": 1, "title": "检索资料", "status": "pending"},
        {"seq": 2, "title": "整理证据", "status": "pending"},
    ]


def _run_async(value: Any) -> Any:
    if not inspect.isawaitable(value):
        return value
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(value)

    result: dict[str, Any] = {}

    def _runner() -> None:
        try:
            result["value"] = asyncio.run(value)
        except BaseException as exc:
            result["error"] = exc

    thread = threading.Thread(target=_runner)
    thread.start()
    thread.join()
    if "error" in result:
        raise result["error"]
    return result.get("value")


def _get_max_sources(ctx: EngineContext) -> int:
    pref = get_preference(ctx.session, "max_sources") or {}
    value = pref.get("value", 20)
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return 20


def _tool_name(tool: Any) -> str:
    return str(getattr(tool, "name", tool.__class__.__name__))


def _tool_call_name(call: Any) -> str:
    if isinstance(call, dict):
        return str(call.get("name") or call.get("function", {}).get("name") or "")
    return str(getattr(call, "name", ""))


def _tool_call_args(call: Any) -> dict:
    if isinstance(call, dict):
        args = call.get("args")
        if args is None:
            args = call.get("function", {}).get("arguments")
    else:
        args = getattr(call, "args", None)

    if isinstance(args, str):
        try:
            parsed = json.loads(args)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return args if isinstance(args, dict) else {}


def _response_tool_calls(response: Any) -> list[Any]:
    calls = getattr(response, "tool_calls", None)
    if calls:
        return list(calls)
    additional = getattr(response, "additional_kwargs", {}) or {}
    return list(additional.get("tool_calls") or [])


def _invoke_tool(tool: Any, args: dict) -> Any:
    if hasattr(tool, "invoke"):
        return _run_async(tool.invoke(args))
    if callable(tool):
        return tool(**args)
    raise TypeError(f"Tool {_tool_name(tool)} is not invokable")


def _iter_source_items(result: Any, *, tool_name: str, args: dict) -> list[dict]:
    if isinstance(result, dict):
        if isinstance(result.get("results"), list):
            candidates = result["results"]
        elif result.get("url"):
            candidates = [result]
        else:
            candidates = []
    elif isinstance(result, list):
        candidates = result
    else:
        candidates = []

    sources = []
    for item in candidates:
        if not isinstance(item, dict) or not item.get("url"):
            continue
        sources.append(
            {
                "title": str(item.get("title") or item.get("url")),
                "url": str(item["url"]),
                "snippet": item.get("snippet") or item.get("content"),
                "tool_name": tool_name,
            }
        )

    if not sources and args.get("url"):
        sources.append(
            {
                "title": str(args.get("title") or args["url"]),
                "url": str(args["url"]),
                "snippet": None,
                "tool_name": tool_name,
            }
        )
    return sources


def _dedupe_findings(findings: list[dict]) -> list[dict]:
    seen = set()
    deduped = []
    for finding in findings:
        url = finding.get("url")
        key = url or json.dumps(finding, sort_keys=True, ensure_ascii=False)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(finding)
    return deduped


def _mark_acceptance_criteria(steps: list[dict], findings: list[dict]) -> list[dict]:
    updated_steps = []
    for step in steps:
        updated = dict(step)
        criteria = []
        for criterion in step.get("acceptance_criteria", []) or []:
            description = (
                str(criterion.get("description", ""))
                if isinstance(criterion, dict)
                else str(criterion)
            )
            evidence_ref = None
            description_lower = description.lower()
            for finding in findings:
                haystack = " ".join(
                    str(finding.get(key, ""))
                    for key in ("title", "snippet", "url")
                ).lower()
                if description_lower and description_lower in haystack:
                    evidence_ref = finding.get("url")
                    break
            criteria.append(
                {
                    "description": description,
                    "met": evidence_ref is not None,
                    "evidence_ref": evidence_ref,
                }
            )
        if criteria:
            updated["acceptance_criteria"] = criteria
        updated_steps.append(updated)
    return updated_steps


def _build_report_markdown(state: ResearchState) -> str:
    findings = state.get("findings", [])
    lines = [
        "# 研究报告",
        "",
        f"## 研究目标",
        "",
        state.get("objective", ""),
        "",
        "## 主要发现",
        "",
    ]

    if not findings:
        lines.append("暂无可引用发现。")
    for idx, finding in enumerate(findings, start=1):
        title = finding.get("title") or finding.get("url") or f"来源 {idx}"
        snippet = finding.get("snippet") or ""
        lines.append(f"- {title}[^{idx}] {snippet}")

    if findings:
        lines.extend(["", "## 参考来源", ""])
        for idx, finding in enumerate(findings, start=1):
            title = finding.get("title") or finding.get("url") or f"来源 {idx}"
            url = finding.get("url", "")
            lines.append(f"[^{idx}]: {title} - {url}")

    return "\n".join(lines).strip() + "\n"


def make_nodes(ctx: EngineContext):
    """Return a dict of node-name -> callable for the research graph."""

    def clarify_intent(state: ResearchState) -> dict:
        if state.get("objective"):
            return {}

        user_message = _latest_user_message(state.get("messages", []))
        try:
            llm = _get_llm(ctx)
            prompt = (
                "Clarify the user's research objective.\n"
                f"User message: {user_message}\n"
                "If the objective is clear, respond with a line starting with OBJECTIVE: "
                "followed by a concise research objective. Otherwise ask a follow-up question."
            )
            response_text = _llm_content(llm.invoke(prompt))
            objective = _extract_objective(response_text, user_message)
            if objective:
                return {"objective": objective}
            return {"messages": [{"role": "assistant", "content": response_text.strip()}]}
        except Exception:
            return {
                "messages": [{"role": "assistant", "content": "请描述你想研究的方向。"}],
            }

    def generate_plan(state: ResearchState) -> dict:
        objective = state["objective"]
        try:
            llm = _get_llm(ctx)
            prompt = (
                "Generate a research plan as JSON with keys summary (string) and options "
                "(array of {id, label}).\n"
                f"Research topic: {objective}"
            )
            response_text = _llm_content(llm.invoke(prompt))
            plan = _parse_json_content(response_text)
            if isinstance(plan, dict) and "summary" in plan and "options" in plan:
                return {"plan": plan}
        except Exception:
            pass
        return {"plan": _fallback_plan(objective)}

    def await_plan_approval(state: ResearchState) -> dict:
        decision = interrupt({"plan": state.get("plan"), "message": "请确认或选择方案"})
        return {
            "approved": bool(decision.get("approved")),
            "plan": {**state.get("plan", {}), "chosen_option": decision.get("chosen_option")},
        }

    def derive_steps(state: ResearchState) -> dict:
        objective = state["objective"]
        plan = state.get("plan") or {}
        try:
            llm = _get_llm(ctx)
            prompt = (
                "Derive research steps as a JSON array of objects with keys "
                "seq (int), title (string), description (string), status (string).\n"
                f"Research topic: {objective}\n"
                f"Selected approach: {json.dumps(plan, ensure_ascii=False)}"
            )
            response_text = _llm_content(llm.invoke(prompt))
            steps = _parse_json_content(response_text)
            if isinstance(steps, list) and steps:
                return {"steps": steps}
        except Exception:
            pass
        return {"steps": _fallback_steps()}

    def execute_research(state: ResearchState) -> dict:
        from app.tools import registry

        max_sources = _get_max_sources(ctx)
        tool_result = _run_async(registry.get_research_tools(ctx.session))
        tools = tool_result.get("tools", [])
        tools_by_name = {_tool_name(tool): tool for tool in tools}

        llm = _get_llm(ctx)
        bound_llm = llm.bind_tools(tools) if hasattr(llm, "bind_tools") else llm
        prompt = (
            "Use the available tools to collect sources for this research task. "
            f"Objective: {state.get('objective', '')}\n"
            f"Steps: {json.dumps(state.get('steps', []), ensure_ascii=False)}\n"
            f"Return at most {max_sources} useful sources."
        )
        response = bound_llm.invoke(prompt)

        findings = list(state.get("findings", []))
        for call in _response_tool_calls(response):
            if len(findings) >= max_sources:
                break

            name = _tool_call_name(call)
            tool = tools_by_name.get(name)
            if tool is None:
                continue

            args = _tool_call_args(call)
            result = _invoke_tool(tool, args)
            for source in _iter_source_items(result, tool_name=name, args=args):
                if len(findings) >= max_sources:
                    break
                findings.append(source)
                ctx.session.add(
                    Source(
                        project_id=state["project_id"],
                        url=source["url"],
                        title=source["title"],
                        snippet=source.get("snippet"),
                        tool_name=name,
                    )
                )

        ctx.session.commit()
        return {"findings": findings}

    def aggregate_evidence(state: ResearchState) -> dict:
        findings = _dedupe_findings(state.get("findings", []))
        steps = _mark_acceptance_criteria(state.get("steps", []), findings)
        return {"findings": findings, "steps": steps}

    def write_report(state: ResearchState) -> dict:
        from app.engine.persistence import persist_report, sync_plan_and_steps

        report_md = _build_report_markdown(state)
        sync_plan_and_steps(ctx.session, state)
        persist_report(ctx.session, project_id=state["project_id"], content_md=report_md)
        return {"report_md": report_md}

    return {
        "clarify_intent": clarify_intent,
        "generate_plan": generate_plan,
        "await_plan_approval": await_plan_approval,
        "derive_steps": derive_steps,
        "execute_research": execute_research,
        "aggregate_evidence": aggregate_evidence,
        "write_report": write_report,
    }
