# LangChain + MCP 搜索与研究 Agent — 设计文档

- 日期：2026-07-06
- 状态：设计已确认，待编写实现计划
- 定位：本地开源、个人使用的对话式搜索/研究 Agent；预留可视化与部署空间

## 1. 目标与范围

构建一个基于 LangChain + MCP 的搜索与研究 Agent。用户通过对话确定研究方向，Agent
解析出研究计划并以"类 Claude plan 模式"输出可选方案供确认；确认执行后，LLM 生成具体
执行步骤与验收标准，通过（默认博查 Bocha）搜索、可插拔 MCP 服务器、以及模型原生联网
搜索能力检索网络内容，最终产出一份带引用的报告，可在线预览并导出 `.md` / `.pdf`。所有
研究记录完整持久化，可浏览与回放。

### 非目标（v1，YAGNI）

- 不做登录鉴权、不做多用户、不做云端同步、不做插件市场。
- 可视化与部署仅"留接口/留空间"，v1 不实现。

## 2. 已确认的关键决策

| 维度 | 决策 |
| --- | --- |
| 形态 | 本地 Web 应用 |
| 技术栈 | FastAPI 后端 + React（Vite + Tailwind）前端 |
| 实时链路 | 方案 A：SSE 流式推送 + REST 控制 |
| 搜索 | 默认博查 Bocha；支持用户自定义 MCP 服务器；模型原生联网搜索作备选 |
| LLM 接入 | LangChain 原生 `init_chat_model`，多供应商，用户自填 baseUrl/apiKey/model |
| 编排 | LangGraph（human-in-the-loop + checkpoint 续跑） |
| 持久化 | SQLite，完整保存对话/计划/步骤/来源/报告 |
| 报告 | Markdown 单一事实来源，预览 + 导出 .md / .pdf（Playwright 打印 PDF） |
| 鉴权 | 单用户本地运行，无登录 |

## 3. 整体架构与模块划分

三层结构：**React 前端** ↔ **FastAPI 应用层** ↔ **LangGraph 研究引擎**，外挂 SQLite
持久化、LLM 提供商适配层、MCP/搜索工具层。

```
┌───────────────────────────── React 前端 (Vite + Tailwind) ─────────────────────────────┐
│  对话面板 │ Plan 确认面板 │ 研究进度/来源流 │ 报告预览&导出 │ 历史记录 │ 设置(LLM/MCP/搜索)   │
└───────────▲─────────────────────────────────────────────────────────▲───────────────────┘
            │  SSE (流式推送: token/进度/来源/中断事件)                 │ REST (控制/CRUD)
┌───────────┴─────────────────────────────────────────────────────────┴───────────────────┐
│                              FastAPI 应用层 (API + SSE 网关)                                │
│   /conversations  /research(run/resume)  /reports  /settings  /mcp  /events(SSE)          │
│   ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐  ┌───────────────────────┐    │
│   │ Session/事件总线 │  │ 配置服务(密钥加密) │  │ 报告导出服务   │  │ MCP 客户端管理器        │    │
│   └────────────────┘  └─────────────────┘  └──────────────┘  └───────────────────────┘    │
└───────────▲───────────────────────────────────────────────────────────────────▲──────────┘
            │  调用/流式回调                                                      │ 工具调用
┌───────────┴────────────────── LangGraph 研究引擎 ──────────────┐   ┌───────────┴──────────┐
│  意图澄清 → 计划生成 → [interrupt 计划确认] → 步骤&验收标准 →     │   │ 工具层                │
│  执行研究(搜索/抓取循环) → 证据聚合 → 报告撰写                    │   │ · Bocha 搜索(默认)     │
│  Checkpointer(断点续跑) + 状态(State)                          │   │ · 自定义 MCP 服务器     │
└───────────▲────────────────────────────────────────────────────┘   │ · 模型原生 web search   │
            │                                                         └──────────────────────┘
┌───────────┴──────────── SQLite ────────────┐   ┌──────────────── LLM 适配层 ───────────────┐
│ 会话/消息/研究项目/计划/步骤/来源/报告版本   │   │ LangChain init_chat_model, 多 provider     │
│ + LangGraph checkpoints                     │   │ 用户填 baseUrl/apiKey/model, 密钥加密存储   │
└─────────────────────────────────────────────┘   └────────────────────────────────────────────┘
```

模块职责（边界清晰、可独立测试）：

- **前端**：纯展示 + 交互，通过 REST 发指令、订阅 SSE 更新，不含业务逻辑。
- **FastAPI 应用层**：HTTP/SSE 接口、会话与事件总线、配置管理（含密钥加密）、报告导出、
  MCP 连接管理。
- **LangGraph 研究引擎**：核心状态机，封装"澄清→计划→确认→执行→报告"全流程，暴露
  `run` / `resume` 两个入口。
- **工具层**：统一搜索/抓取接口，博查为默认实现，MCP 服务器与模型原生搜索为可插拔实现。
- **LLM 适配层**：把用户配置转成 LangChain chat model 实例，屏蔽 provider 差异。
- **SQLite 持久化**：业务数据 + LangGraph checkpoint 共库（不同表），历史可回放、断点可续。

