import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, LoaderCircle, Send, User } from "lucide-react";
import type { ConversationDetail, PlanArtifact, ResearchRunPhase } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { PlanCard } from "./PlanCard";

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
}: ResearchWorkspaceProps) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);
  const trimmed = message.trim();
  const busy = ["starting", "active", "resuming", "executing", "revising_report"].includes(runPhase);
  const awaitingClarification = runPhase === "awaiting_clarification";
  const legacyComposer = !onSend && Boolean(onStart || onClarify);
  const canChat = !busy;
  const disabled = !conversation || !profileId || trimmed.length === 0 || !canChat;
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
        <div className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
          {profileName ? <span className="rounded-full bg-zinc-100 px-2.5 py-1">{profileName}</span> : null}
          {streamStatus ? <span className="rounded-full border border-zinc-200 px-2.5 py-1">{streamStatus}</span> : null}
        </div>
      </div>

      <div ref={timelineRef} data-testid="research-timeline" className="min-h-0 flex-1 overflow-auto bg-zinc-50 px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-4">
        {conversation?.messages.length ? (
          <div className="space-y-4">
            {conversation.messages.map((item) => (
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
                  <div className="whitespace-pre-wrap leading-6">{item.content}</div>
                </div>
                {item.role === "user" ? (
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-700">
                    <User className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : null}
              </div>
            ))}
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
        </div>
      </div>

      <form
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
      </form>
    </section>
  );
}
