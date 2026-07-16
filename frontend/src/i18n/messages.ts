import type { EventStreamStatus, KnownConversationStatus, ResearchLifecycleEventType } from "../api/types";

export const enMessages = {
  "app.selectedProfile": "Selected profile: {name}",
  "app.loadingWorkspace": "Loading workspace...",
  "app.createConversation": "Create a conversation to begin.",
  "app.conversationCreated": "Conversation created.",
  "app.unableToLoadWorkspace": "Unable to load workspace.",
  "app.failedToLoadWorkspace": "Failed to load workspace.",
  "app.failedToCreateConversation": "Failed to create conversation.",
  "app.failedToLoadConversation": "Failed to load conversation.",
  "app.failedToStartResearch": "Failed to start research.",
  "app.failedToResumeResearch": "Failed to resume research.",
  "app.reportLoaded": "Report loaded.",
  "app.failedToLoadReport": "Failed to load report.",
  "app.failedToLoadProfiles": "Failed to load profiles.",
  "app.failedToLoadSourceLimit": "Failed to load source limit.",
  "app.failedToLoadMcpServers": "Failed to load MCP servers.",
  "app.profile": "Profile: {name}",
  "app.selected": "Selected",
  "app.noLlmProfile": "No LLM profile available.",
  "app.researchSummary": "Research summary",
  "app.sessionSettings": "Current session choices pulled from backend settings.",
  "app.activeProfile": "Active profile",
  "app.noProfileSelected": "No profile selected",
  "app.backendDefault": "Backend default",
  "app.notConfigured": "Not configured",
  "app.maxSources": "Max sources",
  "app.mcpServers": "MCP servers",
  "shell.primaryNavigation": "Primary navigation",
  "shell.languageSelector": "Language selector",
  "shell.research": "Research",
  "shell.settings": "Settings",
  "shell.switchToChinese": "Switch language to Chinese",
  "shell.switchToEnglish": "Switch language to English",
  "conversation.history": "History",
  "conversation.new": "New",
  "conversation.empty": "No conversations yet",
  "conversation.untitled": "Untitled",
  "api.requestFailed": "Request failed with status {status}.",
  "workspace.selectConversation": "Select or create a conversation",
  "workspace.ready": "Ready for research",
  "workspace.starting": "Starting research",
  "workspace.active": "Research in progress",
  "workspace.awaitingApproval": "Plan decision required",
  "workspace.resuming": "Resuming research",
  "workspace.completed": "Research completed",
  "workspace.failed": "Research failed",
  "workspace.noMessages": "No messages yet. Start a research request.",
  "workspace.chooseConversation": "Choose a conversation to view its activity.",
  "workspace.request": "Research request",
  "workspace.start": "Start",
  "plan.confirmation": "Plan confirmation",
  "plan.submitting": "Submitting decision",
  "plan.waiting": "Waiting for decision",
  "plan.none": "No pending decision",
  "plan.startToGenerate": "Start a research request to generate a plan.",
  "plan.noOptions": "No plan options available yet.",
  "plan.feedback": "Replan feedback",
  "plan.approve": "Approve plan",
  "plan.replan": "Replan",
  "progress.title": "Progress",
  "progress.empty": "No events yet",
  "progress.message": "message",
  "report.title": "Report",
  "report.load": "Load",
  "report.empty": "No report loaded.",
  "settings.title": "Settings",
  "settings.description": "Manage research profiles, source limits, and MCP servers.",
  "settings.profiles": "LLM profiles",
  "settings.profilesDescription": "Create new profiles and choose which one research runs use.",
  "settings.profileName": "Profile name",
  "settings.provider": "Provider",
  "settings.model": "Model",
  "settings.baseUrl": "Base URL",
  "settings.apiKey": "API key",
  "settings.makeDefault": "Make backend default",
  "settings.firstProfileDefault": "First profile becomes backend default",
  "settings.advancedParams": "Advanced params (JSON)",
  "settings.saving": "Saving...",
  "settings.saveProfile": "Save profile",
  "settings.availableProfiles": "Available research profiles",
  "settings.noProfiles": "No profiles configured yet.",
  "settings.useProfile": "Use {name} for research",
  "settings.backendDefault": "Backend default",
  "settings.active": "Active",
  "settings.keyStored": "Key stored",
  "settings.testing": "Testing...",
  "settings.testProfile": "Test {name}",
  "settings.searchPreference": "Search preference",
  "settings.sourceLimitDescription": "Control how many sources a research run can collect.",
  "settings.maxSources": "Max sources",
  "settings.saveSourceLimit": "Save source limit",
  "settings.mcpServers": "MCP servers",
  "settings.mcpDescription": "Register MCP servers for research tools without exposing stored secrets.",
  "settings.serverName": "MCP server name",
  "settings.transport": "Transport",
  "settings.command": "Command",
  "settings.arguments": "Arguments (one per line)",
  "settings.url": "URL",
  "settings.environment": "Environment variables (KEY=value)",
  "settings.saveServer": "Save server",
  "settings.registeredServers": "Registered servers",
  "settings.noServers": "No MCP servers configured yet.",
  "settings.disabled": "Disabled",
  "settings.noUrl": "No URL configured",
  "settings.envKeys": "Env keys: {keys}",
  "validation.paramsObject": "Params JSON must be an object.",
  "validation.paramsJson": "Params JSON must be valid JSON.",
  "validation.envFormat": "Each environment line must use KEY=value.",
  "validation.envKey": "Environment variable keys cannot be empty.",
  "validation.maxSources": "Enter a whole number from 1 to 50.",
  "validation.profileName": "Profile name is required.",
  "validation.provider": "Provider is required.",
  "validation.model": "Model is required.",
  "validation.serverName": "Server name is required.",
  "validation.command": "Command is required for stdio servers.",
  "validation.url": "URL is required for non-stdio servers.",
  "feedback.profileSaved": "Profile saved.",
  "feedback.failedSaveProfile": "Failed to save profile.",
  "feedback.connectionOk": "Connection OK.",
  "feedback.connectionFailed": "Connection failed.",
  "feedback.failedTestProfile": "Failed to test profile.",
  "feedback.sourceLimitSaved": "Source limit saved.",
  "feedback.failedSaveSourceLimit": "Failed to save source limit.",
  "feedback.serverSaved": "MCP server saved.",
  "feedback.failedSaveServer": "Failed to save MCP server.",
  "phase.idle": "Ready for research.",
  "phase.starting": "Starting research.",
  "phase.active": "Research in progress.",
  "phase.awaiting_approval": "Plan decision required.",
  "phase.resuming": "Resuming research.",
  "phase.completed": "Research completed.",
  "phase.failed": "Research failed.",
  "status.idle": "Idle",
  "status.running": "Running",
  "status.active": "Active",
  "status.completed": "Completed",
  "status.failed": "Failed",
  "role.user": "User",
  "role.assistant": "Assistant",
  "role.system": "System",
  "role.tool": "Tool",
  "event.connecting": "Connecting",
  "event.open": "Connected",
  "event.closed": "Closed",
  "event.error": "Connection error",
  "event.unavailable": "Unavailable",
  "event.research.started": "Research started",
  "event.research.plan_ready": "Plan ready",
  "event.research.awaiting_approval": "Awaiting approval",
  "event.research.resumed": "Research resumed",
  "event.research.sources_collected": "Sources collected",
  "event.research.report_ready": "Report ready",
  "event.research.completed": "Research completed",
  "event.research.failed": "Research failed",
} as const;

