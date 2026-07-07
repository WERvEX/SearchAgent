import type {
  ConversationDetail,
  ConversationRead,
  LLMProfile,
  MCPServer,
  ReportRead,
  ResearchRunResponse,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      message = typeof body.detail === "string" ? body.detail : message;
    } catch {
      message = `Request failed with ${response.status}`;
    }
    throw new Error(message);
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
  listConversations: () => request<ConversationRead[]>("/conversations"),
  getConversation: (id: number) => request<ConversationDetail>(`/conversations/${id}`),
  startResearch: (payload: { conversation_id: number; profile_id: number; user_message: string }) =>
    request<ResearchRunResponse>("/research/start", json("POST", payload)),
  resumeResearch: (threadId: string, payload: { profile_id?: number; decision: Record<string, unknown> }) =>
    request<ResearchRunResponse>(`/research/${encodeURIComponent(threadId)}/resume`, json("POST", payload)),
  listLLMProfiles: () => request<LLMProfile[]>("/settings/llm-profiles"),
  createLLMProfile: (payload: Omit<LLMProfile, "id">) =>
    request<LLMProfile>("/settings/llm-profiles", json("POST", payload)),
  testLLMProfile: (id: number) =>
    request<{ ok: boolean; error: string | null }>(`/settings/llm-profiles/${id}/test`, { method: "POST" }),
  setPreference: (key: string, value: unknown) =>
    request<{ key: string; value: unknown }>(`/settings/preferences/${key}`, json("PUT", { value })),
  getPreference: (key: string) => request<{ key: string; value: unknown }>(`/settings/preferences/${key}`),
  listMCPServers: () => request<MCPServer[]>("/mcp/servers"),
  createMCPServer: (payload: Omit<MCPServer, "id">) => request<MCPServer>("/mcp/servers", json("POST", payload)),
  getReport: (id: number) => request<ReportRead>(`/reports/${id}`),
  exportPdf: (id: number) => request<{ format: string; file_path: string }>(`/reports/${id}/export.pdf`, { method: "POST" }),
  markdownDownloadUrl: (id: number) => `/api/reports/${id}/download.md`,
};
