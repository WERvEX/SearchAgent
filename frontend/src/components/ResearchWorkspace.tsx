import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, Bot, LoaderCircle, Send, User } from "lucide-react";
import type { ConversationDetail, PlanArtifact, PlanningAnswer, PlanningQuestion, ResearchRunPhase } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { PlanCard } from "./PlanCard";
import { PlanningQuestionCard } from "./PlanningQuestionCard";

type ResearchWorkspaceProps = {
  conversation: ConversationDetail | null;
  profileId: number | null;
  profileName?: string | null;
  streamStatus?: string;
  runPhase: ResearchRunPhase;
  onSend?: (message: string) => void;
  onStart?: (message: string) => void;
  onClarify?: (message: string) => void;
  plans?: PlanArtifact[];
  currentPlanVersion?: number | null;
  currentPlanProjectId?: number | null;
  onExecutePlan?: (version: number) => void;
  timelineContent?: ReactNode;
  routeNotice?: { route: "replan" | "report_revision"; reason: string } | null;
  onOverrideRoute?: (route: "replan" | "report_revision") => void;
  optimisticUserMessage?: string | null;
  assistantThinking?: boolean;
  planningPrompt?: { id?: string; questions: PlanningQuestion[] } | null;
  onSubmitPlanningAnswers?: (answers: PlanningAnswer[], displayMessage: string) => void;
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
  executionProgress?: { completed: number; total: number } | null;
  toolApprovalPrompt?: Record<string, unknown> | null;
  onToolApproval?: (approved: boolean) => void;
};

