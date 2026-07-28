import json
import re
import asyncio
import inspect
import threading
from typing import Any

from langgraph.types import interrupt

from app.core.events import get_event_bus
from app.db.models import Source, Step
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
        if getattr(msg, "type", None) in ("human", "user"):
            return str(getattr(msg, "content", ""))
    return ""


def _conversation_context(messages: list) -> str:
    lines = []
    for message in messages[-12:]:
        if isinstance(message, dict):
            role = str(message.get("role", "user"))
            content = str(message.get("content", "")).strip()
        else:
            message_type = getattr(message, "type", "user")
            role = {"human": "user", "ai": "assistant"}.get(message_type, str(message_type))
            content = str(getattr(message, "content", "")).strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _extract_objective(response_text: str, user_message: str) -> str | None:
    marker = "OBJECTIVE:"
    if marker in response_text:
        return response_text.split(marker, 1)[1].strip()
    if len(user_message) > 20:
        return user_message.strip()
    return None


def _fallback_plan(objective: str, *, chinese: bool = True) -> dict:
    return {
        "summary": f"研究计划：{objective}" if chinese else f"Research plan: {objective}",
        "steps": _fallback_steps(chinese=chinese),
    }


def _fallback_steps(*, chinese: bool = True) -> list[dict]:
    if not chinese:
        return [
            {"seq": 1, "title": "Collect sources", "status": "pending"},
            {"seq": 2, "title": "Synthesize evidence", "status": "pending"},
        ]
    return [
        {"seq": 1, "title": "检索资料", "status": "pending"},
        {"seq": 2, "title": "整理证据", "status": "pending"},
    ]


def _is_chinese(state: ResearchState) -> bool:
    return state.get("response_language", "zh-CN") == "zh-CN"


def _response_language_instruction(state: ResearchState) -> str:
    language = "Simplified Chinese" if _is_chinese(state) else "English"
    return (
        f"The application language is {language}. Write every user-visible message, "
        f"plan summary, step title, step description, and report section in {language}."
    )


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
    if hasattr(tool, "ainvoke"):
        return _run_async(tool.ainvoke(args))
    if hasattr(tool, "invoke"):
        return _run_async(tool.invoke(args))
    if callable(tool):
        return tool(**args)
    raise TypeError(f"Tool {_tool_name(tool)} is not invokable")


def _iter_source_items(result: Any, *, tool_name: str, args: dict) -> list[dict]:
    if isinstance(result, str) and result.startswith("Error fetching "):
        return []
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
                "snippet": result if isinstance(result, str) else None,
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


def _report_references(findings: list[dict], *, chinese: bool = True) -> list[str]:
    lines = ["", "## 参考来源" if chinese else "## References", ""]
    for idx, finding in enumerate(findings, start=1):
        title = finding.get("title") or finding.get("url") or f"来源 {idx}"
        url = finding.get("url", "")
        lines.append(f"[^{idx}]: [{title}]({url})")
    return lines


def _build_report_markdown(state: ResearchState, analysis_md: str | None = None) -> str:
    findings = state.get("findings", [])
    chinese = _is_chinese(state)
    lines = [
        "# 研究报告" if chinese else "# Research Report",
        "",
        "## 研究目标" if chinese else "## Research Objective",
        "",
        state.get("objective", ""),
        "",
    ]

    analysis_md = str(analysis_md or "").strip()
    if analysis_md:
        lines.extend([analysis_md, ""])
    else:
        lines.extend(["## 主要发现" if chinese else "## Key Findings", ""])
        if not findings:
            lines.append("暂无可引用发现。" if chinese else "No citable findings are available.")
        for idx, finding in enumerate(findings, start=1):
            title = finding.get("title") or finding.get("url") or f"来源 {idx}"
            url = finding.get("url") or ""
            snippet = finding.get("snippet") or ""
            linked_title = f"[{title}]({url})" if url else str(title)
            lines.append(f"- {linked_title} [^{idx}] {snippet}")

    if findings:
        lines.extend(_report_references(findings, chinese=chinese))

    return "\n".join(lines).strip() + "\n"


def _normalize_report_analysis(content: str, source_count: int) -> str | None:
    content = str(content or "").strip()
    content = re.sub(r"^#\s+(?:研究报告|Research Report)\s*", "", content, flags=re.IGNORECASE)
    content = re.split(r"\n##\s*(?:参考来源|References)\b", content, maxsplit=1, flags=re.IGNORECASE)[0].strip()

    def _normalize_citation(match: re.Match[str]) -> str:
        source_id = int(match.group(1))
        return f"[^{source_id}]" if 1 <= source_id <= source_count else match.group(0)

    content = re.sub(r"(?<!\^)\[(\d+)\]", _normalize_citation, content)
    if len(content) < 100 or not re.search(r"\[\^\d+\]", content):
        return None
    if "## " not in content:
        content = f"## 综合分析\n\n{content}"
    return content


