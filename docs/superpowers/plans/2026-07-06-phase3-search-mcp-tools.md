# Phase 3 — 搜索/MCP 工具层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可插拔的搜索/工具层：把用户配置的 MCP 服务器（默认预置博查 Bocha）通过 `langchain-mcp-adapters` 转换为 LangChain 工具，并提供一个内置的网页正文抓取兜底工具；对外暴露一个统一的"获取本次研究可用工具列表"入口，供 Phase 4 的 LangGraph 引擎消费。

**Architecture:** 新增 `backend/app/tools` 包，三个单元：`mcp_client.py`（MCP 连接配置构建 + 默认博查注册 + 逐服务器容错加载工具）、`fetch.py`（HTTP 抓取 + 正文提取兜底工具，httpx 依赖注入以便测试）、`registry.py`（聚合入口：兜底抓取工具 + 已加载的 MCP 工具，永远保证至少有一个可用工具）。全部单元测试通过 monkeypatch / 依赖注入避免真实网络与真实 MCP 子进程。

**Tech Stack:** `langchain-mcp-adapters`（MCP → LangChain 工具桥接）、`httpx`（HTTP 客户端，含 `MockTransport` 测试）、`langchain-core`（`@tool` 装饰器）；沿用 Phase 1 的 `settings_service`（MCP 服务器 CRUD + 密钥解密）。

> **依赖 Phase 1/2**：`app.services.settings_service`（`list_mcp_servers` / `get_mcp_server_env` / `create_mcp_server`）、`app.db.session`（测试用 `init_db("sqlite:///:memory:")` + `app_home` fixture）。不依赖 Phase 2。

> **环境**：conda 环境 `searchagent`。Windows 运行测试的技巧与 Phase 1/2 相同：
> `cd backend` → `set PYTHONIOENCODING=utf-8` → `C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest <file> -v --basetemp=.pytest_tmp` → 测试后删除 `.pytest_tmp`（勿提交）。若前台命令因沙箱报错挂起，用 `required_permissions: ["all"]` 重跑。PowerShell 用 `;` 连接命令。异步测试用 `asyncio.run(...)` 包裹，不引入 `pytest-asyncio` 新依赖（YAGNI）。

> **已知局限（本阶段测试无法覆盖，留待后续人工验证）**：MCP 的 `transport` 别名映射（配置里的 `"http"` 归一化为 `langchain-mcp-adapters` 期望的 `"streamable_http"`）在单元测试中被 mock 掉，未针对真实远程 MCP 服务器验证；建议在接入首个真实 HTTP/SSE 类 MCP 服务器时手动核实一次。`MultiServerMCPClient` 默认是无状态的（每次工具调用新建 session），这对搜索/抓取类工具足够，但不适合需要保持会话状态的 MCP 工具（如浏览器自动化）——本阶段不实现有状态会话（YAGNI），后续如需再加。

---

## File Structure（本阶段涉及文件）

- Modify: `backend/pyproject.toml` — 增加 `langchain-mcp-adapters`、`httpx` 依赖
- Create: `backend/app/tools/__init__.py`
- Create: `backend/app/tools/mcp_client.py` — 连接配置构建 + 默认博查注册 + 容错加载
- Create: `backend/app/tools/fetch.py` — 正文抓取兜底 + `fetch_page` 工具
- Create: `backend/app/tools/registry.py` — 工具聚合入口
- Create: `backend/tests/test_mcp_client.py`
- Create: `backend/tests/test_fetch.py`
- Create: `backend/tests/test_tool_registry.py`

---

## Task 1: MCP 连接配置构建 + 默认博查注册

**Files:**
- Create: `backend/app/tools/__init__.py`
- Create: `backend/app/tools/mcp_client.py`（本任务只写 `build_mcp_connections` 与 `ensure_default_bocha_server`；`load_mcp_tools` 在 Task 2 追加到同一文件）
- Create: `backend/tests/test_mcp_client.py`（本任务只写连接构建与默认注册的测试；Task 2 会向同一文件追加 `load_mcp_tools` 的测试）

- [ ] **Step 1: 写失败测试 `backend/tests/test_mcp_client.py`**

