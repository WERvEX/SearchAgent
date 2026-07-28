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
import { SettingsPanel, type SettingsLoadErrors } from "./components/SettingsPanel";
import { useEventStream } from "./hooks/useEventStream";
import { useI18n } from "./i18n/I18nProvider";
import {
  messageFromError,
  rawMessage,
  renderLocalizedMessage,
  type LocalizedMessage,
  type MessageKey,
} from "./i18n/messages";

function createPlaceholderRun(threadId: string): ResearchRunResponse {
  return {
    thread_id: threadId,
    state: {},
    interrupted: false,
    interrupt_payload: null,
  };
}

function deriveRunPhaseFromResponse(run: ResearchRunResponse): ResearchRunPhase {
  return run.interrupted && run.interrupt_payload?.kind === "clarification"
    ? "awaiting_clarification"
    : run.interrupted
      ? "awaiting_approval"
      : "completed";
}

function getLatestProject(conversation: ConversationDetail) {
  return conversation.projects.reduce<(typeof conversation.projects)[number] | null>(
    (latest, project) => (latest === null || project.id > latest.id ? project : latest),
    null,
  );
}

function deriveRunPhaseFromConversation(conversation: ConversationDetail): ResearchRunPhase {
  const latestProject = getLatestProject(conversation);
  const status = latestProject?.status ?? conversation.status;

  if (status === "awaiting_clarification") {
    return "awaiting_clarification";
  }
  if (status === "awaiting_approval") {
    return "awaiting_approval";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "running" || status === "active") {
    return "active";
  }
  if (status === "done" || status === "completed" || latestProject?.latest_report_id != null) {
    return "completed";
  }
  return "idle";
}

function isStableRunPhase(phase: ResearchRunPhase) {
  return phase === "awaiting_clarification" || phase === "awaiting_approval" || phase === "completed" || phase === "failed";
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

function getErrorStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : null;
}

const phaseMessageKeys = {
  idle: "phase.idle",
  starting: "phase.starting",
  active: "phase.active",
  awaiting_clarification: "phase.awaiting_clarification",
  awaiting_approval: "phase.awaiting_approval",
  resuming: "phase.resuming",
  completed: "phase.completed",
  failed: "phase.failed",
} satisfies Record<ResearchRunPhase, MessageKey>;

function statusMessageForPhase(phase: ResearchRunPhase): MessageKey {
  return phaseMessageKeys[phase];
}

