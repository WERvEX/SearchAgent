import { useEffect, useState } from "react";
import { subscribeToEvents } from "../api/events";
import type { ResearchProgressEvent } from "../api/types";

type EventStreamOptions = {
  threadId: string | null;
  replayLimit?: number;
  displayLimit?: number;
};

export function useEventStream({ threadId, replayLimit = 100, displayLimit = 50 }: EventStreamOptions) {
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [events, setEvents] = useState<ResearchProgressEvent[]>([]);

  useEffect(() => {
    setEvents([]);
    if (!threadId) {
      setStatus("closed");
      return;
    }

    setStatus("connecting");
    const unsubscribe = subscribeToEvents({
      threadId,
      replayLimit,
      onOpen: () => setStatus("open"),
      onError: () => setStatus("error"),
      onEvent: (event) =>
        setEvents((current) => {
          if (event.data.thread_id !== threadId) {
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
  }, [displayLimit, replayLimit, threadId]);

  return { status, events };
}
