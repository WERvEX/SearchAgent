from langgraph.graph import END, START, StateGraph

from app.engine.context import EngineContext
from app.engine.nodes import make_nodes
from app.engine.state import ResearchState


def _route_after_planner(state: ResearchState) -> str:
    return "await_plan_ready" if state.get("plan_ready") else "await_planning_input"


def _route_after_planning_input(state: ResearchState) -> str:
    return "execute_research" if state.get("approved") else "plan_conversation"


def compile_research_graph(ctx: EngineContext, *, checkpointer=None):
    nodes = make_nodes(ctx)
    builder = StateGraph(ResearchState)

    for name, fn in nodes.items():
        builder.add_node(name, fn)

    builder.add_edge(START, "plan_conversation")
    builder.add_conditional_edges("plan_conversation", _route_after_planner, {
        "await_plan_ready": "await_plan_ready",
        "await_planning_input": "await_planning_input",
    })
    builder.add_conditional_edges("await_planning_input", _route_after_planning_input, {
        "plan_conversation": "plan_conversation",
        "execute_research": "execute_research",
    })
    builder.add_conditional_edges("await_plan_ready", _route_after_planning_input, {
        "plan_conversation": "plan_conversation",
        "execute_research": "execute_research",
    })
    builder.add_edge("execute_research", "aggregate_evidence")
    builder.add_edge("aggregate_evidence", "write_report")
    builder.add_edge("write_report", END)

    return builder.compile(checkpointer=checkpointer, interrupt_before=[])
