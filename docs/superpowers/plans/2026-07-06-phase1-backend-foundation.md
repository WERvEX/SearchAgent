# Phase 1 — 后端基础设施 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建后端项目骨架，建立 SQLite 持久化（全部业务表 + 配置表）、本地应用数据目录、Fernet 密钥加密，以及带加密与掩码的配置（LLM Profiles / MCP 服务器 / 通用偏好）管理服务。

**Architecture:** 分层的 `backend/app` 包：`core`（路径与加密）、`db`（SQLAlchemy 2.0 模型与会话）、`services`（配置服务）。本阶段交付一个可独立运行、可测试的持久化与配置底座，供后续 LLM 适配、工具层、LangGraph 引擎、API 复用。

**Tech Stack:** Python 3.11+、SQLAlchemy 2.0（typed ORM）、Pydantic v2、cryptography（Fernet）、pytest。

> **依赖说明**：本阶段仅编写与测试代码，不涉及联网。执行前请先确认使用的 conda 环境（见文末 Execution Handoff）。

> **对 spec 的一处细化**：spec 第 5 节把配置统称为单个 `settings`。为保持单元边界清晰、便于测试，这里把它落为三张表：`llm_profiles`、`mcp_servers`、`app_preferences`。业务语义不变。

---

## File Structure（本阶段涉及文件）

- Create: `backend/pyproject.toml` — 依赖与 pytest 配置
- Create: `backend/app/__init__.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/paths.py` — 应用数据目录/DB/密钥/报告路径解析
- Create: `backend/app/core/crypto.py` — Fernet 密钥管理、加解密、掩码
- Create: `backend/app/db/__init__.py`
- Create: `backend/app/db/base.py` — SQLAlchemy `DeclarativeBase`
- Create: `backend/app/db/models.py` — 全部 ORM 模型
- Create: `backend/app/db/session.py` — engine / session / `init_db`
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/settings_service.py` — 配置 CRUD（加密 + 掩码）
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py` — 临时 `SEARCHAGENT_HOME` 与内存/临时 DB fixture
- Create: `backend/tests/test_paths.py`
- Create: `backend/tests/test_crypto.py`
- Create: `backend/tests/test_models.py`
- Create: `backend/tests/test_settings_service.py`
- Create: `backend/.gitignore`

---

