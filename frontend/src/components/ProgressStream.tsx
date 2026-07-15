import { Activity } from "lucide-react";
import type { ResearchProgressEvent, ServerEvent } from "../api/types";

function isResearchProgressEvent(event: ServerEvent): event is ResearchProgressEvent {
  return event.event === "research.progress" && typeof event.data === "object" && event.data !== null && "message" in event.data;
}

export function ProgressStream({ status, events }: { status: string; events: ServerEvent[] }) {
  return (
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4">
        <h2 className="text-sm font-semibold">Progress</h2>
        <span className="text-xs text-zinc-500">{status}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">No events yet</p>
        ) : (
          events.map((event, index) => (
            <div key={`${event.id ?? "event"}-${index}`} className="mb-2 rounded-md border border-zinc-200 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase text-zinc-500">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                {isResearchProgressEvent(event) ? event.data.phase : event.event ?? "message"}
              </div>
              {isResearchProgressEvent(event) ? (
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
