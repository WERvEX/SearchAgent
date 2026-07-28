export const KNOWN_CONVERSATION_STATUSES = [
  "idle",
  "running",
  "active",
  "awaiting_clarification",
  "awaiting_approval",
  "completed",
  "failed",
] as const;
export type KnownConversationStatus = (typeof KNOWN_CONVERSATION_STATUSES)[number];
export type ConversationStatus = KnownConversationStatus | (string & {});

export type ConversationRead = {
  id: number;
  title: string;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
};

export type ConversationDetail = ConversationRead & {
  messages: Array<{
    id: number;
    role: string;
    content: string;
    meta: Record<string, unknown> | null;
  }>;
  projects: Array<{
    id: number;
    topic: string;
    objective: string | null;
    status: string;
    created_at: string;
    latest_report_id: number | null;
    latest_report_version: number | null;
  }>;
};

export type ResearchRunResponse = {
  thread_id: string;
  state: Record<string, unknown> & { report_id?: number };
  interrupted: boolean;
  interrupt_payload: Record<string, unknown> | null;
};

export type ResearchRunPhase =
  | "idle"
  | "starting"
  | "active"
  | "awaiting_clarification"
  | "awaiting_approval"
  | "resuming"
  | "completed"
  | "failed";

export type EventStreamStatus = "connecting" | "open" | "closed" | "error" | "unavailable";

export type LLMProfileCreate = {
  name: string;
  provider: string;
  base_url?: string | null;
  model: string;
  api_key?: string | null;
  params?: Record<string, unknown> | null;
  is_default?: boolean;
};

export type LLMProfileRead = {
  id: number;
  name: string;
  provider: string;
  base_url: string | null;
  model: string;
  api_key: string;
  params: Record<string, unknown> | null;
  is_default: boolean;
};

export type PreferenceValue = {
  value: unknown;
};

export type PreferenceRead = {
  key: string;
  value: PreferenceValue;
};

export type MCPServer = {
  id: number;
  name: string;
  transport: string;
  command: string | null;
  args: string[] | null;
  env: Record<string, string> | null;
  url: string | null;
  enabled: boolean;
};

export type ReportRead = {
  id: number;
  project_id: number;
  version: number;
  format: string;
  content_md: string;
  file_path: string | null;
  created_at: string;
};

export const RESEARCH_LIFECYCLE_EVENT_TYPES = [
  "research.started",
  "research.plan_ready",
  "research.awaiting_clarification",
  "research.awaiting_approval",
  "research.resumed",
  "research.sources_collected",
  "research.report_ready",
  "research.completed",
  "research.failed",
] as const;

export type ResearchLifecycleEventType = (typeof RESEARCH_LIFECYCLE_EVENT_TYPES)[number];

export type ResearchLifecyclePayload = Record<string, unknown> & {
  thread_id: string;
};

export type ResearchLifecycleEvent = {
  id: string;
  event: ResearchLifecycleEventType;
  data: ResearchLifecyclePayload;
};

export type UnknownServerEvent = {
  id?: string;
  event?: string;
  data: unknown;
};

export type ServerEvent = ResearchLifecycleEvent | UnknownServerEvent;