```python
import pytest


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_build_mcp_connections_only_includes_enabled(session):
    from app.tools import mcp_client
    from app.services import settings_service as svc

    svc.create_mcp_server(
        session, name="enabled-one", transport="stdio",
        command="npx", args=["-y", "some-mcp"], env={"KEY": "v1"},
        enabled=True,
    )
    svc.create_mcp_server(
        session, name="disabled-one", transport="stdio",
        command="npx", args=["-y", "other-mcp"], enabled=False,
    )

    connections = mcp_client.build_mcp_connections(session)

    assert list(connections.keys()) == ["enabled-one"]
    assert connections["enabled-one"] == {
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "some-mcp"],
        "env": {"KEY": "v1"},
    }


def test_build_mcp_connections_decrypts_env(session):
    from app.tools import mcp_client
    from app.services import settings_service as svc

    svc.create_mcp_server(
        session, name="secret-server", transport="stdio",
        command="python", args=["server.py"],
        env={"API_TOKEN": "plaintext-token-123"},
    )

    connections = mcp_client.build_mcp_connections(session)

    # Must be the real decrypted value, not the masked list_mcp_servers() form.
    assert connections["secret-server"]["env"] == {"API_TOKEN": "plaintext-token-123"}


def test_build_mcp_connections_normalizes_http_transport(session):
    from app.tools import mcp_client
    from app.services import settings_service as svc

    svc.create_mcp_server(
        session, name="remote", transport="http",
        url="https://example.com/mcp",
    )

    connections = mcp_client.build_mcp_connections(session)

    assert connections["remote"] == {
        "transport": "streamable_http",
        "url": "https://example.com/mcp",
    }


def test_build_mcp_connections_empty_when_no_servers(session):
    from app.tools import mcp_client

    assert mcp_client.build_mcp_connections(session) == {}


def test_ensure_default_bocha_server_creates_once(session):
    from app.tools import mcp_client
    from app.services import settings_service as svc

    mcp_client.ensure_default_bocha_server(session, "sk-test-key")
    mcp_client.ensure_default_bocha_server(session, "sk-test-key")  # idempotent

    servers = [s for s in svc.list_mcp_servers(session) if s["name"] == "bocha"]
    assert len(servers) == 1

    server = servers[0]
    assert server["transport"] == "stdio"
    assert server["command"] == "npx"
    assert server["args"] == ["-y", "@humansean/mcp-bocha"]
    assert server["enabled"] is True

    env = svc.get_mcp_server_env(session, server["id"])
    assert env == {"BOCHA_API_KEY": "sk-test-key"}


def test_ensure_default_bocha_server_does_not_overwrite_existing(session):
    from app.tools import mcp_client
    from app.services import settings_service as svc

    svc.create_mcp_server(
        session, name="bocha", transport="stdio",
        command="custom-command", args=["--custom"],
        env={"BOCHA_API_KEY": "user-configured-key"},
    )

    mcp_client.ensure_default_bocha_server(session, "sk-should-not-be-used")

    servers = [s for s in svc.list_mcp_servers(session) if s["name"] == "bocha"]
    assert len(servers) == 1
    assert servers[0]["command"] == "custom-command"
```

- [ ] **Step 2: 运行确认失败**

Run: `pytest tests/test_mcp_client.py -v`（env 解释器）
Expected: FAIL —— `ModuleNotFoundError: No module named 'app.tools'`。

- [ ] **Step 3: 创建 `backend/app/tools/__init__.py`（空）与 `backend/app/tools/mcp_client.py`**

`backend/app/tools/__init__.py`:

```python
```

`backend/app/tools/mcp_client.py`:

```python
from sqlalchemy.orm import Session

from app.services import settings_service as svc

# langchain-mcp-adapters expects "streamable_http" as the transport literal
# for remote HTTP servers; accept the shorter "http" as a user-facing alias.
_TRANSPORT_ALIASES = {"http": "streamable_http"}

BOCHA_SERVER_NAME = "bocha"
BOCHA_NPM_PACKAGE = "@humansean/mcp-bocha"


def _normalize_transport(transport: str) -> str:
    return _TRANSPORT_ALIASES.get(transport, transport)


def build_mcp_connections(session: Session) -> dict[str, dict]:
    """Build langchain-mcp-adapters connection configs for enabled MCP servers.

    Only enabled servers are included. Secrets are decrypted here (not the
    masked form returned by settings_service.list_mcp_servers).
    """
    connections: dict[str, dict] = {}
    for server in svc.list_mcp_servers(session):
        if not server["enabled"]:
            continue

        transport = _normalize_transport(server["transport"])
        if transport == "stdio":
            connections[server["name"]] = {
                "transport": "stdio",
                "command": server["command"],
                "args": server["args"] or [],
                "env": svc.get_mcp_server_env(session, server["id"]),
            }
        else:
            connections[server["name"]] = {
                "transport": transport,
                "url": server["url"],
            }
    return connections


def ensure_default_bocha_server(session: Session, api_key: str) -> None:
    """Register the default Bocha MCP server if it isn't configured yet.

    Idempotent and non-destructive: if a "bocha" server already exists
    (e.g. the user customized it), it is left untouched.
    """
    existing_names = {s["name"] for s in svc.list_mcp_servers(session)}
    if BOCHA_SERVER_NAME in existing_names:
        return

    svc.create_mcp_server(
        session,
        name=BOCHA_SERVER_NAME,
        transport="stdio",
        command="npx",
        args=["-y", BOCHA_NPM_PACKAGE],
        env={"BOCHA_API_KEY": api_key},
    )
```