export type MessageKey = keyof typeof enMessages;
export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

export const zhCNMessages: Record<MessageKey, string> = {
  "app.selectedProfile": "当前配置：{name}", "app.loadingWorkspace": "正在加载工作区...", "app.createConversation": "新建对话以开始研究。", "app.conversationCreated": "对话已创建。", "app.unableToLoadWorkspace": "无法加载工作区。", "app.failedToLoadWorkspace": "加载工作区失败。", "app.failedToCreateConversation": "创建对话失败。", "app.failedToLoadConversation": "加载对话失败。", "app.failedToStartResearch": "启动研究失败。", "app.failedToResumeResearch": "恢复研究失败。", "app.reportLoaded": "报告已加载。", "app.failedToLoadReport": "加载报告失败。", "app.failedToLoadProfiles": "加载配置失败。", "app.failedToLoadSourceLimit": "加载来源限制失败。", "app.failedToLoadMcpServers": "加载 MCP 服务器失败。", "app.profile": "配置：{name}", "app.selected": "已选中", "app.noLlmProfile": "没有可用的 LLM 配置。", "app.researchSummary": "研究摘要", "app.sessionSettings": "当前会话设置来自后端。", "app.activeProfile": "当前配置", "app.noProfileSelected": "未选择配置", "app.backendDefault": "后端默认", "app.notConfigured": "未配置", "app.maxSources": "最大来源数", "app.mcpServers": "MCP 服务器",
  "shell.primaryNavigation": "主导航", "shell.languageSelector": "语言选择", "shell.research": "研究", "shell.settings": "设置", "shell.switchToChinese": "切换语言为中文", "shell.switchToEnglish": "切换语言为英文",
  "conversation.history": "历史记录", "conversation.new": "新建", "conversation.empty": "暂无对话", "conversation.untitled": "未命名",
  "api.requestFailed": "请求失败，状态码 {status}。",
  "workspace.selectConversation": "选择或新建对话", "workspace.ready": "准备开始研究", "workspace.starting": "正在启动研究", "workspace.active": "研究进行中", "workspace.awaitingApproval": "需要确认计划", "workspace.resuming": "正在恢复研究", "workspace.completed": "研究已完成", "workspace.failed": "研究失败", "workspace.noMessages": "暂无消息。开始一项研究请求。", "workspace.chooseConversation": "选择一个对话以查看活动。", "workspace.request": "研究请求", "workspace.start": "开始",
  "plan.confirmation": "计划确认", "plan.submitting": "正在提交决策", "plan.waiting": "等待决策", "plan.none": "没有待处理的决策", "plan.startToGenerate": "开始一项研究请求以生成计划。", "plan.noOptions": "暂无计划选项", "plan.feedback": "重新规划反馈", "plan.approve": "批准计划", "plan.replan": "重新规划",
  "progress.title": "进度", "progress.empty": "暂无事件", "progress.message": "消息",
  "report.title": "报告", "report.load": "加载", "report.empty": "尚未加载报告。",
  "settings.title": "设置", "settings.description": "管理研究配置、来源限制和 MCP 服务器。", "settings.profiles": "LLM 配置", "settings.profilesDescription": "创建配置并选择研究运行使用的配置。", "settings.profileName": "配置名称", "settings.provider": "提供商", "settings.model": "模型", "settings.baseUrl": "基础 URL", "settings.apiKey": "API 密钥", "settings.makeDefault": "设为后端默认", "settings.firstProfileDefault": "首个配置将成为后端默认", "settings.advancedParams": "高级参数 (JSON)", "settings.saving": "正在保存...", "settings.saveProfile": "保存配置", "settings.availableProfiles": "可用研究配置", "settings.noProfiles": "尚未配置任何配置。", "settings.useProfile": "使用 {name} 进行研究", "settings.backendDefault": "后端默认", "settings.active": "当前", "settings.keyStored": "密钥已保存", "settings.testing": "正在测试...", "settings.testProfile": "测试 {name}", "settings.searchPreference": "搜索偏好", "settings.sourceLimitDescription": "控制单次研究可收集的来源数量。", "settings.maxSources": "最大来源数", "settings.saveSourceLimit": "保存来源限制", "settings.mcpServers": "MCP 服务器", "settings.mcpDescription": "注册研究工具使用的 MCP 服务器，且不暴露已存储的密钥。", "settings.serverName": "MCP 服务器名称", "settings.transport": "传输方式", "settings.command": "命令", "settings.arguments": "参数（每行一个）", "settings.url": "URL", "settings.environment": "环境变量 (KEY=value)", "settings.saveServer": "保存服务器", "settings.registeredServers": "已注册服务器", "settings.noServers": "尚未配置 MCP 服务器。", "settings.disabled": "已禁用", "settings.noUrl": "未配置 URL", "settings.envKeys": "环境变量键：{keys}",
  "validation.paramsObject": "参数 JSON 必须是对象。", "validation.paramsJson": "参数 JSON 必须有效。", "validation.envFormat": "每行环境变量必须使用 KEY=value 格式。", "validation.envKey": "环境变量键不能为空。", "validation.maxSources": "请输入 1 到 50 的整数。", "validation.profileName": "必须填写配置名称。", "validation.provider": "必须填写提供商。", "validation.model": "必须填写模型。", "validation.serverName": "必须填写服务器名称。", "validation.command": "stdio 服务器必须填写命令。", "validation.url": "非 stdio 服务器必须填写 URL。",
  "feedback.profileSaved": "配置已保存。", "feedback.failedSaveProfile": "保存配置失败。", "feedback.connectionOk": "连接正常。", "feedback.connectionFailed": "连接失败。", "feedback.failedTestProfile": "测试配置失败。", "feedback.sourceLimitSaved": "来源限制已保存。", "feedback.failedSaveSourceLimit": "保存来源限制失败。", "feedback.serverSaved": "MCP 服务器已保存。", "feedback.failedSaveServer": "保存 MCP 服务器失败。",
  "phase.idle": "准备开始研究。", "phase.starting": "正在启动研究。", "phase.active": "研究进行中。", "phase.awaiting_approval": "需要确认计划。", "phase.resuming": "正在恢复研究。", "phase.completed": "研究已完成。", "phase.failed": "研究失败。",
  "status.idle": "空闲", "status.running": "进行中", "status.active": "进行中", "status.completed": "已完成", "status.failed": "失败",
  "role.user": "用户", "role.assistant": "助手", "role.system": "系统", "role.tool": "工具",
  "event.connecting": "正在连接", "event.open": "已连接", "event.closed": "已关闭", "event.error": "连接错误", "event.unavailable": "不可用", "event.research.started": "研究已启动", "event.research.plan_ready": "计划已就绪", "event.research.awaiting_approval": "等待确认", "event.research.resumed": "研究已恢复", "event.research.sources_collected": "已收集来源", "event.research.report_ready": "报告已就绪", "event.research.completed": "研究已完成", "event.research.failed": "研究失败",
};