def _synthesize_report(ctx: EngineContext, state: ResearchState) -> str | None:
    findings = state.get("findings", [])
    evidence = [
        {
            "source_id": idx,
            "title": finding.get("title") or finding.get("url") or f"来源 {idx}",
            "url": finding.get("url") or "",
            "snippet": str(finding.get("snippet") or "")[:1000],
        }
        for idx, finding in enumerate(findings, start=1)
    ]
    base_prompt = (
        f"Write the analytical body of a research report in Markdown. {_response_language_instruction(state)} "
        "Use only the supplied evidence; do not invent facts or URLs. Synthesize the "
        "evidence instead of listing or repeating source snippets. Clearly distinguish "
        "reported facts, reasonable inferences, and unresolved uncertainties. Include "
        "an executive summary, analysis organized around the objective's requested "
        "dimensions, a 12-month outlook when relevant, key risks, and a concise "
        "conclusion. Cite claims inline with the supplied source IDs in [^N] format. "
        "Do not add a document title, research-objective section, or references section.\n"
        f"Objective: {state.get('objective', '')}\n"
        f"Selected plan: {json.dumps(state.get('plan') or {}, ensure_ascii=False)}\n"
        f"Evidence: {json.dumps(evidence, ensure_ascii=False)}"
    )
    llm = _get_llm(ctx)
    content = _llm_content(llm.invoke(base_prompt))
    normalized = _normalize_report_analysis(content, len(evidence))
    if normalized:
        return normalized

    retry_prompt = (
        f"{base_prompt}\n\n"
        "The previous draft did not satisfy the required citation format. Rewrite it now. "
        "Every factual paragraph must contain at least one citation such as [^1], using "
        f"only IDs 1 through {len(evidence)}. Use Markdown headings beginning with ##."
    )
    return _normalize_report_analysis(
        _llm_content(llm.invoke(retry_prompt)),
        len(evidence),
    )


