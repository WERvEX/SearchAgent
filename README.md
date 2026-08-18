# SearchAgent

SearchAgent 是一个本地优先的 AI 深度研究工作台。它用类似 Codex Plan Mode 的对话流程澄清需求、形成可执行计划，再调用 LLM 与搜索工具收集证据，最终生成带引用的结构化报告。

界面支持中文和英文，并让模型回复跟随当前界面语言。会话、计划、执行进度和报告都保存在本地，刷新页面或重启应用后可以继续。

> 项目目前面向本地单用户开发与验证。开始研究前，必须配置至少一个可用的模型 API；联网检索还需要配置 Bocha 或其他 MCP 搜索服务。

## 工作流程

```text
规划对话 → 澄清问答 → 最终计划 → 执行研究 → 实时进度 → 最终报告
                                                        ↓
                                             修改报告或重新规划
```

1. 在聊天中描述研究目标；信息不足时，助手会给出最多三个单选问题，也可以自行输入答案。
2. 信息充分后，时间线中出现版本化计划卡片。继续聊天会生成新版本，只有最新计划可以执行。
3. 点击“执行计划”后，输入框暂时锁定；关键进度显示在时间线，步骤、来源和日志可在详情抽屉中查看。
4. 完成后可分章节阅读报告、跳转引用来源，并下载 Markdown 或 PDF。
5. 对报告继续提问时，系统会判断是修改现有报告，还是开启新一轮规划，并允许纠正判断。

## 主要功能

- 单滚动聊天时间线，集中展示规划消息、问答、计划、执行状态和历次报告
- 首次访问自动创建会话；支持历史恢复、重命名和删除
- 结构化澄清卡片，支持预设选项和用户自定义答案
- 可中断、可恢复的 LangGraph 研究流程和版本化执行计划
- 基于 SSE 的实时阶段、步骤、来源和异常进度
- 折叠式报告结构、可点击引用、来源定位及报告版本切换
- Markdown 下载，以及带生成状态、失败提示和重试的 PDF 导出
- OpenAI-compatible 与 Anthropic 两种模型兼容格式
- OpenAI、Anthropic、DeepSeek、Xiaomi MiMo、Alibaba Qwen 和自定义服务预设
- 本地 stdio 与远程 HTTP MCP 服务配置、测试和编辑
- API Key 与 MCP 环境变量本地加密存储
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
│   │   └── tools/     # Bocha、MCP 与网页抓取工具
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
- PDF 排版依赖本机可用的 Chromium/Chrome/Edge 与中文字体。

## 许可证

本项目基于 [Apache License 2.0](LICENSE) 开源。

Copyright 2026 WERvEX
