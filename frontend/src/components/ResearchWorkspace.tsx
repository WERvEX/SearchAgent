import { useState, type ReactNode } from "react";
import { LoaderCircle, Send } from "lucide-react";
import type { ConversationDetail, ResearchRunPhase } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { translateRole } from "../i18n/messages";

type ResearchWorkspaceProps = {
  conversation: ConversationDetail | null;
  profileId: number | null;
  runPhase: ResearchRunPhase;
  onStart: (message: string) => void;
  onClarify?: (answer: string) => void;
  timelineContent?: ReactNode;
};

export function ResearchWorkspace({
  conversation,
  profileId,
  runPhase,
  onStart,
  onClarify,
  timelineContent,
}: ResearchWorkspaceProps) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const trimmed = message.trim();
  const canStart = runPhase === "idle" || runPhase === "completed" || runPhase === "failed";
  const awaitingClarification = runPhase === "awaiting_clarification";
  const busy = runPhase === "starting" || runPhase === "active" || runPhase === "resuming";
  const disabled = !conversation || !profileId || trimmed.length === 0 || (!canStart && !awaitingClarification);
  const statusLabel =
    awaitingClarification
      ? t("workspace.awaitingClarification")
      : runPhase === "awaiting_approval"
      ? t("workspace.awaitingApproval")
      : runPhase === "starting"
        ? t("workspace.starting")
        : runPhase === "resuming"
          ? t("workspace.resuming")
          : runPhase === "active"
            ? t("workspace.active")
            : runPhase === "completed"
              ? t("workspace.completed")
              : runPhase === "failed"
                ? t("workspace.failed")
                : t("workspace.ready");

  return (
    <section className="flex h-full flex-col">
      <div className="border-b border-zinc-200 bg-white p-4">
        <h1 className="text-base font-semibold text-zinc-950">
          {conversation?.title ?? t("workspace.selectConversation")}
        </h1>
        <p role="status" aria-live="polite" className={`mt-1 inline-flex items-center gap-2 text-sm ${busy ? "font-medium text-teal-700" : "text-zinc-500"}`}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {statusLabel}
        </p>
      </div>

      <div data-testid="research-timeline" className="min-h-0 flex-1 overflow-auto p-4">
        {conversation?.messages.length ? (
          <div className="space-y-3">
            {conversation.messages.map((item) => (
              <div
                key={item.id}
                data-testid="conversation-message"
                className="rounded-md border border-zinc-200 bg-white p-3 text-sm"
              >
                <div className="mb-1 text-xs uppercase text-zinc-500">{translateRole(t, item.role)}</div>
                <div className="whitespace-pre-wrap text-zinc-900">{item.content}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-500">
            {conversation ? t("workspace.noMessages") : t("workspace.chooseConversation")}
          </div>
        )}
        {timelineContent ? <div className="mt-4">{timelineContent}</div> : null}
      </div>

      <form
        className="flex gap-2 border-t border-zinc-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) {
            return;
          }
          if (awaitingClarification) {
            onClarify?.(trimmed);
          } else {
            onStart(trimmed);
          }
          setMessage("");
        }}
      >
        <textarea
          className="h-20 min-w-0 flex-1 rounded-md border border-zinc-300 p-3 text-sm"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-label={awaitingClarification ? t("workspace.clarificationAnswer") : t("workspace.request")}
        />
        <button type="submit" className="nav-button-active self-end" disabled={disabled}>
          <Send className="h-4 w-4" aria-hidden="true" />
          {awaitingClarification ? t("workspace.submitClarification") : t("workspace.start")}
        </button>
      </form>
    </section>
  );
}
