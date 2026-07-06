from langgraph.types import interrupt

from app.engine.context import EngineContext
from app.engine.state import ResearchState


def make_nodes(ctx: EngineContext):
    """Return a dict of node-name -> callable for the research graph."""

    def clarify_intent(state: ResearchState) -> dict:
        if state.get("objective"):
            return {}
        return {
            "messages": [{"role": "assistant", "content": "请描述你想研究的方向。"}],
        }

    def generate_plan(state: ResearchState) -> dict:
        return {
            "plan": {
                "summary": f"研究计划：{state['objective']}",
                "options": [
                    {"id": "A", "label": "全面综述"},
                    {"id": "B", "label": "聚焦最新进展"},
                ],
            },
        }

    def await_plan_approval(state: ResearchState) -> dict:
        decision = interrupt({"plan": state.get("plan"), "message": "请确认或选择方案"})
        return {
            "approved": bool(decision.get("approved")),
            "plan": {**state.get("plan", {}), "chosen_option": decision.get("chosen_option")},
        }

    def derive_steps(state: ResearchState) -> dict:
        return {
            "steps": [
                {"seq": 1, "title": "检索资料", "status": "pending"},
                {"seq": 2, "title": "整理证据", "status": "pending"},
            ],
        }

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
