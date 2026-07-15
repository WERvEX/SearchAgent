import { useEffect, useState } from "react";
import { subscribeToEvents } from "../api/events";
import type { ResearchLifecycleEvent } from "../api/types";

type EventStreamOptions = {
  threadId: string | null;
  conversationId: number | null;
  replayLimit?: number;
  displayLimit?: number;
};

export function useEventStream({ threadId, conversationId, replayLimit = 100, displayLimit = 50 }: EventStreamOptions) {
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [events, setEvents] = useState<ResearchLifecycleEvent[]>([]);

  useEffect(() => {
    if (!threadId && conversationId === null) {
      setEvents([]);
      setStatus("closed");
      return;
    }

    setEvents((current) => (threadId ? current.filter((event) => event.data.thread_id === threadId) : []));

    setStatus("connecting");
    const unsubscribe = subscribeToEvents({
      threadId,
      conversationId,
      replayLimit,
      onOpen: () => setStatus("open"),
      onError: () => setStatus("error"),
      onEvent: (event) =>
        setEvents((current) => {
          if (threadId ? event.data.thread_id !== threadId : event.data.conversation_id !== conversationId) {
            return current;
          }
          if (current.some((existing) => existing.id === event.id)) {
            return current;
          }
          return [event, ...current].slice(0, displayLimit);
        }),
    });
    return () => {
      unsubscribe();
      setStatus("closed");
    };
  }, [conversationId, displayLimit, replayLimit, threadId]);

  return { status, events };
}