export function ResearchWorkspace({
  conversation,
  profileId,
  profileName,
  streamStatus,
  runPhase,
  onSend,
  onStart,
  onClarify,
  plans = [],
  currentPlanVersion = null,
  currentPlanProjectId = null,
  onExecutePlan,
  timelineContent,
  routeNotice,
  onOverrideRoute,
  optimisticUserMessage = null,
  assistantThinking = false,
  planningPrompt = null,
  onSubmitPlanningAnswers,
  detailsOpen = false,
  onToggleDetails,
  executionProgress = null,
  toolApprovalPrompt = null,
  onToolApproval,
}: ResearchWorkspaceProps) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);
  const trimmed = message.trim();
  const busy = ["starting", "active", "resuming", "executing", "revising_report"].includes(runPhase);
  const awaitingClarification = runPhase === "awaiting_clarification";
  const legacyComposer = !onSend && Boolean(onStart || onClarify);
  const canChat = !busy;
  const hasStructuredQuestions = Boolean(planningPrompt?.questions.length);
  const disabled = !conversation || !profileId || trimmed.length === 0 || !canChat;
  const historicalAnswers = new Map<string, PlanningAnswer[]>();
  for (const item of conversation?.messages ?? []) {
    const interaction = item.meta?.research_interaction as Record<string, unknown> | undefined;
    const interruptId = typeof item.meta?.research_interrupt_id === "string"
      ? item.meta.research_interrupt_id
      : null;
    if (interruptId && interaction?.kind === "planning_answers" && Array.isArray(interaction.answers)) {
      historicalAnswers.set(interruptId, interaction.answers as PlanningAnswer[]);
    }
  }
  const statusLabel =
    awaitingClarification
      ? t("workspace.planning")
      : runPhase === "awaiting_approval" || runPhase === "awaiting_execution"
      ? t("workspace.planReady")
      : runPhase === "starting"
        ? t("workspace.starting")
        : runPhase === "resuming"
          ? t("workspace.resuming")
          : runPhase === "active"
            ? t("workspace.active")
            : runPhase === "executing"
              ? t("workspace.executing")
            : runPhase === "planning"
              ? t("workspace.planning")
              : runPhase === "revising_report"
                ? t("workspace.revisingReport")
            : runPhase === "completed"
              ? t("workspace.completed")
              : runPhase === "failed"
                ? t("workspace.failed")
                : t("workspace.ready");

  useEffect(() => {
    if (optimisticUserMessage || assistantThinking) {
      const timeline = timelineRef.current;
      if (timeline) {
        timeline.scrollTop = timeline.scrollHeight;
      }
    }
  }, [assistantThinking, optimisticUserMessage]);

  return (
    <section className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-200 bg-white px-5 py-4">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-zinc-950">
            {conversation?.title ?? t("workspace.selectConversation")}
          </h1>
          <p role="status" aria-live="polite" className={`mt-1 inline-flex items-center gap-2 text-sm ${busy ? "font-medium text-teal-700" : "text-zinc-500"}`}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {statusLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs text-zinc-500">
          {profileName ? <span className="rounded-full bg-zinc-100 px-2.5 py-1">{profileName}</span> : null}
          {streamStatus ? <span className="rounded-full border border-zinc-200 px-2.5 py-1">{streamStatus}</span> : null}
          {conversation && onToggleDetails ? (
            <button
              type="button"
              className={detailsOpen ? "nav-button-active" : "nav-button"}
              aria-pressed={detailsOpen}
              onClick={onToggleDetails}
            >
              <Activity className="h-4 w-4" aria-hidden="true" />
              <span>
                {runPhase === "executing" && executionProgress?.total
                  ? t("progress.executingCount", executionProgress)
                  : t("execution.details")}
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <div ref={timelineRef} data-testid="research-timeline" className="min-h-0 flex-1 overflow-auto bg-zinc-50 px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-4">
        {conversation?.messages.length ? (
          <div className="space-y-4">
            {conversation.messages.map((item) => {
              const interaction = item.meta?.research_interaction as Record<string, unknown> | undefined;
              const historicalQuestions = Array.isArray(interaction?.questions)
                ? interaction.questions as PlanningQuestion[]
                : [];
              const interruptId = typeof item.meta?.research_interrupt_id === "string"
                ? item.meta.research_interrupt_id
                : undefined;
              const activeQuestions = Boolean(
                historicalQuestions.length &&
                planningPrompt?.questions.length &&
                (!planningPrompt.id || planningPrompt.id === interruptId),
              );
              return (
              <div
                key={item.id}
                data-testid="conversation-message"
                className={`flex gap-3 ${item.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {item.role === "user" ? null : (
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white">
                    <Bot className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}
                <div className={item.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 px-4 py-3 text-sm text-white"
                  : "max-w-[85%] rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm"}>
                  {historicalQuestions.length ? (
                    <div className="w-full min-w-[min(42rem,78vw)] max-w-full">
                      <PlanningQuestionCard
                        questions={historicalQuestions}
                        answers={interruptId ? historicalAnswers.get(interruptId) : undefined}
                        active={activeQuestions}
                        pending={runPhase === "resuming"}
                        onSubmit={activeQuestions ? onSubmitPlanningAnswers : undefined}
                      />
                    </div>
                  ) : <div className="whitespace-pre-wrap leading-6">{item.content}</div>}
                </div>
                {item.role === "user" ? (
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-700">
                    <User className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : null}
              </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-500">
            {conversation ? t("workspace.noMessages") : t("workspace.chooseConversation")}
          </div>
        )}
        {plans.map((plan) => (
          <PlanCard
            key={plan.id ?? plan.version}
            plan={plan}
            current={
              plan.version === currentPlanVersion &&
              (currentPlanProjectId === null || plan.project_id === currentPlanProjectId)
            }
            executable={runPhase === "awaiting_execution" || runPhase === "awaiting_approval"}
            pending={runPhase === "resuming" || runPhase === "executing"}
            onExecute={(version) => onExecutePlan?.(version)}
          />
        ))}
        {routeNotice ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
            <div className="font-medium">{routeNotice.route === "replan" ? t("followup.routedReplan") : t("followup.routedRevision")}</div>
            <p className="mt-1 text-sky-800">{routeNotice.reason}</p>
            <button type="button" className="mt-2 text-xs font-medium underline" onClick={() => onOverrideRoute?.(routeNotice.route === "replan" ? "report_revision" : "replan")}>
              {routeNotice.route === "replan" ? t("followup.switchRevision") : t("followup.switchReplan")}
            </button>
          </div>
        ) : null}
        {timelineContent ? <div>{timelineContent}</div> : null}
        {toolApprovalPrompt ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="font-medium">工具调用需要确认</div>
            <p className="mt-1">{String(toolApprovalPrompt.agent_role ?? "agent")} 请求调用 {String(toolApprovalPrompt.tool_name ?? "tool")}。</p>
            {toolApprovalPrompt.reason ? <p className="mt-1 text-xs text-amber-800">{String(toolApprovalPrompt.reason)}</p> : null}
            <div className="mt-3 flex gap-2">
              <button type="button" className="nav-button-active" onClick={() => onToolApproval?.(true)}>允许本次任务</button>
              <button type="button" className="nav-button" onClick={() => onToolApproval?.(false)}>拒绝</button>
            </div>
          </div>
        ) : null}
        {optimisticUserMessage ? (
          <div data-testid="optimistic-user-message" className="flex justify-end gap-3">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 px-4 py-3 text-sm text-white">
              <div className="whitespace-pre-wrap leading-6">{optimisticUserMessage}</div>
            </div>
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-700">
              <User className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
        ) : null}
        {assistantThinking ? (
          <div data-testid="assistant-thinking" className="flex justify-start gap-3" role="status" aria-label={t("workspace.thinking")}>
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white">
              <Bot className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3 shadow-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-teal-600" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-teal-600 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-teal-600 [animation-delay:300ms]" />
              <span className="ml-2 text-xs text-zinc-500">{t("workspace.thinking")}</span>
            </div>
          </div>
        ) : null}
        {hasStructuredQuestions && !conversation?.messages.some((item) => (
          item.meta?.research_interrupt_id === planningPrompt?.id &&
          Array.isArray((item.meta?.research_interaction as Record<string, unknown> | undefined)?.questions)
        )) ? (
          <PlanningQuestionCard
            questions={planningPrompt?.questions ?? []}
            active
            pending={runPhase === "resuming"}
            onSubmit={onSubmitPlanningAnswers}
          />
        ) : null}
        </div>
      </div>

      {!hasStructuredQuestions ? <form
        className="border-t border-zinc-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) {
            return;
          }
          if (onSend) {
            onSend(trimmed);
          } else if (awaitingClarification) {
            onClarify?.(trimmed);
          } else {
            onStart?.(trimmed);
          }
          setMessage("");
        }}
      >
        <div className="mx-auto flex max-w-4xl gap-2 rounded-xl border border-zinc-300 bg-white p-2 shadow-sm focus-within:border-teal-500">
        <textarea
          className="max-h-40 min-h-14 min-w-0 flex-1 resize-y border-0 p-2 text-sm outline-none"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={busy}
          placeholder={busy ? t("workspace.inputLocked") : t("workspace.chatPlaceholder")}
          aria-label={legacyComposer && awaitingClarification ? t("workspace.clarificationAnswer") : t("workspace.request")}
        />
        <button type="submit" className="nav-button-active self-end" disabled={disabled}>
          <Send className="h-4 w-4" aria-hidden="true" />
          {legacyComposer ? awaitingClarification ? t("workspace.submitClarification") : t("workspace.start") : t("workspace.send")}
        </button>
        </div>
      </form> : null}
    </section>
  );
}