## Task 1: 后端项目脚手架

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.gitignore`
- Create: `backend/app/__init__.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_smoke.py`

- [ ] **Step 1: 写 `backend/pyproject.toml`**

```toml
[project]
name = "searchagent-backend"
version = "0.1.0"
description = "Local LangChain + MCP research agent backend"
requires-python = ">=3.11"
dependencies = [
    "sqlalchemy>=2.0,<3.0",
    "pydantic>=2.6,<3.0",
    "cryptography>=42.0",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
addopts = "-v"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["app*"]
```

- [ ] **Step 2: 写 `backend/.gitignore`**

```gitignore
__pycache__/
*.pyc
.pytest_cache/
.venv/
*.db
.env
```

- [ ] **Step 3: 写空包文件**

`backend/app/__init__.py`:

```python
```

`backend/tests/__init__.py`:

```python
```

- [ ] **Step 4: 写冒烟测试 `backend/tests/test_smoke.py`**

```python
def test_python_and_imports():
    import sqlalchemy
    import cryptography
    import pydantic

    assert sqlalchemy.__version__.startswith("2.")
```

- [ ] **Step 5: 运行冒烟测试（先安装依赖）**

Run（在已确认的 conda 环境中）:

```bash
cd backend
pip install -e ".[dev]"
pytest tests/test_smoke.py -v
```

Expected: 1 passed。若 `sqlalchemy` 未安装则先失败，安装后通过。

- [ ] **Step 6: 提交**

```bash
git add backend/pyproject.toml backend/.gitignore backend/app/__init__.py backend/tests/__init__.py backend/tests/test_smoke.py
git commit -m "chore(backend): scaffold project with pyproject and smoke test"
```

---

## Task 2: 应用数据路径解析（core/paths.py）

**Files:**
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/paths.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_paths.py`

- [ ] **Step 1: 写 `backend/tests/conftest.py`（隔离数据目录）**

```python
import importlib
import pytest


@pytest.fixture()
def app_home(tmp_path, monkeypatch):
    """Point SEARCHAGENT_HOME at a temp dir so tests never touch the real home."""
    home = tmp_path / "searchagent_home"
    monkeypatch.setenv("SEARCHAGENT_HOME", str(home))

    # Reload path-dependent modules so cached module-level state is reset.
    import app.core.paths as paths
    importlib.reload(paths)

    return home
```

- [ ] **Step 2: 写失败测试 `backend/tests/test_paths.py`**

```python
from pathlib import Path


def test_app_home_uses_env_override(app_home):
    import app.core.paths as paths

    result = paths.get_app_home()

    assert result == Path(app_home)
    assert result.exists()


def test_db_key_reports_paths_are_under_home(app_home):
    import app.core.paths as paths

    assert paths.get_db_path() == Path(app_home) / "searchagent.db"
    assert paths.get_key_path() == Path(app_home) / "secret.key"

    reports = paths.get_reports_dir()
    assert reports == Path(app_home) / "reports"
    assert reports.exists()
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd backend && pytest tests/test_paths.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'app.core.paths'`。

- [ ] **Step 4: 写 `backend/app/core/__init__.py`（空）与 `backend/app/core/paths.py`**

`backend/app/core/__init__.py`:

```python
```

`backend/app/core/paths.py`:

```python
import os
from pathlib import Path


def get_app_home() -> Path:
    """Return the application data directory, creating it if needed.

    Overridable via the SEARCHAGENT_HOME env var (used by tests and for
    running multiple isolated instances).
    """
    override = os.environ.get("SEARCHAGENT_HOME")
    base = Path(override) if override else Path.home() / ".searchagent"
    base.mkdir(parents=True, exist_ok=True)
    return base


def get_db_path() -> Path:
    return get_app_home() / "searchagent.db"


def get_key_path() -> Path:
    return get_app_home() / "secret.key"


def get_reports_dir() -> Path:
    reports = get_app_home() / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    return reports
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd backend && pytest tests/test_paths.py -v`
Expected: 2 passed。

- [ ] **Step 6: 提交**

```bash
git add backend/app/core/__init__.py backend/app/core/paths.py backend/tests/conftest.py backend/tests/test_paths.py
git commit -m "feat(backend): add app data path resolution with env override"
```

---

## Task 3: 密钥加密与掩码（core/crypto.py）

**Files:**
- Create: `backend/app/core/crypto.py`
- Create: `backend/tests/test_crypto.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_crypto.py`**

```python
def test_key_is_created_once_and_reused(app_home):
    import app.core.crypto as crypto
    import app.core.paths as paths

    f1 = crypto.get_fernet()
    assert paths.get_key_path().exists()
    key_bytes = paths.get_key_path().read_bytes()

    f2 = crypto.get_fernet()
    # Same key file, so a token from f1 must decrypt with f2.
    token = f1.encrypt(b"hello")
    assert f2.decrypt(token) == b"hello"
    assert paths.get_key_path().read_bytes() == key_bytes


def test_encrypt_decrypt_roundtrip(app_home):
    import app.core.crypto as crypto

    secret = "sk-1234567890abcdef"
    token = crypto.encrypt(secret)

    assert token != secret
    assert crypto.decrypt(token) == secret


def test_mask_secret(app_home):
    import app.core.crypto as crypto

    assert crypto.mask_secret("sk-1234567890") == "sk-1****"
    assert crypto.mask_secret("abc") == "****"
    assert crypto.mask_secret("") == ""
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && pytest tests/test_crypto.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'app.core.crypto'`。

- [ ] **Step 3: 写 `backend/app/core/crypto.py`**

```python
import os

from cryptography.fernet import Fernet

from app.core.paths import get_key_path


def _load_or_create_key() -> bytes:
    path = get_key_path()
    if path.exists():
        return path.read_bytes()

    key = Fernet.generate_key()
    path.write_bytes(key)
    try:
        os.chmod(path, 0o600)
    except OSError:
        # chmod may be unsupported on some Windows setups; ignore.
        pass
    return key


def get_fernet() -> Fernet:
    return Fernet(_load_or_create_key())


def encrypt(plaintext: str) -> str:
    return get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    return get_fernet().decrypt(token.encode()).decode()


def mask_secret(value: str, visible: int = 4) -> str:
    """Return a display-safe masked form: keep a short prefix, hide the rest."""
    if not value:
        return ""
    if len(value) <= visible:
        return "****"
    return value[:visible] + "****"
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && pytest tests/test_crypto.py -v`
Expected: 3 passed。

- [ ] **Step 5: 提交**

```bash
git add backend/app/core/crypto.py backend/tests/test_crypto.py
git commit -m "feat(backend): add Fernet-based secret encryption and masking"
```

---

## Task 4: 数据库模型与会话（db/base.py, models.py, session.py）

**Files:**
- Create: `backend/app/db/__init__.py`
- Create: `backend/app/db/base.py`
- Create: `backend/app/db/models.py`
- Create: `backend/app/db/session.py`
- Create: `backend/tests/test_models.py`

> `langgraph_checkpoints` 表由后续阶段引入的 `langgraph-checkpoint-sqlite` 自行管理，这里不手写模型。

- [ ] **Step 1: 写失败测试 `backend/tests/test_models.py`**

```python
import datetime as dt

import pytest
from sqlalchemy import inspect


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_all_tables_created(session):
    engine = session.get_bind()
    tables = set(inspect(engine).get_table_names())

    expected = {
        "conversations",
        "messages",
        "research_projects",
        "plans",
        "steps",
        "acceptance_criteria",
        "sources",
        "reports",
        "llm_profiles",
        "mcp_servers",
        "app_preferences",
    }
    assert expected.issubset(tables)


def test_conversation_message_relationship(session):
    from app.db.models import Conversation, Message

    conv = Conversation(title="Test topic")
    session.add(conv)
    session.flush()

    msg = Message(conversation_id=conv.id, role="user", content="hi")
    session.add(msg)
    session.commit()

    assert conv.id is not None
    assert isinstance(conv.created_at, dt.datetime)
    assert len(conv.messages) == 1
    assert conv.messages[0].content == "hi"


def test_project_plan_step_source_chain(session):
    from app.db.models import (
        Conversation,
        ResearchProject,
        Plan,
        Step,
        AcceptanceCriterion,
        Source,
        Report,
    )

    conv = Conversation(title="c")
    session.add(conv)
    session.flush()

    project = ResearchProject(
        conversation_id=conv.id, topic="t", objective="o", status="draft"
    )
    session.add(project)
    session.flush()

    session.add(Plan(project_id=project.id, version=1, summary="plan v1"))
    session.add(Step(project_id=project.id, seq=1, title="s1", status="pending"))
    session.add(
        AcceptanceCriterion(project_id=project.id, description="ac1", met=False)
    )
    session.add(
        Source(project_id=project.id, url="https://x", title="X", tool_name="bocha")
    )
    session.add(
        Report(project_id=project.id, version=1, format="md", content_md="# r")
    )
    session.commit()

    assert len(project.plans) == 1
    assert len(project.steps) == 1
    assert len(project.acceptance_criteria) == 1
    assert len(project.sources) == 1
    assert len(project.reports) == 1
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && pytest tests/test_models.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'app.db.session'`。

- [ ] **Step 3: 写 `backend/app/db/__init__.py`（空）与 `backend/app/db/base.py`**

`backend/app/db/__init__.py`:

```python
```

`backend/app/db/base.py`:

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

- [ ] **Step 4: 写 `backend/app/db/models.py`**

```python
import datetime as dt
from typing import Optional

from sqlalchemy import ForeignKey, JSON, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(default="Untitled")
    status: Mapped[str] = mapped_column(default="active")
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(default=_now, onupdate=_now)

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )
    projects: Mapped[list["ResearchProject"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column()
    content: Mapped[str] = mapped_column(Text)
    meta_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")


class ResearchProject(Base):
    __tablename__ = "research_projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE")
    )
    topic: Mapped[str] = mapped_column()
    objective: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(default="draft")
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    conversation: Mapped["Conversation"] = relationship(back_populates="projects")
    plans: Mapped[list["Plan"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    steps: Mapped[list["Step"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    acceptance_criteria: Mapped[list["AcceptanceCriterion"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    sources: Mapped[list["Source"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    reports: Mapped[list["Report"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("research_projects.id", ondelete="CASCADE")
    )
    version: Mapped[int] = mapped_column(default=1)
    summary: Mapped[str] = mapped_column(Text, default="")
    options_json: Mapped[Optional[list]] = mapped_column(JSON, default=None)
    chosen_option: Mapped[Optional[str]] = mapped_column(default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    project: Mapped["ResearchProject"] = relationship(back_populates="plans")


class Step(Base):
    __tablename__ = "steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("research_projects.id", ondelete="CASCADE")
    )
    seq: Mapped[int] = mapped_column()
    title: Mapped[str] = mapped_column()
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(default="pending")
    result_summary: Mapped[Optional[str]] = mapped_column(Text, default=None)

    project: Mapped["ResearchProject"] = relationship(back_populates="steps")


class AcceptanceCriterion(Base):
    __tablename__ = "acceptance_criteria"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("research_projects.id", ondelete="CASCADE")
    )
    description: Mapped[str] = mapped_column(Text)
    met: Mapped[bool] = mapped_column(Boolean, default=False)
    evidence_ref: Mapped[Optional[str]] = mapped_column(default=None)

    project: Mapped["ResearchProject"] = relationship(
        back_populates="acceptance_criteria"
    )


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("research_projects.id", ondelete="CASCADE")
    )
    step_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("steps.id", ondelete="SET NULL"), default=None
    )
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(default="")
    snippet: Mapped[Optional[str]] = mapped_column(Text, default=None)
    tool_name: Mapped[str] = mapped_column(default="")
    retrieved_at: Mapped[dt.datetime] = mapped_column(default=_now)

    project: Mapped["ResearchProject"] = relationship(back_populates="sources")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("research_projects.id", ondelete="CASCADE")
    )
    version: Mapped[int] = mapped_column(default=1)
    format: Mapped[str] = mapped_column(default="md")
    content_md: Mapped[str] = mapped_column(Text, default="")
    file_path: Mapped[Optional[str]] = mapped_column(default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    project: Mapped["ResearchProject"] = relationship(back_populates="reports")


class LLMProfile(Base):
    __tablename__ = "llm_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    provider: Mapped[str] = mapped_column()
    base_url: Mapped[Optional[str]] = mapped_column(default=None)
    model: Mapped[str] = mapped_column()
    api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, default=None)
    params_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class MCPServer(Base):
    __tablename__ = "mcp_servers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    transport: Mapped[str] = mapped_column(default="stdio")  # stdio | http | sse
    command: Mapped[Optional[str]] = mapped_column(default=None)
    args_json: Mapped[Optional[list]] = mapped_column(JSON, default=None)
    env_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    url: Mapped[Optional[str]] = mapped_column(default=None)
    secret_encrypted: Mapped[Optional[str]] = mapped_column(Text, default=None)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class AppPreference(Base):
    __tablename__ = "app_preferences"

    key: Mapped[str] = mapped_column(primary_key=True)
    value_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
```

- [ ] **Step 5: 写 `backend/app/db/session.py`**

```python
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from app.core.paths import get_db_path
from app.db.base import Base
import app.db.models  # noqa: F401  ensure all models are registered on Base


engine: Optional[Engine] = None
SessionLocal: Optional[sessionmaker] = None


def _build_url(url: Optional[str]) -> str:
    if url is not None:
        return url
    return f"sqlite:///{get_db_path()}"


def init_db(url: Optional[str] = None) -> Engine:
    """Create the engine + session factory and create all tables.

    Pass an explicit url (e.g. 'sqlite:///:memory:') in tests.
    """
    global engine, SessionLocal

    engine = create_engine(
        _build_url(url), connect_args={"check_same_thread": False}
    )
    SessionLocal = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False
    )
    Base.metadata.create_all(engine)
    return engine
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd backend && pytest tests/test_models.py -v`
Expected: 3 passed。

- [ ] **Step 7: 提交**

```bash
git add backend/app/db/__init__.py backend/app/db/base.py backend/app/db/models.py backend/app/db/session.py backend/tests/test_models.py
git commit -m "feat(backend): add SQLAlchemy models and db session bootstrap"
```

---

## Task 5: 配置服务（services/settings_service.py）

实现 LLM Profiles 的增删查（API Key 加密存储、列表默认掩码、可显式解密取用）、MCP 服务器增查、通用偏好读写。

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/settings_service.py`
- Create: `backend/tests/test_settings_service.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_settings_service.py`**

```python
import pytest


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_create_and_list_llm_profile_masks_key(session):
    from app.services import settings_service as svc

    profile = svc.create_llm_profile(
        session,
        name="openai-main",
        provider="openai",
        base_url="https://api.openai.com/v1",
        model="gpt-4o",
        api_key="sk-secret-1234567890",
        is_default=True,
    )
    assert profile.id is not None
    # Stored key must be encrypted, not plaintext.
    assert profile.api_key_encrypted != "sk-secret-1234567890"

    listed = svc.list_llm_profiles(session)
    assert len(listed) == 1
    assert listed[0]["name"] == "openai-main"
    assert listed[0]["api_key"] == "sk-s****"  # masked
    assert listed[0]["is_default"] is True


def test_get_decrypted_api_key(session):
    from app.services import settings_service as svc

    p = svc.create_llm_profile(
        session,
        name="p1",
        provider="openai",
        base_url=None,
        model="gpt-4o-mini",
        api_key="sk-abcdefghij",
    )

    assert svc.get_decrypted_api_key(session, p.id) == "sk-abcdefghij"


def test_only_one_default_profile(session):
    from app.services import settings_service as svc

    svc.create_llm_profile(
        session, name="a", provider="openai", base_url=None,
        model="m", api_key="k1", is_default=True,
    )
    b = svc.create_llm_profile(
        session, name="b", provider="anthropic", base_url=None,
        model="claude", api_key="k2", is_default=True,
    )

    defaults = [p for p in svc.list_llm_profiles(session) if p["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["id"] == b.id


def test_delete_llm_profile(session):
    from app.services import settings_service as svc

    p = svc.create_llm_profile(
        session, name="temp", provider="openai", base_url=None,
        model="m", api_key="k",
    )
    svc.delete_llm_profile(session, p.id)

    assert svc.list_llm_profiles(session) == []


def test_mcp_server_create_and_list(session):
    from app.services import settings_service as svc

    svc.create_mcp_server(
        session,
        name="bocha",
        transport="stdio",
        command="npx",
        args=["-y", "bocha-mcp"],
        env={"BOCHA_API_KEY": "bk-123"},
    )
    servers = svc.list_mcp_servers(session)

    assert len(servers) == 1
    assert servers[0]["name"] == "bocha"
    assert servers[0]["enabled"] is True
    # env secret must not be returned in plaintext.
    assert servers[0]["env"]["BOCHA_API_KEY"] == "bk-1****"


def test_preferences_roundtrip(session):
    from app.services import settings_service as svc

    svc.set_preference(session, "report_language", {"value": "zh"})
    svc.set_preference(session, "max_sources", {"value": 20})

    assert svc.get_preference(session, "report_language") == {"value": "zh"}
    assert svc.get_preference(session, "missing") is None
    # Upsert updates in place.
    svc.set_preference(session, "max_sources", {"value": 30})
    assert svc.get_preference(session, "max_sources") == {"value": 30}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && pytest tests/test_settings_service.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'app.services.settings_service'`。

- [ ] **Step 3: 写 `backend/app/services/__init__.py`（空）与 `backend/app/services/settings_service.py`**

`backend/app/services/__init__.py`:

```python
```

`backend/app/services/settings_service.py`:

```python
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.crypto import encrypt, decrypt, mask_secret
from app.db.models import LLMProfile, MCPServer, AppPreference


# ---------- LLM Profiles ----------

def create_llm_profile(
    session: Session,
    *,
    name: str,
    provider: str,
    base_url: Optional[str],
    model: str,
    api_key: Optional[str],
    params: Optional[dict] = None,
    is_default: bool = False,
) -> LLMProfile:
    if is_default:
        _clear_default_profiles(session)

    profile = LLMProfile(
        name=name,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key_encrypted=encrypt(api_key) if api_key else None,
        params_json=params,
        is_default=is_default,
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


def _clear_default_profiles(session: Session) -> None:
    for p in session.scalars(
        select(LLMProfile).where(LLMProfile.is_default.is_(True))
    ):
        p.is_default = False
    session.flush()


def list_llm_profiles(session: Session) -> list[dict]:
    profiles = session.scalars(select(LLMProfile).order_by(LLMProfile.id)).all()
    result = []
    for p in profiles:
        masked = ""
        if p.api_key_encrypted:
            masked = mask_secret(decrypt(p.api_key_encrypted))
        result.append(
            {
                "id": p.id,
                "name": p.name,
                "provider": p.provider,
                "base_url": p.base_url,
                "model": p.model,
                "api_key": masked,
                "params": p.params_json,
                "is_default": p.is_default,
            }
        )
    return result


def get_decrypted_api_key(session: Session, profile_id: int) -> Optional[str]:
    profile = session.get(LLMProfile, profile_id)
    if profile is None or not profile.api_key_encrypted:
        return None
    return decrypt(profile.api_key_encrypted)


def delete_llm_profile(session: Session, profile_id: int) -> None:
    profile = session.get(LLMProfile, profile_id)
    if profile is not None:
        session.delete(profile)
        session.commit()


# ---------- MCP Servers ----------

def create_mcp_server(
    session: Session,
    *,
    name: str,
    transport: str = "stdio",
    command: Optional[str] = None,
    args: Optional[list] = None,
    env: Optional[dict] = None,
    url: Optional[str] = None,
    enabled: bool = True,
) -> MCPServer:
    server = MCPServer(
        name=name,
        transport=transport,
        command=command,
        args_json=args,
        env_json={k: encrypt(str(v)) for k, v in env.items()} if env else None,
        url=url,
        enabled=enabled,
    )
    session.add(server)
    session.commit()
    session.refresh(server)
    return server


def list_mcp_servers(session: Session) -> list[dict]:
    servers = session.scalars(select(MCPServer).order_by(MCPServer.id)).all()
    result = []
    for s in servers:
        masked_env = None
        if s.env_json:
            masked_env = {k: mask_secret(decrypt(v)) for k, v in s.env_json.items()}
        result.append(
            {
                "id": s.id,
                "name": s.name,
                "transport": s.transport,
                "command": s.command,
                "args": s.args_json,
                "env": masked_env,
                "url": s.url,
                "enabled": s.enabled,
            }
        )
    return result


def get_mcp_server_env(session: Session, server_id: int) -> dict:
    """Return decrypted env for actually launching the MCP server."""
    server = session.get(MCPServer, server_id)
    if server is None or not server.env_json:
        return {}
    return {k: decrypt(v) for k, v in server.env_json.items()}


# ---------- Preferences ----------

def set_preference(session: Session, key: str, value: dict[str, Any]) -> None:
    pref = session.get(AppPreference, key)
    if pref is None:
        session.add(AppPreference(key=key, value_json=value))
    else:
        pref.value_json = value
    session.commit()


def get_preference(session: Session, key: str) -> Optional[dict]:
    pref = session.get(AppPreference, key)
    return pref.value_json if pref is not None else None
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && pytest tests/test_settings_service.py -v`
Expected: 7 passed。

- [ ] **Step 5: 运行全部测试确认整体绿灯**

Run: `cd backend && pytest -v`
Expected: 全部 passed（smoke 1 + paths 2 + crypto 3 + models 3 + settings 7）。

- [ ] **Step 6: 提交**

```bash
git add backend/app/services/__init__.py backend/app/services/settings_service.py backend/tests/test_settings_service.py
git commit -m "feat(backend): add settings service for LLM profiles, MCP servers, prefs"
```

---

## Self-Review

**1. Spec coverage（本阶段应覆盖的 spec 点）**
- SQLite 持久化 + 全部业务表（第 5 节）→ Task 4 ✅
- 配置存储 + API Key 加密（第 9 节）→ Task 3（Fernet）+ Task 5（加密存取、掩码返回）✅
- 密钥存 `~/.searchagent/secret.key`、报告目录（第 9/10 节）→ Task 2（paths）✅
- `langgraph_checkpoints` 由后续 checkpointer 库管理 → 已在 Task 4 说明，不在本阶段 ✅
- LLM 适配、工具层、LangGraph 引擎、API、前端、报告导出 → 属于 Phase 2–6，不在本阶段范围 ✅

**2. Placeholder scan**：无 TBD/TODO；所有代码步骤含完整代码；测试步骤含完整断言。✅

**3. Type consistency**：
- `init_db(url)` 定义于 Task 4，测试与后续均以 `sqlite:///:memory:` 调用 ✅
- `SessionLocal` 在 `session.py` 定义并在测试中使用 ✅
- `create_llm_profile(...)` 关键字参数、`api_key_encrypted` 字段名、`mask_secret` 返回格式（`前缀+****`）在模型/服务/测试三处一致 ✅
- `mask_secret("sk-secret-1234567890")` → 前 4 位 `sk-s` + `****` = `sk-s****`，与测试断言一致 ✅
- MCP `env` 加密存 / 掩码列出 / `get_mcp_server_env` 解密取用，命名一致 ✅

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-06-phase1-backend-foundation.md`.**

> ⚠️ 执行前需确认 conda 环境：本计划的 `pip install -e ".[dev]"` 与 `pytest` 需要一个 Python 环境。按你的项目规范，请先告诉我该用哪个 conda 环境（不要用 base）。

两种执行方式：

1. **Subagent-Driven（推荐）** — 每个 Task 派发一个全新 subagent，任务间我来 review，迭代快。
2. **Inline Execution** — 在当前会话按批次执行，带检查点复核。

你想用哪种方式？确认执行方式与 conda 环境后，我就开始实现 Phase 1。
