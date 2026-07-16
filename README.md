# SearchAgent

SearchAgent 是一个本地优先的 AI 搜索与研究工作台。它通过对话整理研究目标，先生成可确认的研究计划，再使用 LangGraph、LLM 与可插拔 MCP 工具执行检索、汇总证据，并生成带来源的 Markdown/PDF 报告。

界面支持中文和英文，首次访问时默认跟随浏览器语言，手动切换后会在本机保存偏好。

> 当前项目处于 MVP 阶段，适合本地开发与验证。运行研究前需要在设置页配置可用的 LLM Profile；联网检索能力取决于所配置的 MCP 服务或工具。

## 已实现功能

- 对话式创建研究任务与查看历史会话
- 研究计划生成、人工确认及继续执行
- 基于 LangGraph 的可中断、可恢复研究流程
- SSE 实时展示研究状态、来源收集和报告生成进度
- OpenAI、Anthropic 及 OpenAI-compatible LLM 配置
- stdio、SSE、HTTP/streamable HTTP MCP 服务接入
- MCP 不可用时保留内置网页抓取工具作为降级能力
- LLM API Key 和 MCP 环境变量在本地加密存储
- Markdown 报告预览，以及 Markdown/PDF 下载
- 中英文界面、浏览器语言检测与语言偏好持久化

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite、Tailwind CSS、Vitest |
| API | FastAPI、Pydantic、SQLAlchemy、SSE |
| Agent | LangChain、LangGraph、langchain-mcp-adapters |
| 存储 | SQLite、本地文件系统、加密密钥文件 |
| 导出 | markdown-it-py、Playwright/Chromium |

## 环境要求

- Python 3.11+
- Node.js 18+ 和 npm
- PDF 导出需要 Playwright Chromium
- 至少一个可访问的 LLM API
- 可选：Bocha 或其他 MCP 搜索服务

## 本地启动

### 1. 启动后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
python -m playwright install chromium
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

后端健康检查地址为 <http://127.0.0.1:8000/health>，交互式 API 文档位于 <http://127.0.0.1:8000/docs>。

### 2. 启动前端

另开一个终端：

```powershell
cd frontend
npm install
npm run dev
```

打开 <http://127.0.0.1:5173>。Vite 会把 `/api` 和 `/events` 请求代理到本地后端。

## 首次使用

1. 打开右上角设置页，新建一个 LLM Profile。
2. 填写 provider、model、API Key；使用自定义兼容接口时同时填写 base URL。
3. 保存后执行连接测试，并将可用 Profile 设为当前配置。
4. 如需联网检索，在 MCP Servers 中配置 Bocha 或其他 MCP 服务。
5. 返回研究工作区，创建会话、输入研究问题，确认计划后开始执行。

LLM Profile 支持 `openai`、`anthropic` 和 `openai_compatible` 等 LangChain provider。MCP 服务可使用 `stdio`、`sse`、`http` 或 `streamable_http` 传输方式。

## 本地数据与安全

默认数据目录为 `~/.searchagent/`：

```text
~/.searchagent/
├── searchagent.db   # 会话、配置与报告元数据
├── secret.key       # 本地字段加密密钥
└── reports/         # 导出的 Markdown/PDF 报告
```

可通过 `SEARCHAGENT_HOME` 环境变量更改数据目录。例如：

```powershell
$env:SEARCHAGENT_HOME = "C:\data\searchagent"
```

不要提交 API Key、`secret.key`、数据库或导出报告。项目的 `.gitignore` 已排除仓库内的 `.searchagent/`、环境变量文件、依赖、构建产物、测试输出和本地开发文件。

## 测试与构建

后端：

```powershell
cd backend
python -m pytest
```

前端：

```powershell
cd frontend
npm test
npm run build
```

## 项目结构

```text
SearchAgent/
├── backend/
│   ├── app/
│   │   ├── api/       # FastAPI 路由与 SSE
│   │   ├── core/      # 路径、事件和加密
│   │   ├── db/        # SQLite 模型与会话
│   │   ├── engine/    # LangGraph 状态、节点和运行器
│   │   ├── llm/       # LLM provider 与模型工厂
│   │   ├── services/  # 设置和报告导出
│   │   └── tools/     # MCP 客户端与网页抓取
│   └── tests/
├── frontend/
│   └── src/
│       ├── api/        # REST/SSE 客户端
│       ├── components/ # 研究、计划、报告和设置界面
│       └── i18n/       # 中英文资源与语言状态
└── docs/superpowers/
    ├── specs/          # 产品与技术规格
    └── plans/          # 分阶段实现计划
```

## 设计文档

- [总体设计](docs/superpowers/specs/2026-07-06-langchain-mcp-research-agent-design.md)
- [前端本地化设计](docs/superpowers/specs/2026-07-16-frontend-localization-design.md)
- [分阶段实现计划](docs/superpowers/plans/)

## 当前限制

- 仅面向单用户、本地运行，不包含账号、权限和云端部署能力。
- 研究质量与可用工具取决于 LLM 及 MCP 服务配置。
- PDF 导出依赖本机安装的 Playwright Chromium。
