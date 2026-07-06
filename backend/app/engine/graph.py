from langgraph.graph import END, START, StateGraph

from app.engine.context import EngineContext
from app.engine.nodes import make_nodes
from app.engine.state import ResearchState


def _route_after_clarify(state: ResearchState) -> str:
    return "generate_plan" if state.get("objective") else END


def compile_research_graph(ctx: EngineContext, *, checkpointer=None):
    nodes = make_nodes(ctx)
    builder = StateGraph(ResearchState)

    for name, fn in nodes.items():
        builder.add_node(name, fn)

    builder.add_edge(START, "clarify_intent")
    builder.add_conditional_edges("clarify_intent", _route_after_clarify, {
        "generate_plan": "generate_plan",
        END: END,
    })
    builder.add_edge("generate_plan", "await_plan_approval")
    builder.add_edge("await_plan_approval", "derive_steps")
    builder.add_edge("derive_steps", "execute_research")
    builder.add_edge("execute_research", "aggregate_evidence")
    builder.add_edge("aggregate_evidence", "write_report")
    builder.add_edge("write_report", END)

    return builder.compile(checkpointer=checkpointer, interrupt_before=[])
