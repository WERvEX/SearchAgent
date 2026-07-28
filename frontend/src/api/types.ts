export const KNOWN_CONVERSATION_STATUSES = [
  "idle",
  "running",
  "active",
  "awaiting_clarification",
  "awaiting_approval",
  "planning",
  "awaiting_execution",
  "executing",
  "revising_report",
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
    created_at?: string;
  }>;
  projects: Array<{
    id: number;
    topic: string;
    objective: string | null;
    status: string;
    created_at: string;
    latest_report_id: number | null;
    latest_report_version: number | null;
    plans?: PlanArtifact[];
    reports?: Array<{ id: number; project_id?: number; version: number; created_at: string }>;
  }>;
};

export type PlanStep = {
  seq: number;
  title: string;
  description?: string;
  status?: string;
};

export type PlanArtifact = {
  id?: number;
  project_id?: number;
  version: number;
  summary: string;
  steps: PlanStep[];
  created_at?: string;
};

export type PlanningQuestionOption = {
  id: string;
  label: string;
  description?: string;
};

export type PlanningQuestion = {
  id: string;
  prompt: string;
  options: PlanningQuestionOption[];
  allow_custom: boolean;
};

export type PlanningAnswer = {
  question_id: string;
  option_id?: string;
  text?: string;
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
  | "planning"
  | "awaiting_execution"
  | "executing"
  | "revising_report"
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

export type ProjectExecutionDetail = {
  project_id: number;
  status: string;
  steps: Array<PlanStep & { id: number; result_summary?: string | null }>;
  sources: Array<{
    id: number;
    title: string;
    url: string;
    snippet: string | null;
    tool_name: string;
  }>;
  reports: Array<{ id: number; version: number; created_at: string }>;
};

export type ResearchFollowUpResponse = {
  route: "replan" | "report_revision";
  reason: string;
  run: ResearchRunResponse | null;
  report_id: number | null;
};

export const RESEARCH_LIFECYCLE_EVENT_TYPES = [
  "research.started",
  "research.plan_ready",
  "research.planning_message",
  "research.execution_started",
  "research.step_started",
  "research.step_completed",
  "research.tool_started",
  "research.tool_completed",
  "research.source_collected",
  "research.report_revision_started",
  "research.report_revised",
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
