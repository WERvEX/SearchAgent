# SearchAgent

SearchAgent 是一个面向开发者的 AI 开发启动工作台，帮助你把“想做一个新项目或新功能”推进到可以执行的实施计划。它采用类似 vibe coding 和 Codex Plan Mode 的多轮对话流程，先梳理问题和约束，再搜索可复用的开源项目、服务、官方文档与技术资料，最后给出经过验证的实现路径。

系统提供两个入口：默认的“通用研究”用于规划、检索、核验和写作；“项目/功能启动”则围绕目标、用户场景、成功标准和待验证假设展开问题梳理，比较候选方案，并让用户明确选择哪些内容仅作参考、哪些内容纳入实施计划。计划确认后，可以生成面向开发者阅读的 Markdown、面向后续 AI 消费的紧凑 JSON，或同时生成两者。

会话、问题定义、候选决策、版本化计划、执行进度和报告都保存在本地，支持中断恢复与历史追踪。工作流模式在会话开始后锁定，确保后续聊天、检索和恢复始终沿用同一套上下文。

> 项目目前面向本地单用户开发与验证。开始使用前，必须配置至少一个可用的模型 API；需要联网检索时，还应配置 Bocha 或其他 MCP 搜索服务。系统不会自动 clone、fork、安装依赖、执行脚本或修改用户仓库。

## 工作流程

```text
通用研究：规划对话 → 澄清问答 → 最终计划 → 执行研究 → 实时进度 → 最终报告
开发启动：问题梳理 → 候选检索 → 参考/采用决策 → 详细计划 → 输出选择 → 验证总结
```

1. 在聊天中描述研究目标；信息不足时，助手会给出最多三个单选问题，也可以自行输入答案。
   新会话可以切换到“项目/功能启动”模式；该模式会先形成问题定义，再检索 GitHub 仓库和官方文档候选。
2. 信息充分后，时间线中出现版本化计划卡片。继续聊天会生成新版本，只有最新计划可以执行。
3. 点击“执行计划”后，输入框暂时锁定；关键进度显示在时间线，步骤、来源和日志可在详情抽屉中查看。
4. 完成后可分章节阅读报告、跳转引用来源，并下载 Markdown 或 PDF。
5. 对报告继续提问时，系统会判断是修改现有报告，还是开启新一轮规划，并允许纠正判断。
6. 开发启动模式在执行计划时可选择人类 Markdown、AI-friendly JSON 或同时生成两者；“采用”候选只进入文本计划，不会自动安装或修改仓库。

### 开发启动模式说明

开发启动模式适合开始一个新项目或新功能。它会先把目标、用户/场景、约束、非目标、成功标准和待验证假设整理成问题定义，再搜索可复用的开源项目、服务和官方文档。

- 每轮问题梳理最多提出三个结构化问题；每题支持预设选项和自定义答案。
- 候选结果会保留名称、URL、来源类型、许可证、版本/分支、活跃度和证据引用。
- “参考”只作为比较证据；“采用”会进入实施计划，并说明使用方式、集成边界、替代方案和验证方式。
- 工作流只允许在发送第一条消息前切换。会话创建 run 后模式锁定，继续聊天和恢复中断都会沿用该模式；如需切换，请新建会话。

开发启动模式支持两种报告输出：

| 输出 | 用途 | 内容 |
| --- | --- | --- |
| Markdown | 人类阅读 | 问题定义、候选比较、决策、实施计划、验证结果、风险和引用 |
| JSON | AI 阅读 | 固定字段顺序和稳定 ID，去除重复摘要，保留版本、许可证、来源 URL、验证状态和不确定性 |

AI 输出遵循 `schema_version: "1.0"` 的紧凑契约：

```json
{
  "schema_version": "1.0",
  "workflow": "development_start",
  "problem": {},
  "decisions": {},
  "candidates": [],
  "plan": {},
  "findings": [],
  "verification": [],
  "next_actions": [],
  "sources": []
}
```

系统只保存与决策相关的短摘录，不保存原始网页全文，也不会自动 clone、fork、安装依赖、执行脚本或修改用户仓库。

## 主要功能