const KNOWN_MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;
type KnownMessageRole = (typeof KNOWN_MESSAGE_ROLES)[number];

const knownStatuses = {
  idle: "status.idle",
  running: "status.running",
  active: "status.active",
  completed: "status.completed",
  failed: "status.failed",
} satisfies Record<KnownConversationStatus, MessageKey>;
const knownRoles = {
  user: "role.user",
  assistant: "role.assistant",
  system: "role.system",
  tool: "role.tool",
} satisfies Record<KnownMessageRole, MessageKey>;
const knownEventStatuses = { connecting: "event.connecting", open: "event.open", closed: "event.closed", error: "event.error", unavailable: "event.unavailable" } satisfies Record<EventStreamStatus, MessageKey>;
const knownLifecycleEvents = {
  "research.started": "event.research.started", "research.plan_ready": "event.research.plan_ready", "research.awaiting_approval": "event.research.awaiting_approval", "research.resumed": "event.research.resumed", "research.sources_collected": "event.research.sources_collected", "research.report_ready": "event.research.report_ready", "research.completed": "event.research.completed", "research.failed": "event.research.failed",
} satisfies Record<ResearchLifecycleEventType, MessageKey>;

function translateKnown<K extends string>(t: Translate, values: Record<K, MessageKey>, value: string) {
  return Object.prototype.hasOwnProperty.call(values, value) ? t(values[value as K]) : value;
}

