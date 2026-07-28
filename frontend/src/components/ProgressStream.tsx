import { Activity } from "lucide-react";
import type { ResearchLifecycleEvent, ServerEvent } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { translateEventStatus, translateLifecycleEvent } from "../i18n/messages";

function isResearchLifecycleEvent(event: ServerEvent): event is ResearchLifecycleEvent {
  return typeof event.event === "string" && event.event.startsWith("research.") && typeof event.data === "object" && event.data !== null;
}

function lifecycleDetail(event: ResearchLifecycleEvent, t: ReturnType<typeof useI18n>["t"]) {
  if (typeof event.data.message === "string") {
    return event.data.message;
  }
  if (typeof event.data.step_seq === "number" && typeof event.data.step_title === "string") {
    return t("progress.stepDetail", { step: event.data.step_seq, title: event.data.step_title });
  }
  if (typeof event.data.source_title === "string") {
    return t("progress.sourceDetail", {
      count: typeof event.data.source_count === "number" ? event.data.source_count : 1,
      title: event.data.source_title,
    });
  }
  if (typeof event.data.tool_name === "string") {
    return t("progress.toolDetail", { tool: event.data.tool_name });
  }
  if (typeof event.data.source_count === "number") {
    return t("progress.sourcesCollected", { count: event.data.source_count });
  }
  if (typeof event.data.option_count === "number") {
    return t("progress.optionsPrepared", { count: event.data.option_count });
  }
  if (typeof event.data.report_id === "number") {
    return t("progress.reportPrepared");
  }
  return null;
}

export function ProgressStream({ status, events }: { status: string; events: ServerEvent[] }) {
  const { t } = useI18n();

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4">
        <h2 className="text-sm font-semibold">{t("progress.title")}</h2>
        <span className="text-xs text-zinc-500">{translateEventStatus(t, status)}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("progress.empty")}</p>
        ) : (
          events.map((event, index) => {
            const detail = isResearchLifecycleEvent(event) ? lifecycleDetail(event, t) : null;
            return (
              <div key={`${event.id ?? "event"}-${index}`} className="mb-2 rounded-md border border-zinc-200 p-3 text-sm">
                <div className="flex items-center gap-2 text-xs font-medium uppercase text-zinc-500">
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  {event.event ? translateLifecycleEvent(t, event.event) : t("progress.message")}
                </div>
                {detail ? (
                  <p className="mt-1 break-words text-sm text-zinc-700">{detail}</p>
                ) : isResearchLifecycleEvent(event) ? null : (
                  <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-zinc-700">{JSON.stringify(event.data, null, 2)}</pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
