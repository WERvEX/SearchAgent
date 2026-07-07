# Phase 5 — FastAPI 应用层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 FastAPI 应用层：REST 控制研究流程、暴露历史/设置/MCP/报告接口、提供 SSE 事件流，并支持 Markdown/PDF 报告导出。

**Architecture:** 新增 `backend/app/main.py`、`backend/app/api/`、`backend/app/schemas/` 和 `backend/app/core/events.py`。API 层只做 HTTP DTO、依赖注入和服务编排；研究流程继续委托 `app.engine.runner.start_research()` / `resume_research()`，设置仍委托 `settings_service`，报告导出放在 `app/services/report_export.py`。测试使用 FastAPI `TestClient`、内存 SQLite 和 monkeypatch，不触网、不调用真实 LLM/MCP/Playwright 浏览器。

**Tech Stack:** Python 3.11；FastAPI；Pydantic v2；SQLAlchemy 2.x；LangGraph runner；SQLite；SSE 使用标准 `StreamingResponse`；PDF 导出使用 Playwright（测试中 monkeypatch）。

## Global Constraints

- 本地开源、个人使用；单用户、无登录鉴权。
- 技术栈：FastAPI 后端 + React（Vite + Tailwind）前端。
- 实时链路：SSE 流式推送 + REST 控制。
- REST 路由范围：`/conversations`、`/research`、`/reports`、`/settings`、`/mcp`、`/events`。
- LangGraph human-in-the-loop：计划确认由 `interrupt()` 暂停，用户决策经 REST 传入，`Command(resume=...)` 续跑。
- SQLite 完整保存对话、计划、步骤、来源、报告；LangGraph checkpoints 与业务库共用 DB 文件。
- 密钥不回传明文：读取配置时敏感字段以掩码返回，仅后端解密使用。
- 报告以 Markdown 为单一事实来源；导出 `.md` 直接落盘，导出 `.pdf` 用 Playwright / Chromium。
- Windows 测试命令：`$env:PYTHONIOENCODING="utf-8"; C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest -q --basetemp=.pytest_tmp`

---

## File Structure

- Modify: `backend/pyproject.toml` — 增加 FastAPI、Uvicorn、Playwright、Markdown 渲染依赖。
- Create: `backend/app/main.py` — FastAPI app factory、DB 初始化、路由挂载。
- Create: `backend/app/api/__init__.py` — API package marker。
- Create: `backend/app/api/deps.py` — DB session dependency。
- Create: `backend/app/api/router.py` — 汇总所有 API router。
- Create: `backend/app/api/health.py` — `/health`。
- Create: `backend/app/api/conversations.py` — 会话创建、列表、详情。
- Create: `backend/app/api/research.py` — start / resume 研究流程。
- Create: `backend/app/api/settings.py` — LLM profile、偏好、连接测试。
- Create: `backend/app/api/mcp.py` — MCP server 配置。
- Create: `backend/app/api/reports.py` — 报告读取和导出。
- Create: `backend/app/api/events.py` — SSE endpoint。
- Create: `backend/app/core/events.py` — 进程内事件总线。
- Create: `backend/app/schemas/__init__.py` — schemas package marker。
- Create: `backend/app/schemas/conversations.py` — conversation DTO。
- Create: `backend/app/schemas/research.py` — research DTO。
- Create: `backend/app/schemas/settings.py` — settings DTO。
- Create: `backend/app/schemas/mcp.py` — MCP DTO。
- Create: `backend/app/schemas/reports.py` — report DTO。
- Create: `backend/app/services/report_export.py` — Markdown/PDF export。
- Create: `backend/tests/test_api_health.py`
- Create: `backend/tests/test_api_conversations_research.py`
- Create: `backend/tests/test_api_settings_mcp.py`
- Create: `backend/tests/test_api_reports.py`
- Create: `backend/tests/test_api_events.py`

---

