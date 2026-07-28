import pytest
import asyncio


class _FakeLLM:
    def invoke(self, prompt):
        class _R:
            pass

        r = _R()
        prompt_text = str(prompt).lower()
        if "derive research steps" in prompt_text:
            r.content = '[{"seq": 1, "title": "搜索", "description": "d", "status": "pending"}]'
        elif "generate a research plan" in prompt_text:
            r.content = (
                '{"summary": "计划摘要", "options": [{"id": "A", "label": "全面"}, '
                '{"id": "B", "label": "聚焦"}]}'
            )
        elif "clarify" in prompt_text or "objective" in prompt_text:
            r.content = "OBJECTIVE: 可再生能源趋势"
        else:
            r.content = "ok"
        return r


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_clarify_sets_objective_from_llm(session):
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _FakeLLM())
    nodes = make_nodes(ctx)
    out = nodes["clarify_intent"](
        {
            "conversation_id": 1,
            "project_id": 1,
            "messages": [{"role": "user", "content": "研究新能源"}],
            "objective": "",
            "plan": None,
            "approved": False,
            "steps": [],
            "findings": [],
            "report_md": None,
        }
    )
    assert out.get("objective") == "可再生能源趋势"


def test_generate_plan_parses_json(session):
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _FakeLLM())
    nodes = make_nodes(ctx)
    out = nodes["generate_plan"](
        {
            "conversation_id": 1,
            "project_id": 1,
            "messages": [],
            "objective": "可再生能源",
            "plan": None,
            "approved": False,
            "steps": [],
            "findings": [],
            "report_md": None,
        }
    )
    assert out["plan"]["summary"] == "计划摘要"
    assert len(out["plan"]["options"]) == 2


def test_derive_steps_parses_json(session):
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _FakeLLM())
    nodes = make_nodes(ctx)
    out = nodes["derive_steps"](
        {
            "conversation_id": 1,
            "project_id": 1,
            "messages": [],
            "objective": "可再生能源",
            "plan": {"summary": "s"},
            "approved": True,
            "steps": [],
            "findings": [],
            "report_md": None,
        }
    )
    assert out["steps"][0]["title"] == "搜索"
    assert out["steps"][0]["status"] == "pending"


def test_planning_prompt_requires_the_selected_interface_language(session):
    from app.engine.context import EngineContext
    from app.engine.nodes import make_nodes

    prompts = []

    class _LanguageLLM:
        def invoke(self, prompt):
            prompts.append(str(prompt))
            return type("_R", (), {
                "content": (
                    '{"ready": false, "message": "请说明地区范围。", '
                    '"objective": "研究市场趋势"}'
                )
            })()

    nodes = make_nodes(
        EngineContext(session=session, profile_id=1, llm_factory=lambda: _LanguageLLM())
    )
    out = nodes["plan_conversation"]({
        "run_id": "thread-language",
        "conversation_id": 1,
        "project_id": 1,
        "response_language": "zh-CN",
        "messages": [{"role": "user", "content": "研究市场趋势"}],
        "objective": "",
        "plan": None,
        "approved": False,
        "steps": [],
        "findings": [],
        "report_md": None,
    })

    assert "application language is Simplified Chinese" in prompts[0]
    assert out["planner_message"] == "请说明地区范围。"


def test_clarify_propagates_llm_configuration_errors(session):
    from app.engine.context import EngineContext
    from app.engine.nodes import make_nodes

    def missing_profile():
        raise ValueError("LLM profile 999 not found")

    nodes = make_nodes(EngineContext(session=session, profile_id=999, llm_factory=missing_profile))

    with pytest.raises(ValueError, match="profile 999"):
        nodes["clarify_intent"](
            {
                "conversation_id": 1,
                "project_id": 1,
                "messages": [{"role": "user", "content": "research a clear objective"}],
                "objective": "",
                "plan": None,
                "approved": False,
                "steps": [],
                "findings": [],
                "report_md": None,
            }
        )


def test_invoke_tool_uses_async_interface_when_available():
    from langchain_core.tools import StructuredTool

    from app.engine.nodes import _invoke_tool

    async def search(query: str):
        return [{"url": "https://example.com", "snippet": query}]

    tool = StructuredTool.from_function(
        coroutine=search,
        name="search",
        description="Search for a source.",
    )

    assert _invoke_tool(tool, {"query": "renewable energy"}) == [
        {"url": "https://example.com", "snippet": "renewable energy"}
    ]


def test_iter_source_items_keeps_fetched_page_text():
    from app.engine.nodes import _iter_source_items

    assert _iter_source_items(
        "A useful page summary.",
        tool_name="fetch_page",
        args={"url": "https://example.com"},
    ) == [
        {
            "title": "https://example.com",
            "url": "https://example.com",
            "snippet": "A useful page summary.",
            "tool_name": "fetch_page",
        }
    ]


