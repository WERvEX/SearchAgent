# Phase 2 — LLM 适配层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 LangChain `init_chat_model` 构建多供应商 LLM 适配层：把用户的 LLM Profile（provider / base_url / api_key / model / 参数）转换成可用的 LangChain chat model 实例，并提供连通性自检。

**Architecture:** 新增 `backend/app/llm` 包，分三个单元：`providers.py`（纯函数：provider 别名映射 + init_chat_model kwargs 解析）、`factory.py`（用解析结果构建 chat model；并能从数据库 Profile 直接构建，负责解密 API Key）、`connectivity.py`（用最小请求测试连通性，返回结构化结果）。全部单元测试通过 monkeypatch `init_chat_model` 与 fake model 实现，不触网。

**Tech Stack:** LangChain（`langchain` 提供 `init_chat_model`）、`langchain-openai`、`langchain-anthropic`；沿用 Phase 1 的 SQLAlchemy 模型与 settings 服务、pytest。

> **依赖 Phase 1**：`app.db.models.LLMProfile`、`app.services.settings_service.get_decrypted_api_key`、`app.db.session`（测试用 `init_db("sqlite:///:memory:")` + `app_home` fixture）。

> **环境**：使用 conda 环境 `searchagent`。Windows 运行测试的已知技巧见下（与 Phase 1 相同）。

---

## File Structure（本阶段涉及文件）

- Modify: `backend/pyproject.toml` — 增加 langchain 依赖
- Create: `backend/app/llm/__init__.py`
- Create: `backend/app/llm/providers.py` — provider 别名 + `resolve_init_kwargs`（纯函数）
- Create: `backend/app/llm/factory.py` — `build_chat_model` + `build_chat_model_from_profile`
- Create: `backend/app/llm/connectivity.py` — `check_connection` + `check_profile_connection`
- Create: `backend/tests/test_llm_providers.py`
- Create: `backend/tests/test_llm_factory.py`
- Create: `backend/tests/test_llm_connectivity.py`

**Windows 测试运行方式（每个 Task 都用）**：从 `backend/` 执行
`set PYTHONIOENCODING=utf-8` 然后
`C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest <file> -v --basetemp=.pytest_tmp`
测试后删除 `.pytest_tmp`（勿提交）。若前台命令因沙箱报 "Sandbox policy 'workspace_readwrite' is not supported" 而挂起，用 `required_permissions: ["all"]` 重跑。PowerShell 用 `;` 连接命令。

---

## Task 1: 增加依赖 + provider 解析（providers.py）

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/app/llm/__init__.py`
- Create: `backend/app/llm/providers.py`
- Create: `backend/tests/test_llm_providers.py`

- [ ] **Step 1: 修改 `backend/pyproject.toml`，在 `dependencies` 列表中追加 langchain 依赖**

把 dependencies 从：

```toml
dependencies = [
    "sqlalchemy>=2.0,<3.0",
    "pydantic>=2.6,<3.0",
    "cryptography>=42.0",
    "python-dotenv>=1.0",
]
```

改为：

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

- [ ] **Step 2: 安装新依赖（searchagent 环境）**

Run: `conda activate searchagent`（或用 env 解释器）然后 `cd backend && pip install -e ".[dev]"`
Expected: 成功安装 langchain / langchain-openai / langchain-anthropic 及其依赖。

- [ ] **Step 3: 写失败测试 `backend/tests/test_llm_providers.py`**

```python
from app.llm import providers


def test_resolve_provider_passthrough():
    assert providers.resolve_provider("openai") == "openai"
    assert providers.resolve_provider("anthropic") == "anthropic"


def test_resolve_provider_aliases_compatible_to_openai():
    assert providers.resolve_provider("openai_compatible") == "openai"
    assert providers.resolve_provider("compatible") == "openai"


