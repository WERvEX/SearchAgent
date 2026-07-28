import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./api/client";
import { I18nProvider } from "./i18n/I18nProvider";

vi.mock("./api/client", () => ({
  api: {
    createConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    listConversations: vi.fn(),
    getConversation: vi.fn(),
    getActiveResearch: vi.fn(),
    startResearch: vi.fn(),
    resumeResearch: vi.fn(),
    followUpResearch: vi.fn(),
    getProjectExecution: vi.fn(),
    listLLMProfiles: vi.fn(),
    createLLMProfile: vi.fn(),
    updateLLMProfile: vi.fn(),
    testLLMProfile: vi.fn(),
    getPreference: vi.fn(),
    setPreference: vi.fn(),
    listMCPServers: vi.fn(),
    createMCPServer: vi.fn(),
    updateMCPServer: vi.fn(),
    getReport: vi.fn(),
    markdownDownloadUrl: vi.fn((id: number) => `/api/reports/${id}/download.md`),
    pdfDownloadUrl: vi.fn((id: number) => `/api/reports/${id}/download.pdf`),
  },
}));

const conversation = { id: 4, title: "Search API evaluation", status: "idle", created_at: "", updated_at: "" };
const detail = { ...conversation, messages: [], projects: [] };
const profile = {
  id: 7, name: "Default profile", provider: "openai", base_url: null, model: "gpt-5",
  api_key: "", params: null, is_default: true,
};
const plan = {
  id: 3,
  version: 1,
  summary: "Compare pricing and limits",
  steps: [{ seq: 1, title: "Collect official pricing", description: "Use primary sources", status: "pending" }],
  created_at: "2026-07-15T10:00:00Z",
};
const plannedDetail = {
  ...detail,
  status: "awaiting_execution",
  messages: [{ id: 1, role: "user", content: "Compare API pricing", meta: null }],
  projects: [{
    id: 2, topic: "API pricing", objective: "Compare API pricing", status: "awaiting_execution",
    created_at: "", latest_report_id: null, latest_report_version: null, plans: [plan], reports: [],
  }],
};

class MockEventSource {
  addEventListener() {}
  close() {}
}