def test_execute_research_calls_tools_respects_source_limit_and_persists_sources(
    session, monkeypatch
):
    from sqlalchemy import select

    from app.db.models import Conversation, ResearchProject, Source
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext
    from app.services.settings_service import set_preference
    from app.tools import registry

    conv = Conversation(title="c")
    session.add(conv)
    session.flush()
    project = ResearchProject(
        conversation_id=conv.id,
        topic="renewable energy",
        objective="Study renewable energy trends",
    )
    session.add(project)
    session.commit()

    set_preference(session, "max_sources", {"value": 1})

    class _FakeTool:
        name = "search_web"

        def __init__(self):
            self.calls = []

        def invoke(self, args):
            self.calls.append(args)
            return [
                {
                    "title": "First source",
                    "url": "https://example.com/1",
                    "snippet": "first snippet",
                },
                {
                    "title": "Second source",
                    "url": "https://example.com/2",
                    "snippet": "second snippet",
                },
            ]

    fake_tool = _FakeTool()

    async def fake_get_research_tools(_session):
        return {"tools": [fake_tool], "errors": []}

    monkeypatch.setattr(registry, "get_research_tools", fake_get_research_tools)

    class _ToolCallResponse:
        content = ""
        tool_calls = [
            {
                "name": "search_web",
                "args": {"query": "renewable energy market 2026"},
            }
        ]

    class _ToolCallingLLM:
        def bind_tools(self, tools):
            self.bound_tools = tools
            return self

        def invoke(self, prompt):
            self.prompt = prompt
            return _ToolCallResponse()

    llm = _ToolCallingLLM()
    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: llm)
    nodes = make_nodes(ctx)

    out = nodes["execute_research"](
        {
            "conversation_id": conv.id,
            "project_id": project.id,
            "messages": [],
            "objective": "Study renewable energy trends",
            "plan": {"summary": "plan"},
            "approved": True,
            "steps": [{"seq": 1, "title": "Search", "status": "pending"}],
            "findings": [],
            "report_md": None,
        }
    )

    assert fake_tool.calls == [{"query": "renewable energy market 2026"}]
    assert out["findings"] == [
        {
            "title": "First source",
            "url": "https://example.com/1",
            "snippet": "first snippet",
            "tool_name": "search_web",
        }
    ]
    sources = session.scalars(select(Source).order_by(Source.id)).all()
    assert len(sources) == 1
    assert sources[0].project_id == project.id
    assert sources[0].url == "https://example.com/1"
    assert sources[0].tool_name == "search_web"


def test_execute_research_can_load_tools_inside_running_event_loop(session, monkeypatch):
    from app.db.models import Conversation, ResearchProject
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext
    from app.tools import registry

    conv = Conversation(title="c")
    session.add(conv)
    session.flush()
    project = ResearchProject(
        conversation_id=conv.id,
        topic="renewable energy",
        objective="Study renewable energy trends",
    )
    session.add(project)
    session.commit()

    async def fake_get_research_tools(_session):
        return {"tools": [], "errors": []}

    monkeypatch.setattr(registry, "get_research_tools", fake_get_research_tools)

    class _NoToolCallResponse:
        content = ""
        tool_calls = []

    class _NoToolLLM:
        def bind_tools(self, tools):
            return self

        def invoke(self, prompt):
            return _NoToolCallResponse()

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _NoToolLLM())
    nodes = make_nodes(ctx)

    async def run_node():
        return nodes["execute_research"](
            {
                "conversation_id": conv.id,
                "project_id": project.id,
                "messages": [],
                "objective": "Study renewable energy trends",
                "plan": {"summary": "plan"},
                "approved": True,
                "steps": [],
                "findings": [],
                "report_md": None,
            }
        )

    with pytest.raises(RuntimeError, match="No usable sources"):
        asyncio.run(run_node())


def test_aggregate_evidence_deduplicates_findings_and_marks_criteria(session):
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _FakeLLM())
    nodes = make_nodes(ctx)

    out = nodes["aggregate_evidence"](
        {
            "conversation_id": 1,
            "project_id": 1,
            "messages": [],
            "objective": "Study renewable energy trends",
            "plan": {"summary": "plan"},
            "approved": True,
            "steps": [
                {
                    "seq": 1,
                    "title": "Search",
                    "status": "pending",
                    "acceptance_criteria": ["market data"],
                }
            ],
            "findings": [
                {
                    "title": "Market report",
                    "url": "https://example.com/report",
                    "snippet": "market data for renewable energy",
                    "tool_name": "search_web",
                },
                {
                    "title": "Duplicate report",
                    "url": "https://example.com/report",
                    "snippet": "duplicate",
                    "tool_name": "search_web",
                },
            ],
            "report_md": None,
        }
    )

    assert out["findings"] == [
        {
            "title": "Market report",
            "url": "https://example.com/report",
            "snippet": "market data for renewable energy",
            "tool_name": "search_web",
        }
    ]
    assert out["steps"][0]["acceptance_criteria"] == [
        {
            "description": "market data",
            "met": True,
            "evidence_ref": "https://example.com/report",
        }
    ]