def test_resolve_init_kwargs_openai_full():
    kwargs = providers.resolve_init_kwargs(
        provider="openai",
        model="gpt-4o",
        base_url="https://api.openai.com/v1",
        api_key="sk-x",
        params={"temperature": 0.2},
    )
    assert kwargs == {
        "model": "gpt-4o",
        "model_provider": "openai",
        "base_url": "https://api.openai.com/v1",
        "api_key": "sk-x",
        "temperature": 0.2,
    }


def test_resolve_init_kwargs_drops_none_and_empty():
    kwargs = providers.resolve_init_kwargs(
        provider="anthropic",
        model="claude-3-5-sonnet-latest",
        base_url=None,
        api_key=None,
        params=None,
    )
    assert kwargs == {
        "model": "claude-3-5-sonnet-latest",
        "model_provider": "anthropic",
    }


def test_resolve_init_kwargs_compatible_provider_resolved():
    kwargs = providers.resolve_init_kwargs(
        provider="openai_compatible",
        model="qwen-max",
        base_url="https://dashscope.example/v1",
        api_key="key",
    )
    assert kwargs["model_provider"] == "openai"
    assert kwargs["base_url"] == "https://dashscope.example/v1"
```

- [ ] **Step 4: 运行确认失败**

Run: `pytest tests/test_llm_providers.py -v`（env 解释器）
Expected: FAIL —— `ModuleNotFoundError: No module named 'app.llm'`。

- [ ] **Step 5: 创建 `backend/app/llm/__init__.py`（空）与 `backend/app/llm/providers.py`**

`backend/app/llm/__init__.py`:

```python
```

`backend/app/llm/providers.py`:

```python
from typing import Optional

# Providers exposing an OpenAI-compatible API are driven through the
# langchain "openai" integration with a custom base_url.
PROVIDER_ALIASES = {
    "openai_compatible": "openai",
    "compatible": "openai",
}


def resolve_provider(provider: str) -> str:
    return PROVIDER_ALIASES.get(provider, provider)


def resolve_init_kwargs(
    *,
    provider: str,
    model: str,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    params: Optional[dict] = None,
) -> dict:
    """Build the keyword arguments passed to langchain.init_chat_model.

    None/empty base_url and api_key are omitted so provider defaults apply.
    `params` (e.g. temperature) are flattened into the kwargs.
    """
    kwargs: dict = {
        "model": model,
        "model_provider": resolve_provider(provider),
    }
    if base_url:
        kwargs["base_url"] = base_url
    if api_key:
        kwargs["api_key"] = api_key
    if params:
        kwargs.update(params)
    return kwargs
```

- [ ] **Step 6: 运行确认通过**

Run: `pytest tests/test_llm_providers.py -v`
Expected: 5 passed。

- [ ] **Step 7: 提交**

```bash
git add backend/pyproject.toml backend/app/llm/__init__.py backend/app/llm/providers.py backend/tests/test_llm_providers.py
git commit -m "feat(llm): add langchain deps and provider kwargs resolution"
```

---

## Task 2: chat model 工厂（factory.py）

**Files:**
- Create: `backend/app/llm/factory.py`
- Create: `backend/tests/test_llm_factory.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_llm_factory.py`**

```python
import pytest


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


def test_build_chat_model_passes_resolved_kwargs(monkeypatch):
    from app.llm import factory

    captured = {}

    def fake_init_chat_model(**kwargs):
        captured.update(kwargs)
        return "FAKE_MODEL"

    monkeypatch.setattr(factory, "init_chat_model", fake_init_chat_model)

    model = factory.build_chat_model(
        provider="openai_compatible",
        model="qwen-max",
        base_url="https://dashscope.example/v1",
        api_key="sk-123",
        params={"temperature": 0.1},
    )

    assert model == "FAKE_MODEL"
    assert captured == {
        "model": "qwen-max",
        "model_provider": "openai",
        "base_url": "https://dashscope.example/v1",
        "api_key": "sk-123",
        "temperature": 0.1,
    }


