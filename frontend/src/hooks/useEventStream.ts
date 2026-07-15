import { useEffect, useState } from "react";
import { subscribeToEvents } from "../api/events";
import type { ResearchLifecycleEvent } from "../api/types";

type EventStreamOptions = {
  threadId: string | null;
  conversationId: number | null;
  replayLimit?: number;
  displayLimit?: number;
  promoteDiscoveredThread?: boolean;
  onEvent?: (event: ResearchLifecycleEvent) => void;
};

export function useEventStream({
  threadId,
  conversationId,
  replayLimit = 100,
  displayLimit = 50,
  promoteDiscoveredThread = false,
  onEvent,
}: EventStreamOptions) {
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [events, setEvents] = useState<ResearchLifecycleEvent[]>([]);
  const [promotedThreadId, setPromotedThreadId] = useState<string | null>(null);
  const effectiveThreadId = threadId ?? promotedThreadId;

  useEffect(() => {
    setPromotedThreadId(null);
  }, [conversationId, threadId]);

  useEffect(() => {
    if (!effectiveThreadId && conversationId === null) {
      setEvents([]);
      setStatus("closed");
      return;
    }

    setEvents((current) => (effectiveThreadId ? current.filter((event) => event.data.thread_id === effectiveThreadId) : []));

    setStatus("connecting");
    const unsubscribe = subscribeToEvents({
      threadId: effectiveThreadId,
      conversationId,
      replayLimit,
      onOpen: () => setStatus("open"),
      onError: () => setStatus("error"),
      onEvent: (event) => {
        if (!effectiveThreadId && promoteDiscoveredThread && event.data.conversation_id === conversationId) {
          setPromotedThreadId((current) => current ?? event.data.thread_id);
        }
        onEvent?.(event);
        setEvents((current) => {
          if (effectiveThreadId ? event.data.thread_id !== effectiveThreadId : event.data.conversation_id !== conversationId) {
            return current;
          }
          if (current.some((existing) => existing.id === event.id)) {
            return current;
          }
          return [event, ...current].slice(0, displayLimit);
        });
      },
    });
    return () => {
      unsubscribe();
      setStatus("closed");
    };
  }, [conversationId, displayLimit, effectiveThreadId, onEvent, promoteDiscoveredThread, replayLimit]);

  return { status, events };
}