- 单滚动聊天时间线，集中展示规划消息、问答、计划、执行状态和历次报告
- 首次访问自动创建会话；支持历史恢复、重命名和删除
- 结构化澄清卡片，支持预设选项和用户自定义答案
- 可中断、可恢复的 LangGraph 研究流程和版本化执行计划
- 基于 SSE 的实时阶段、步骤、来源和异常进度
- 折叠式报告结构、可点击引用、来源定位及报告版本切换
- Markdown 下载，以及带生成状态、失败提示和重试的 PDF 导出
- 开发启动专用 GitHub 公开仓库搜索、仓库元数据和官方文档抓取工具
- 候选项目的参考/采用决策、详细搜索任务、验证任务和风险记录
- 人类 Markdown 与 AI JSON 报告，可分别下载或同时生成
- OpenAI-compatible 与 Anthropic 两种模型兼容格式
- OpenAI、Anthropic、DeepSeek、Xiaomi MiMo、Alibaba Qwen 和自定义服务预设
- 本地 stdio 与远程 HTTP MCP 服务配置、测试和编辑
- API Key 与 MCP 环境变量本地加密存储
- 规划、检索、核验、写作四类 Agent 任务编排，检索任务最多三路协作
- 本地 Trace、工具调用审计、Agent 级工具策略和运行中授权确认
- 本地评测数据集、确定性指标及可选独立 LLM 裁判配置
- 中英文界面、浏览器语言检测和语言偏好持久化

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite、Tailwind CSS、Vitest |
| API | FastAPI、Pydantic、SQLAlchemy、SSE |
| Agent | LangChain、LangGraph、langchain-mcp-adapters |
| 存储 | SQLite、LangGraph SQLite checkpoint、本地文件系统 |
| 导出 | markdown-it-py、Playwright/Chromium |

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+ 和 npm
- 至少一个可访问的 LLM API
- PDF 导出推荐安装 Playwright Chromium
- 联网研究推荐准备 Bocha API Key 或其他搜索 MCP 服务

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

可用地址：

- 健康检查：<http://127.0.0.1:8000/health>
- API 文档：<http://127.0.0.1:8000/docs>

### 2. 启动前端

另开一个终端：

```powershell
cd frontend
npm install
npm run dev
```

访问 <http://127.0.0.1:5173>。开发服务器会把 `/api` 和 `/events` 代理到 `127.0.0.1:8000`。

## 关键接口

所有接口通过前端开发服务器的 `/api` 代理访问；直接运行后端时可使用 `http://127.0.0.1:8000` 前缀。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/research/start` | 启动研究；`workflow_mode` 可选 `research` 或 `development_start` |
| `POST` | `/research/{thread_id}/resume` | 提交问题确认、候选决策、计划确认、输出格式和工具审批 |
| `GET` | `/research/active/{conversation_id}` | 恢复会话中的活动 run |
| `GET` | `/reports/{report_id}/download.md` | 下载 Markdown 报告 |
| `GET` | `/reports/{report_id}/download.json` | 下载 AI JSON 报告 |
| `GET` | `/reports/{report_id}/download.pdf` | 下载 PDF 报告 |

开发启动模式的恢复决策通过 `decision.kind` 区分，例如 `problem_confirm`、`candidate_selection` 和 `execute_plan`。旧版研究请求和旧版计划确认仍保持兼容。

## 首次配置

### 模型 API

打开“设置 → 模型 API”，选择提供商预设和兼容格式，再填写模型名称与 API Key。

- OpenAI-compatible：适用于 OpenAI、DeepSeek、MiMo、Qwen 兼容接口及大多数第三方服务。
- Anthropic：适用于 Anthropic Messages API，或明确提供 Anthropic 兼容接口的服务。
- Custom：手动填写 Base URL；应填写 API 根地址，不要填完整的 `/chat/completions` 请求地址。

保存后先点击连接测试，再将该配置设为当前模型。模型、地址或密钥发生变化时，可直接编辑已有配置。

### Bocha 搜索

在“设置 → MCP 服务”中新建以下本地服务：

| 字段 | 值 |
| --- | --- |
| 名称 | `bocha` |
| 类型 | 本地命令（stdio） |
| 命令 | `npx` |
| 参数 | `-y` 和 `@humansean/mcp-bocha`，每行一个 |
| 环境变量 | `BOCHA_API_KEY=你的密钥` |

SearchAgent 会识别名为 `bocha` 的配置，并使用保存的密钥调用内置 Bocha 搜索适配器。其他工具可以按其文档配置为 stdio 命令或远程 HTTP MCP 服务。

不配置搜索服务时，系统仍可抓取模型已经知道的网页地址，但无法可靠完成开放式网络搜索。

## 本地数据与安全

默认数据目录为用户主目录下的 `.searchagent`：

```text
~/.searchagent/
├── searchagent.db   # 会话、消息、计划、配置和报告元数据
├── secret.key       # API Key 与 MCP 环境变量的本地加密密钥
└── reports/         # 生成的报告导出文件
```

Trace、Agent 任务、工具策略、授权记录和评测结果也保存在 `searchagent.db`。权限策略按 Agent 角色和工具名匹配，未知工具默认暂停等待本次任务确认；批准不会写入持久化允许规则。首期是应用层隔离，不提供 MCP 进程的操作系统级沙箱。

可以用 `SEARCHAGENT_HOME` 指定其他目录：

```powershell
$env:SEARCHAGENT_HOME = "C:\data\searchagent"
```

请备份数据库时一并备份 `secret.key`，否则已加密的密钥无法恢复。不要提交数据库、密钥、环境变量文件或导出报告；仓库的 `.gitignore` 已覆盖这些本地产物。

## 常用命令

后端测试：

```powershell
cd backend
python -m pytest
```

前端测试与生产构建：

```powershell
cd frontend
npm test
npm run build
```

安装完成后可用以下命令做一次完整验证：

```powershell
cd backend
python -m pytest
python -m playwright install chromium
python -c "from playwright.sync_api import sync_playwright; p=sync_playwright().start(); b=p.chromium.launch(); b.close(); p.stop(); print('playwright-chromium-ok')"

