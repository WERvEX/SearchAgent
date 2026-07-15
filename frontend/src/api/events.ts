import type { ResearchProgressEvent, ResearchProgressPayload } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResearchProgressPayload(value: unknown): value is ResearchProgressPayload {
  if (!isRecord(value) || value.kind !== "research.progress" || !isRecord(value.data)) {
    return false;
  }

  return (
    typeof value.schema_version === "number" &&
    typeof value.occurred_at === "string" &&
    typeof value.thread_id === "string" &&
    typeof value.conversation_id === "number" &&
    typeof value.project_id === "number" &&
    typeof value.phase === "string" &&
    typeof value.message === "string"
  );
}

export function parseResearchProgressEvent(id: string, rawData: string): ResearchProgressEvent | null {
  try {
    const data: unknown = JSON.parse(rawData);
    return isResearchProgressPayload(data) ? { id, event: "research.progress", data } : null;
  } catch {
    return null;
  }
}

export function subscribeToEvents(options: {
  threadId: string;
  replayLimit: number;
  onOpen?: () => void;
  onEvent: (event: ResearchProgressEvent) => void;
  onError?: () => void;
}): () => void {
  const query = new URLSearchParams({ thread_id: options.threadId, replay_limit: String(options.replayLimit) });
  const source = new EventSource(`/events?${query.toString()}`);
  source.onopen = () => options.onOpen?.();
  source.onerror = () => options.onError?.();
  source.addEventListener("research.progress", (event) => {
    const message = event as MessageEvent<string>;
    const parsed = parseResearchProgressEvent(message.lastEventId, message.data);
    if (parsed) {
      options.onEvent(parsed);
    }
  });
  return () => source.close();
}