- [ ] **Step 4: 运行确认通过**

Run: `pytest tests/test_mcp_client.py -v`
Expected: 6 passed。

- [ ] **Step 5: 提交**

```bash
git add backend/app/tools/__init__.py backend/app/tools/mcp_client.py backend/tests/test_mcp_client.py
git commit -m "feat(tools): add MCP connection builder and default Bocha registration"
```

---

## Task 2: MCP 工具容错加载（追加到 mcp_client.py）

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/tools/mcp_client.py`（追加 `load_mcp_tools`）
- Modify: `backend/tests/test_mcp_client.py`（追加测试）

- [ ] **Step 1: 修改 `backend/pyproject.toml`，在 `dependencies` 追加一项**

把 Phase 2 之后的 dependencies：

```toml
dependencies = [
    "sqlalchemy>=2.0,<3.0",
    "pydantic>=2.6,<3.0",
    "cryptography>=42.0",
    "python-dotenv>=1.0",
    "langchain>=0.3",
    "langchain-openai>=0.2",
    "langchain-anthropic>=0.2",
]
```

改为（追加 `langchain-mcp-adapters`）：

```toml
dependencies = [
    "sqlalchemy>=2.0,<3.0",
    "pydantic>=2.6,<3.0",
    "cryptography>=42.0",
    "python-dotenv>=1.0",
    "langchain>=0.3",
    "langchain-openai>=0.2",
    "langchain-anthropic>=0.2",
    "langchain-mcp-adapters>=0.1",
]
```

- [ ] **Step 2: 安装新依赖**

Run（searchagent 环境）: `cd backend && pip install -e ".[dev]"`
Expected: `langchain-mcp-adapters` 及其依赖（含 `mcp` SDK）安装成功。

- [ ] **Step 3: 在 `backend/tests/test_mcp_client.py` 末尾追加失败测试**

```python
import asyncio


def test_load_mcp_tools_aggregates_across_servers(session, monkeypatch):
    from app.services import settings_service as svc
    from app.tools import mcp_client

    svc.create_mcp_server(
        session, name="server-a", transport="stdio",
        command="cmd-a", args=[],
    )
    svc.create_mcp_server(
        session, name="server-b", transport="stdio",
        command="cmd-b", args=[],
    )

    class FakeClient:
        def __init__(self, connections):
            assert len(connections) == 1
            self._server_name = next(iter(connections))

        async def get_tools(self):
            return [f"TOOL_FROM_{self._server_name}"]

    monkeypatch.setattr(mcp_client, "MultiServerMCPClient", FakeClient)

    tools, errors = asyncio.run(mcp_client.load_mcp_tools(session))

    assert sorted(tools) == ["TOOL_FROM_server-a", "TOOL_FROM_server-b"]
    assert errors == []


def test_load_mcp_tools_isolates_failing_server(session, monkeypatch):
    from app.services import settings_service as svc
    from app.tools import mcp_client

    svc.create_mcp_server(
        session, name="good-server", transport="stdio",
        command="cmd-good", args=[],
    )
    svc.create_mcp_server(
        session, name="bad-server", transport="stdio",
        command="cmd-bad", args=[],
    )

    class FakeClient:
        def __init__(self, connections):
            self._server_name = next(iter(connections))

        async def get_tools(self):
            if self._server_name == "bad-server":
                raise RuntimeError("connection refused")
            return ["GOOD_TOOL"]

    monkeypatch.setattr(mcp_client, "MultiServerMCPClient", FakeClient)

    tools, errors = asyncio.run(mcp_client.load_mcp_tools(session))

    assert tools == ["GOOD_TOOL"]
    assert errors == [{"server": "bad-server", "error": "connection refused"}]