### Task 1: FastAPI App Foundation

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/app/main.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/deps.py`
- Create: `backend/app/api/router.py`
- Create: `backend/app/api/health.py`
- Create: `backend/tests/test_api_health.py`

**Interfaces:**
- Produces: `create_app() -> FastAPI`
- Produces: `get_db() -> Iterator[Session]`
- Produces: `api_router: APIRouter`

- [ ] **Step 1: Add dependencies to `backend/pyproject.toml`**

Add these entries inside `[project].dependencies`:

```toml
    "fastapi>=0.115,<1.0",
    "uvicorn[standard]>=0.30,<1.0",
    "playwright>=1.45,<2.0",
    "markdown-it-py>=3.0,<4.0",
```

- [ ] **Step 2: Install dependencies**

Run:

```powershell
cd C:\Workspace\SearchAgent\backend
pip install -e ".[dev]"
```

Expected: installation succeeds in the `searchagent` environment.

- [ ] **Step 3: Write failing test `backend/tests/test_api_health.py`**

```python
from fastapi.testclient import TestClient


def test_health_endpoint_returns_ok(app_home):
    from app.main import create_app

    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
```

- [ ] **Step 4: Run test to verify it fails**

Run:

```powershell
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest tests\test_api_health.py -q --basetemp=.pytest_tmp
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **Step 5: Implement `backend/app/api/deps.py`**

```python
from collections.abc import Iterator

from sqlalchemy.orm import Session

from app.db.session import SessionLocal


def get_db() -> Iterator[Session]:
    if SessionLocal is None:
        raise RuntimeError("Database has not been initialized")
    with SessionLocal() as session:
        yield session
```

- [ ] **Step 6: Implement `backend/app/api/health.py`**

```python
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}
```

- [ ] **Step 7: Implement `backend/app/api/router.py`**

```python
from fastapi import APIRouter

from app.api import health

api_router = APIRouter()
api_router.include_router(health.router)
```

- [ ] **Step 8: Implement `backend/app/main.py`**

```python
from fastapi import FastAPI

from app.api.router import api_router
from app.db.session import init_db


def create_app() -> FastAPI:
    init_db()
    app = FastAPI(title="SearchAgent", version="0.1.0")
    app.include_router(api_router)
    return app


app = create_app()
```

- [ ] **Step 9: Add `backend/app/api/__init__.py`**

```python
"""HTTP API routes for SearchAgent."""
```

- [ ] **Step 10: Run test to verify it passes**

Run:

```powershell
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest tests\test_api_health.py -q --basetemp=.pytest_tmp
```

Expected: `1 passed`.

- [ ] **Step 11: Commit**

```powershell
git add backend/pyproject.toml backend/app/main.py backend/app/api/__init__.py backend/app/api/deps.py backend/app/api/router.py backend/app/api/health.py backend/tests/test_api_health.py
git commit -m "feat(api): add FastAPI app foundation"
```

---

### Task 2: Conversations and Research Control API

**Files:**
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/conversations.py`
- Create: `backend/app/schemas/research.py`
- Create: `backend/app/api/conversations.py`
- Create: `backend/app/api/research.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_api_conversations_research.py`

**Interfaces:**
- Consumes: `get_db() -> Iterator[Session]`
- Consumes: `start_research(session, *, conversation_id, profile_id, user_message) -> dict`
- Consumes: `resume_research(session, *, thread_id, decision, profile_id=1) -> dict`
- Produces: `POST /conversations`
- Produces: `GET /conversations`
- Produces: `GET /conversations/{conversation_id}`
- Produces: `POST /research/start`
- Produces: `POST /research/{thread_id}/resume`

- [ ] **Step 1: Write failing test `backend/tests/test_api_conversations_research.py`**

```python
from fastapi.testclient import TestClient