def test_write_report_generates_cited_markdown_persists_report_and_publishes_event(session, monkeypatch):
    from sqlalchemy import select

    from app.db.models import Conversation, ResearchProject, Report
    from app.core.events import EventBus
    from app.engine import nodes as nodes_module
    from app.engine.nodes import make_nodes
    from app.engine.context import EngineContext

    conv = Conversation(title="c")
    session.add(conv)
    session.flush()
    project = ResearchProject(
        conversation_id=conv.id,
        topic="renewable energy",
        objective="Study renewable energy trends",
    )
    session.add(project)
    session.commit()

    ctx = EngineContext(session=session, profile_id=1, llm_factory=lambda: _FakeLLM())
    nodes = make_nodes(ctx)
    bus = EventBus()
    monkeypatch.setattr(nodes_module, "get_event_bus", lambda: bus)

    out = nodes["write_report"](
        {
            "conversation_id": conv.id,
            "project_id": project.id,
            "messages": [],
            "objective": "Study renewable energy trends",
            "plan": {"summary": "plan"},
            "approved": True,
            "steps": [{"seq": 1, "title": "Search", "status": "done"}],
            "findings": [
                {
                    "title": "Market report",
                    "url": "https://example.com/report",
                    "snippet": "market data for renewable energy",
                    "tool_name": "search_web",
                }
            ],
            "report_md": None,
            "report_id": None,
            "run_id": "run-1",
        }
    )

    assert out["report_md"].startswith("# 研究报告")
    assert "[^1]" in out["report_md"]
    assert "https://example.com/report" in out["report_md"]
    assert isinstance(out["report_id"], int)

    event = next(bus.subscribe(replay_limit=1))
    assert event["type"] == "research.report_ready"
    assert event["data"]["run_id"] == "run-1"
    assert event["data"]["report_id"] == out["report_id"]

    reports = session.scalars(select(Report).order_by(Report.id)).all()
    assert len(reports) == 1
    assert reports[0].project_id == project.id
    assert reports[0].content_md == out["report_md"]


def test_write_report_uses_synthesized_analysis_instead_of_dumping_snippets(session, monkeypatch):
    from app.db.models import Conversation, ResearchProject
    from app.engine.context import EngineContext
    from app.engine.nodes import make_nodes

    class _ReportLLM:
        def invoke(self, prompt):
            class _R:
                content = (
                    "## 执行摘要\n\n自研芯片短期内更可能补充而非取代通用 GPU。[^1]\n\n"
                    "## 成本与产能\n\n定制化有望改善特定负载成本，但量产爬坡仍是主要不确定性。[^1]\n\n"
                    "## 风险与展望\n\n未来十二个月应重点观察良率、软件适配和部署规模。[^1]\n\n"
                    "## 结论\n\n现有证据支持渐进替代判断，尚不足以支持全面替代。[^1]"
                )

            return _R()

    conv = Conversation(title="c")
    session.add(conv)
    session.flush()
    project = ResearchProject(conversation_id=conv.id, topic="chips", objective="分析芯片影响")
    session.add(project)
    session.commit()

    nodes = make_nodes(EngineContext(session=session, profile_id=1, llm_factory=lambda: _ReportLLM()))
    long_snippet = "不应原样出现在综合报告中的搜索摘要 " * 80
    out = nodes["write_report"](
        {
            "conversation_id": conv.id,
            "project_id": project.id,
            "messages": [],
            "objective": "分析芯片影响",
            "plan": {"summary": "情景分析", "chosen_option": "A"},
            "approved": True,
            "steps": [],
            "findings": [
                {
                    "title": "Source",
                    "url": "https://example.com/source",
                    "snippet": long_snippet,
                    "tool_name": "search_web",
                }
            ],
            "report_md": None,
            "report_id": None,
            "run_id": "run-synthesis",
        }
    )

    assert "## 执行摘要" in out["report_md"]
    assert "## 成本与产能" in out["report_md"]
    assert long_snippet not in out["report_md"]
    assert "[^1]: [Source](https://example.com/source)" in out["report_md"]


def test_normalize_report_analysis_accepts_plain_numbered_citations():
    from app.engine.nodes import _normalize_report_analysis

    draft = "## 摘要\n\n" + ("这是基于来源的综合判断，而不是原始摘要的重复。" * 8) + "[1]"

    normalized = _normalize_report_analysis(draft, source_count=2)

    assert normalized is not None
    assert "[^1]" in normalized
