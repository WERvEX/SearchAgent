import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { api } from "./api/client";
import type {
  ConversationDetail,
  ConversationRead,
  MCPServer,
  PreferenceRead,
  LLMProfileRead,
  PlanArtifact,
  PlanningAnswer,
  PlanningQuestion,
  ProjectExecutionDetail,
  ReportRead,
  ResearchLifecycleEvent,
  ResearchRunPhase,
  ResearchRunResponse,
  WorkflowMode,
  ToolPolicy,
} from "./api/types";
import { AppPanel, AppShell } from "./components/AppShell";
import { ConversationPanel } from "./components/ConversationPanel";
import { ExecutionDrawer } from "./components/ExecutionDrawer";
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
  const kind = run.interrupt_payload?.kind;
  if (run.interrupted && (kind === "planning_input" || kind === "clarification" || kind === "problem_framing" || kind === "candidate_selection")) {
    return "planning";
  }
  if (run.interrupted && (kind === "plan_ready" || kind === "plan_approval")) {
    return "awaiting_execution";
  }
  if (run.interrupted && kind === "tool_approval") {
    return "awaiting_approval";
  }
  if (run.state.phase === "executing" || run.state.status === "executing") {
    return "executing";
  }
  return "completed";
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

  if (status === "planning" || status === "awaiting_clarification") {
    return "planning";
  }
  if (status === "awaiting_execution" || status === "awaiting_approval") {
    return "awaiting_execution";
  }
  if (status === "executing" || status === "running" || status === "active") {
    return "executing";
  }
  if (status === "revising_report") {
    return "revising_report";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "done" || status === "completed" || latestProject?.latest_report_id != null) {
    return "completed";
  }
  return "idle";
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
  planning: "phase.planning",
  awaiting_execution: "phase.awaiting_execution",
  executing: "phase.executing",
  revising_report: "phase.revising_report",
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

  if (
    event.event === "research.awaiting_clarification" ||
    event.event === "research.awaiting_approval" ||
    event.event === "research.planning_message" ||
    event.event === "research.plan_ready"
  ) {
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
  const { t, locale } = useI18n();
  const [activePanel, setActivePanel] = useState<AppPanel>("research");
  const [conversations, setConversations] = useState<ConversationRead[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const [profiles, setProfiles] = useState<LLMProfileRead[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [policies, setPolicies] = useState<ToolPolicy[]>([]);
  const [maxSources, setMaxSources] = useState(8);
  const [settingsLoadErrors, setSettingsLoadErrors] = useState<SettingsLoadErrors>({
    profiles: null,
    maxSources: null,
    servers: null,
  });
  const [currentRun, setCurrentRun] = useState<ResearchRunResponse | null>(null);
  const [retainedReportId, setRetainedReportId] = useState<number | null>(null);
  const [report, setReport] = useState<ReportRead | null>(null);
  const [, setStatusMessageKey] = useState<MessageKey>("app.loadingWorkspace");
  const [errorMessage, setErrorMessage] = useState<LocalizedMessage | null>(null);
  const [runPhase, setRunPhase] = useState<ResearchRunPhase>("idle");
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [executionDetail, setExecutionDetail] = useState<ProjectExecutionDetail | null>(null);
  const [routeNotice, setRouteNotice] = useState<{ route: "replan" | "report_revision"; reason: string } | null>(null);
  const [lastFollowUp, setLastFollowUp] = useState<string | null>(null);
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<string | null>(null);
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("research");
  const [selectedOutputModes, setSelectedOutputModes] = useState<Array<"human" | "ai">>(["human"]);
  const resumePendingRef = useRef(false);

  const reportId =
    retainedReportId ??
    (typeof currentRun?.state.report_id === "number" ? currentRun.state.report_id : null);

  const updateRunPhase = useCallback((nextPhase: SetStateAction<ResearchRunPhase>) => {
    setRunPhase((current) => {
      const resolvedPhase = typeof nextPhase === "function" ? nextPhase(current) : nextPhase;
      return resolvedPhase;
    });
  }, []);

  useEffect(() => {
    if (
      runPhase === "idle" ||
      runPhase === "awaiting_clarification" ||
      runPhase === "awaiting_approval" ||
      runPhase === "planning" ||
      runPhase === "awaiting_execution" ||
      runPhase === "completed" ||
      runPhase === "failed"
    ) {
      resumePendingRef.current = false;
    }
  }, [runPhase]);

  const handleLifecycleEvent = useCallback((event: ResearchLifecycleEvent) => {
    setCurrentRun((current) => mergeLifecycleEventIntoRun(current, event));

    if (event.event === "research.step_started" || event.event === "research.step_completed") {
      const stepSeq = typeof event.data.step_seq === "number" ? event.data.step_seq : null;
      setExecutionDetail((current) => current && stepSeq !== null ? {
        ...current,
        status: "executing",
        steps: current.steps.map((step) =>
          step.seq === stepSeq
            ? { ...step, status: event.event === "research.step_started" ? "running" : "completed" }
            : step,
        ),
      } : current);
    }

    if (
      (event.event === "research.source_collected" ||
        event.event === "research.sources_collected" ||
        event.event === "research.execution_started") &&
      typeof event.data.project_id === "number"
    ) {
      void api.getProjectExecution(event.data.project_id)
        .then(setExecutionDetail)
        .catch(() => undefined);
    }

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

    if (event.event === "research.planning_message") {
      updateRunPhase("planning");
      setStatusMessageKey(statusMessageForPhase("planning"));
      return;
    }

    if (event.event === "research.plan_ready") {
      updateRunPhase("awaiting_execution");
      setStatusMessageKey(statusMessageForPhase("awaiting_execution"));
      return;
    }

    if (event.event === "research.execution_started" || event.event === "research.step_started") {
      updateRunPhase("executing");
      setStatusMessageKey(statusMessageForPhase("executing"));
      return;
    }

    if (event.event === "research.report_revision_started") {
      updateRunPhase("revising_report");
      setStatusMessageKey(statusMessageForPhase("revising_report"));
      return;
    }

    if (event.event === "research.report_revised") {
      updateRunPhase("completed");
      setStatusMessageKey(statusMessageForPhase("completed"));
      return;
    }

    if (event.event === "research.awaiting_approval") {
      updateRunPhase("awaiting_approval");
      setStatusMessageKey(statusMessageForPhase("awaiting_approval"));
      return;
    }

    if (event.event === "research.tool_approval_required") {
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

      const [profileResult, sourceLimitResult, serverResult, policyResult] = await Promise.allSettled([
        api.listLLMProfiles(),
        loadMaxSourcesPreference(),
        api.listMCPServers(),
        typeof api.listToolPolicies === "function" ? api.listToolPolicies() : Promise.resolve([] as ToolPolicy[]),
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
      if (policyResult.status === "fulfilled") {
        setPolicies(policyResult.value);
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
        const loadedProject = getLatestProject(detail);
        setWorkflowMode(loadedProject?.workflow_mode ?? "research");
        const latestReportId = loadedProject?.latest_report_id ?? null;
        setRetainedReportId(latestReportId);
        setRouteNotice(null);
        if (loadedProject && typeof api.getProjectExecution === "function") {
          try {
            setExecutionDetail(await api.getProjectExecution(loadedProject.id));
          } catch {
            setExecutionDetail(null);
          }
        }
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

  const latestProject = useMemo(
    () => (activeConversation ? getLatestProject(activeConversation) : null),
    [activeConversation],
  );
  const plans = useMemo<PlanArtifact[]>(
    () =>
      activeConversation?.projects.flatMap((project) =>
        (project.plans ?? []).map((plan) => ({ ...plan, project_id: plan.project_id ?? project.id })),
      ) ?? [],
    [activeConversation],
  );
  const reportVersions = useMemo(
    () =>
      activeConversation?.projects.flatMap((project) =>
        (project.reports ?? []).map((item) => ({ ...item, project_id: item.project_id ?? project.id })),
      ) ?? [],
    [activeConversation],
  );
  const currentPlanVersion =
    typeof currentRun?.interrupt_payload?.plan_version === "number"
      ? currentRun.interrupt_payload.plan_version
      : runPhase === "awaiting_execution"
        ? latestProject?.plans?.at(-1)?.version ?? null
        : null;
  const workflowModeLocked = Boolean(
    currentRun ||
    latestProject ||
    activeConversation?.messages.some((item) => item.role === "user"),
  );

  const refreshConversation = useCallback(async () => {
    if (!activeConversationId) {
      return null;
    }
    const detail = await api.getConversation(activeConversationId);
    setActiveConversation(detail);
    setConversations((current) =>
      current.map((conversation) => (conversation.id === detail.id ? detail : conversation)),
    );
    const project = getLatestProject(detail);
    setWorkflowMode(project?.workflow_mode ?? "research");
    if (project) {
      try {
        setExecutionDetail(await api.getProjectExecution(project.id));
      } catch {
        setExecutionDetail(null);
      }
    }
    return detail;
  }, [activeConversationId]);

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

  async function settleRun(run: ResearchRunResponse) {
    setCurrentRun(run);
    if (typeof run.state.report_id === "number") {
      setRetainedReportId(run.state.report_id);
    }
    const nextPhase = deriveRunPhaseFromResponse(run);
    updateRunPhase(nextPhase);
    setStatusMessageKey(statusMessageForPhase(nextPhase));
    await refreshConversation();
    setOptimisticUserMessage(null);
    setAssistantThinking(false);
  }

  async function handlePlanningMessage(message: string) {
    if (!currentRun || !selectedProfileId || resumePendingRef.current) {
      return;
    }
    resumePendingRef.current = true;
    const fallbackPhase = runPhase;
    try {
      setErrorMessage(null);
      updateRunPhase("resuming");
      const run = await api.resumeResearch(currentRun.thread_id, {
        profile_id: selectedProfileId,
        response_language: locale,
        decision: { kind: "planning_message", message },
      });
      await settleRun(run);
    } catch (error) {
      updateRunPhase(fallbackPhase);
      setAssistantThinking(false);
      await refreshConversation().catch(() => null);
      setOptimisticUserMessage(null);
      setErrorMessage(messageFromError(error, "app.failedToResumeResearch"));
    } finally {
      resumePendingRef.current = false;
    }
  }

  async function handlePlanningAnswers(answers: PlanningAnswer[], displayMessage: string) {
    if (!currentRun || !selectedProfileId || resumePendingRef.current) {
      return;
    }
    resumePendingRef.current = true;
    const fallbackPhase = runPhase;
    setOptimisticUserMessage(displayMessage);
    setAssistantThinking(true);
    try {
      setErrorMessage(null);
      updateRunPhase("resuming");
      const run = await api.resumeResearch(currentRun.thread_id, {
        profile_id: selectedProfileId,
        response_language: locale,
        decision: { kind: "planning_answers", answers },
      });
      await settleRun(run);
    } catch (error) {
      updateRunPhase(fallbackPhase);
      setAssistantThinking(false);
      setOptimisticUserMessage(null);
      await refreshConversation().catch(() => null);
      setErrorMessage(messageFromError(error, "app.failedToResumeResearch"));
    } finally {
      resumePendingRef.current = false;
    }
  }

  async function resumeDevelopment(decision: Record<string, unknown>) {
    if (!currentRun || !selectedProfileId || resumePendingRef.current) return;
    resumePendingRef.current = true;
    const fallbackPhase = runPhase;
    try {
      setErrorMessage(null);
      updateRunPhase("resuming");
      const run = await api.resumeResearch(currentRun.thread_id, {
        profile_id: selectedProfileId,
        response_language: locale,
        decision,
      });
      await settleRun(run);
    } catch (error) {
      updateRunPhase(fallbackPhase);
      setErrorMessage(messageFromError(error, "app.failedToResumeResearch"));
    } finally {
      resumePendingRef.current = false;
    }
  }

  function handleProblemConfirm(confirmed: boolean, feedback?: string) {
    void resumeDevelopment(confirmed ? { kind: "problem_confirm", confirmed: true } : { kind: "problem_message", message: feedback || "请继续补充问题定义。" });
  }

  function handleCandidateSelection(selections: Array<{ candidate_key: string; decision: "reference" | "adopt" }>) {
    void resumeDevelopment({ kind: "candidate_selection", selections });
  }

  function handleOutputModes(modes: Array<"human" | "ai">) {
    setSelectedOutputModes(modes);
    if (currentPlanVersion !== null) void handleExecutePlan(currentPlanVersion, modes);
  }

  async function handleFollowUp(message: string, routeOverride?: "replan" | "report_revision") {
    if (!activeConversation || !latestProject || !selectedProfileId) {
      return;
    }
    const fallbackPhase = runPhase;
    try {
      setLastFollowUp(message);
      setErrorMessage(null);
      updateRunPhase(routeOverride === "report_revision" ? "revising_report" : "starting");
      const response = await api.followUpResearch({
        conversation_id: activeConversation.id,
        project_id: latestProject.id,
        profile_id: selectedProfileId,
        message,
        response_language: locale,
        ...(routeOverride ? { route_override: routeOverride } : {}),
      });
      setRouteNotice({ route: response.route, reason: response.reason });
      if (response.run) {
        await settleRun(response.run);
      } else {
        if (response.report_id !== null) {
          setRetainedReportId(response.report_id);
        }
        updateRunPhase("completed");
        await refreshConversation();
        setOptimisticUserMessage(null);
        setAssistantThinking(false);
      }
    } catch (error) {
      updateRunPhase(fallbackPhase);
      setAssistantThinking(false);
      await refreshConversation().catch(() => null);
      setOptimisticUserMessage(null);
      setErrorMessage(messageFromError(error, "app.failedToStartResearch"));
    }
  }

  async function handleSendMessage(message: string) {
    if (!activeConversation || !selectedProfileId) {
      return;
    }
    setOptimisticUserMessage(message);
    setAssistantThinking(true);
    setRouteNotice(null);
    if (runPhase === "planning" || runPhase === "awaiting_execution" || runPhase === "awaiting_clarification" || runPhase === "awaiting_approval") {
      await handlePlanningMessage(message);
      return;
    }
    if (runPhase === "completed" && latestProject?.latest_report_id) {
      await handleFollowUp(message);
      return;
    }
    try {
      setErrorMessage(null);
      setCurrentRun(null);
      updateRunPhase("starting");
      const startPayload = {
        conversation_id: activeConversation.id,
        profile_id: selectedProfileId,
        user_message: message,
        response_language: locale,
        ...(workflowMode === "development_start" ? { workflow_mode: workflowMode } : {}),
      };
      const run = await api.startResearch(startPayload);
      await settleRun(run);
    } catch (error) {
      updateRunPhase("idle");
      setAssistantThinking(false);
      await refreshConversation().catch(() => null);
      setOptimisticUserMessage(null);
      setErrorMessage(messageFromError(error, "app.failedToStartResearch"));
    }
  }

  async function handleExecutePlan(version: number, modes: Array<"human" | "ai"> = selectedOutputModes) {
    if (!currentRun || !selectedProfileId || resumePendingRef.current || version !== currentPlanVersion) {
      return;
    }
    resumePendingRef.current = true;
    try {
      setErrorMessage(null);
      updateRunPhase("executing");
      setDetailsOpen(true);
      const run = await api.resumeResearch(currentRun.thread_id, {
        profile_id: selectedProfileId,
        response_language: locale,
        decision: {
          kind: "execute_plan",
          plan_version: version,
          ...(workflowMode === "development_start" ? { output_modes: modes } : {}),
        },
      });
      await settleRun(run);
    } catch (error) {
      updateRunPhase("awaiting_execution");
      setErrorMessage(messageFromError(error, "app.failedToResumeResearch"));
    } finally {
      resumePendingRef.current = false;
    }
  }

  async function handleToolApproval(approved: boolean) {
    if (!currentRun || !selectedProfileId || resumePendingRef.current) return;
    const payload = currentRun.interrupt_payload ?? {};
    resumePendingRef.current = true;
    try {
      updateRunPhase("resuming");
      const run = await api.resumeResearch(currentRun.thread_id, {
        profile_id: selectedProfileId,
        response_language: locale,
        decision: {
          kind: "tool_approval",
          approved,
          agent_role: payload.agent_role,
          tool_name: payload.tool_name,
          args_fingerprint: payload.args_fingerprint,
        },
      });
      await settleRun(run);
    } catch (error) {
      updateRunPhase("awaiting_approval");
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

  async function handleCreatePolicy(payload: Omit<ToolPolicy, "id" | "version" | "created_at">) {
    const created = await api.createToolPolicy(payload);
    setPolicies((current) => [...current, created]);
  }

  async function handleUpdatePolicy(id: number, payload: Omit<ToolPolicy, "id" | "version" | "created_at">) {
    const updated = await api.updateToolPolicy(id, payload);
    setPolicies((current) => current.map((item) => item.id === id ? updated : item));
  }

  async function handleDeletePolicy(id: number) {
    await api.deleteToolPolicy(id);
    setPolicies((current) => current.filter((item) => item.id !== id));
  }

  const backendDefaultProfile = profiles.find((profile) => profile.is_default) ?? null;
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  return (
    <AppShell
      activePanel={activePanel}
      onPanelChange={setActivePanel}
      historyCollapsed={historyCollapsed}
      mobileHistoryOpen={mobileHistoryOpen}
      detailsOpen={detailsOpen}
      onToggleHistory={() => {
        if (window.matchMedia("(min-width: 1024px)").matches) {
          setHistoryCollapsed((current) => !current);
        } else {
          setMobileHistoryOpen((current) => !current);
        }
      }}
      onCloseHistory={() => setMobileHistoryOpen(false)}
      onToggleDetails={() => setDetailsOpen((current) => !current)}
      left={
        <ConversationPanel
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={setActiveConversationId}
          onCreate={handleCreateConversation}
          onRename={handleRenameConversation}
          onDelete={handleDeleteConversation}
          onCollapse={() => {
            if (window.matchMedia("(min-width: 1024px)").matches) {
              setHistoryCollapsed(true);
            } else {
              setMobileHistoryOpen(false);
            }
          }}
          collapsed={historyCollapsed}
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
            policies={policies}
            onCreatePolicy={handleCreatePolicy}
            onUpdatePolicy={handleUpdatePolicy}
            onDeletePolicy={handleDeletePolicy}
            loadErrors={settingsLoadErrors}
          />
        ) : (
          <ResearchWorkspace
            conversation={activeConversation}
            profileId={selectedProfileId}
            profileName={selectedProfile?.name}
            streamStatus={eventStream.status}
            runPhase={runPhase}
            onSend={handleSendMessage}
            workflowMode={workflowMode}
            onWorkflowModeChange={setWorkflowMode}
            workflowModeLocked={workflowModeLocked}
            plans={plans}
            currentPlanVersion={currentPlanVersion}
            currentPlanProjectId={latestProject?.id ?? null}
            onExecutePlan={handleExecutePlan}
            routeNotice={routeNotice}
            optimisticUserMessage={optimisticUserMessage}
            assistantThinking={assistantThinking}
            planningPrompt={
              Array.isArray(currentRun?.interrupt_payload?.questions)
                ? {
                    id: typeof currentRun?.interrupt_payload?.id === "string" ? currentRun.interrupt_payload.id : undefined,
                    questions: currentRun.interrupt_payload.questions as PlanningQuestion[],
                  }
                : null
            }
            developmentPrompt={
              currentRun?.interrupt_payload && workflowMode === "development_start"
                ? {
                    phase: typeof currentRun.interrupt_payload.phase === "string"
                      ? currentRun.interrupt_payload.phase
                      : currentRun.interrupt_payload.kind === "plan_ready" ? "plan_ready" : undefined,
                    problem_definition: (currentRun.interrupt_payload.problem_definition as Record<string, unknown> | undefined) ?? undefined,
                    candidates: Array.isArray(currentRun.interrupt_payload.candidates) ? currentRun.interrupt_payload.candidates as Array<Record<string, unknown>> : [],
                  }
                : null
            }
            onProblemConfirm={handleProblemConfirm}
            onCandidateSelection={handleCandidateSelection}
            onOutputModes={handleOutputModes}
            toolApprovalPrompt={currentRun?.interrupt_payload?.kind === "tool_approval" ? currentRun.interrupt_payload : null}
            onToolApproval={handleToolApproval}
            onSubmitPlanningAnswers={handlePlanningAnswers}
            detailsOpen={detailsOpen}
            onToggleDetails={() => setDetailsOpen((current) => !current)}
            executionProgress={executionDetail ? {
              completed: executionDetail.steps.filter((step) => step.status === "completed" || step.status === "done").length,
              total: executionDetail.steps.length,
            } : null}
            onOverrideRoute={(route) => {
              if (lastFollowUp) {
                void handleFollowUp(lastFollowUp, route);
              }
            }}
            timelineContent={
              <>
                {errorMessage ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {renderLocalizedMessage(t, errorMessage)}
                  </div>
                ) : null}
                {reportId !== null ? (
                  <ReportPanel
                    report={report}
                    markdownUrl={api.markdownDownloadUrl(reportId)}
                    jsonUrl={workflowMode === "development_start" && latestProject?.output_modes?.includes("ai") ? `/api/reports/${reportId}/download.json` : null}
                    pdfUrl={api.pdfDownloadUrl(reportId)}
                    onLoadReport={handleLoadReport}
                    versions={reportVersions}
                    selectedReportId={reportId}
                    onSelectReport={setRetainedReportId}
                    embedded
                  />
                ) : null}
              </>
            }
          />
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
          <ExecutionDrawer
            detail={executionDetail}
            streamStatus={eventStream.status}
            events={eventStream.events}
          />
        )
      }
    />
  );
}