def test_create_list_and_get_conversation(app_home):
    from app.main import create_app

    client = TestClient(create_app())

    created = client.post("/conversations", json={"title": "Renewable energy"}).json()
    assert created["id"] == 1
    assert created["title"] == "Renewable energy"
    assert created["status"] == "active"

    listed = client.get("/conversations").json()
    assert listed == [created]

    detail = client.get("/conversations/1").json()
    assert detail["id"] == 1
    assert detail["messages"] == []
    assert detail["projects"] == []


def test_research_start_and_resume_delegate_to_runner(app_home, monkeypatch):
    from app.engine import runner
    from app.main import create_app

    async def fake_start(session, *, conversation_id, profile_id, user_message):
        return {
            "thread_id": "thread-1",
            "state": {"conversation_id": conversation_id, "objective": user_message},
            "interrupted": True,
            "interrupt_payload": {"plan": {"summary": "p"}},
        }

    async def fake_resume(session, *, thread_id, decision, profile_id=1):
        return {
            "thread_id": thread_id,
            "state": {"approved": decision["approved"], "report_md": "# R"},
            "interrupted": False,
            "interrupt_payload": None,
        }

    monkeypatch.setattr(runner, "start_research", fake_start)
    monkeypatch.setattr(runner, "resume_research", fake_resume)

    client = TestClient(create_app())
    conv = client.post("/conversations", json={"title": "c"}).json()

    started = client.post(
        "/research/start",
        json={
            "conversation_id": conv["id"],
            "profile_id": 7,
            "user_message": "研究可再生能源趋势",
        },
    ).json()
    assert started["thread_id"] == "thread-1"
    assert started["interrupted"] is True
    assert started["interrupt_payload"]["plan"]["summary"] == "p"

    resumed = client.post(
        "/research/thread-1/resume",
        json={"profile_id": 7, "decision": {"approved": True, "chosen_option": "A"}},
    ).json()
    assert resumed["interrupted"] is False
    assert resumed["state"]["report_md"] == "# R"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest tests\test_api_conversations_research.py -q --basetemp=.pytest_tmp
```

Expected: FAIL because `/conversations` and `/research/start` are not registered.

- [ ] **Step 3: Implement `backend/app/schemas/__init__.py`**

```python
"""Pydantic schemas for the HTTP API."""
```

- [ ] **Step 4: Implement `backend/app/schemas/conversations.py`**

```python
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ConversationCreate(BaseModel):
    title: str = "Untitled"


class ConversationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: str
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationRead):
    messages: list[dict[str, Any]]
    projects: list[dict[str, Any]]
```

- [ ] **Step 5: Implement `backend/app/schemas/research.py`**

```python
from typing import Any

from pydantic import BaseModel


class ResearchStartRequest(BaseModel):
    conversation_id: int
    profile_id: int
    user_message: str


class ResearchResumeRequest(BaseModel):
    profile_id: int = 1
    decision: dict[str, Any]


class ResearchRunResponse(BaseModel):
    thread_id: str
    state: dict[str, Any]
    interrupted: bool
    interrupt_payload: dict[str, Any] | None
```

- [ ] **Step 6: Implement `backend/app/api/conversations.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.models import Conversation
from app.schemas.conversations import ConversationCreate, ConversationDetail, ConversationRead

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("", response_model=ConversationRead)
def create_conversation(payload: ConversationCreate, session: Session = Depends(get_db)):
    conv = Conversation(title=payload.title)
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return conv


@router.get("", response_model=list[ConversationRead])
def list_conversations(session: Session = Depends(get_db)):
    return session.scalars(select(Conversation).order_by(Conversation.id)).all()


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: int, session: Session = Depends(get_db)):
    conv = session.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationDetail(
        id=conv.id,
        title=conv.title,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[
            {"id": m.id, "role": m.role, "content": m.content, "meta": m.meta_json}
            for m in conv.messages
        ],
        projects=[
            {
                "id": p.id,
                "topic": p.topic,
                "objective": p.objective,
                "status": p.status,
                "created_at": p.created_at.isoformat(),
            }
            for p in conv.projects
        ],
    )
