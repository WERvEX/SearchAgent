import json
import re
import asyncio
import inspect
import threading
import datetime as dt
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from langgraph.types import interrupt

from app.core.events import get_event_bus
from app.db.models import AgentTask, ResearchCandidate, ResearchProject, Source, Step, TraceRun
from app.engine.context import EngineContext
from app.engine.state import ResearchState
from app.services.settings_service import get_preference
from app.services.report_markdown import normalize_report_markdown
from app.services.tracing_service import finish_span, start_span
from app.tools.gateway import execute_tool


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


def _normalize_planning_questions(value: Any) -> list[dict]:
    if not isinstance(value, list):
        return []
    questions: list[dict] = []
    for index, item in enumerate(value[:3], start=1):
        if not isinstance(item, dict):
            continue
        prompt = str(item.get("prompt") or item.get("question") or "").strip()
        raw_options = item.get("options")
        if not prompt or not isinstance(raw_options, list):
            continue
        options: list[dict] = []
        for option_index, option in enumerate(raw_options[:4], start=1):
            if isinstance(option, str):
                label = option.strip()
                description = ""
                option_id = f"o{option_index}"
            elif isinstance(option, dict):
                label = str(option.get("label") or "").strip()
                description = str(option.get("description") or "").strip()
                option_id = str(option.get("id") or f"o{option_index}").strip()
            else:
                continue
            if label and option_id:
                options.append({
                    "id": option_id,
                    "label": label,
                    **({"description": description} if description else {}),
                })
        if len(options) < 2:
            continue
        questions.append({
            "id": str(item.get("id") or f"q{index}").strip() or f"q{index}",
            "prompt": prompt,
            "options": options,
            "allow_custom": bool(item.get("allow_custom", True)),
        })
    return questions


def _is_chinese(state: ResearchState) -> bool:
    return state.get("response_language", "zh-CN") == "zh-CN"


def _response_language_instruction(state: ResearchState) -> str:
    language = "Simplified Chinese" if _is_chinese(state) else "English"
    return (
        f"The application language is {language}. Write every user-visible message, "
        f"plan summary, step title, step description, and report section in {language}."
    )


def _development_problem_prompt(state: ResearchState) -> str:
    return (
        "You are a development kickoff facilitator. Work in a planning-only conversation. "
        "Return JSON only. Ask at most three materially important single-choice questions, "
        "each with 3-4 options and allow_custom true. Cover target user, problem, constraints, "
        "non-goals, and measurable success criteria. Return {ready:false, phase:'problem_framing', "
        "problem_definition:{goal, users, context, constraints, non_goals, success_criteria, assumptions}, "
        "questions:[...]}. When the user has supplied enough detail, still return a concise problem_definition "
        "and questions only for unresolved decisions."
    )


def _development_plan_prompt(state: ResearchState) -> str:
    return (
        "You are a development kickoff planner. Return JSON only. Based on the confirmed problem definition "
        "and selected candidates, create a decision-complete implementation research plan with ready:true, "
        "summary, steps, search_tasks, verification_tasks, risks, and candidates. Each step needs seq, title, "
        "description, and status. Explain how adopted projects would be forked/pulled and used, but never ask "
        "to execute installation or code changes. "
    )


def _discover_development_candidates(objective: str) -> list[dict]:
    from app.tools.github import search_github_repositories

    try:
        return list(search_github_repositories(objective, count=6).get("candidates", []))
    except Exception:
        return []


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
    findings = state.get("verified_findings") or state.get("findings", [])
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


def _build_ai_report(state: ResearchState) -> str:
    findings = state.get("verified_findings") or state.get("findings", [])
    sources = []
    for index, item in enumerate(findings, start=1):
        sources.append({
            "id": f"s{index}",
            "title": item.get("title") or item.get("url") or f"source-{index}",
            "url": item.get("url") or "",
            "excerpt": str(item.get("snippet") or item.get("content") or "")[:600],
            "verified": bool(item.get("verified")),
        })
    payload = {
        "schema_version": "1.0",
        "workflow": state.get("workflow_mode") or "research",
        "problem": state.get("problem_definition") or {"goal": state.get("objective", "")},
        "decisions": {"candidates": state.get("candidate_decisions") or []},
        "candidates": state.get("candidates") or [],
        "plan": state.get("plan") or {"steps": state.get("steps") or []},
        "findings": [
            {"id": f"f{index}", "claim": item.get("snippet") or item.get("title"), "source_ids": [f"s{index}"], "verified": bool(item.get("verified"))}
            for index, item in enumerate(findings, start=1)
        ],
        "verification": [{"step": step.get("title"), "status": step.get("status")} for step in state.get("steps", [])],
        "next_actions": [step.get("title") for step in state.get("steps", []) if step.get("status") not in {"completed", "done"}],
        "sources": sources,
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=False)


