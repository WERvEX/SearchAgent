import type {
  ConversationDetail,
  ConversationRead,
  LLMProfileCreate,
  LLMProfileRead,
  MCPServer,
  PreferenceRead,
  ReportRead,
  ResearchRunResponse,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string | null;

  constructor(status: number, detail: string | null) {
    super(detail ?? `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) {
    let detail: string | null = null;
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : null;
    } catch {
      detail = null;
    }
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const api = {
  createConversation: (title: string) => request<ConversationRead>("/conversations", json("POST", { title })),
  updateConversation: (id: number, title: string) =>
    request<ConversationRead>(`/conversations/${id}`, json("PUT", { title })),
  deleteConversation: (id: number) =>
    request<void>(`/conversations/${id}`, { method: "DELETE" }),
  listConversations: () => request<ConversationRead[]>("/conversations"),
  getConversation: (id: number) => request<ConversationDetail>(`/conversations/${id}`),
  startResearch: (payload: { conversation_id: number; profile_id: number; user_message: string }) =>
    request<ResearchRunResponse>("/research/start", json("POST", payload)),
  getActiveResearch: (conversationId: number) =>
    request<ResearchRunResponse | null>(`/research/active/${conversationId}`),
  resumeResearch: (threadId: string, payload: { profile_id?: number; decision: Record<string, unknown> }) =>
    request<ResearchRunResponse>(`/research/${encodeURIComponent(threadId)}/resume`, json("POST", payload)),
  listLLMProfiles: () => request<LLMProfileRead[]>("/settings/llm-profiles"),
  createLLMProfile: (payload: LLMProfileCreate) =>
    request<LLMProfileRead>("/settings/llm-profiles", json("POST", payload)),
  updateLLMProfile: (id: number, payload: LLMProfileCreate) =>
    request<LLMProfileRead>(`/settings/llm-profiles/${id}`, json("PUT", payload)),
  testLLMProfile: (id: number) =>
    request<{ ok: boolean; error: string | null }>(`/settings/llm-profiles/${id}/test`, { method: "POST" }),
  setPreference: (key: string, value: unknown) => request<PreferenceRead>(`/settings/preferences/${key}`, json("PUT", { value })),
  getPreference: (key: string) => request<PreferenceRead>(`/settings/preferences/${key}`),
  listMCPServers: () => request<MCPServer[]>("/mcp/servers"),
  createMCPServer: (payload: Omit<MCPServer, "id">) => request<MCPServer>("/mcp/servers", json("POST", payload)),
  updateMCPServer: (id: number, payload: Omit<MCPServer, "id">) =>
    request<MCPServer>(`/mcp/servers/${id}`, json("PUT", payload)),
  getReport: (id: number) => request<ReportRead>(`/reports/${id}`),
  markdownDownloadUrl: (id: number) => `/api/reports/${id}/download.md`,
  pdfDownloadUrl: (id: number) => `/api/reports/${id}/download.pdf`,
};