```

- [ ] **Step 7: Implement `backend/app/api/research.py`**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.engine import runner
from app.schemas.research import ResearchResumeRequest, ResearchRunResponse, ResearchStartRequest

router = APIRouter(prefix="/research", tags=["research"])


@router.post("/start", response_model=ResearchRunResponse)
async def start_research_endpoint(
    payload: ResearchStartRequest,
    session: Session = Depends(get_db),
):
    return await runner.start_research(
        session,
        conversation_id=payload.conversation_id,
        profile_id=payload.profile_id,
        user_message=payload.user_message,
    )


@router.post("/{thread_id}/resume", response_model=ResearchRunResponse)
async def resume_research_endpoint(
    thread_id: str,
    payload: ResearchResumeRequest,
    session: Session = Depends(get_db),
):
    return await runner.resume_research(
        session,
        thread_id=thread_id,
        decision=payload.decision,
        profile_id=payload.profile_id,
    )
```

- [ ] **Step 8: Register routers in `backend/app/api/router.py`**

Replace file with:

```python
from fastapi import APIRouter

from app.api import conversations, health, research

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(conversations.router)
api_router.include_router(research.router)
```

- [ ] **Step 9: Run tests to verify they pass**

Run:

```powershell
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest tests\test_api_conversations_research.py tests\test_api_health.py -q --basetemp=.pytest_tmp
```

Expected: all selected tests pass.

- [ ] **Step 10: Commit**

```powershell
git add backend/app/schemas/__init__.py backend/app/schemas/conversations.py backend/app/schemas/research.py backend/app/api/conversations.py backend/app/api/research.py backend/app/api/router.py backend/tests/test_api_conversations_research.py
git commit -m "feat(api): add conversations and research control routes"
```

---

### Task 3: Settings and MCP API

**Files:**
- Create: `backend/app/schemas/settings.py`
- Create: `backend/app/schemas/mcp.py`
- Create: `backend/app/api/settings.py`
- Create: `backend/app/api/mcp.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_api_settings_mcp.py`

**Interfaces:**
- Consumes: `settings_service.create_llm_profile()`, `list_llm_profiles()`, `delete_llm_profile()`, `set_preference()`, `get_preference()`
- Consumes: `settings_service.create_mcp_server()`, `list_mcp_servers()`
- Consumes: `check_profile_connection(session, profile_id) -> dict`
- Produces: `/settings/llm-profiles`, `/settings/preferences/{key}`, `/settings/llm-profiles/{id}/test`
- Produces: `/mcp/servers`

- [ ] **Step 1: Write failing test `backend/tests/test_api_settings_mcp.py`**

```python
from fastapi.testclient import TestClient


def test_llm_profile_api_masks_keys_and_tests_connection(app_home, monkeypatch):
    from app.llm import connectivity
    from app.main import create_app

    monkeypatch.setattr(
        connectivity,
        "check_profile_connection",
        lambda session, profile_id: {"ok": True, "error": None},
    )

    client = TestClient(create_app())
    created = client.post(
        "/settings/llm-profiles",
        json={
            "name": "local",
            "provider": "openai_compatible",
            "base_url": "http://localhost:11434/v1",
            "model": "qwen",
            "api_key": "sk-secret",
            "params": {"temperature": 0},
            "is_default": True,
        },
    ).json()

    assert created["name"] == "local"
    assert created["api_key"] == "sk-s****"

    listed = client.get("/settings/llm-profiles").json()
    assert listed[0]["api_key"] == "sk-s****"

    checked = client.post(f"/settings/llm-profiles/{created['id']}/test").json()
    assert checked == {"ok": True, "error": None}


def test_preferences_and_mcp_server_api(app_home):
    from app.main import create_app

    client = TestClient(create_app())

    pref = client.put("/settings/preferences/max_sources", json={"value": 12}).json()
    assert pref == {"key": "max_sources", "value": {"value": 12}}
    assert client.get("/settings/preferences/max_sources").json() == pref

    server = client.post(
        "/mcp/servers",
        json={
            "name": "bocha",
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@humansean/mcp-bocha"],
            "env": {"BOCHA_API_KEY": "secret"},
            "enabled": True,
        },
    ).json()
    assert server["name"] == "bocha"
    assert server["env"] == {"BOCHA_API_KEY": "secr****"}
    assert client.get("/mcp/servers").json()[0]["name"] == "bocha"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest tests\test_api_settings_mcp.py -q --basetemp=.pytest_tmp
```

