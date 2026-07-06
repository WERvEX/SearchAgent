import json
import re
from typing import Any

from langgraph.types import interrupt

from app.engine.context import EngineContext
from app.engine.state import ResearchState


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
        return {"findings": [{"title": "stub finding", "url": "https://example.com"}]}

    def aggregate_evidence(state: ResearchState) -> dict:
        return {}

    def write_report(state: ResearchState) -> dict:
        return {"report_md": "# 研究报告\n\n（stub）"}

    return {
        "clarify_intent": clarify_intent,
        "generate_plan": generate_plan,
        "await_plan_approval": await_plan_approval,
        "derive_steps": derive_steps,
        "execute_research": execute_research,
        "aggregate_evidence": aggregate_evidence,
        "write_report": write_report,
    }