def make_nodes(ctx: EngineContext):
    """Return a dict of node-name -> callable for the research graph."""

    def publish_progress(event_type: str, state: ResearchState, **details: Any) -> None:
        run_id = state.get("run_id")
        metadata = {
            "thread_id": run_id,
            "run_id": run_id,
            "conversation_id": state.get("conversation_id"),
            "project_id": state.get("project_id"),
        }
        get_event_bus().publish(
            {
                "type": event_type,
                "data": {key: value for key, value in {**metadata, **details}.items() if value is not None},
            }
        )

    def plan_conversation(state: ResearchState) -> dict:
        from app.engine.persistence import persist_plan_version

        latest_user = _latest_user_message(state.get("messages", []))
        current_objective = str(state.get("objective") or "").strip()
        previous_plan = state.get("plan") or {}
        prompt = (
            "You are a research planning assistant. Clarify the objective in a planning-only "
            "chat, then return one JSON "
            "object and no prose. If important scope is missing or the user is asking for an "
            "explanation, return {\"ready\": false, \"message\": \"...\", \"objective\": \"...\"}. "
            "When the work is decision-complete, return {\"ready\": true, \"message\": \"...\", "
            "\"objective\": \"...\", \"summary\": \"...\", \"steps\": [{\"seq\": 1, "
            "\"title\": \"...\", \"description\": \"...\", \"status\": \"pending\"}]}. "
            "Ask only questions that materially change the research. A user message after a "
            "previous plan requests discussion or revision; produce a new ready plan only when "
            "their concern has been incorporated.\n"
            f"{_response_language_instruction(state)}\n"
            f"Conversation:\n{_conversation_context(state.get('messages', []))}\n"
            f"Current objective: {current_objective}\n"
            f"Previous plan: {json.dumps(previous_plan, ensure_ascii=False)}"
        )

        llm = _get_llm(ctx)
        try:
            response_text = _llm_content(llm.invoke(prompt))
            parsed = _parse_json_content(response_text)
        except Exception:
            parsed = None
            response_text = locals().get("response_text", "")

        legacy_plan = (
            isinstance(parsed, dict)
            and isinstance(parsed.get("summary"), str)
            and isinstance(parsed.get("options"), list)
        )

        if isinstance(parsed, dict) and parsed.get("ready") is False:
            message = str(parsed.get("message") or (
                "请补充研究目标的具体范围。" if _is_chinese(state)
                else "Please clarify the specific scope of the research objective."
            )).strip()
            objective = str(parsed.get("objective") or current_objective).strip()
            publish_progress("research.planning_message", state, message=message)
            return {
                "objective": objective,
                "planner_message": message,
                "plan_ready": False,
                "approved": False,
            }

        objective = (
            str(parsed.get("objective") or "").strip()
            if isinstance(parsed, dict)
            else ""
        ) or current_objective or _extract_objective(response_text, latest_user)
        if legacy_plan and not objective:
            objective = latest_user.strip()
        if not objective:
            message = response_text.strip() or (
                "请补充研究目标、范围、时间跨度或期望输出。" if _is_chinese(state)
                else "Please clarify the objective, scope, time horizon, or expected output."
            )
            publish_progress("research.planning_message", state, message=message)
            return {
                "planner_message": message,
                "plan_ready": False,
                "approved": False,
            }

        if isinstance(parsed, dict) and parsed.get("ready") is True:
            steps = parsed.get("steps")
            plan = {
                "summary": str(parsed.get("summary") or (
                    f"研究计划：{objective}" if _is_chinese(state)
                    else f"Research plan: {objective}"
                )),
                "steps": steps if isinstance(steps, list) and steps else _fallback_steps(chinese=_is_chinese(state)),
            }
            message = str(parsed.get("message") or (
                "计划已经准备完成，可以开始执行。" if _is_chinese(state)
                else "The plan is ready to execute."
            ))
        elif legacy_plan:
            plan = {
                "summary": str(parsed["summary"]),
                "steps": _fallback_steps(chinese=_is_chinese(state)),
                "options": parsed["options"],
            }
            message = "计划已经准备完成，可以开始执行。" if _is_chinese(state) else "The plan is ready to execute."
        else:
            plan = _fallback_plan(objective, chinese=_is_chinese(state))
            message = "计划已经准备完成，可以开始执行。" if _is_chinese(state) else "The plan is ready to execute."

        next_state = {
            **state,
            "objective": objective,
            "plan": plan,
            "steps": plan["steps"],
        }
        version = persist_plan_version(ctx.session, next_state)
        publish_progress(
            "research.plan_ready",
            state,
            plan_version=version,
            step_count=len(plan["steps"]),
        )
        return {
            "objective": objective,
            "plan": plan,
            "steps": plan["steps"],
            "plan_version": version,
            "plan_ready": True,
            "planner_message": message,
            "approved": False,
            "replan_feedback": None,
        }

    def persist_step_status(state: ResearchState, step: dict, status: str) -> None:
        project_id = state.get("project_id")
        step_seq = step.get("seq")
        if not isinstance(project_id, int) or not isinstance(step_seq, int):
            return
        persisted = (
            ctx.session.query(Step)
            .filter(Step.project_id == project_id, Step.seq == step_seq)
            .one_or_none()
        )
        if persisted is not None:
            persisted.status = status
            ctx.session.commit()

    # Compatibility helpers retained for callers that exercise individual v1 nodes.
    def clarify_intent(state: ResearchState) -> dict:
        if state.get("objective"):
            return {}
        user_message = _latest_user_message(state.get("messages", []))
        response_text = _llm_content(_get_llm(ctx).invoke(
            "Clarify the user's research objective.\n"
            f"Conversation:\n{_conversation_context(state.get('messages', []))}\n"
            "If clear, respond with OBJECTIVE: followed by the objective."
        ))
        objective = _extract_objective(response_text, user_message)
        return {"objective": objective} if objective else {"clarification_question": response_text.strip()}

    def generate_plan(state: ResearchState) -> dict:
        response = _parse_json_content(_llm_content(_get_llm(ctx).invoke(
            "Generate a research plan as JSON with keys summary and options.\n"
            f"Research topic: {state.get('objective', '')}"
        )))
        return {"plan": response}

    def derive_steps(state: ResearchState) -> dict:
        response = _parse_json_content(_llm_content(_get_llm(ctx).invoke(
            "Derive research steps as a JSON array with seq, title, description and status.\n"
            f"Research topic: {state.get('objective', '')}"
        )))
        return {"steps": response}

    def _planning_interrupt(state: ResearchState, *, ready: bool) -> dict:
        payload = {
            "kind": "plan_ready" if ready else "planning_input",
            "message": state.get("planner_message") or (
                (
                    "计划已经准备完成，可以开始执行。"
                    if _is_chinese(state)
                    else "The plan is ready to execute."
                )
                if ready
                else (
                    "请继续补充研究细节。"
                    if _is_chinese(state)
                    else "Please add more research details."
                )
            ),
        }
        if ready:
            payload.update({
                "plan": state.get("plan"),
                "plan_version": state.get("plan_version"),
            })
        response = interrupt(payload)
        if not isinstance(response, dict):
            raise ValueError("Expected a planning response")

        kind = response.get("kind")
        if kind == "clarification":
            kind = "planning_message"
            response = {**response, "message": response.get("answer")}
        elif kind in (None, "plan_approval"):
            if response.get("approved"):
                kind = "execute_plan"
                response = {**response, "plan_version": state.get("plan_version")}
            else:
                kind = "planning_message"
                response = {**response, "message": response.get("feedback")}

        if kind == "planning_message":
            message = str(response.get("message") or "").strip()
            if not message:
                raise ValueError("A non-empty planning message is required")
            return {
                "messages": [{"role": "user", "content": message}],
                "response_language": response.get("response_language") or state.get("response_language"),
                "planner_message": None,
                "plan_ready": False,
                "approved": False,
                "replan_feedback": message,
            }
        if kind == "execute_plan":
            requested_version = response.get("plan_version")
            if requested_version != state.get("plan_version"):
                raise ValueError("The selected plan version is no longer current")
            return {
                "approved": True,
                "response_language": response.get("response_language") or state.get("response_language"),
            }
        raise ValueError("Expected planning_message or execute_plan")

    def await_planning_input(state: ResearchState) -> dict:
        return _planning_interrupt(state, ready=False)

    def await_plan_ready(state: ResearchState) -> dict:
        return _planning_interrupt(state, ready=True)

    def execute_research(state: ResearchState) -> dict:
        from app.tools import registry

        steps = [dict(item) for item in state.get("steps", [])]
        if steps:
            steps[0]["status"] = "running"
            persist_step_status(state, steps[0], "running")
            publish_progress(
                "research.step_started",
                state,
                step_seq=steps[0].get("seq"),
                step_title=steps[0].get("title"),
            )
        max_sources = _get_max_sources(ctx)
        tool_result = _run_async(registry.get_research_tools(ctx.session))
        tools = tool_result.get("tools", [])
        tools_by_name = {_tool_name(tool): tool for tool in tools}

        llm = _get_llm(ctx)
        bound_llm = llm.bind_tools(tools) if hasattr(llm, "bind_tools") else llm
        prompt = (
            "Use the available tools to collect sources for this research task. "
            "Use search-capable tools for discovery when available, do not invent URLs, "
            "and satisfy any minimum source-count requirement stated in the objective. "
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
            publish_progress(
                "research.tool_started",
                state,
                tool_name=name,
            )
            result = _invoke_tool(tool, args)
            collected_before = len(findings)
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
                publish_progress(
                    "research.source_collected",
                    state,
                    source_count=len(findings),
                    source_title=source["title"],
                    source_url=source["url"],
                    tool_name=name,
                )
            publish_progress(
                "research.tool_completed",
                state,
                tool_name=name,
                source_count=len(findings) - collected_before,
            )

        ctx.session.commit()
        if not findings:
            raise RuntimeError(
                "No usable sources were collected. Configure a search-capable MCP server "
                "or verify that the requested public sources are reachable."
            )
        publish_progress(
            "research.sources_collected",
            state,
            source_count=len(findings),
            tool_count=len(tools_by_name),
        )
        for step in steps:
            if step.get("status") != "running":
                step["status"] = "running"
                persist_step_status(state, step, "running")
                publish_progress(
                    "research.step_started",
                    state,
                    step_seq=step.get("seq"),
                    step_title=step.get("title"),
                )
            step["status"] = "completed"
            persist_step_status(state, step, "completed")
            publish_progress(
                "research.step_completed",
                state,
                step_seq=step.get("seq"),
                step_title=step.get("title"),
            )
        return {"findings": findings, "steps": steps}

    def aggregate_evidence(state: ResearchState) -> dict:
        findings = _dedupe_findings(state.get("findings", []))
        steps = _mark_acceptance_criteria(state.get("steps", []), findings)
        return {"findings": findings, "steps": steps}

    def write_report(state: ResearchState) -> dict:
        from app.engine.persistence import persist_report, sync_plan_and_steps

        try:
            analysis_md = _synthesize_report(ctx, state)
        except Exception:
            analysis_md = None
        report_md = _build_report_markdown(state, analysis_md=analysis_md)
        sync_plan_and_steps(ctx.session, state)
        report = persist_report(ctx.session, project_id=state["project_id"], content_md=report_md)
        publish_progress("research.report_ready", state, report_id=report.id)
        return {"report_md": report_md, "report_id": report.id}

    return {
        "plan_conversation": plan_conversation,
        "await_planning_input": await_planning_input,
        "await_plan_ready": await_plan_ready,
        "clarify_intent": clarify_intent,
        "generate_plan": generate_plan,
        "derive_steps": derive_steps,
        "execute_research": execute_research,
        "aggregate_evidence": aggregate_evidence,
        "write_report": write_report,
    }