Expected: FAIL because settings and MCP routes are not registered.

- [ ] **Step 3: Implement `backend/app/schemas/settings.py`**

```python
from typing import Any

from pydantic import BaseModel


class LLMProfileCreate(BaseModel):
    name: str
    provider: str
    base_url: str | None = None
    model: str
    api_key: str | None = None
    params: dict[str, Any] | None = None
    is_default: bool = False


class PreferenceValue(BaseModel):
    value: dict[str, Any]
```

- [ ] **Step 4: Implement `backend/app/schemas/mcp.py`**

```python
from pydantic import BaseModel


class MCPServerCreate(BaseModel):
    name: str
    transport: str = "stdio"
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    url: str | None = None
    enabled: bool = True
```

- [ ] **Step 5: Implement `backend/app/api/settings.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.llm import connectivity
from app.schemas.settings import LLMProfileCreate, PreferenceValue
from app.services import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.post("/llm-profiles")
def create_llm_profile(payload: LLMProfileCreate, session: Session = Depends(get_db)):
    profile = settings_service.create_llm_profile(
        session,
        name=payload.name,
        provider=payload.provider,
        base_url=payload.base_url,
        model=payload.model,
        api_key=payload.api_key,
        params=payload.params,
        is_default=payload.is_default,
    )
    return next(p for p in settings_service.list_llm_profiles(session) if p["id"] == profile.id)


@router.get("/llm-profiles")
def list_llm_profiles(session: Session = Depends(get_db)):
    return settings_service.list_llm_profiles(session)


@router.delete("/llm-profiles/{profile_id}", status_code=204)
def delete_llm_profile(profile_id: int, session: Session = Depends(get_db)):
    settings_service.delete_llm_profile(session, profile_id)
    return None


@router.post("/llm-profiles/{profile_id}/test")
def test_llm_profile(profile_id: int, session: Session = Depends(get_db)):
    return connectivity.check_profile_connection(session, profile_id)


@router.put("/preferences/{key}")
def set_preference(key: str, payload: PreferenceValue, session: Session = Depends(get_db)):
    settings_service.set_preference(session, key, payload.value)
    return {"key": key, "value": payload.value}


@router.get("/preferences/{key}")
def get_preference(key: str, session: Session = Depends(get_db)):
    value = settings_service.get_preference(session, key)
    if value is None:
        raise HTTPException(status_code=404, detail="Preference not found")
    return {"key": key, "value": value}
```

- [ ] **Step 6: Implement `backend/app/api/mcp.py`**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.mcp import MCPServerCreate
from app.services import settings_service

router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.post("/servers")
def create_mcp_server(payload: MCPServerCreate, session: Session = Depends(get_db)):
    server = settings_service.create_mcp_server(
        session,
        name=payload.name,
        transport=payload.transport,
        command=payload.command,
        args=payload.args,
        env=payload.env,
        url=payload.url,
        enabled=payload.enabled,
    )
    return next(s for s in settings_service.list_mcp_servers(session) if s["id"] == server.id)


@router.get("/servers")
def list_mcp_servers(session: Session = Depends(get_db)):
    return settings_service.list_mcp_servers(session)
```

- [ ] **Step 7: Register routers in `backend/app/api/router.py`**

Replace imports and includes with:

```python
from fastapi import APIRouter

