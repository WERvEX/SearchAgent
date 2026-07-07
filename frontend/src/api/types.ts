export type ConversationRead = {
  id: number;
  title: string;
  status: string;
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
  }>;
};

export type ResearchRunResponse = {
  thread_id: string;
  state: Record<string, unknown>;
  interrupted: boolean;
  interrupt_payload: Record<string, unknown> | null;
};

export type LLMProfile = {
  id: number;
  name: string;
  provider: string;
  base_url: string | null;
  model: string;
  api_key?: string | null;
  api_key_masked?: string | null;
  params: Record<string, unknown> | null;
  is_default: boolean;
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

export type ServerEvent = {
  id?: string;
  event?: string;
  data: Record<string, unknown>;
};