export function translateStatus(t: Translate, status: string) { return translateKnown(t, knownStatuses, status); }
export function translateRole(t: Translate, role: string) { return translateKnown(t, knownRoles, role); }
export function translateEventStatus(t: Translate, status: string) { return translateKnown(t, knownEventStatuses, status); }
export function translateLifecycleEvent(t: Translate, event: string) { return translateKnown(t, knownLifecycleEvents, event); }

export type LocalizedMessage =
  | { kind: "localized"; key: MessageKey; values?: Record<string, string | number> }
  | { kind: "raw"; text: string };

export function localizedMessage(
  key: MessageKey,
  values?: Record<string, string | number>,
): LocalizedMessage {
  return values ? { kind: "localized", key, values } : { kind: "localized", key };
}

export function rawMessage(text: string): LocalizedMessage {
  return { kind: "raw", text };
}

export function renderLocalizedMessage(t: Translate, message: LocalizedMessage) {
  return message.kind === "raw" ? message.text : t(message.key, message.values);
}

export function messageFromError(error: unknown, fallbackKey: MessageKey): LocalizedMessage {
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    const detail = "detail" in error && typeof error.detail === "string" ? error.detail : null;
    return detail ? rawMessage(detail) : localizedMessage("api.requestFailed", { status: error.status });
  }

  if (error instanceof Error && error.message) {
    return rawMessage(error.message);
  }

  return localizedMessage(fallbackKey);
}