cd ..\frontend
npm ci
npm test
npm run build
```

仓库的 GitHub Actions 也会在每次 push 和 pull request 时自动执行同样的后端测试、前端测试与生产构建检查。

## 项目结构

```text
SearchAgent/
├── backend/
│   ├── app/
│   │   ├── api/       # REST、SSE、研究恢复和报告接口
│   │   ├── core/      # 路径、事件与加密
│   │   ├── db/        # SQLite 模型和数据库会话
│   │   ├── engine/    # LangGraph 状态、节点与运行器
│   │   ├── llm/       # 模型提供商适配
│   │   ├── services/  # 设置、研究和报告导出服务
│   │   └── tools/     # Bocha、GitHub、官方文档、MCP 与网页抓取工具
│   └── tests/
├── frontend/
│   └── src/
│       ├── api/        # REST/SSE 客户端和类型
│       ├── components/ # 时间线、问答、计划、报告与设置 UI
│       └── i18n/       # 中英文文案和语言状态
└── docs/               # 项目补充文档
```

## 常见问题

### 模型连接测试失败

确认兼容格式、Base URL、模型名称和 API Key 属于同一服务。OpenAI-compatible 地址通常以 `/v1` 或服务商给出的兼容模式根路径结尾，不要追加 `/chat/completions`。

### 研究没有搜索结果

检查搜索 MCP 是否已启用、环境变量名称是否正确，并查看执行详情中的工具错误。Bocha 配置的名称必须是 `bocha`，密钥字段必须是 `BOCHA_API_KEY`。

### PDF 无法生成

先在后端虚拟环境中执行：

```powershell
python -m playwright install chromium
```

后端会尝试 Playwright Chromium，并在 Windows 上回退到本机 Chrome 或 Edge。若仍失败，报告卡片会显示后端返回的具体原因；Markdown 下载不受影响。

### 刷新后进度没有立即更新

页面会先从 SQLite 恢复任务状态，再通过 SSE 接收后续事件。确认后端仍在运行，并检查浏览器到 `/events` 的连接是否正常。

## 当前限制

- 仅面向本地单用户使用，不包含账号、权限和云端部署能力。
- 研究质量取决于所选模型、搜索工具和来源质量。
- 执行期间暂不支持暂停、插入指令或修改计划。
- GitHub 连接器首期只支持公开仓库；不支持私有仓库、企业文档或自动拉取代码。
- 工作流模式按会话锁定，不能在同一 run 中迁移为另一种工作流。
- PDF 排版依赖本机可用的 Chromium/Chrome/Edge 与中文字体。

## 许可证

本项目基于 [Apache License 2.0](LICENSE) 开源。

Copyright 2026 WERvEX