from app.api import conversations, health, mcp, research, settings

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(conversations.router)
api_router.include_router(research.router)
api_router.include_router(settings.router)
api_router.include_router(mcp.router)
```

- [ ] **Step 8: Run tests to verify they pass**

Run:

```powershell
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest tests\test_api_settings_mcp.py -q --basetemp=.pytest_tmp
```

Expected: all selected tests pass.

- [ ] **Step 9: Commit**

```powershell
git add backend/app/schemas/settings.py backend/app/schemas/mcp.py backend/app/api/settings.py backend/app/api/mcp.py backend/app/api/router.py backend/tests/test_api_settings_mcp.py
git commit -m "feat(api): add settings and MCP routes"
```

---

### Task 4: Reports API and Export Service

**Files:**
- Create: `backend/app/schemas/reports.py`
- Create: `backend/app/services/report_export.py`
- Create: `backend/app/api/reports.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_api_reports.py`

**Interfaces:**
- Consumes: `Report` rows from `app.db.models`
- Produces: `export_markdown(report: Report) -> Path`
- Produces: `async export_pdf(report: Report) -> Path`
- Produces: `GET /reports/{report_id}`
- Produces: `GET /reports/{report_id}/download.md`
- Produces: `POST /reports/{report_id}/export.pdf`

- [ ] **Step 1: Write failing test `backend/tests/test_api_reports.py`**

```python
from fastapi.testclient import TestClient


def test_report_read_and_markdown_download(app_home):
    from app.db import session as db
    from app.db.models import Conversation, Report, ResearchProject
    from app.main import create_app

    client = TestClient(create_app())
    with db.SessionLocal() as session:
        conv = Conversation(title="c")
        session.add(conv)
        session.flush()
        project = ResearchProject(conversation_id=conv.id, topic="t", objective="o")
        session.add(project)
        session.flush()
        report = Report(project_id=project.id, version=1, format="md", content_md="# Report")
        session.add(report)
        session.commit()
        report_id = report.id

    read = client.get(f"/reports/{report_id}").json()
    assert read["content_md"] == "# Report"

    downloaded = client.get(f"/reports/{report_id}/download.md")
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"].startswith("text/markdown")
    assert downloaded.text == "# Report"


def test_report_pdf_export_uses_service(app_home, monkeypatch):
    from pathlib import Path

    from app.db import session as db
    from app.db.models import Conversation, Report, ResearchProject
    from app.main import create_app
    from app.services import report_export

    async def fake_export_pdf(report):
        path = Path(app_home) / "reports" / str(report.project_id) / "report.pdf"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"%PDF-test")
        return path

    monkeypatch.setattr(report_export, "export_pdf", fake_export_pdf)

    client = TestClient(create_app())
    with db.SessionLocal() as session:
        conv = Conversation(title="c")
        session.add(conv)
        session.flush()
        project = ResearchProject(conversation_id=conv.id, topic="t", objective="o")
        session.add(project)
        session.flush()
        report = Report(project_id=project.id, version=1, format="md", content_md="# Report")
        session.add(report)
        session.commit()
        report_id = report.id

    exported = client.post(f"/reports/{report_id}/export.pdf").json()
    assert exported["format"] == "pdf"
    assert exported["file_path"].endswith("report.pdf")
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest tests\test_api_reports.py -q --basetemp=.pytest_tmp
```

Expected: FAIL because reports routes are not registered.

- [ ] **Step 3: Implement `backend/app/schemas/reports.py`**

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    version: int
    format: str
    content_md: str
    file_path: str | None
    created_at: datetime
```

- [ ] **Step 4: Implement `backend/app/services/report_export.py`**

