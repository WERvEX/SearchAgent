import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./api/client";
import { I18nProvider } from "./i18n/I18nProvider";

vi.mock("./api/client", () => ({
  api: {
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    getConversation: vi.fn(),
    startResearch: vi.fn(),
    resumeResearch: vi.fn(),
    listLLMProfiles: vi.fn(),
    createLLMProfile: vi.fn(),
    testLLMProfile: vi.fn(),
    getPreference: vi.fn(),
    setPreference: vi.fn(),
    listMCPServers: vi.fn(),
    createMCPServer: vi.fn(),
    getReport: vi.fn(),
    markdownDownloadUrl: vi.fn((id: number) => `/api/reports/${id}/download.md`),
    pdfDownloadUrl: vi.fn((id: number) => `/api/reports/${id}/download.pdf`),
  },
}));

const conversation = {
  id: 4,
  title: "Search API evaluation",
  status: "idle",
  created_at: "",
  updated_at: "",
};

const conversationDetail = { ...conversation, messages: [], projects: [] };
const profile = {
  id: 7,
  name: "Default profile",
  provider: "openai",
  base_url: null,
  model: "gpt-5",
  api_key: "",
  params: null,
  is_default: true,
};

const completedReport = {
  id: 12,
  project_id: 2,
  version: 1,
  format: "md",
  content_md: "# Completed report",
  file_path: null,
  created_at: "2026-07-15T10:30:00Z",
};

class MockEventSource {
  static instance: MockEventSource | null = null;
  static instances: MockEventSource[] = [];

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly listeners = new Map<string, (message: MessageEvent<string>) => void>();
  closed = false;

  constructor(public readonly url: string) {
    MockEventSource.instance = this;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (message: MessageEvent<string>) => void) {
    this.listeners.set(type, listener);
  }

