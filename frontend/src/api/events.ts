import {
  RESEARCH_LIFECYCLE_EVENT_TYPES,
  type ResearchLifecycleEvent,
  type ResearchLifecycleEventType,
  type ResearchLifecyclePayload,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResearchLifecycleEventType(value: string): value is ResearchLifecycleEventType {
  return (RESEARCH_LIFECYCLE_EVENT_TYPES as readonly string[]).includes(value);
}

function isResearchLifecyclePayload(value: unknown): value is ResearchLifecyclePayload {
  return isRecord(value) && typeof value.thread_id === "string";
}

export function parseResearchLifecycleEvent(
  id: string,
  event: string,
  rawData: string,
): ResearchLifecycleEvent | null {
  try {
    const data: unknown = JSON.parse(rawData);
    return isResearchLifecycleEventType(event) && isResearchLifecyclePayload(data) ? { id, event, data } : null;
  } catch {
    return null;
  }
}

export function subscribeToEvents(options: {
  threadId: string | null;
  conversationId?: number | null;
  replayLimit: number;
  onOpen?: () => void;
  onEvent: (event: ResearchLifecycleEvent) => void;
  onError?: () => void;
}): () => void {
  const query = new URLSearchParams();
  if (options.threadId) {
    query.set("thread_id", options.threadId);
  } else if (options.conversationId !== null && options.conversationId !== undefined) {
    query.set("conversation_id", String(options.conversationId));
  }
  query.set("replay_limit", String(options.replayLimit));
  const source = new EventSource(`/events?${query.toString()}`);
  source.onopen = () => options.onOpen?.();
  source.onerror = () => options.onError?.();
  for (const eventType of RESEARCH_LIFECYCLE_EVENT_TYPES) {
    source.addEventListener(eventType, (event) => {
      const message = event as MessageEvent<string>;
      const parsed = parseResearchLifecycleEvent(message.lastEventId, eventType, message.data);
      if (parsed) {
        options.onEvent(parsed);
      }
    });
  }
  return () => source.close();
}