def test_build_chat_model_from_profile_uses_decrypted_key(session, monkeypatch):
    from app.llm import factory
    from app.services import settings_service as svc

    profile = svc.create_llm_profile(
        session,
        name="main",
        provider="openai",
        base_url="https://api.openai.com/v1",
        model="gpt-4o",
        api_key="sk-plaintext-secret",
        params={"temperature": 0.0},
    )

    captured = {}

    def fake_init_chat_model(**kwargs):
        captured.update(kwargs)
        return "FAKE_MODEL"

    monkeypatch.setattr(factory, "init_chat_model", fake_init_chat_model)

    model = factory.build_chat_model_from_profile(session, profile.id)

    assert model == "FAKE_MODEL"
    # The decrypted (plaintext) key must be forwarded, not the encrypted/masked form.
    assert captured["api_key"] == "sk-plaintext-secret"
    assert captured["model"] == "gpt-4o"
    assert captured["model_provider"] == "openai"
    assert captured["base_url"] == "https://api.openai.com/v1"
    assert captured["temperature"] == 0.0


def test_build_chat_model_from_profile_missing_raises(session):
    from app.llm import factory

    with pytest.raises(ValueError):
        factory.build_chat_model_from_profile(session, 99999)
```

- [ ] **Step 2: 运行确认失败**

Run: `pytest tests/test_llm_factory.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'app.llm.factory'`（或 AttributeError）。

- [ ] **Step 3: 创建 `backend/app/llm/factory.py`**

```python
from typing import Optional

from langchain.chat_models import init_chat_model
from sqlalchemy.orm import Session

from app.db.models import LLMProfile
from app.llm.providers import resolve_init_kwargs
from app.services.settings_service import get_decrypted_api_key


def build_chat_model(
    *,
    provider: str,
    model: str,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    params: Optional[dict] = None,
):
    """Build a LangChain chat model from explicit (plaintext) config."""
    kwargs = resolve_init_kwargs(
        provider=provider,
        model=model,
        base_url=base_url,
        api_key=api_key,
        params=params,
    )
    return init_chat_model(**kwargs)


def build_chat_model_from_profile(session: Session, profile_id: int):
    """Load an LLM profile from the DB and build its chat model.

    Decrypts the stored API key for actual use.
    """
    profile = session.get(LLMProfile, profile_id)
    if profile is None:
        raise ValueError(f"LLM profile {profile_id} not found")

    api_key = get_decrypted_api_key(session, profile_id)
    return build_chat_model(
        provider=profile.provider,
        model=profile.model,
        base_url=profile.base_url,
        api_key=api_key,
        params=profile.params_json,
    )
```

- [ ] **Step 4: 运行确认通过**

Run: `pytest tests/test_llm_factory.py -v`
Expected: 3 passed。

- [ ] **Step 5: 提交**

```bash
git add backend/app/llm/factory.py backend/tests/test_llm_factory.py
git commit -m "feat(llm): add chat model factory and build-from-profile"
```

---

## Task 3: 连通性自检（connectivity.py）

**Files:**
- Create: `backend/app/llm/connectivity.py`
- Create: `backend/tests/test_llm_connectivity.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_llm_connectivity.py`**

```python
import pytest


@pytest.fixture()
def session(app_home):
    import app.db.session as db

    engine = db.init_db("sqlite:///:memory:")
    with db.SessionLocal() as s:
        yield s
    engine.dispose()


class _OkModel:
    def invoke(self, _input):
        class _Msg:
            content = "pong"
        return _Msg()


class _FailModel:
    def invoke(self, _input):
        raise RuntimeError("401 Unauthorized")


def test_check_connection_ok():
    from app.llm import connectivity

    result = connectivity.check_connection(_OkModel())

    assert result["ok"] is True
    assert result["error"] is None


def test_check_connection_error_captures_message():
    from app.llm import connectivity

    result = connectivity.check_connection(_FailModel())

    assert result["ok"] is False
    assert "401 Unauthorized" in result["error"]


def test_check_profile_connection_build_failure(session, monkeypatch):
    from app.llm import connectivity

    def boom(*args, **kwargs):
        raise ValueError("no such profile")

    monkeypatch.setattr(connectivity, "build_chat_model_from_profile", boom)

    result = connectivity.check_profile_connection(session, 12345)

    assert result["ok"] is False
    assert "no such profile" in result["error"]


