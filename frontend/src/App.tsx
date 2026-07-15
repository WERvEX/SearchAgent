import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { api } from "./api/client";
import type {
  ConversationDetail,
  ConversationRead,
  MCPServer,
  PreferenceRead,
  LLMProfileRead,
  ReportRead,
  ResearchLifecycleEvent,
  ResearchRunPhase,
  ResearchRunResponse,
} from "./api/types";
import { AppPanel, AppShell } from "./components/AppShell";
import { ConversationPanel } from "./components/ConversationPanel";
import { PlanPanel, type ResearchPlan } from "./components/PlanPanel";
import { ProgressStream } from "./components/ProgressStream";
import { ReportPanel } from "./components/ReportPanel";
import { ResearchWorkspace } from "./components/ResearchWorkspace";
import { SettingsPanel } from "./components/SettingsPanel";
import { useEventStream } from "./hooks/useEventStream";

function createPlaceholderRun(threadId: string): ResearchRunResponse {
  return {
    thread_id: threadId,
    state: {},
    interrupted: false,
    interrupt_payload: null,
  };
}

function deriveRunPhaseFromResponse(run: ResearchRunResponse): ResearchRunPhase {
  return run.interrupted ? "awaiting_approval" : "completed";
}

function isStableRunPhase(phase: ResearchRunPhase) {
  return phase === "awaiting_approval" || phase === "completed" || phase === "failed";
}

function resolveSelectedProfileId(
  profileList: LLMProfileRead[],
  options: { preferredId?: number | null; currentId?: number | null } = {},
) {
  const { preferredId = null, currentId = null } = options;

  if (preferredId !== null && profileList.some((profile) => profile.id === preferredId)) {
    return preferredId;
  }

  if (currentId !== null && profileList.some((profile) => profile.id === currentId)) {
    return currentId;
  }

  return profileList.find((profile) => profile.is_default)?.id ?? profileList[0]?.id ?? null;
}

function readMaxSourcesPreference(preference: PreferenceRead) {
  return typeof preference.value.value === "number" ? preference.value.value : null;
}

type SettingsLoadErrors = {
  profiles: string | null;
  maxSources: string | null;
  servers: string | null;
};

function getErrorStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : null;
}

function statusMessageForPhase(phase: ResearchRunPhase) {
  switch (phase) {
    case "starting":
      return "Starting research.";
    case "active":
      return "Research in progress.";
    case "awaiting_approval":
      return "Plan decision required.";
    case "resuming":
      return "Resuming research.";
    case "completed":
      return "Research completed.";
    case "failed":
      return "Research failed.";
    case "idle":
    default:
      return "Ready for research.";
  }
}

function mergeLifecycleEventIntoRun(
  currentRun: ResearchRunResponse | null,
  event: ResearchLifecycleEvent,
): ResearchRunResponse {
  const base =
    currentRun?.thread_id === event.data.thread_id ? currentRun : createPlaceholderRun(event.data.thread_id);
  const reportId = typeof event.data.report_id === "number" ? event.data.report_id : null;
  const nextState = reportId === null ? base.state : { ...base.state, report_id: reportId };

  if (event.event === "research.awaiting_approval") {
    return {
      ...base,
      state: nextState,
      interrupted: true,
    };
  }

  return {
    ...base,
    state: nextState,
    interrupted: false,
    interrupt_payload:
      event.event === "research.started" || event.event === "research.resumed" ? base.interrupt_payload : null,
  };
}