def test_load_mcp_tools_no_servers_returns_empty(session):
    from app.tools import mcp_client

    tools, errors = asyncio.run(mcp_client.load_mcp_tools(session))

    assert tools == []
    assert errors == []
```

- [ ] **Step 4: 运行确认新测试失败**

Run: `pytest tests/test_mcp_client.py -v`
Expected: 前 6 个（Task 1 的）继续通过，新增 3 个 FAIL —— `AttributeError: module 'app.tools.mcp_client' has no attribute 'load_mcp_tools'`（或 `MultiServerMCPClient` 未定义）。

- [ ] **Step 5: 在 `backend/app/tools/mcp_client.py` 顶部追加导入，并在文件末尾追加函数**

在文件顶部 `from app.services import settings_service as svc` 之后追加：

```python
from langchain_mcp_adapters.client import MultiServerMCPClient
```

在文件末尾追加：

```python
async def load_mcp_tools(session: Session) -> tuple[list, list[dict]]:
    """Load LangChain tools from every enabled MCP server.

    Each server gets its own MultiServerMCPClient so one unreachable or
    misconfigured server does not prevent tools from the others from
    loading. Failures are collected (not raised) so callers can surface
    them to the user while still using whatever tools did load.
    """
    tools: list = []
    errors: list[dict] = []

    for name, connection in build_mcp_connections(session).items():
        try:
            client = MultiServerMCPClient({name: connection})
            server_tools = await client.get_tools()
            tools.extend(server_tools)
        except Exception as exc:  # noqa: BLE001 - isolate per-server failures
            errors.append({"server": name, "error": str(exc)})

    return tools, errors
```

- [ ] **Step 6: 运行确认全部通过**

Run: `pytest tests/test_mcp_client.py -v`
Expected: 9 passed。

- [ ] **Step 7: 提交**

```bash
git add backend/pyproject.toml backend/app/tools/mcp_client.py backend/tests/test_mcp_client.py
git commit -m "feat(tools): add per-server fault-tolerant MCP tool loading"
```

---

## Task 3: 网页正文抓取兜底工具（fetch.py）

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/app/tools/fetch.py`
- Create: `backend/tests/test_fetch.py`

- [ ] **Step 1: 修改 `backend/pyproject.toml`，追加 `httpx` 依赖**

把 dependencies 追加一行 `"httpx>=0.27",`（放在 `langchain-mcp-adapters` 之后）：

```toml
dependencies = [
    "sqlalchemy>=2.0,<3.0",
    "pydantic>=2.6,<3.0",
    "cryptography>=42.0",
    "python-dotenv>=1.0",
    "langchain>=0.3",
    "langchain-openai>=0.2",
    "langchain-anthropic>=0.2",
    "langchain-mcp-adapters>=0.1",
    "httpx>=0.27",
]
```

Run: `cd backend && pip install -e ".[dev]"`（`httpx` 大概率已作为其他包的传递依赖安装，这一步用于显式声明并确保版本满足）。

- [ ] **Step 2: 写失败测试 `backend/tests/test_fetch.py`**

```python
import httpx


def _client_with_handler(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_fetch_url_extracts_visible_text():
    from app.tools import fetch

    html = (
        "<html><head><style>body{color:red}</style>"
        "<script>var x=1;</script></head>"
        "<body><h1>Hello World</h1><p>This is a test page.</p></body></html>"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=html)

    result = fetch.fetch_url("https://example.com", client=_client_with_handler(handler))

    assert "Hello World" in result
    assert "This is a test page." in result
    assert "color:red" not in result
    assert "var x=1" not in result


def test_fetch_url_truncates_to_max_chars():
    from app.tools import fetch

    html = f"<html><body>{'A' * 100}</body></html>"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=html)

    result = fetch.fetch_url(
        "https://example.com", max_chars=10, client=_client_with_handler(handler)
    )

    assert result == "A" * 10


def test_fetch_url_returns_error_string_on_http_error():
    from app.tools import fetch

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Server Error")

    result = fetch.fetch_url("https://example.com/broken", client=_client_with_handler(handler))

    assert result.startswith("Error fetching https://example.com/broken:")


def test_fetch_url_returns_error_string_on_connection_error():
    from app.tools import fetch

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    result = fetch.fetch_url("https://unreachable.example", client=_client_with_handler(handler))

    assert result.startswith("Error fetching https://unreachable.example:")


def test_fetch_page_tool_delegates_to_fetch_url(monkeypatch):
    from app.tools import fetch

    captured = {}

    def fake_fetch_url(url, **kwargs):
        captured["url"] = url
        return "FAKE_PAGE_TEXT"

    monkeypatch.setattr(fetch, "fetch_url", fake_fetch_url)

    result = fetch.fetch_page.invoke("https://example.com/page")

    assert result == "FAKE_PAGE_TEXT"
    assert captured["url"] == "https://example.com/page"
```