```python
from html import escape
from pathlib import Path

from markdown_it import MarkdownIt
from playwright.async_api import async_playwright

from app.core.paths import get_reports_dir
from app.db.models import Report


def _report_dir(report: Report) -> Path:
    path = get_reports_dir() / str(report.project_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def export_markdown(report: Report) -> Path:
    path = _report_dir(report) / f"report-v{report.version}.md"
    path.write_text(report.content_md, encoding="utf-8")
    return path


def render_report_html(markdown: str) -> str:
    body = MarkdownIt("commonmark").enable("table").render(markdown)
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<style>body{font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.6;"
        "max-width:860px;margin:40px auto;color:#111} a{color:#0645ad}</style>"
        "</head><body>"
        f"{body if body else '<pre>' + escape(markdown) + '</pre>'}"
        "</body></html>"
    )


async def export_pdf(report: Report) -> Path:
    path = _report_dir(report) / f"report-v{report.version}.pdf"
    html = render_report_html(report.content_md)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_content(html, wait_until="networkidle")
        await page.pdf(path=str(path), format="A4", print_background=True)
        await browser.close()
    return path
```

- [ ] **Step 5: Implement `backend/app/api/reports.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.models import Report
from app.schemas.reports import ReportRead
from app.services import report_export

router = APIRouter(prefix="/reports", tags=["reports"])


def _get_report_or_404(session: Session, report_id: int) -> Report:
    report = session.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("/{report_id}", response_model=ReportRead)
def get_report(report_id: int, session: Session = Depends(get_db)):
    return _get_report_or_404(session, report_id)


@router.get("/{report_id}/download.md")
def download_markdown(report_id: int, session: Session = Depends(get_db)):
    report = _get_report_or_404(session, report_id)
    path = report_export.export_markdown(report)
    return Response(
        content=path.read_text(encoding="utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{path.name}"'},
    )


@router.post("/{report_id}/export.pdf")
async def export_pdf(report_id: int, session: Session = Depends(get_db)):
    report = _get_report_or_404(session, report_id)
    path = await report_export.export_pdf(report)
    report.file_path = str(path)
    session.commit()
    return {"format": "pdf", "file_path": str(path)}
```

- [ ] **Step 6: Register reports router**

Update `backend/app/api/router.py`:

```python
from fastapi import APIRouter

from app.api import conversations, health, mcp, reports, research, settings

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(conversations.router)
api_router.include_router(research.router)
api_router.include_router(settings.router)
api_router.include_router(mcp.router)
api_router.include_router(reports.router)
```

- [ ] **Step 7: Run tests to verify they pass**

Run:

```powershell
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest tests\test_api_reports.py -q --basetemp=.pytest_tmp
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit**

```powershell
git add backend/app/schemas/reports.py backend/app/services/report_export.py backend/app/api/reports.py backend/app/api/router.py backend/tests/test_api_reports.py
git commit -m "feat(api): add reports API and export service"
```

---

### Task 5: SSE Event Stream

**Files:**
- Create: `backend/app/core/events.py`
- Create: `backend/app/api/events.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_api_events.py`

**Interfaces:**
- Produces: `EventBus.publish(event: dict) -> None`
- Produces: `EventBus.subscribe() -> Iterator[dict]`
- Produces: `get_event_bus() -> EventBus`
- Produces: `GET /events`

- [ ] **Step 1: Write failing test `backend/tests/test_api_events.py`**

```python
from fastapi.testclient import TestClient


def test_event_bus_formats_sse_messages(app_home):
    from app.core.events import format_sse

    assert format_sse({"type": "progress", "message": "running"}) == (
        'data: {"type":"progress","message":"running"}\n\n'
    )


def test_events_endpoint_streams_published_event(app_home):
    from app.core.events import get_event_bus
    from app.main import create_app

    bus = get_event_bus()
    bus.publish({"type": "progress", "message": "running"})

    client = TestClient(create_app())
    with client.stream("GET", "/events?limit=1") as response:
        body = next(response.iter_text())

    assert response.status_code == 200
    assert '"type":"progress"' in body
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest tests\test_api_events.py -q --basetemp=.pytest_tmp
```

Expected: FAIL because `app.core.events` and `/events` do not exist.

- [ ] **Step 3: Implement `backend/app/core/events.py`**

```python
import json
import queue
from collections.abc import Iterator
from typing import Any


