# Phase 4 — LangGraph 研究引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 LangGraph 研究引擎：澄清意图 → 生成计划 → **interrupt 等待用户确认** → 生成步骤与验收标准 → 执行研究（调用 Phase 3 工具层）→ 聚合证据 → 撰写报告；支持 SQLite checkpoint 断点续跑，暴露 `start_research` / `resume_research` 入口。

**Architecture:** 新增 `backend/app/engine` 包：`state.py`（ResearchState）、`checkpointer.py`（SQLite saver）、`nodes.py`（各阶段节点，LLM/工具可注入）、`graph.py`（StateGraph 编译 + interrupt）、`runner.py`（run/resume + 业务表持久化）。节点通过构造时注入的 `EngineContext`（session、profile_id、可选 mock LLM）解耦，测试全程 monkeypatch LLM/工具，不触网。

**Tech Stack:** LangGraph 1.x（已随 langchain 安装）、`langgraph-checkpoint-sqlite`、Phase 1 DB 模型、Phase 2 `build_chat_model_from_profile`、Phase 3 `get_research_tools`。

> **环境**：conda `searchagent`；Windows 测试同前（`PYTHONIOENCODING=utf-8`、env 解释器、`--basetemp=.pytest_tmp`、必要时 `required_permissions: ["all"]`）。

> **对 spec 的细化**：设计文档 State 示意用 `str` id；本阶段与 DB 一致使用 `int`。`langgraph_checkpoints` 表由 checkpointer 库自动管理，不手写 ORM。

---

## File Structure

- Modify: `backend/pyproject.toml` — 增加 `langgraph-checkpoint-sqlite`
- Create: `backend/app/engine/__init__.py`
- Create: `backend/app/engine/state.py`
- Create: `backend/app/engine/checkpointer.py`
- Create: `backend/app/engine/context.py` — `EngineContext` 依赖容器
- Create: `backend/app/engine/nodes.py`
- Create: `backend/app/engine/graph.py`
- Create: `backend/app/engine/runner.py`
- Create: `backend/tests/test_engine_state.py`
- Create: `backend/tests/test_engine_checkpointer.py`
- Create: `backend/tests/test_engine_graph.py`
- Create: `backend/tests/test_engine_runner.py`

---

## Task 1: ResearchState + SQLite Checkpointer

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/app/engine/__init__.py`
- Create: `backend/app/engine/state.py`
- Create: `backend/app/engine/checkpointer.py`
- Create: `backend/tests/test_engine_state.py`
- Create: `backend/tests/test_engine_checkpointer.py`

- [ ] **Step 1: 在 `backend/pyproject.toml` dependencies 追加**

```toml
    "langgraph-checkpoint-sqlite>=2.0",
```

- [ ] **Step 2: 安装依赖** — `pip install -e ".[dev]"`（searchagent 环境）

- [ ] **Step 3: 写失败测试 `backend/tests/test_engine_state.py`**

```python
from app.engine.state import ResearchState


def test_research_state_typed_dict_keys():
    # Smoke: ResearchState is importable and has the expected keys.
    annotations = ResearchState.__annotations__
    expected = {
        "conversation_id", "project_id", "messages", "objective",
        "plan", "approved", "steps", "findings", "report_md",
    }
    assert expected == set(annotations.keys())
```

- [ ] **Step 4: 写失败测试 `backend/tests/test_engine_checkpointer.py`**

```python
import pytest


def test_create_checkpointer_returns_usable_saver(app_home):
    from app.engine import checkpointer

    saver = checkpointer.create_checkpointer()
    assert saver is not None
    # SqliteSaver exposes a conn attribute after construction.
    assert hasattr(saver, "conn") or hasattr(saver, "setup")
```

- [ ] **Step 5: 运行确认失败** — `pytest tests/test_engine_state.py tests/test_engine_checkpointer.py -v`

- [ ] **Step 6: 实现文件**

`backend/app/engine/__init__.py` — 空。

`backend/app/engine/state.py`:

```python
from typing import Annotated, Optional

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class ResearchState(TypedDict):
    conversation_id: int
    project_id: int
    messages: Annotated[list, add_messages]
    objective: str
    plan: Optional[dict]
    approved: bool
    steps: list[dict]
    findings: list[dict]
    report_md: Optional[str]
```

`backend/app/engine/checkpointer.py`:

```python
from langgraph.checkpoint.sqlite import SqliteSaver

from app.core.paths import get_db_path


def create_checkpointer() -> SqliteSaver:
    """Return a SQLite checkpointer backed by the app database file.

    LangGraph manages its own checkpoint tables in the same DB file.
    """
    conn_string = str(get_db_path())
    return SqliteSaver.from_conn_string(conn_string)
```

- [ ] **Step 7: 运行确认通过** — 2 passed

- [ ] **Step 8: 提交** — `feat(engine): add ResearchState and SQLite checkpointer`

---

## Task 2: Graph 骨架 + interrupt 计划确认

**Files:**
- Create: `backend/app/engine/context.py`
- Create: `backend/app/engine/nodes.py`（本任务只写 stub 节点 + `await_plan_approval` interrupt 节点）
- Create: `backend/app/engine/graph.py`
- Create: `backend/tests/test_engine_graph.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_engine_graph.py`**

```python
import pytest
from langgraph.types import Command


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_compile_graph_has_interrupt_after_plan(session):
    from app.engine.graph import compile_research_graph
    from app.engine.context import EngineContext

    ctx = EngineContext(session=session, profile_id=1)
    graph = compile_research_graph(ctx)

    assert graph is not None
    # Compiled graph should expose invoke/stream methods.
    assert hasattr(graph, "invoke")