- [ ] **Step 3: 运行确认失败**

Run: `pytest tests/test_fetch.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'app.tools.fetch'`。

- [ ] **Step 4: 创建 `backend/app/tools/fetch.py`**

```python
import re
from typing import Optional

import httpx
from langchain_core.tools import tool

DEFAULT_MAX_CHARS = 20000
DEFAULT_TIMEOUT = 10.0

_SCRIPT_STYLE_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


def _extract_text(html: str) -> str:
    without_scripts = _SCRIPT_STYLE_RE.sub(" ", html)
    without_tags = _TAG_RE.sub(" ", without_scripts)
    return _WHITESPACE_RE.sub(" ", without_tags).strip()


def fetch_url(
    url: str,
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    client: Optional[httpx.Client] = None,
) -> str:
    """Fetch a URL and return its extracted plain-text content.

    Never raises: network/HTTP errors are returned as an
    "Error fetching <url>: <reason>" string instead, so this is safe to
    expose directly as an agent tool.
    """
    owns_client = client is None
    http_client = client or httpx.Client(timeout=DEFAULT_TIMEOUT, follow_redirects=True)
    try:
        response = http_client.get(url)
        response.raise_for_status()
        text = _extract_text(response.text)
        return text[:max_chars]
    except Exception as exc:  # noqa: BLE001 - surface any fetch error to the caller
        return f"Error fetching {url}: {exc}"
    finally:
        if owns_client:
            http_client.close()


@tool
def fetch_page(url: str) -> str:
    """Fetch a web page by URL and return its extracted plain-text content."""
    return fetch_url(url)
```

- [ ] **Step 5: 运行确认通过**

Run: `pytest tests/test_fetch.py -v`
Expected: 5 passed。

- [ ] **Step 6: 提交**

```bash
git add backend/pyproject.toml backend/app/tools/fetch.py backend/tests/test_fetch.py
git commit -m "feat(tools): add fallback page-fetch tool with text extraction"
```

---

## Task 4: 工具聚合入口（registry.py）

**Files:**
- Create: `backend/app/tools/registry.py`
- Create: `backend/tests/test_tool_registry.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_tool_registry.py`**

```python
import asyncio

import pytest


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_get_research_tools_always_includes_fetch_page(session):
    from app.tools import registry

    result = asyncio.run(registry.get_research_tools(session))

    names = [getattr(t, "name", None) for t in result["tools"]]
    assert "fetch_page" in names
    assert result["errors"] == []


def test_get_research_tools_includes_mcp_tools_and_surfaces_errors(session, monkeypatch):
    from app.tools import registry

    async def fake_load_mcp_tools(_session):
        return (["FAKE_MCP_TOOL"], [{"server": "x", "error": "boom"}])

    monkeypatch.setattr(registry, "load_mcp_tools", fake_load_mcp_tools)

    result = asyncio.run(registry.get_research_tools(session))

    assert "FAKE_MCP_TOOL" in result["tools"]
    names = [getattr(t, "name", None) for t in result["tools"]]
    assert "fetch_page" in names
    assert result["errors"] == [{"server": "x", "error": "boom"}]
```

- [ ] **Step 2: 运行确认失败**

Run: `pytest tests/test_tool_registry.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'app.tools.registry'`。

- [ ] **Step 3: 创建 `backend/app/tools/registry.py`**