def _normalize_report_analysis(content: str, source_count: int) -> str | None:
    content = str(content or "").strip()
    content = re.sub(r"^#\s+(?:研究报告|Research Report)\s*", "", content, flags=re.IGNORECASE)
    content = re.split(r"\n##\s*(?:参考来源|References)\b", content, maxsplit=1, flags=re.IGNORECASE)[0].strip()

    def _normalize_citation(match: re.Match[str]) -> str:
        source_id = int(match.group(1))
        return f"[^{source_id}]" if 1 <= source_id <= source_count else match.group(0)

    content = re.sub(r"(?<!\^)\[(\d+)\]", _normalize_citation, content)
    content = normalize_report_markdown(content, source_count)
    if len(content) < 100 or not re.search(r"\[\^\d+\]", content):
        return None
    if "## " not in content:
        content = f"## 综合分析\n\n{content}"
    return content


def _synthesize_report(ctx: EngineContext, state: ResearchState) -> str | None:
    findings = state.get("verified_findings") or state.get("findings", [])
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

        planner_task = None
        trace_id = state.get("trace_id")
        if isinstance(trace_id, str) and isinstance(state.get("project_id"), int) and ctx.session.get(ResearchProject, state["project_id"]) is not None and ctx.session.get(TraceRun, trace_id) is not None:
            planner_task = AgentTask(project_id=state["project_id"], trace_id=trace_id, role="planner", title="Clarify objective and build plan", status="running", input_json={"message": _latest_user_message(state.get("messages", []))})
            ctx.session.add(planner_task)
            ctx.session.commit()

        latest_user = _latest_user_message(state.get("messages", []))
        current_objective = str(state.get("objective") or "").strip()
        previous_plan = state.get("plan") or {}
        development = state.get("workflow_mode") == "development_start"
        problem = state.get("problem_definition") or {}
        candidate_selection_done = bool(state.get("candidate_selection_done"))
        if development and not problem.get("confirmed"):
            prompt = (
                f"{_development_problem_prompt(state)}\n"
                f"{_response_language_instruction(state)}\n"
                f"Conversation:\n{_conversation_context(state.get('messages', []))}\n"
                f"Current objective: {current_objective}\n"
                f"Current problem definition: {json.dumps(problem, ensure_ascii=False)}"
            )
        elif development and not candidate_selection_done:
            prompt = (
                "Return JSON only with ready:false, phase:'candidate_selection', message, and candidates. "
                "Candidates must be objects with candidate_key, source_type, title, url, description, license, "
                "version_or_branch, activity, and evidence_refs.\n"
                f"{_response_language_instruction(state)}\n"
                f"Objective: {current_objective}\n"
                f"Problem definition: {json.dumps(problem, ensure_ascii=False)}"
            )
        elif development:
            prompt = (
                f"{_development_plan_prompt(state)}\n"
                f"{_response_language_instruction(state)}\n"
                f"Objective: {current_objective}\n"
                f"Problem definition: {json.dumps(problem, ensure_ascii=False)}\n"
                f"Candidate decisions: {json.dumps(state.get('candidate_decisions', []), ensure_ascii=False)}\n"
                f"Candidates: {json.dumps(state.get('candidates', []), ensure_ascii=False)}\n"
                f"Previous plan: {json.dumps(previous_plan, ensure_ascii=False)}"
            )
        else:
            prompt = (
                "You are a research planning assistant. Clarify the objective in a planning-only "
                "chat, then return one JSON "
                "object and no prose. If important scope is missing or the user is asking for an "
                "explanation, return {\"ready\": false, \"message\": \"...\", \"objective\": \"...\", "
                "\"questions\": [{\"id\": \"q1\", \"prompt\": \"...\", \"options\": "
                "[{\"id\": \"o1\", \"label\": \"...\", \"description\": \"...\"}, "
                "{\"id\": \"o2\", \"label\": \"...\"}], \"allow_custom\": true}]}. "
                "Return between one and three single-choice questions when useful, with two to four "
                "meaningfully different options per question. "
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

        if development and not candidate_selection_done and problem.get("confirmed"):
            candidates = parsed.get("candidates") if isinstance(parsed, dict) and isinstance(parsed.get("candidates"), list) else []
            if not candidates:
                candidates = _discover_development_candidates(current_objective or latest_user)
            normalized = [item for item in candidates if isinstance(item, dict) and item.get("url")][:12]
            for item in normalized:
                existing = ctx.session.query(ResearchCandidate).filter_by(
                    project_id=state.get("project_id"), candidate_key=str(item.get("candidate_key") or item.get("url"))
                ).one_or_none()
                if existing is None and isinstance(state.get("project_id"), int):
                    ctx.session.add(ResearchCandidate(
                        project_id=state["project_id"], candidate_key=str(item.get("candidate_key") or item.get("url")),
                        source_type=str(item.get("source_type") or "web"), title=str(item.get("title") or item.get("url")),
                        url=str(item["url"]), description=item.get("description"), license=item.get("license"),
                        version_or_branch=item.get("version_or_branch"), activity=json.dumps(item.get("activity"), ensure_ascii=False) if isinstance(item.get("activity"), dict) else item.get("activity"),
                        evidence_json={"refs": item.get("evidence_refs") or []},
                    ))
            ctx.session.commit()
            return {"candidates": normalized, "development_phase": "candidate_selection", "planner_message": str((parsed.get("message") if isinstance(parsed, dict) else "") or "请选择候选项目的参考或采用方式。"), "planner_questions": [], "plan_ready": False, "candidate_selection_done": False}

        if development and not problem.get("confirmed"):
            problem_definition = dict(parsed.get("problem_definition") or problem) if isinstance(parsed, dict) else dict(problem)
            problem_definition.setdefault("goal", current_objective or latest_user)
            return {
                "objective": current_objective or latest_user,
                "problem_definition": problem_definition,
                "planner_message": str((parsed.get("message") if isinstance(parsed, dict) else "") or "请继续梳理问题定义。"),
                "planner_questions": _normalize_planning_questions(parsed.get("questions") if isinstance(parsed, dict) else []),
                "development_phase": "problem_framing",
                "plan_ready": False,
                "approved": False,
            }
        if development and isinstance(parsed, dict) and parsed.get("problem_definition"):
            problem_definition = dict(parsed.get("problem_definition"))
            problem_definition.setdefault("goal", current_objective or latest_user)
        else:
            problem_definition = problem

        if isinstance(parsed, dict) and parsed.get("ready") is False:
            message = str(parsed.get("message") or (
                "请补充研究目标的具体范围。" if _is_chinese(state)
                else "Please clarify the specific scope of the research objective."
            )).strip()
            objective = str(parsed.get("objective") or current_objective).strip()
            questions = _normalize_planning_questions(parsed.get("questions"))
            publish_progress("research.planning_message", state, message=message)
            if planner_task is not None:
                planner_task.status = "completed"
                planner_task.completed_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
                planner_task.output_json = {"ready": False, "question_count": len(questions)}
                ctx.session.commit()
            result = {
                "objective": objective,
                "planner_message": message,
                "planner_questions": questions,
                "plan_ready": False,
                "approved": False,
            }
            if development:
                result.update({"problem_definition": problem_definition, "development_phase": "problem_framing"})
            return result

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
            if planner_task is not None:
                planner_task.status = "completed"
                planner_task.completed_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
                planner_task.output_json = {"ready": False, "question_count": 0}
                ctx.session.commit()
            return {
                "planner_message": message,
                "planner_questions": [],
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
            for key in ("search_tasks", "verification_tasks", "risks", "candidates"):
                if isinstance(parsed.get(key), list):
                    plan[key] = parsed[key]
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
        if development:
            next_state.update({"problem_definition": {**problem_definition, "confirmed": True}, "development_phase": "plan_ready"})
        version = persist_plan_version(ctx.session, next_state)
        publish_progress(
            "research.plan_ready",
            state,
            plan_version=version,
            step_count=len(plan["steps"]),
        )
        if planner_task is not None:
            planner_task.status = "completed"
            planner_task.completed_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
            planner_task.output_json = {"ready": True, "step_count": len(plan["steps"]), "plan_version": version}
            ctx.session.commit()
        return {
            "objective": objective,
            "plan": plan,
            "steps": plan["steps"],
            "plan_version": version,
            "plan_ready": True,
            "planner_message": message,
            "planner_questions": [],
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
        development = state.get("workflow_mode") == "development_start"
        phase = state.get("development_phase") or ("plan_ready" if ready else "problem_framing")
        payload = {
            "kind": "plan_ready" if ready else ("candidate_selection" if phase == "candidate_selection" else "problem_framing" if development else "planning_input"),
            "phase": phase,
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
        if not ready and state.get("planner_questions"):
            payload["questions"] = state["planner_questions"]
        if development:
            payload["problem_definition"] = state.get("problem_definition") or {}
            payload["candidates"] = state.get("candidates") or []
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

        if kind == "candidate_selection":
            selections = response.get("selections") or []
            if not isinstance(selections, list):
                raise ValueError("Expected candidate selections")
            decisions = [item for item in selections if isinstance(item, dict) and item.get("candidate_key") and item.get("decision") in {"reference", "adopt"}]
            for item in decisions:
                candidate = ctx.session.query(ResearchCandidate).filter_by(project_id=state.get("project_id"), candidate_key=str(item["candidate_key"])).one_or_none()
                if candidate is not None:
                    candidate.decision = str(item["decision"])
            ctx.session.commit()
            return {"candidate_decisions": decisions, "candidate_selection_done": True, "development_phase": "plan_generation", "messages": [{"role": "user", "content": json.dumps(decisions, ensure_ascii=False)}]}
        if kind == "problem_confirm":
            if not response.get("confirmed"):
                return {"messages": [{"role": "user", "content": str(response.get("feedback") or "请继续补充问题定义。") }], "planner_message": None}
            problem = dict(state.get("problem_definition") or {})
            problem["confirmed"] = True
            return {"problem_definition": problem, "development_phase": "candidate_selection", "messages": [{"role": "user", "content": "问题定义已确认。"}]}
        if kind in {"problem_answers", "planning_answers"}:
            message = str(response.get("message") or "").strip()
            if not message:
                raise ValueError("A summarized planning answer is required")
            kind = "planning_message"
        if kind == "planning_message":
            message = str(response.get("message") or "").strip()
            if not message:
                raise ValueError("A non-empty planning message is required")
            return {
                "messages": [{"role": "user", "content": message}],
                "response_language": response.get("response_language") or state.get("response_language"),
                "planner_message": None,
                "planner_questions": [],
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
                "output_modes": list(dict.fromkeys(response.get("output_modes") or state.get("output_modes") or ["human"])),
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
        trace_id = state.get("trace_id")
        agent_tasks: list[dict] = []
        if not isinstance(trace_id, str) or ctx.session.get(TraceRun, trace_id) is None:
            trace_id = None
        if trace_id:
            for index, step in enumerate(steps[:3], start=1):
                task = AgentTask(project_id=state["project_id"], trace_id=trace_id, role="retriever", title=str(step.get("title") or f"Retrieval task {index}"), status="running", input_json={"step": step})
                ctx.session.add(task)
                ctx.session.flush()
                agent_tasks.append({"id": task.id, "role": task.role, "title": task.title, "status": task.status})
            ctx.session.commit()
        coordinator_span = start_span(ctx.session, trace_id, "agent:coordinator", kind="agent", attributes={"role": "coordinator", "parallel_limit": 3}, input_value=state.get("objective")) if trace_id else None
        tool_result = _run_async(
            registry.get_research_tools(ctx.session, include_development=True)
            if state.get("workflow_mode") == "development_start"
            else registry.get_research_tools(ctx.session)
        )
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
        tool_calls = []
        for call in _response_tool_calls(response)[:3]:
            name = _tool_call_name(call)
            tool = tools_by_name.get(name)
            if tool is not None:
                tool_calls.append((name, tool, _tool_call_args(call)))

        parallel_results = None
        if trace_id and len(tool_calls) > 1:
            # Interrupts stay on the graph thread; once every call is allowed, actual I/O runs in up to three workers.
            from app.db import session as db_session
            from app.tools.policy import decide
            for name, tool, args in tool_calls:
                decision = decide(ctx.session, project_id=state["project_id"], trace_id=trace_id, agent_role="retriever", tool_name=name, args=args)
                if decision.action != "allow":
                    execute_tool(ctx.session, project_id=state["project_id"], trace_id=trace_id, agent_role="retriever", tool_name=name, args=args, tool=tool, invoke=_invoke_tool, publish=lambda event_type, **details: publish_progress(event_type, state, **details))
            def _parallel_call(item):
                name, tool, args = item
                with db_session.SessionLocal() as worker_session:
                    return execute_tool(worker_session, project_id=state["project_id"], trace_id=trace_id, agent_role="retriever", tool_name=name, args=args, tool=tool, invoke=_invoke_tool, publish=lambda event_type, **details: publish_progress(event_type, state, **details))
            with ThreadPoolExecutor(max_workers=min(3, len(tool_calls))) as executor:
                parallel_results = list(executor.map(_parallel_call, tool_calls))

        for index, (name, tool, args) in enumerate(tool_calls):
            if len(findings) >= max_sources:
                break
            task_id = agent_tasks[0]["id"] if agent_tasks else None
            publish_progress("research.tool_started", state, tool_name=name, agent_role="retriever")
            result = parallel_results[index] if parallel_results is not None else (
                execute_tool(ctx.session, project_id=state["project_id"], trace_id=trace_id, agent_role="retriever", tool_name=name, args=args, tool=tool, invoke=_invoke_tool, publish=lambda event_type, **details: publish_progress(event_type, state, **details))
                if trace_id else _invoke_tool(tool, args)
            )
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
                agent_role="retriever",
                source_count=len(findings) - collected_before,
            )

        ctx.session.commit()
        if not findings:
            if coordinator_span:
                finish_span(ctx.session, coordinator_span, status="error", error="No usable sources")
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
        for task in ctx.session.query(AgentTask).filter(AgentTask.project_id == state["project_id"], AgentTask.trace_id == trace_id).all():
            task.status = "completed"
            task.completed_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
            task.output_json = {"source_count": len(findings)}
        ctx.session.commit()
        if coordinator_span:
            finish_span(ctx.session, coordinator_span, output_value={"source_count": len(findings)})
        return {"findings": findings, "steps": steps}

    def aggregate_evidence(state: ResearchState) -> dict:
        findings = _dedupe_findings(state.get("findings", []))
        trace_id = state.get("trace_id")
        verifier_span = start_span(ctx.session, trace_id, "agent:verifier", kind="agent", attributes={"role": "verifier"}, input_value={"finding_count": len(findings)}) if isinstance(trace_id, str) and ctx.session.get(TraceRun, trace_id) is not None else None
        verified = []
        for finding in findings:
            if finding.get("url"):
                verified.append({**finding, "verified": True})
        steps = _mark_acceptance_criteria(state.get("steps", []), verified)
        if verifier_span:
            finish_span(ctx.session, verifier_span, output_value={"verified_count": len(verified)})
        return {"findings": findings, "verified_findings": verified, "steps": steps}

    def write_report(state: ResearchState) -> dict:
        from app.engine.persistence import persist_report, sync_plan_and_steps

        writer_task = None
        trace_id = state.get("trace_id")
        if isinstance(trace_id, str) and isinstance(state.get("project_id"), int) and ctx.session.get(ResearchProject, state["project_id"]) is not None and ctx.session.get(TraceRun, trace_id) is not None:
            writer_task = AgentTask(project_id=state["project_id"], trace_id=trace_id, role="writer", title="Synthesize verified evidence", status="running", input_json={"verified_count": len(state.get("verified_findings") or state.get("findings", []))})
            ctx.session.add(writer_task)
            ctx.session.commit()

        try:
            analysis_md = _synthesize_report(ctx, state)
        except Exception:
            analysis_md = None
        report_md = _build_report_markdown(state, analysis_md=analysis_md)
        sync_plan_and_steps(ctx.session, state)
        report = persist_report(ctx.session, project_id=state["project_id"], content_md=report_md, content_text=report_md, format="md")
        ai_report_id = None
        if "ai" in (state.get("output_modes") or []):
            ai_content = _build_ai_report(state)
            ai_report = persist_report(ctx.session, project_id=state["project_id"], content_text=ai_content, format="json")
            ai_report_id = ai_report.id
        if writer_task is not None:
            writer_task.status = "completed"
            writer_task.completed_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
            writer_task.output_json = {"report_id": report.id, "ai_report_id": ai_report_id, "citation_count": report_md.count("[^")}
            ctx.session.commit()
        publish_progress("research.report_ready", state, report_id=report.id)
        return {"report_md": report_md, "report_id": report.id, "ai_report_id": ai_report_id}

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