describe("App Codex-style research flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal("EventSource", MockEventSource);
    vi.mocked(api.listConversations).mockResolvedValue([conversation]);
    vi.mocked(api.getConversation).mockResolvedValue(detail);
    vi.mocked(api.getActiveResearch).mockResolvedValue(null);
    vi.mocked(api.getProjectExecution).mockResolvedValue({
      project_id: 2, status: "awaiting_execution", steps: [], sources: [], reports: [],
    });
    vi.mocked(api.listLLMProfiles).mockResolvedValue([profile]);
    vi.mocked(api.getPreference).mockResolvedValue({ key: "max_sources", value: { value: 8 } });
    vi.mocked(api.listMCPServers).mockResolvedValue([]);
  });

  it("starts planning from the chat composer", async () => {
    vi.mocked(api.startResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: {},
      interrupted: true,
      interrupt_payload: { kind: "planning_input", message: "Which market?" },
    });
    render(<I18nProvider><App /></I18nProvider>);
    const composer = await screen.findByLabelText("Research request");
    await userEvent.type(composer, "Compare API pricing");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(api.startResearch).toHaveBeenCalledWith({
      conversation_id: 4, profile_id: 7, user_message: "Compare API pricing", response_language: "en",
    }));
  });

  it("sends the selected Chinese interface language with the first request", async () => {
    localStorage.setItem("searchagent.locale", "zh-CN");
    vi.mocked(api.startResearch).mockResolvedValue({
      thread_id: "thread-zh",
      state: {},
      interrupted: true,
      interrupt_payload: { kind: "planning_input", message: "请说明市场范围。" },
    });
    render(<I18nProvider><App /></I18nProvider>);
    const composer = await screen.findByLabelText("研究请求");
    await userEvent.type(composer, "比较 API 价格");
    await userEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(api.startResearch).toHaveBeenCalledWith({
      conversation_id: 4,
      profile_id: 7,
      user_message: "比较 API 价格",
      response_language: "zh-CN",
    }));
  });

  it("shows the sent message and a thinking placeholder before the API responds", async () => {
    let resolveRun!: (value: {
      thread_id: string;
      state: Record<string, unknown>;
      interrupted: boolean;
      interrupt_payload: Record<string, unknown>;
    }) => void;
    vi.mocked(api.startResearch).mockReturnValue(new Promise((resolve) => {
      resolveRun = resolve;
    }));
    render(<I18nProvider><App /></I18nProvider>);
    const composer = await screen.findByLabelText("Research request");
    await userEvent.type(composer, "Investigate current pricing");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByTestId("optimistic-user-message")).toHaveTextContent("Investigate current pricing");
    expect(screen.getByTestId("assistant-thinking")).toBeInTheDocument();

    resolveRun({
      thread_id: "thread-pending",
      state: {},
      interrupted: true,
      interrupt_payload: { kind: "planning_input", message: "Which market?" },
    });
    await waitFor(() => expect(screen.queryByTestId("assistant-thinking")).not.toBeInTheDocument());
  });

  it("restores planning chat and sends a planning message", async () => {
    vi.mocked(api.getActiveResearch).mockResolvedValue({
      thread_id: "thread-1", state: {}, interrupted: true,
      interrupt_payload: { kind: "planning_input", message: "Which market?" },
    });
    vi.mocked(api.resumeResearch).mockResolvedValue({
      thread_id: "thread-1", state: { plan_version: 1 }, interrupted: true,
      interrupt_payload: { kind: "plan_ready", plan_version: 1, plan: { summary: plan.summary, steps: plan.steps } },
    });
    vi.mocked(api.getConversation).mockResolvedValueOnce({
      ...detail,
      messages: [{ id: 1, role: "assistant", content: "Which market?", meta: null }],
      projects: [],
    }).mockResolvedValue(plannedDetail);
    render(<I18nProvider><App /></I18nProvider>);
    await screen.findByText("Which market?");
    await userEvent.type(screen.getByLabelText("Research request"), "Europe in 2026");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(api.resumeResearch).toHaveBeenCalledWith("thread-1", {
      profile_id: 7,
      response_language: "en",
      decision: { kind: "planning_message", message: "Europe in 2026" },
    }));
  });

  it("renders the latest plan inline and executes its exact version", async () => {
    vi.mocked(api.getConversation).mockResolvedValue(plannedDetail);
    vi.mocked(api.getActiveResearch).mockResolvedValue({
      thread_id: "thread-1", state: { plan_version: 1 }, interrupted: true,
      interrupt_payload: { kind: "plan_ready", plan_version: 1, plan: { summary: plan.summary, steps: plan.steps } },
    });
    vi.mocked(api.resumeResearch).mockResolvedValue({
      thread_id: "thread-1", state: { report_id: 12 }, interrupted: false, interrupt_payload: null,
    });
    vi.mocked(api.getReport).mockResolvedValue({
      id: 12, project_id: 2, version: 1, format: "md", content_md: "# Completed report", file_path: null, created_at: "",
    });
    render(<I18nProvider><App /></I18nProvider>);
    expect(await screen.findByText("Compare pricing and limits")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Execute plan" }));
    await waitFor(() => expect(api.resumeResearch).toHaveBeenCalledWith("thread-1", {
      profile_id: 7,
      response_language: "en",
      decision: { kind: "execute_plan", plan_version: 1 },
    }));
  });

  it("restores a completed report from conversation history", async () => {
    vi.mocked(api.getConversation).mockResolvedValue({
      ...plannedDetail,
      status: "completed",
      projects: [{ ...plannedDetail.projects[0], status: "done", latest_report_id: 12, latest_report_version: 1, reports: [{ id: 12, version: 1, created_at: "" }] }],
    });
    vi.mocked(api.getReport).mockResolvedValue({
      id: 12, project_id: 2, version: 1, format: "md", content_md: "# Completed report", file_path: null, created_at: "",
    });
    render(<I18nProvider><App /></I18nProvider>);
    expect(await screen.findByRole("heading", { name: "Completed report" })).toBeInTheDocument();
    expect(api.getReport).toHaveBeenCalledWith(12);
  });

  it("routes a completed follow-up and exposes correction", async () => {
    vi.mocked(api.getConversation).mockResolvedValue({
      ...plannedDetail,
      status: "completed",
      projects: [{ ...plannedDetail.projects[0], status: "done", latest_report_id: 12, latest_report_version: 1 }],
    });
    vi.mocked(api.getReport).mockResolvedValue({
      id: 12, project_id: 2, version: 1, format: "md", content_md: "# Report", file_path: null, created_at: "",
    });
    vi.mocked(api.followUpResearch).mockResolvedValue({
      route: "report_revision", reason: "Formatting only", run: null, report_id: 13,
    });
    render(<I18nProvider><App /></I18nProvider>);
    await screen.findByRole("heading", { name: "Report" });
    await userEvent.type(screen.getByLabelText("Research request"), "Rewrite the summary");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Routed to report revision")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change to replan" })).toBeInTheDocument();
  });

  it("opens execution details as an on-demand drawer", async () => {
    vi.mocked(api.getConversation).mockResolvedValue(plannedDetail);
    render(<I18nProvider><App /></I18nProvider>);
    await screen.findByText("Compare pricing and limits");
    await userEvent.click(screen.getByRole("button", { name: "Progress" }));
    expect(screen.getByRole("heading", { name: "Execution details" })).toBeInTheDocument();
  });
});