  close() {
    this.closed = true;
  }
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    MockEventSource.instance = null;
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    vi.mocked(api.listConversations).mockResolvedValue([conversation]);
    vi.mocked(api.listLLMProfiles).mockResolvedValue([profile]);
    vi.mocked(api.getPreference).mockResolvedValue({ key: "max_sources", value: { value: 8 } });
    vi.mocked(api.listMCPServers).mockResolvedValue([]);
    vi.mocked(api.createLLMProfile).mockResolvedValue(profile);
    vi.mocked(api.testLLMProfile).mockResolvedValue({ ok: true, error: null });
    vi.mocked(api.setPreference).mockResolvedValue({ key: "max_sources", value: { value: 12 } });
    vi.mocked(api.createMCPServer).mockResolvedValue({
      id: 3,
      name: "bocha",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@humansean/mcp-bocha"],
      env: { BOCHA_API_KEY: "secr****" },
      url: null,
      enabled: true,
    });
    vi.mocked(api.getConversation).mockResolvedValue(conversationDetail);
  });

  it("updates an existing application status message when the locale changes", async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    await screen.findByText("Ready for research.");
    await user.click(screen.getByRole("button", { name: "Switch language to Chinese" }));

    expect(await screen.findByText("准备开始研究。")).toBeInTheDocument();
  });

  it("maps the backend interrupted plan payload and submits the selected approval", async () => {
    const user = userEvent.setup();
    vi.mocked(api.startResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: {},
      interrupted: true,
      interrupt_payload: {
        plan: {
          summary: "Compare search APIs by cost and quality.",
          options: [
            { id: "A", label: "Cost-focused comparison" },
            { id: "B", label: "Quality-focused comparison" },
          ],
        },
      },
    });
    vi.mocked(api.resumeResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: {},
      interrupted: false,
      interrupt_payload: null,
    });

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.type(screen.getByLabelText("Research request"), "Compare search APIs");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("Compare search APIs by cost and quality.")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Quality-focused comparison"));
    await user.click(screen.getByRole("button", { name: /approve plan/i }));

    await waitFor(() =>
      expect(api.resumeResearch).toHaveBeenCalledWith("thread-1", {
        profile_id: 7,
        decision: { approved: true, chosen_option: "B" },
      }),
    );
  });

  it("does not start another research request while a plan decision is pending", async () => {
    const user = userEvent.setup();
    vi.mocked(api.startResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: {},
      interrupted: true,
      interrupt_payload: {
        plan: { summary: "Choose a scope.", options: [{ id: "A", label: "Broad scope" }] },
      },
    });

    render(<App />);

    await screen.findByText("Search API evaluation");
    const request = screen.getByLabelText("Research request");
    await user.type(request, "First request");
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByText("Choose a scope.");

    await user.type(request, "Second request");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(api.startResearch).toHaveBeenCalledTimes(1);
  });

  it("loads the numeric report_id from a completed run", async () => {
    const user = userEvent.setup();
    vi.mocked(api.startResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: { report_id: 12 },
      interrupted: false,
      interrupt_payload: null,
    });
    vi.mocked(api.getReport).mockResolvedValue({
      id: 12,
      project_id: 2,
      version: 1,
      format: "md",
      content_md: "# Completed report",
      file_path: null,
      created_at: "2026-07-15T10:30:00Z",
    });

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.type(screen.getByLabelText("Research request"), "Complete the report");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(api.getReport).toHaveBeenCalledWith(12));
    expect(await screen.findByRole("heading", { name: "Completed report" })).toBeInTheDocument();
  });

  it("renders the backend research.plan_ready SSE contract for the active run", async () => {
    const user = userEvent.setup();
    vi.mocked(api.startResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: {},
      interrupted: false,
      interrupt_payload: null,
    });

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.type(screen.getByLabelText("Research request"), "Compare search APIs");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?thread_id=thread-1&replay_limit=100"));
    act(() => {
      MockEventSource.instance?.listeners.get("research.plan_ready")?.({
        data: JSON.stringify({
          thread_id: "thread-1",
          conversation_id: 4,
          project_id: 9,
          option_count: 2,
        }),
        lastEventId: "42",
      } as MessageEvent<string>);
    });

    expect(await screen.findByText("Plan ready")).toBeInTheDocument();
    expect(screen.getByText(/"option_count": 2/)).toBeInTheDocument();
  });

  it("renders active-conversation lifecycle progress before starting research resolves", async () => {
    const user = userEvent.setup();
    let resolveStart: (run: { thread_id: string; state: {}; interrupted: boolean; interrupt_payload: null }) => void;
    vi.mocked(api.startResearch).mockImplementation(
      () => new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );

    render(<App />);

    await screen.findByText("Search API evaluation");
    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?conversation_id=4&replay_limit=100"));
    await user.type(screen.getByLabelText("Research request"), "Compare search APIs");
    await user.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?conversation_id=4&replay_limit=100"));
    const conversationSource = MockEventSource.instance;

    act(() => {
      conversationSource?.listeners.get("research.started")?.({
        data: JSON.stringify({ thread_id: "thread-1", conversation_id: 4, project_id: 9 }),
        lastEventId: "1",
      } as MessageEvent<string>);
    });

    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?thread_id=thread-1&replay_limit=100"));
    expect(conversationSource?.closed).toBe(true);
    expect(await screen.findByText("Research started")).toBeInTheDocument();

    await act(async () => {
      resolveStart!({ thread_id: "thread-1", state: {}, interrupted: false, interrupt_payload: null });
    });
  });

  it("keeps the completed state when the start response resolves after SSE completion", async () => {
    const user = userEvent.setup();
    let resolveStart: (run: { thread_id: string; state: { report_id: number }; interrupted: false; interrupt_payload: null }) => void;
    vi.mocked(api.getReport).mockResolvedValue(completedReport);
    vi.mocked(api.startResearch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.type(screen.getByLabelText("Research request"), "Compare search APIs");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?conversation_id=4&replay_limit=100"));
    const conversationSource = MockEventSource.instance;

    act(() => {
      conversationSource?.listeners.get("research.started")?.({
        data: JSON.stringify({ thread_id: "thread-1", conversation_id: 4, project_id: 9 }),
        lastEventId: "evt-1",
      } as MessageEvent<string>);
    });

    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?thread_id=thread-1&replay_limit=100"));
    const threadSource = MockEventSource.instance;

    act(() => {
      threadSource?.listeners.get("research.completed")?.({
        data: JSON.stringify({ thread_id: "thread-1", conversation_id: 4, project_id: 9, report_id: 12 }),
        lastEventId: "evt-2",
      } as MessageEvent<string>);
    });

    await waitFor(() => expect(api.getReport).toHaveBeenCalledWith(12));
    expect(await screen.findByRole("heading", { name: "Completed report" })).toBeInTheDocument();

    await act(async () => {
      resolveStart!({ thread_id: "thread-1", state: { report_id: 12 }, interrupted: false, interrupt_payload: null });
    });

    await user.type(screen.getByLabelText("Research request"), "Second request");
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("keeps the completed terminal status when startResearch rejects after SSE completion", async () => {
    const user = userEvent.setup();
    let rejectStart: (error: Error) => void;
    vi.mocked(api.getReport).mockResolvedValue(completedReport);
    vi.mocked(api.startResearch).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectStart = reject;
        }),
    );

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.type(screen.getByLabelText("Research request"), "Compare search APIs");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?conversation_id=4&replay_limit=100"));
    const conversationSource = MockEventSource.instance;

    act(() => {
      conversationSource?.listeners.get("research.started")?.({
        data: JSON.stringify({ thread_id: "thread-1", conversation_id: 4, project_id: 9 }),
        lastEventId: "evt-start-1",
      } as MessageEvent<string>);
    });

    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?thread_id=thread-1&replay_limit=100"));
    const threadSource = MockEventSource.instance;

    act(() => {
      threadSource?.listeners.get("research.completed")?.({
        data: JSON.stringify({ thread_id: "thread-1", conversation_id: 4, project_id: 9, report_id: 12 }),
        lastEventId: "evt-start-2",
      } as MessageEvent<string>);
    });

    await waitFor(() => expect(api.getReport).toHaveBeenCalledWith(12));
    expect(await screen.findByRole("heading", { name: "Completed report" })).toBeInTheDocument();
    expect(screen.queryByText("Late start failure")).not.toBeInTheDocument();

    await act(async () => {
      rejectStart!(new Error("Late start failure"));
    });

    expect(screen.getByRole("heading", { name: "Completed report" })).toBeInTheDocument();
    expect(screen.queryByText("Late start failure")).not.toBeInTheDocument();
  });

  it("returns to idle with an error when startResearch fails before any terminal SSE event", async () => {
    const user = userEvent.setup();
    vi.mocked(api.startResearch).mockRejectedValue(new Error("Start request failed"));

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.type(screen.getByLabelText("Research request"), "Compare search APIs");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("Ready for research.")).toBeInTheDocument();
    expect(screen.getByText("Start request failed")).toBeInTheDocument();
  });

  it("recovers to idle when startResearch rejects after an early research.started SSE", async () => {
    const user = userEvent.setup();
    let rejectStart: (error: Error) => void;
    vi.mocked(api.startResearch).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectStart = reject;
        }),
    );

    render(<App />);

    await screen.findByText("Search API evaluation");
    const request = screen.getByLabelText("Research request");
    const startButton = screen.getByRole("button", { name: "Start" });
    await user.type(request, "Compare search APIs");
    await user.click(startButton);

    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?conversation_id=4&replay_limit=100"));
    const conversationSource = MockEventSource.instance;

    act(() => {
      conversationSource?.listeners.get("research.started")?.({
        data: JSON.stringify({ thread_id: "thread-1", conversation_id: 4, project_id: 9 }),
        lastEventId: "evt-start-reject-1",
      } as MessageEvent<string>);
    });

    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?thread_id=thread-1&replay_limit=100"));
    expect(await screen.findByText("Research in progress.")).toBeInTheDocument();
    expect(startButton).toBeDisabled();

    await act(async () => {
      rejectStart!(new Error("Late start rejection"));
    });

    expect(await screen.findByText("Ready for research.")).toBeInTheDocument();
    expect(screen.getByText("Late start rejection")).toBeInTheDocument();
    await user.type(request, "Retry request");
    expect(startButton).toBeEnabled();
  });

  it("returns to conversation-scoped subscription before restarting after completion and promotes on research.started", async () => {
    const user = userEvent.setup();
    let resolveRestart: (run: { thread_id: string; state: {}; interrupted: false; interrupt_payload: null }) => void;
    vi.mocked(api.getReport).mockResolvedValue(completedReport);
    vi.mocked(api.startResearch)
      .mockResolvedValueOnce({
        thread_id: "thread-1",
        state: { report_id: 12 },
        interrupted: false,
        interrupt_payload: null,
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRestart = resolve;
          }),
      );

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.type(screen.getByLabelText("Research request"), "First request");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?thread_id=thread-1&replay_limit=100"));
    const completedThreadSource = MockEventSource.instance;
    expect(await screen.findByRole("heading", { name: "Completed report" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Research request"), "Second request");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?conversation_id=4&replay_limit=100"));
    const restartedConversationSource = MockEventSource.instance;
    expect(completedThreadSource?.closed).toBe(true);
    expect(screen.getByRole("heading", { name: "Completed report" })).toBeInTheDocument();

    act(() => {
      restartedConversationSource?.listeners.get("research.started")?.({
        data: JSON.stringify({ thread_id: "thread-2", conversation_id: 4, project_id: 10 }),
        lastEventId: "evt-3",
      } as MessageEvent<string>);
    });

    await waitFor(() => expect(MockEventSource.instance?.url).toBe("/events?thread_id=thread-2&replay_limit=100"));
    expect(restartedConversationSource?.closed).toBe(true);

    await act(async () => {
      resolveRestart!({ thread_id: "thread-2", state: {}, interrupted: false, interrupt_payload: null });
    });
  });

  it("prevents duplicate resume submissions and handles an early research.resumed event", async () => {
    const user = userEvent.setup();
    let resolveResume: (run: { thread_id: string; state: { report_id: number }; interrupted: false; interrupt_payload: null }) => void;
    vi.mocked(api.getReport).mockResolvedValue(completedReport);
    vi.mocked(api.startResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: {},
      interrupted: true,
      interrupt_payload: {
        plan: {
          summary: "Choose a scope.",
          options: [{ id: "A", label: "Broad scope" }],
        },
      },
    });
    vi.mocked(api.resumeResearch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResume = resolve;
        }),
    );

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.type(screen.getByLabelText("Research request"), "Compare search APIs");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await screen.findByText("Choose a scope.");
    const approveButton = screen.getByRole("button", { name: /approve plan/i });
    const replanButton = screen.getByRole("button", { name: /replan/i });

    await user.click(approveButton);
    expect(api.resumeResearch).toHaveBeenCalledTimes(1);
    expect(approveButton).toBeDisabled();
    expect(replanButton).toBeDisabled();

    await user.click(approveButton);
    expect(api.resumeResearch).toHaveBeenCalledTimes(1);

    act(() => {
      MockEventSource.instance?.listeners.get("research.resumed")?.({
        data: JSON.stringify({ thread_id: "thread-1", conversation_id: 4, project_id: 9 }),
        lastEventId: "evt-4",
      } as MessageEvent<string>);
    });

    expect(await screen.findByText("Research resumed")).toBeInTheDocument();
    expect(screen.getByText("Research in progress")).toBeInTheDocument();
    expect(approveButton).toBeDisabled();
    expect(replanButton).toBeDisabled();

    await act(async () => {
      resolveResume!({ thread_id: "thread-1", state: { report_id: 12 }, interrupted: false, interrupt_payload: null });
    });

    await waitFor(() => expect(api.getReport).toHaveBeenCalledWith(12));
    expect(await screen.findByRole("heading", { name: "Completed report" })).toBeInTheDocument();
  });

  it("keeps the failed terminal status when resumeResearch rejects after SSE failure", async () => {
    const user = userEvent.setup();
    let rejectResume: (error: Error) => void;
    vi.mocked(api.startResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: {},
      interrupted: true,
      interrupt_payload: {
        plan: {
          summary: "Choose a scope.",
          options: [{ id: "A", label: "Broad scope" }],
        },
      },
    });
    vi.mocked(api.resumeResearch).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectResume = reject;
        }),
    );

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.type(screen.getByLabelText("Research request"), "Compare search APIs");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await screen.findByText("Choose a scope.");
    await user.click(screen.getByRole("button", { name: /approve plan/i }));

    expect(await screen.findByText("Resuming research.")).toBeInTheDocument();

    act(() => {
      MockEventSource.instance?.listeners.get("research.failed")?.({
        data: JSON.stringify({
          thread_id: "thread-1",
          conversation_id: 4,
          project_id: 9,
          message: "Backend reported failure",
        }),
        lastEventId: "evt-resume-1",
      } as MessageEvent<string>);
    });

    expect(await screen.findByText("Research failed.")).toBeInTheDocument();
    expect(screen.getAllByText("Backend reported failure")).toHaveLength(2);

    await act(async () => {
      rejectResume!(new Error("Late resume failure"));
    });

    expect(screen.getByText("Research failed.")).toBeInTheDocument();
    expect(screen.getAllByText("Backend reported failure")).toHaveLength(2);
    expect(screen.queryByText("Late resume failure")).not.toBeInTheDocument();
  });

  it("returns to awaiting approval with an error when resumeResearch fails before any terminal SSE event", async () => {
    const user = userEvent.setup();
    vi.mocked(api.startResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: {},
      interrupted: true,
      interrupt_payload: {
        plan: {
          summary: "Choose a scope.",
          options: [{ id: "A", label: "Broad scope" }],
        },
      },
    });
    vi.mocked(api.resumeResearch).mockRejectedValue(new Error("Resume request failed"));

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.type(screen.getByLabelText("Research request"), "Compare search APIs");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await screen.findByText("Choose a scope.");
    await user.click(screen.getByRole("button", { name: /approve plan/i }));

    expect(await screen.findByText("Plan decision required.")).toBeInTheDocument();
    expect(screen.getByText("Resume request failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve plan/i })).toBeEnabled();
  });

  it("recovers to awaiting approval when resumeResearch rejects after an early research.resumed SSE", async () => {
    const user = userEvent.setup();
    let rejectResume: (error: Error) => void;
    vi.mocked(api.startResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: {},
      interrupted: true,
      interrupt_payload: {
        plan: {
          summary: "Choose a scope.",
          options: [{ id: "A", label: "Broad scope" }],
        },
      },
    });
    vi.mocked(api.resumeResearch).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectResume = reject;
        }),
    );

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.type(screen.getByLabelText("Research request"), "Compare search APIs");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await screen.findByText("Choose a scope.");
    const approveButton = screen.getByRole("button", { name: /approve plan/i });
    const replanButton = screen.getByRole("button", { name: /replan/i });

    await user.click(approveButton);
    expect(await screen.findByText("Resuming research.")).toBeInTheDocument();
    expect(approveButton).toBeDisabled();
    expect(replanButton).toBeDisabled();

    act(() => {
      MockEventSource.instance?.listeners.get("research.resumed")?.({
        data: JSON.stringify({ thread_id: "thread-1", conversation_id: 4, project_id: 9 }),
        lastEventId: "evt-resume-reject-1",
      } as MessageEvent<string>);
    });

    expect(await screen.findByText("Research in progress.")).toBeInTheDocument();

    await act(async () => {
      rejectResume!(new Error("Late resume rejection"));
    });

    expect(await screen.findByText("Plan decision required.")).toBeInTheDocument();
    expect(screen.getByText("Late resume rejection")).toBeInTheDocument();
    expect(approveButton).toBeEnabled();
    expect(replanButton).toBeEnabled();
  });

  it("prevents duplicate research starts while a started run is still in progress", async () => {
    const user = userEvent.setup();
    let resolveStart: (run: { thread_id: string; state: {}; interrupted: false; interrupt_payload: null }) => void;
    vi.mocked(api.startResearch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );

    render(<App />);

    await screen.findByText("Search API evaluation");
    const request = screen.getByLabelText("Research request");
    await user.type(request, "First request");
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(api.startResearch).toHaveBeenCalledTimes(1));
    act(() => {
      MockEventSource.instance?.listeners.get("research.started")?.({
        data: JSON.stringify({ thread_id: "thread-1", conversation_id: 4, project_id: 9 }),
        lastEventId: "evt-5",
      } as MessageEvent<string>);
    });

    await user.type(request, "Second request");

    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(api.startResearch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStart!({ thread_id: "thread-1", state: {}, interrupted: false, interrupt_payload: null });
    });
  });

  it("renders the unavailable progress state when EventSource is not supported", async () => {
    vi.stubGlobal("EventSource", undefined);

    render(<App />);

    await screen.findByText("Search API evaluation");
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });

  it("loads settings data on mount and falls back to 8 when max_sources is missing", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getPreference).mockRejectedValue(
      Object.assign(new Error("Preference not found"), { status: 404 }),
    );

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByLabelText("Max sources")).toHaveValue(8);
    expect(api.listMCPServers).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Preference not found")).not.toBeInTheDocument();
  });

  it("keeps the conversation workspace usable when settings requests fail on mount", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listLLMProfiles).mockRejectedValue(new Error("Profiles unavailable"));
    vi.mocked(api.listMCPServers).mockRejectedValue(new Error("MCP unavailable"));
    vi.mocked(api.getPreference).mockRejectedValue(new Error("Preference unavailable"));

    render(<App />);

    expect(await screen.findByText("Search API evaluation")).toBeInTheDocument();
    expect(await screen.findByLabelText("Research request")).toBeInTheDocument();
    expect(screen.queryByText("Unable to load workspace.")).not.toBeInTheDocument();
    expect(screen.queryByText("Profiles unavailable")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByText("Profiles unavailable")).toBeInTheDocument();
    expect(screen.getByText("MCP unavailable")).toBeInTheDocument();
    expect(screen.getByText("Preference unavailable")).toBeInTheDocument();
    expect(screen.getByLabelText("Max sources")).toHaveValue(8);
  });

  it("creates a profile from the returned record and selects it without refreshing the list", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listLLMProfiles).mockResolvedValueOnce([]);
    vi.mocked(api.createLLMProfile).mockResolvedValue({
      id: 9,
      name: "Local profile",
      provider: "openai_compatible",
      base_url: "http://localhost:11434/v1",
      model: "qwen",
      api_key: "sk-l****",
      params: { temperature: 0 },
      is_default: true,
    });

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.type(screen.getByLabelText("Profile name"), "Local profile");
    await user.clear(screen.getByLabelText("Provider"));
    await user.type(screen.getByLabelText("Provider"), "openai_compatible");
    await user.type(screen.getByLabelText("Model"), "qwen");
    await user.type(screen.getByLabelText("Base URL"), "http://localhost:11434/v1");
    await user.type(screen.getByLabelText("API key"), "sk-local");
    await user.click(screen.getByLabelText("Advanced params (JSON)"));
    await user.paste("{\"temperature\":0}");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(api.createLLMProfile).toHaveBeenCalledWith({
        name: "Local profile",
        provider: "openai_compatible",
        base_url: "http://localhost:11434/v1",
        model: "qwen",
        api_key: "sk-local",
        params: { temperature: 0 },
        is_default: true,
      }),
    );
    await waitFor(() => expect(api.listLLMProfiles).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText("Use Local profile for research")).toBeChecked();
  });

  it("saves the source limit through the wrapped preference contract", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const input = await screen.findByLabelText("Max sources");
    await user.clear(input);
    await user.type(input, "12");
    await user.click(screen.getByRole("button", { name: "Save source limit" }));

    await waitFor(() => expect(api.setPreference).toHaveBeenCalledWith("max_sources", 12));
    expect(await screen.findByText("Source limit saved.")).toBeInTheDocument();
  });

  it("creates an MCP server from the returned record without refreshing the list", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.click(screen.getByRole("button", { name: "Settings" }));

    await user.clear(screen.getByLabelText("MCP server name"));
    await user.type(screen.getByLabelText("MCP server name"), "bocha");
    await user.type(screen.getByLabelText("Command"), "npx");
    await user.clear(screen.getByLabelText("Arguments (one per line)"));
    await user.type(screen.getByLabelText("Arguments (one per line)"), "-y{enter}@humansean/mcp-bocha");
    await user.type(screen.getByLabelText("Environment variables (KEY=value)"), "BOCHA_API_KEY=secret");
    await user.click(screen.getByRole("button", { name: "Save server" }));

    await waitFor(() =>
      expect(api.createMCPServer).toHaveBeenCalledWith({
        name: "bocha",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@humansean/mcp-bocha"],
        env: { BOCHA_API_KEY: "secret" },
        url: null,
        enabled: true,
      }),
    );
    await waitFor(() => expect(api.listMCPServers).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("bocha")).toBeInTheDocument();
  });
});