## 4. 实时通信（方案 A：SSE + REST）

- LLM 逐字输出、研究进度、来源发现、"待确认"中断事件通过 **SSE** 单向推送前端。
- 用户动作（确认计划 / 选项 / 编辑 / 打回 / 执行）走普通 **REST POST**。
- LangGraph 在计划节点 `interrupt()` 暂停并落 checkpoint；用户 POST 决策后以
  `Command(resume=...)` 续跑。
- 后续如需双向实时协作，可平滑升级 WebSocket，数据模型不变。

## 5. 数据模型（SQLite）

业务表：

- `conversations`：会话（id, title, created_at, updated_at, status）
- `messages`：对话消息（id, conversation_id, role, content, meta_json, created_at）
- `research_projects`：研究项目（id, conversation_id, topic, objective,
  status[draft/planning/awaiting_approval/running/done/failed/canceled], created_at）
- `plans`：计划（id, project_id, version, summary, options_json, chosen_option, created_at）
- `steps`：执行步骤（id, project_id, seq, title, description,
  status[pending/running/done/failed], result_summary）
- `acceptance_criteria`：验收标准（id, project_id, description, met[bool], evidence_ref）
- `sources`：来源引用（id, project_id, step_id, url, title, snippet, retrieved_at, tool_name）
- `reports`：报告版本（id, project_id, version, format, content_md, file_path, created_at）
- `settings`：应用配置（LLM profiles、MCP server 列表、搜索偏好；密钥加密存储）
- `langgraph_checkpoints`：LangGraph 官方 checkpointer 表（断点续跑，独立管理）

## 6. LangGraph 研究流程状态机

State（贯穿全流程的共享状态，示意）：

```python
class ResearchState(TypedDict):
    conversation_id: str
    project_id: str
    messages: Annotated[list, add_messages]   # 对话历史
    objective: str                            # 澄清后的研究目标
    plan: dict | None                         # 计划 + 可选项
    approved: bool                            # 用户是否已确认计划
    steps: list[dict]                         # 步骤 + 验收标准
    findings: list[dict]                      # 累积证据(含来源)
    report_md: str | None
```

节点与流转：

```
[clarify_intent] ──(信息不足)──► 回到对话, 追问用户
      │(信息充分)
      ▼
[generate_plan] ── 产出 计划摘要 + 2~3 个可选方案/侧重点
      │
      ▼
◇ interrupt: await_plan_approval ◇ ◄─── 前端 Plan 面板: 确认/选选项/编辑/打回重规划
      │(用户确认执行)
      ▼
[derive_steps] ── 生成 具体执行步骤 + 验收标准 (写入 steps / acceptance_criteria)
      │
      ▼
[execute_research] ◄──┐  按步骤循环: 生成查询 → 调搜索/MCP工具 → 抓取正文 → 抽取&记录来源 → 判定步骤完成
      │                │  (逐步骤/逐来源通过 SSE 推送进度)
      └──(还有步骤)────┘
      │(全部完成)
      ▼
[aggregate_evidence] ── 去重/归类证据, 校验验收标准是否满足
      │
      ▼
[write_report] ── 生成带引用脚注的 Markdown 报告 → 写入 reports(version)
      │
      ▼
    END
```

关键设计点：

- **中断点**：`generate_plan` 后 `interrupt()` 暂停并落 checkpoint；用户决策经 REST 传入，
  `Command(resume=...)` 续跑——即"类 Claude plan 模式"的落点。
- **可打回**：Plan 面板选"重新规划"，携反馈回到 `generate_plan`，生成新 `plan.version`。
- **可续跑/可恢复**：任何阶段中断（关页面、报错）凭 checkpoint 恢复到最近节点。
- **执行循环**：`execute_research` 为"步骤级 + 查询级"受控循环，带最大轮次/来源上限防失控，
  每次工具调用都记来源。

## 7. LLM 适配层

- 用户维护多个 **LLM Profile**：`name / provider(openai|anthropic|openai_compatible|...) /
  base_url / api_key / model / 参数(temperature 等)`。
- 通过 `init_chat_model(model, model_provider=..., base_url=..., api_key=...)` 统一实例化；
  OpenAI 兼容端点走 `openai` provider + 自定义 `base_url`，覆盖大量国产/自建服务。
- **按用途分配模型**（预留）：如规划/报告用强模型、执行检索用快模型；默认统一 profile。
- **连通性自检**：设置页"测试连接"按钮，后端发最小请求校验 key/baseUrl/model。

## 8. 搜索 / MCP 工具层

统一 `SearchTool` 抽象，可插拔实现：

- **统一接口**：`search(query) -> [{title,url,snippet}]` 与 `fetch(url) -> text`，供执行节点
  调用；所有结果统一写入 `sources`。
- **默认实现：博查 Bocha**。Bocha 提供 Web Search API 与 MCP 服务；默认走其 MCP 服务器
  （契合 MCP 主线），用户在设置填 Bocha API Key 即可。