class EventBus:
    def __init__(self) -> None:
        self._queue: queue.Queue[dict[str, Any]] = queue.Queue()

    def publish(self, event: dict[str, Any]) -> None:
        self._queue.put(event)

    def subscribe(self, *, limit: int | None = None) -> Iterator[dict[str, Any]]:
        count = 0
        while limit is None or count < limit:
            yield self._queue.get()
            count += 1


_BUS = EventBus()


def get_event_bus() -> EventBus:
    return _BUS


def format_sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, separators=(',', ':'))}\n\n"
```

- [ ] **Step 4: Implement `backend/app/api/events.py`**

```python
from collections.abc import Iterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.events import format_sse, get_event_bus

router = APIRouter(tags=["events"])


@router.get("/events")
def stream_events(limit: int | None = None):
    def body() -> Iterator[str]:
        for event in get_event_bus().subscribe(limit=limit):
            yield format_sse(event)

    return StreamingResponse(body(), media_type="text/event-stream")
```

- [ ] **Step 5: Register events router**

Update `backend/app/api/router.py`:

```python
from fastapi import APIRouter

from app.api import conversations, events, health, mcp, reports, research, settings

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(conversations.router)
api_router.include_router(research.router)
api_router.include_router(settings.router)
api_router.include_router(mcp.router)
api_router.include_router(reports.router)
api_router.include_router(events.router)
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```powershell
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest tests\test_api_events.py -q --basetemp=.pytest_tmp
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

```powershell
git add backend/app/core/events.py backend/app/api/events.py backend/app/api/router.py backend/tests/test_api_events.py
git commit -m "feat(api): add SSE event stream"
```

---

### Task 6: Phase 5 Integration and Smoke Verification

**Files:**
- Modify: `backend/tests/test_api_health.py`
- Modify: `backend/tests/test_api_conversations_research.py`
- Modify: `backend/tests/test_api_settings_mcp.py`
- Modify: `backend/tests/test_api_reports.py`
- Modify: `backend/tests/test_api_events.py`

**Interfaces:**
- Consumes: all routes from Tasks 1-5.
- Produces: full backend test suite passing with API layer included.

- [ ] **Step 1: Run all API tests**

Run:

```powershell
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest tests\test_api_*.py -q --basetemp=.pytest_tmp
```

Expected: all API tests pass.

- [ ] **Step 2: Run complete backend test suite**

Run:

```powershell
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest -q --basetemp=.pytest_tmp
```

Expected: all tests pass. At the time this plan was written, the backend suite was expected to include Phase 1-5 tests and report no failures.

- [ ] **Step 3: Start the dev server manually for smoke**

Run:

```powershell
cd C:\Workspace\SearchAgent\backend
$env:PYTHONIOENCODING="utf-8"
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Expected: server starts at `http://127.0.0.1:8000`.

- [ ] **Step 4: Check health endpoint**

Run in a second PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Expected:

```powershell
ok
--
True
```

- [ ] **Step 5: Commit final verification adjustments if any**

Only commit if Task 6 changed tests or docs:

```powershell
git add backend/tests
git commit -m "test(api): verify FastAPI integration"
```

---

## Self-Review

1. **Spec coverage:** This plan covers the FastAPI application layer, REST control routes, settings/MCP routes, report preview/export routes, and SSE event endpoint from spec sections 3, 4, 9, 10, and 12. It intentionally does not implement React frontend, UI plan panel, or packaging; those belong to Phase 6+.
2. **Placeholder scan:** No unresolved placeholders or vague test instructions remain. Each task includes exact paths, test code, implementation code, commands, and expected results.
3. **Type consistency:** Route schemas use Pydantic v2. API dependencies use SQLAlchemy `Session`. Research routes call the existing runner signatures: `start_research(session, *, conversation_id, profile_id, user_message)` and `resume_research(session, *, thread_id, decision, profile_id=1)`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-07-phase5-fastapi-application-layer.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