def test_graph_pauses_at_plan_interrupt(session):
    from app.engine.graph import compile_research_graph
    from app.engine.context import EngineContext
    from app.engine import checkpointer

    ctx = EngineContext(session=session, profile_id=1)
    cp = checkpointer.create_checkpointer()
    graph = compile_research_graph(ctx, checkpointer=cp)

    config = {"configurable": {"thread_id": "test-thread-1"}}
    # Seed state that skips clarify (objective already set) and reaches plan interrupt.
    initial = {
        "conversation_id": 1,
        "project_id": 1,
        "messages": [],
        "objective": "Study renewable energy trends",
        "plan": None,
        "approved": False,
        "steps": [],
        "findings": [],
        "report_md": None,
    }

    # First invoke: should stop at interrupt with a plan stub set.
    result = graph.invoke(initial, config)
    assert result.get("plan") is not None
    assert result.get("approved") is False

    # Resume with approval.
    resumed = graph.invoke(Command(resume={"approved": True, "chosen_option": "A"}), config)
    assert resumed.get("approved") is True
```

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现 `context.py`、`nodes.py`（stub）、`graph.py`**

`backend/app/engine/context.py`:

```python
from dataclasses import dataclass
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session


@dataclass
class EngineContext:
    session: Session
    profile_id: int
    llm_factory: Optional[Callable[[], Any]] = None
```

`backend/app/engine/nodes.py`（stub 版本，Task 3 替换为真实 LLM 逻辑）:

```python
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
```

`backend/app/engine/graph.py`:

```python
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
```

> **注意**：LangGraph 1.x 的 `interrupt()` 在节点内调用时会暂停图执行；resume 用 `Command(resume=...)`。测试用 `invoke` 同步 API。

- [ ] **Step 4: 运行测试，调试 interrupt/resume 行为直至 2 passed**

- [ ] **Step 5: 提交** — `feat(engine): add research graph with plan-approval interrupt`

---

## Task 3: LLM 节点实现（clarify / plan / steps）

替换 `nodes.py` 中 `clarify_intent`、`generate_plan`、`derive_steps` 为真实 LLM 调用（通过 `ctx.llm_factory()` 获取模型，默认用 `build_chat_model_from_profile`）。输出解析用简单 JSON/markdown 启发式（不引入额外 parser 库）。

测试：monkeypatch `llm_factory` 返回假 LLM，断言 state 更新。

- [ ] 实现 + 测试 + 提交 — `feat(engine): add LLM-backed clarify, plan, and steps nodes`

（实现细节在 subagent 执行时按 TDD 展开；保持与 stub 图结构兼容。）

---

## Task 4: execute_research 节点（工具调用 + 来源上限）

- 调用 `get_research_tools(session)` 获取工具列表
- 用 `llm.bind_tools(tools)` 驱动单步研究循环（每步最多 `max_sources` 次工具调用，从 `app_preferences` 读取，默认 20）
- 将来源写入 `findings` 和 DB `sources` 表
- 测试：mock `get_research_tools` 和 LLM tool-calls

- [ ] 实现 + 测试 + 提交 — `feat(engine): add execute_research with MCP tools and source limits`

---

## Task 5: aggregate_evidence + write_report + DB 持久化

- `aggregate_evidence`：去重 findings，校验 acceptance_criteria
- `write_report`：生成带引用脚注的 Markdown，写入 `reports` 表
- 新增 `backend/app/engine/persistence.py`：把 plan/steps/sources/report 同步到业务表

- [ ] 实现 + 测试 + 提交 — `feat(engine): add evidence aggregation, report writing, and DB sync`

---

## Task 6: Runner（start / resume）+ 端到端集成测试

`backend/app/engine/runner.py`:

```python
async def start_research(session, *, conversation_id, profile_id, user_message) -> dict: ...
async def resume_research(session, *, thread_id, decision: dict) -> dict: ...
```

- 创建 `research_projects` 行，生成 `thread_id`
- 包装 `graph.invoke` / `Command(resume=...)`
- 返回 `{thread_id, state, interrupted: bool, interrupt_payload: ...}`

集成测试：完整 stub/mock 流程从 start → interrupt → resume → report_md 非空。

- [ ] 实现 + 测试 + 提交 — `feat(engine): add start/resume runner with integration test`

- [ ] 全量测试：Phase 1–3 的 49 + Phase 4 新增 ≈ 55+ passed

---

## Self-Review

- Spec 第 6 节状态机全部节点 ✅（Task 2–6）
- interrupt + Command(resume) ✅（Task 2）
- checkpoint 续跑 ✅（Task 1 + Task 6）
- 工具层集成 ✅（Task 4）
- 业务表持久化 ✅（Task 5）
- SSE/API 层 → Phase 5，本阶段不实现（YAGNI）✅

---

## Execution Handoff

分支：`phase4-langgraph-engine`，conda `searchagent`，Subagent-Driven 执行。