- **自定义 MCP 服务器**：配置声明（stdio: `command/args/env`；或 streamable-http/SSE: `url`），
  用 `langchain-mcp-adapters` 把 MCP 工具自动转成 LangChain 工具注入 Agent；支持搜索/抓取/
  读文件等任意 MCP。
- **模型原生联网搜索（备选）**：provider 支持（OpenAI/Anthropic 的 web search）时，作为可开关
  的 `SearchTool` 实现。
- **抓取正文**：对结果 URL 做正文提取（去广告/导航）；无 MCP 抓取工具时用内置轻量提取兜底。
- **工具选择策略**：优先"已启用且可用"的搜索源，可配置优先级；单次研究的来源数、抓取字数
  设上限，避免 token/时间失控。

## 9. 配置与密钥管理

- 所有配置存 SQLite `settings`；**敏感字段（API Key 等）加密存储**：本地生成对称密钥
  （存 `~/.searchagent/secret.key`，权限受限），用 Fernet 对敏感字段加解密。
- 配置分组：`LLM Profiles`、`搜索与 MCP 服务器`、`通用偏好（默认模型、来源上限、报告语言=
  中文默认）`。
- **首次启动引导**：无 LLM profile 时，前端引导先配置并"测试连接"，再开始研究。
- **密钥不回传明文**：读取配置时敏感字段以掩码（`sk-****`）返回，仅后端解密使用。

## 10. 报告预览与导出

- 报告以 **Markdown** 为单一事实来源，含带编号引用脚注（关联 `sources`），末尾自动生成
  "参考来源"列表。
- **前端预览**：渲染 Markdown（标题/表格/代码/链接），来源可点击跳转。
- **导出 .md**：直接落盘。
- **导出 .pdf**：后端用 **Playwright（Headless Chromium）** 将渲染后 HTML 打印为 PDF，
  跨平台（含 Windows）一致、中文/排版友好。（备选 WeasyPrint，因中文字体/复杂排版较弱未选）
- 导出默认存 `~/.searchagent/reports/<project>/`，记录 `reports.file_path`；同一研究多版本报告。

## 11. 项目目录结构（monorepo）

```
SearchAgent/
├─ backend/
│  ├─ app/
│  │  ├─ main.py                # FastAPI 入口
│  │  ├─ api/                   # 路由: conversations/research/reports/settings/mcp/events(SSE)
│  │  ├─ core/                  # 配置、加密、事件总线、日志
│  │  ├─ engine/                # LangGraph: state / nodes / graph / checkpointer
│  │  ├─ llm/                   # LLM 适配 (init_chat_model 封装, profile 解析)
│  │  ├─ tools/                 # SearchTool 抽象 + bocha / mcp_adapter / native_search / fetch
│  │  ├─ services/              # report_export / persistence 服务
│  │  ├─ db/                    # SQLAlchemy 模型 + 迁移
│  │  └─ schemas/               # Pydantic DTO
│  ├─ tests/
│  ├─ pyproject.toml            # 依赖与版本
│  └─ README.md
├─ frontend/
│  ├─ src/
│  │  ├─ pages/                 # Chat / Plan / Research / Report / History / Settings
│  │  ├─ components/            # 复用组件
│  │  ├─ api/                   # REST 客户端 + SSE 订阅
│  │  └─ store/                 # 前端状态
│  ├─ package.json
│  └─ vite.config.ts
├─ docs/superpowers/specs/      # 本设计文档所在
├─ .env.example
└─ README.md                    # 一键启动说明
```

## 12. MVP（v1）范围

1. 会话对话澄清研究方向
2. 计划生成 + Plan 确认面板（确认/选项/编辑/打回）
3. 步骤 + 验收标准生成
4. 执行研究：博查搜索 + 正文抓取 + 来源记录（自定义 MCP、模型原生搜索作为可启用项）
5. 带引用的 Markdown 报告：预览 + 导出 .md / .pdf
6. SQLite 完整持久化 + 历史记录浏览/回放
7. 设置页：LLM Profiles、搜索/MCP、密钥加密、测试连接
8. 单用户本地运行（无登录鉴权）

## 13. 后续预留（非 v1）

- 可视化：研究过程图谱、来源关系图、进度看板（前端已分层，加页面即可）。
- 部署：容器化 + 可选多用户/鉴权（应用层已抽象会话，可加 auth 中间件）。
- 协作/多端：SSE 平滑升级 WebSocket，数据模型不变。
- 报告模板与更多导出格式（docx/html）。

## 14. 主要风险与对策

- **研究失控（token/时间）**：步骤/来源/轮次上限 + 可中断。
- **provider 差异**：优先 OpenAI 兼容路径；`init_chat_model` 分 provider 处理；"测试连接"前置。
- **PDF 中文排版**：选 Playwright/Chromium 保证一致性。
- **密钥安全**：本地加密存储 + 掩码返回，不入前端明文、不入日志。
- **MCP 服务器不稳定**：连接失败降级到其他已启用搜索源，错误对用户可见。