export default function App() {
  const [activePanel, setActivePanel] = useState<AppPanel>("research");
  const [conversations, setConversations] = useState<ConversationRead[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const [profiles, setProfiles] = useState<LLMProfileRead[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [maxSources, setMaxSources] = useState(8);
  const [settingsLoadErrors, setSettingsLoadErrors] = useState<SettingsLoadErrors>({
    profiles: null,
    maxSources: null,
    servers: null,
  });
  const [currentRun, setCurrentRun] = useState<ResearchRunResponse | null>(null);
  const [retainedReportId, setRetainedReportId] = useState<number | null>(null);
  const [report, setReport] = useState<ReportRead | null>(null);
  const [statusMessage, setStatusMessage] = useState("Loading workspace...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runPhase, setRunPhase] = useState<ResearchRunPhase>("idle");
  const runPhaseRef = useRef<ResearchRunPhase>("idle");
  const resumePendingRef = useRef(false);

  const reportId = typeof currentRun?.state.report_id === "number" ? currentRun.state.report_id : retainedReportId;

  const updateRunPhase = useCallback((nextPhase: SetStateAction<ResearchRunPhase>) => {
    setRunPhase((current) => {
      const resolvedPhase = typeof nextPhase === "function" ? nextPhase(current) : nextPhase;
      runPhaseRef.current = resolvedPhase;
      return resolvedPhase;
    });
  }, []);

  const handleLifecycleEvent = useCallback((event: ResearchLifecycleEvent) => {
    setCurrentRun((current) => mergeLifecycleEventIntoRun(current, event));

    if (typeof event.data.report_id === "number") {
      setRetainedReportId(event.data.report_id);
    }

    if (event.event === "research.started" || event.event === "research.resumed") {
      updateRunPhase("active");
      setStatusMessage(statusMessageForPhase("active"));
      return;
    }

    if (event.event === "research.awaiting_approval") {
      updateRunPhase("awaiting_approval");
      setStatusMessage(statusMessageForPhase("awaiting_approval"));
      return;
    }

    if (event.event === "research.completed") {
      updateRunPhase("completed");
      setStatusMessage(statusMessageForPhase("completed"));
      return;
    }

    if (event.event === "research.failed") {
      updateRunPhase("failed");
      setStatusMessage(statusMessageForPhase("failed"));
      if (typeof event.data.message === "string") {
        setErrorMessage(event.data.message);
      }
    }
  }, [updateRunPhase]);

  const eventStream = useEventStream({
    threadId: currentRun?.thread_id ?? null,
    conversationId: activeConversation?.id ?? null,
    replayLimit: 100,
    displayLimit: 80,
    promoteDiscoveredThread: runPhase === "starting" && currentRun === null,
    onEvent: handleLifecycleEvent,
  });

  const loadMaxSourcesPreference = useCallback(async () => {
    try {
      const preference = await api.getPreference("max_sources");
      return readMaxSourcesPreference(preference) ?? 8;
    } catch (error) {
      if (getErrorStatus(error) === 404) {
        return 8;
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialState() {
      try {
        setErrorMessage(null);
        const conversationList = await api.listConversations();
        if (cancelled) {
          return;
        }

        setConversations(conversationList);

        if (conversationList[0]) {
          setActiveConversationId(conversationList[0].id);
        } else {
          setStatusMessage("Create a conversation to begin.");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load workspace.");
          setStatusMessage("Unable to load workspace.");
        }
      }
    }

    void loadInitialState();

    return () => {
      cancelled = true;
    };
  }, [loadMaxSourcesPreference]);

  useEffect(() => {
    let cancelled = false;

    async function loadSettingsState() {
      setSettingsLoadErrors({
        profiles: null,
        maxSources: null,
        servers: null,
      });

      const [profileResult, sourceLimitResult, serverResult] = await Promise.allSettled([
        api.listLLMProfiles(),
        loadMaxSourcesPreference(),
        api.listMCPServers(),
      ]);

      if (cancelled) {
        return;
      }

      if (profileResult.status === "fulfilled") {
        setProfiles(profileResult.value);
        setSelectedProfileId((currentId) =>
          resolveSelectedProfileId(profileResult.value, {
            currentId,
          }),
        );
      } else {
        setSettingsLoadErrors((current) => ({
          ...current,
          profiles: profileResult.reason instanceof Error ? profileResult.reason.message : "Failed to load profiles.",
        }));
      }

      if (sourceLimitResult.status === "fulfilled") {
        setMaxSources(sourceLimitResult.value);
      } else {
        setSettingsLoadErrors((current) => ({
          ...current,
          maxSources:
            sourceLimitResult.reason instanceof Error ? sourceLimitResult.reason.message : "Failed to load source limit.",
        }));
      }

      if (serverResult.status === "fulfilled") {
        setServers(serverResult.value);
      } else {
        setSettingsLoadErrors((current) => ({
          ...current,
          servers: serverResult.reason instanceof Error ? serverResult.reason.message : "Failed to load MCP servers.",
        }));
      }
    }

    void loadSettingsState();

    return () => {
      cancelled = true;
    };
  }, [loadMaxSourcesPreference]);

  useEffect(() => {
    if (activeConversationId === null) {
      setActiveConversation(null);
      setCurrentRun(null);
      setRetainedReportId(null);
      updateRunPhase("idle");
      return;
    }

    const conversationId = activeConversationId;
    let cancelled = false;

    async function loadConversation() {
      try {
        setErrorMessage(null);
        const detail = await api.getConversation(conversationId);
        if (cancelled) {
          return;
        }
        setActiveConversation(detail);
        setCurrentRun(null);
        setRetainedReportId(null);
        updateRunPhase("idle");
        setStatusMessage(statusMessageForPhase("idle"));
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load conversation.");
        }
      }
    }

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [activeConversationId, updateRunPhase]);

  useEffect(() => {
    if (reportId === null) {
      setReport(null);
      return;
    }

    const id = reportId;

    let cancelled = false;

    async function loadReport() {
      try {
        const nextReport = await api.getReport(id);
        if (!cancelled) {
          setReport(nextReport);
        }
      } catch (error) {
        if (!cancelled) {
          setReport(null);
          setErrorMessage(error instanceof Error ? error.message : "Failed to load report.");
        }
      }
    }

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const plan = useMemo(() => {
    const payload = currentRun?.interrupt_payload;
    const rawPlan = payload?.plan;
    if (!rawPlan || typeof rawPlan !== "object") {
      return null;
    }

    const summary = "summary" in rawPlan && typeof rawPlan.summary === "string" ? rawPlan.summary : undefined;
    const rawOptions = "options" in rawPlan && Array.isArray(rawPlan.options) ? rawPlan.options : [];
    const options = rawOptions
      .map((option) => {
        if (!option || typeof option !== "object") {
          return null;
        }

        const id = "id" in option && typeof option.id === "string" ? option.id : null;
        const title = "label" in option && typeof option.label === "string" ? option.label : null;

        return id && title ? { id, title } : null;
      })
      .filter((option): option is NonNullable<typeof option> => option !== null);

    const result: ResearchPlan = {};
    if (summary) {
      result.summary = summary;
    }
    if (options.length > 0) {
      result.options = options;
    }
    return result;
  }, [currentRun]);

  async function handleCreateConversation() {
    try {
      setErrorMessage(null);
      const created = await api.createConversation("Untitled");
      setConversations((current) => [created, ...current]);
      setActiveConversationId(created.id);
      setStatusMessage("Conversation created.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create conversation.");
    }
  }

  async function handleStartResearch(message: string) {
    if (
      !activeConversation ||
      !selectedProfileId ||
      runPhase === "starting" ||
      runPhase === "active" ||
      runPhase === "awaiting_approval" ||
      runPhase === "resuming"
    ) {
      return;
    }

      try {
        setErrorMessage(null);
        setCurrentRun(null);
        updateRunPhase("starting");
        setStatusMessage(statusMessageForPhase("starting"));
        const run = await api.startResearch({
        conversation_id: activeConversation.id,
        profile_id: selectedProfileId,
        user_message: message,
      });
      setCurrentRun(run);
      if (typeof run.state.report_id === "number") {
        setRetainedReportId(run.state.report_id);
        }
        let nextPhase = deriveRunPhaseFromResponse(run);
        updateRunPhase((current) => {
          nextPhase = isStableRunPhase(current) ? current : deriveRunPhaseFromResponse(run);
          return nextPhase;
        });
      setStatusMessage(statusMessageForPhase(nextPhase));
      const detail = await api.getConversation(activeConversation.id);
      setActiveConversation(detail);
        setConversations((current) =>
          current.map((conversation) => (conversation.id === detail.id ? detail : conversation)),
        );
      } catch (error) {
        if (runPhaseRef.current === "completed" || runPhaseRef.current === "failed") {
          return;
        }
        let recoveredPhase: ResearchRunPhase = "idle";
        updateRunPhase((current) => {
          recoveredPhase = current === "completed" || current === "failed" ? current : "idle";
          return recoveredPhase;
        });
        setStatusMessage(statusMessageForPhase(recoveredPhase));
        setErrorMessage(error instanceof Error ? error.message : "Failed to start research.");
      }
  }

  async function handleResumeResearch(decision: { approved: true; chosen_option: string } | { approved: false; feedback: string }) {
    if (
      !currentRun ||
      !selectedProfileId ||
      !activeConversation ||
      runPhase !== "awaiting_approval" ||
      resumePendingRef.current
    ) {
      return;
    }

      try {
        resumePendingRef.current = true;
        setErrorMessage(null);
        updateRunPhase("resuming");
        setStatusMessage(statusMessageForPhase("resuming"));
        const run = await api.resumeResearch(currentRun.thread_id, {
        profile_id: selectedProfileId,
        decision,
      });
      setCurrentRun(run);
      if (typeof run.state.report_id === "number") {
        setRetainedReportId(run.state.report_id);
        }
        let nextPhase = deriveRunPhaseFromResponse(run);
        updateRunPhase((current) => {
          nextPhase = isStableRunPhase(current) ? current : deriveRunPhaseFromResponse(run);
          return nextPhase;
        });
      setStatusMessage(statusMessageForPhase(nextPhase));
      const detail = await api.getConversation(activeConversation.id);
      setActiveConversation(detail);
        setConversations((current) =>
          current.map((conversation) => (conversation.id === detail.id ? detail : conversation)),
        );
      } catch (error) {
        if (runPhaseRef.current === "completed" || runPhaseRef.current === "failed") {
          return;
        }
        let recoveredPhase: ResearchRunPhase = "awaiting_approval";
        updateRunPhase((current) => {
          recoveredPhase = current === "completed" || current === "failed" ? current : "awaiting_approval";
          return recoveredPhase;
        });
        setStatusMessage(statusMessageForPhase(recoveredPhase));
        setErrorMessage(error instanceof Error ? error.message : "Failed to resume research.");
      } finally {
      resumePendingRef.current = false;
    }
  }

  async function handleLoadReport() {
    if (reportId === null) {
      return;
    }

    try {
      setErrorMessage(null);
      setReport(await api.getReport(reportId));
      setStatusMessage("Report loaded.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load report.");
    }
  }

  async function handleCreateProfile(payload: {
    name: string;
    provider: string;
    base_url?: string | null;
    model: string;
    api_key?: string | null;
    params?: Record<string, unknown> | null;
    is_default?: boolean;
  }) {
    const created = await api.createLLMProfile(payload);
    setProfiles((current) => {
      const remainingProfiles = current
        .filter((profile) => profile.id !== created.id)
        .map((profile) => (created.is_default ? { ...profile, is_default: false } : profile));
      return [created, ...remainingProfiles];
    });
    setSelectedProfileId(created.id);
    setSettingsLoadErrors((current) => ({ ...current, profiles: null }));
  }

  async function handleTestProfile(profileId: number) {
    return api.testLLMProfile(profileId);
  }

  async function handleSaveMaxSources(value: number) {
    const saved = await api.setPreference("max_sources", value);
    setMaxSources(readMaxSourcesPreference(saved) ?? value);
    setSettingsLoadErrors((current) => ({ ...current, maxSources: null }));
  }

  async function handleCreateServer(payload: Omit<MCPServer, "id">) {
    const created = await api.createMCPServer(payload);
    setServers((current) => [created, ...current.filter((server) => server.id !== created.id)]);
    setSettingsLoadErrors((current) => ({ ...current, servers: null }));
  }

  const backendDefaultProfile = profiles.find((profile) => profile.is_default) ?? null;
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  return (
    <AppShell
      activePanel={activePanel}
      onPanelChange={setActivePanel}
      left={
        <ConversationPanel
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={setActiveConversationId}
          onCreate={handleCreateConversation}
        />
      }
      main={
        activePanel === "settings" ? (
          <SettingsPanel
            profiles={profiles}
            selectedProfileId={selectedProfileId}
            servers={servers}
            maxSources={maxSources}
            onSelectProfile={setSelectedProfileId}
            onCreateProfile={handleCreateProfile}
            onTestProfile={handleTestProfile}
            onSaveMaxSources={handleSaveMaxSources}
            onCreateServer={handleCreateServer}
            loadErrors={settingsLoadErrors}
          />
        ) : (
          <div className="flex h-full flex-col">
            <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-3 text-sm text-zinc-600">
              <div>{statusMessage}</div>
              {selectedProfileId ? (
                <div className="mt-1 text-xs text-zinc-500">
                  Profile: {profiles.find((profile) => profile.id === selectedProfileId)?.name ?? "Selected"}
                </div>
              ) : (
                <div className="mt-1 text-xs text-amber-700">No LLM profile available.</div>
              )}
              {errorMessage ? <div className="mt-1 text-xs text-red-600">{errorMessage}</div> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <div className={reportId === null ? "h-full" : "min-h-full"}>
                <ResearchWorkspace
                  conversation={activeConversation}
                  profileId={selectedProfileId}
                  runPhase={runPhase}
                  onStart={handleStartResearch}
                />
              </div>
              {reportId !== null ? (
                <ReportPanel
                  report={report}
                  markdownUrl={api.markdownDownloadUrl(reportId)}
                  pdfUrl={api.pdfDownloadUrl(reportId)}
                  onLoadReport={handleLoadReport}
                />
              ) : null}
            </div>
          </div>
        )
      }
      right={
        activePanel === "settings" ? (
          <section className="h-full overflow-auto bg-white">
            <div className="border-b border-zinc-200 px-4 py-4">
              <h2 className="text-sm font-semibold text-zinc-950">Research summary</h2>
              <p className="mt-1 text-xs text-zinc-500">Current session choices pulled from backend settings.</p>
            </div>
            <dl className="divide-y divide-zinc-200 text-sm">
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Active profile</dt>
                <dd className="mt-1 text-zinc-900">{selectedProfile?.name ?? "No profile selected"}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Backend default</dt>
                <dd className="mt-1 text-zinc-900">{backendDefaultProfile?.name ?? "Not configured"}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Max sources</dt>
                <dd className="mt-1 text-zinc-900">{maxSources}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">MCP servers</dt>
                <dd className="mt-1 text-zinc-900">{servers.length}</dd>
              </div>
            </dl>
            {errorMessage ? <p className="px-4 py-3 text-sm text-red-600">{errorMessage}</p> : null}
          </section>
        ) : (
          <div className="grid h-full grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
            <PlanPanel
              awaitingDecision={runPhase === "awaiting_approval"}
              pending={runPhase === "resuming"}
              plan={plan}
              onApprove={handleResumeResearch}
              onReplan={handleResumeResearch}
            />
            <ProgressStream status={eventStream.status} events={eventStream.events} />
          </div>
        )
      }
    />
  );
}