def test_check_profile_connection_ok(session, monkeypatch):
    from app.llm import connectivity

    monkeypatch.setattr(
        connectivity, "build_chat_model_from_profile",
        lambda s, pid: _OkModel(),
    )

    result = connectivity.check_profile_connection(session, 1)

    assert result["ok"] is True
    assert result["error"] is None
```

- [ ] **Step 2: 运行确认失败**

Run: `pytest tests/test_llm_connectivity.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'app.llm.connectivity'`。

- [ ] **Step 3: 创建 `backend/app/llm/connectivity.py`**

```python
from sqlalchemy.orm import Session

from app.llm.factory import build_chat_model_from_profile


def check_connection(model) -> dict:
    """Send a minimal request to verify the model is reachable/usable.

    Returns {"ok": bool, "error": Optional[str]}. Never raises.
    """
    try:
        model.invoke("ping")
        return {"ok": True, "error": None}
    except Exception as exc:  # noqa: BLE001 - surface any provider error to the user
        return {"ok": False, "error": str(exc)}


def check_profile_connection(session: Session, profile_id: int) -> dict:
    """Build the model for a stored profile and test its connectivity."""
    try:
        model = build_chat_model_from_profile(session, profile_id)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
    return check_connection(model)
```

- [ ] **Step 4: 运行确认通过**

Run: `pytest tests/test_llm_connectivity.py -v`
Expected: 4 passed。

- [ ] **Step 5: 运行全部测试确认整体绿灯**

Run: `pytest -v --basetemp=.pytest_tmp`（env 解释器）
Expected: Phase 1 的 18 + Phase 2 的 12（providers 5 + factory 3 + connectivity 4）= 30 passed。删除 `.pytest_tmp`。

- [ ] **Step 6: 提交**

```bash
git add backend/app/llm/connectivity.py backend/tests/test_llm_connectivity.py
git commit -m "feat(llm): add connectivity self-check for chat models"
```

---

## Self-Review

**1. Spec coverage（对应设计文档第 7 节 LLM 适配层）**
- 多 Profile → `init_chat_model` 统一实例化（provider / base_url / api_key / model / params）→ Task 1（解析）+ Task 2（构建）✅
- OpenAI 兼容端点走 `openai` provider + 自定义 base_url → Task 1 别名映射 ✅
- 从存储的 Profile 构建并解密 API Key → Task 2 `build_chat_model_from_profile` ✅
- 连通性自检（设置页"测试连接"后端）→ Task 3 `check_profile_connection` ✅
- 按用途分配模型（强/快模型）→ 设计里标注为"预留/可选"，本阶段不实现（YAGNI），后续阶段按需增加 ✅

**2. Placeholder scan**：无 TBD/TODO；所有步骤含完整代码与命令。✅

**3. Type consistency**：
- `resolve_init_kwargs(*, provider, model, base_url, api_key, params)` 关键字签名在 providers/factory/测试三处一致 ✅
- `build_chat_model(*, provider, model, base_url, api_key, params)` 与 `build_chat_model_from_profile(session, profile_id)` 命名/参数在 factory/connectivity/测试一致 ✅
- `init_chat_model` 在 factory 中 `from langchain.chat_models import init_chat_model` 导入；测试通过 `monkeypatch.setattr(factory, "init_chat_model", ...)` 覆盖，路径一致 ✅
- `check_connection`/`check_profile_connection` 返回 `{"ok": bool, "error": Optional[str]}` 统一契约 ✅
- 复用 Phase 1：`LLMProfile`、`get_decrypted_api_key`、`init_db`/`SessionLocal`/`app_home` fixture，名称与 Phase 1 实现一致 ✅

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-06-phase2-llm-adapter.md`.**

执行采用 Subagent-Driven（与 Phase 1 一致），conda 环境 `searchagent`，分支 `phase2-llm-adapter`。
