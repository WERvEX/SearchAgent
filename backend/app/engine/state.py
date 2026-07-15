from typing import Annotated, Optional

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class ResearchState(TypedDict):
    run_id: Optional[str]
    conversation_id: int
    project_id: int
    messages: Annotated[list, add_messages]
    objective: str
    plan: Optional[dict]
    approved: bool
    steps: list[dict]
    findings: list[dict]
    report_md: Optional[str]
    report_id: Optional[int]
