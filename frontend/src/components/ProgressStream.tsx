import { Activity } from "lucide-react";
import type { ResearchLifecycleEvent, ServerEvent } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { translateEventStatus, translateLifecycleEvent } from "../i18n/messages";

function isResearchLifecycleEvent(event: ServerEvent): event is ResearchLifecycleEvent {
  return typeof event.event === "string" && event.event.startsWith("research.") && typeof event.data === "object" && event.data !== null;
}

export function ProgressStream({ status, events }: { status: string; events: ServerEvent[] }) {
  const { t } = useI18n();

  return (
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4">
        <h2 className="text-sm font-semibold">{t("progress.title")}</h2>
        <span className="text-xs text-zinc-500">{translateEventStatus(t, status)}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("progress.empty")}</p>
        ) : (
          events.map((event, index) => (
            <div key={`${event.id ?? "event"}-${index}`} className="mb-2 rounded-md border border-zinc-200 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase text-zinc-500">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                {event.event ? translateLifecycleEvent(t, event.event) : t("progress.message")}
              </div>
              {isResearchLifecycleEvent(event) && typeof event.data.message === "string" ? (
                <p className="break-words text-sm text-zinc-700">{event.data.message}</p>
              ) : (
                <pre className="whitespace-pre-wrap break-words text-xs text-zinc-700">{JSON.stringify(event.data, null, 2)}</pre>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