function mergeLifecycleEventIntoRun(
  currentRun: ResearchRunResponse | null,
  event: ResearchLifecycleEvent,
): ResearchRunResponse {
  const base =
    currentRun?.thread_id === event.data.thread_id ? currentRun : createPlaceholderRun(event.data.thread_id);
  const reportId = typeof event.data.report_id === "number" ? event.data.report_id : null;
  const nextState = reportId === null ? base.state : { ...base.state, report_id: reportId };

  if (event.event === "research.awaiting_clarification" || event.event === "research.awaiting_approval") {
    const interruptPayload = event.data.interrupt_payload;
    return {
      ...base,
      state: nextState,
      interrupted: true,
      interrupt_payload:
        interruptPayload && typeof interruptPayload === "object"
          ? interruptPayload as Record<string, unknown>
          : base.interrupt_payload,
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
  const { t } = useI18n();
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
  const [statusMessageKey, setStatusMessageKey] = useState<MessageKey>("app.loadingWorkspace");
  const [errorMessage, setErrorMessage] = useState<LocalizedMessage | null>(null);
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

  useEffect(() => {
    if (
      runPhase === "idle" ||
      runPhase === "awaiting_clarification" ||
      runPhase === "awaiting_approval" ||
      runPhase === "completed" ||
      runPhase === "failed"
    ) {
      resumePendingRef.current = false;
    }
  }, [runPhase]);

  const handleLifecycleEvent = useCallback((event: ResearchLifecycleEvent) => {
    setCurrentRun((current) => mergeLifecycleEventIntoRun(current, event));

    if (typeof event.data.report_id === "number") {
      setRetainedReportId(event.data.report_id);
    }

    if (event.event === "research.started" || event.event === "research.resumed") {
      updateRunPhase("active");
      setStatusMessageKey(statusMessageForPhase("active"));
      return;
    }

    if (event.event === "research.awaiting_clarification") {
      updateRunPhase("awaiting_clarification");
      setStatusMessageKey(statusMessageForPhase("awaiting_clarification"));
      return;
    }

    if (event.event === "research.awaiting_approval") {
      updateRunPhase("awaiting_approval");
      setStatusMessageKey(statusMessageForPhase("awaiting_approval"));
      return;
    }

    if (event.event === "research.completed") {
      updateRunPhase("completed");
      setStatusMessageKey(statusMessageForPhase("completed"));
      return;
    }

    if (event.event === "research.failed") {
      updateRunPhase("failed");
      setStatusMessageKey(statusMessageForPhase("failed"));
      if (typeof event.data.message === "string") {
        setErrorMessage(rawMessage(event.data.message));
      }
    }
  }, [updateRunPhase]);

  const eventStream = useEventStream({
    threadId: currentRun?.thread_id ?? null,
    conversationId: activeConversation?.id ?? null,
    replayLimit: runPhase === "starting" && currentRun === null ? 0 : 100,
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
        let conversationList = await api.listConversations();
        if (conversationList.length === 0) {
          conversationList = [await api.createConversation(t("conversation.untitled"))];
        }
        if (cancelled) {
          return;
        }

        setConversations(conversationList);

        setActiveConversationId(conversationList[0].id);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(messageFromError(error, "app.failedToLoadWorkspace"));
          setStatusMessageKey("app.unableToLoadWorkspace");
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
          profiles: messageFromError(profileResult.reason, "app.failedToLoadProfiles"),
        }));
      }

      if (sourceLimitResult.status === "fulfilled") {
        setMaxSources(sourceLimitResult.value);
      } else {
        setSettingsLoadErrors((current) => ({
          ...current,
          maxSources: messageFromError(sourceLimitResult.reason, "app.failedToLoadSourceLimit"),
        }));
      }

      if (serverResult.status === "fulfilled") {
        setServers(serverResult.value);
      } else {
        setSettingsLoadErrors((current) => ({
          ...current,
          servers: messageFromError(serverResult.reason, "app.failedToLoadMcpServers"),
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
        setCurrentRun(null);
        setRetainedReportId(null);
        setReport(null);
        const activeResearch = typeof api.getActiveResearch === "function"
          ? api.getActiveResearch(conversationId)
          : Promise.resolve(null);
        const [detail, activeRun] = await Promise.all([api.getConversation(conversationId), activeResearch]);
        if (cancelled) {
          return;
        }
        setActiveConversation(detail);
        setCurrentRun(activeRun);
        const latestReportId = getLatestProject(detail)?.latest_report_id ?? null;
        setRetainedReportId(latestReportId);
        const phase = activeRun ? deriveRunPhaseFromResponse(activeRun) : deriveRunPhaseFromConversation(detail);
        updateRunPhase(phase);
        setStatusMessageKey(statusMessageForPhase(phase));
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(messageFromError(error, "app.failedToLoadConversation"));
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
          setErrorMessage(messageFromError(error, "app.failedToLoadReport"));
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
      const created = await api.createConversation(t("conversation.untitled"));
      setConversations((current) => [created, ...current]);
      setActiveConversationId(created.id);
      setStatusMessageKey("app.conversationCreated");
    } catch (error) {
      setErrorMessage(messageFromError(error, "app.failedToCreateConversation"));
    }
  }

  async function handleStartResearch(message: string) {
    if (
      !activeConversation ||
      !selectedProfileId ||
      runPhase === "starting" ||
      runPhase === "active" ||
      runPhase === "awaiting_clarification" ||
      runPhase === "awaiting_approval" ||
      runPhase === "resuming"
    ) {
      return;
    }

      try {
        setErrorMessage(null);
        setCurrentRun(null);
        updateRunPhase("starting");
        setStatusMessageKey(statusMessageForPhase("starting"));
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
      setStatusMessageKey(statusMessageForPhase(nextPhase));
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
        setStatusMessageKey(statusMessageForPhase(recoveredPhase));
        setErrorMessage(messageFromError(error, "app.failedToStartResearch"));
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
        setStatusMessageKey(statusMessageForPhase("resuming"));
        const run = await api.resumeResearch(currentRun.thread_id, {
        profile_id: selectedProfileId,
        decision: { ...decision, kind: "plan_approval" },
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
      setStatusMessageKey(statusMessageForPhase(nextPhase));
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
        setStatusMessageKey(statusMessageForPhase(recoveredPhase));
        setErrorMessage(messageFromError(error, "app.failedToResumeResearch"));
      } finally {
      resumePendingRef.current = false;
    }
  }

  async function handleRenameConversation(conversationId: number, title: string) {
    try {
      setErrorMessage(null);
      const updated = await api.updateConversation(conversationId, title);
      setConversations((current) => current.map((conversation) => conversation.id === updated.id ? updated : conversation));
      setActiveConversation((current) => current?.id === updated.id ? { ...current, title: updated.title, updated_at: updated.updated_at } : current);
    } catch (error) {
      setErrorMessage(messageFromError(error, "app.failedToRenameConversation"));
    }
  }

  async function handleDeleteConversation(conversationId: number) {
    try {
      setErrorMessage(null);
      await api.deleteConversation(conversationId);
    } catch (error) {
      setErrorMessage(messageFromError(error, "app.failedToDeleteConversation"));
      return false;
    }

    const remaining = conversations.filter((conversation) => conversation.id !== conversationId);
    if (remaining.length > 0) {
      setConversations(remaining);
      if (activeConversationId === conversationId) {
        setActiveConversationId(remaining[0].id);
      }
      return true;
    }

    setConversations([]);
    setActiveConversationId(null);
    try {
      const created = await api.createConversation(t("conversation.untitled"));
      setConversations([created]);
      setActiveConversationId(created.id);
    } catch (error) {
      setErrorMessage(messageFromError(error, "app.failedToCreateConversation"));
    }
    return true;
  }

  async function handleClarification(answer: string) {
    if (
      !currentRun || !selectedProfileId || !activeConversation || runPhase !== "awaiting_clarification" || resumePendingRef.current
    ) {
      return;
    }

    try {
      resumePendingRef.current = true;
      setErrorMessage(null);
      updateRunPhase("resuming");
      setStatusMessageKey(statusMessageForPhase("resuming"));
      const run = await api.resumeResearch(currentRun.thread_id, {
        profile_id: selectedProfileId,
        decision: { kind: "clarification", answer },
      });
      setCurrentRun(run);
      const nextPhase = deriveRunPhaseFromResponse(run);
      updateRunPhase(nextPhase);
      setStatusMessageKey(statusMessageForPhase(nextPhase));
      const detail = await api.getConversation(activeConversation.id);
      setActiveConversation(detail);
      setConversations((current) => current.map((conversation) => (conversation.id === detail.id ? detail : conversation)));
    } catch (error) {
      if (runPhaseRef.current === "completed" || runPhaseRef.current === "failed") {
        return;
      }
      updateRunPhase("awaiting_clarification");
      setStatusMessageKey(statusMessageForPhase("awaiting_clarification"));
      setErrorMessage(messageFromError(error, "app.failedToResumeResearch"));
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
      setStatusMessageKey("app.reportLoaded");
    } catch (error) {
      setErrorMessage(messageFromError(error, "app.failedToLoadReport"));
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

  async function handleUpdateProfile(profileId: number, payload: {
    name: string;
    provider: string;
    base_url?: string | null;
    model: string;
    api_key?: string | null;
    params?: Record<string, unknown> | null;
    is_default?: boolean;
  }) {
    const updated = await api.updateLLMProfile(profileId, payload);
    setProfiles((current) => current.map((profile) =>
      profile.id === updated.id ? updated : updated.is_default ? { ...profile, is_default: false } : profile,
    ));
    setSelectedProfileId(updated.id);
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

  async function handleUpdateServer(serverId: number, payload: Omit<MCPServer, "id">) {
    const updated = await api.updateMCPServer(serverId, payload);
    setServers((current) => current.map((server) => server.id === updated.id ? updated : server));
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
          onRename={handleRenameConversation}
          onDelete={handleDeleteConversation}
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
            onUpdateProfile={handleUpdateProfile}
            onTestProfile={handleTestProfile}
            onSaveMaxSources={handleSaveMaxSources}
            onCreateServer={handleCreateServer}
            onUpdateServer={handleUpdateServer}
            loadErrors={settingsLoadErrors}
          />
        ) : (
          <div className="flex h-full flex-col">
            <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-3 text-sm text-zinc-600">
              <div>{t(statusMessageKey)}</div>
              {selectedProfileId ? (
                <div className="mt-1 text-xs text-zinc-500">
                  {t("app.profile", { name: profiles.find((profile) => profile.id === selectedProfileId)?.name ?? t("app.selected") })}
                </div>
              ) : (
                <div className="mt-1 text-xs text-amber-700">{t("app.noLlmProfile")}</div>
              )}
              {errorMessage ? <div className="mt-1 text-xs text-red-600">{renderLocalizedMessage(t, errorMessage)}</div> : null}
            </div>
            <div className="min-h-0 flex-1">
              <ResearchWorkspace
                conversation={activeConversation}
                profileId={selectedProfileId}
                runPhase={runPhase}
                onStart={handleStartResearch}
                onClarify={handleClarification}
                timelineContent={
                  reportId !== null ? (
                    <ReportPanel
                      report={report}
                      markdownUrl={api.markdownDownloadUrl(reportId)}
                      pdfUrl={api.pdfDownloadUrl(reportId)}
                      onLoadReport={handleLoadReport}
                      embedded
                    />
                  ) : null
                }
              />
            </div>
          </div>
        )
      }
      right={
        activePanel === "settings" ? (
          <section className="h-full overflow-auto bg-white">
            <div className="border-b border-zinc-200 px-4 py-4">
              <h2 className="text-sm font-semibold text-zinc-950">{t("app.researchSummary")}</h2>
              <p className="mt-1 text-xs text-zinc-500">{t("app.sessionSettings")}</p>
            </div>
            <dl className="divide-y divide-zinc-200 text-sm">
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">{t("app.activeProfile")}</dt>
                <dd className="mt-1 text-zinc-900">{selectedProfile?.name ?? t("app.noProfileSelected")}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">{t("app.backendDefault")}</dt>
                <dd className="mt-1 text-zinc-900">{backendDefaultProfile?.name ?? t("app.notConfigured")}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">{t("app.maxSources")}</dt>
                <dd className="mt-1 text-zinc-900">{maxSources}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">{t("app.mcpServers")}</dt>
                <dd className="mt-1 text-zinc-900">{servers.length}</dd>
              </div>
            </dl>
            {errorMessage ? <p className="px-4 py-3 text-sm text-red-600">{renderLocalizedMessage(t, errorMessage)}</p> : null}
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