```python
from typing import Any

from sqlalchemy.orm import Session

from app.tools.fetch import fetch_page
from app.tools.mcp_client import load_mcp_tools


async def get_research_tools(session: Session) -> dict[str, Any]:
    """Aggregate the local fallback fetch tool with any configured MCP tools.

    The fetch_page fallback is always included first so research can
    proceed even if every configured MCP server is unavailable. MCP load
    errors are returned (not raised) so the caller can surface them to the
    user without failing the whole research run.
    """
    mcp_tools, errors = await load_mcp_tools(session)
    return {"tools": [fetch_page, *mcp_tools], "errors": errors}
```

- [ ] **Step 4: 运行确认通过**

Run: `pytest tests/test_tool_registry.py -v`
Expected: 2 passed。

- [ ] **Step 5: 运行全部测试确认整体绿灯**

Run: `pytest -v --basetemp=.pytest_tmp`（env 解释器）
Expected: Phase 1+2 的 30 + Phase 3 的 16（mcp_client 9 + fetch 5 + registry 2）= 46 passed。删除 `.pytest_tmp`。

- [ ] **Step 6: 提交**

```bash
git add backend/app/tools/registry.py backend/tests/test_tool_registry.py
git commit -m "feat(tools): add research tool registry aggregating fetch + MCP tools"
```

---

## Self-Review

**1. Spec coverage（对应设计文档第 8 节 搜索/MCP 工具层）**
- 统一的可插拔工具层（`search`/`fetch` 类能力）→ 本阶段以"聚合 LangChain 工具列表"实现，供 Phase 4 的 Agent 直接 `bind_tools`；MCP 工具本身即声明式的搜索/抓取/读文件能力，不强行套用单一签名（符合设计文档"支持搜索/抓取/读文件等任意 MCP"的表述）✅
- 默认实现：博查 Bocha，走其 MCP 服务器 → Task 1 `ensure_default_bocha_server`（真实包名 `@humansean/mcp-bocha` + `BOCHA_API_KEY`，已通过网络核实）✅
- 自定义 MCP 服务器（stdio / streamable-http / SSE）→ Task 1 `build_mcp_connections` 支持两类；Task 2 `load_mcp_tools` 用 `langchain-mcp-adapters` 转换 ✅
- 抓取正文兜底（无 MCP 抓取工具时使用）→ Task 3 `fetch_page`，且 Task 4 `get_research_tools` 保证其永远在工具列表中 ✅
- MCP 服务器不稳定时降级、错误对用户可见 → Task 2 逐服务器隔离 try/except，返回 `errors` 列表而非整体失败；Task 4 透传 `errors` ✅
- 模型原生联网搜索（备选）→ 属于 Phase 4（模型/Agent 绑定层面的开关），非工具层职责，本阶段不实现（YAGNI，设计文档中此项本就标注"备选"）✅
- 单次研究的来源数/抓取字数上限 → `fetch_url` 已有 `max_chars` 单次截断；跨步骤的来源计数上限属于 Phase 4 执行循环的职责（设计文档把它放在 `execute_research` 节点），本阶段不重复实现 ✅

**2. Placeholder scan**：无 TBD/TODO；所有步骤含完整代码与命令；已知局限（transport 别名未被自动化测试覆盖）已在计划开头明确说明，不是遗漏而是有意识的范围边界。✅

**3. Type consistency**：
- `build_mcp_connections(session) -> dict[str, dict]`、`ensure_default_bocha_server(session, api_key)`、`load_mcp_tools(session) -> tuple[list, list[dict]]` 在 Task 1/2/测试三处签名一致 ✅
- `svc.list_mcp_servers`/`svc.get_mcp_server_env`/`svc.create_mcp_server` 均直接复用 Phase 1 已定稿的签名与返回结构（`id/name/transport/command/args/env/url/enabled`），未重新发明 ✅
- `fetch_url(url, *, max_chars=DEFAULT_MAX_CHARS, client=None) -> str`、`fetch_page`（`@tool` 包装，`.invoke(...)`）在 Task 3/4/测试三处一致 ✅
- `get_research_tools(session) -> {"tools": [...], "errors": [...]}` 契约在 Task 4 与测试中一致，且与 Task 2 `load_mcp_tools` 的 `(tools, errors)` 返回顺序对应 ✅
- `mcp_client.MultiServerMCPClient` 作为模块级导入被测试 `monkeypatch.setattr` 覆盖（与 Phase 2 `factory.init_chat_model` 的 mock 模式一致）✅

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-06-phase3-search-mcp-tools.md`.**

执行采用 Subagent-Driven（与 Phase 1/2 一致），conda 环境 `searchagent`，分支 `phase3-search-mcp-tools`。
