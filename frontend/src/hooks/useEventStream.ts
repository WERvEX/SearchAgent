import { useEffect, useState } from "react";
import { subscribeToEvents } from "../api/events";
import type { ServerEvent } from "../api/types";

export function useEventStream(limit = 50) {
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [events, setEvents] = useState<ServerEvent[]>([]);

  useEffect(() => {
    setStatus("connecting");
    const unsubscribe = subscribeToEvents({
      limit,
      onOpen: () => setStatus("open"),
      onError: () => setStatus("error"),
      onEvent: (event) => setEvents((current) => [event, ...current].slice(0, limit)),
    });
    return () => {
      unsubscribe();
      setStatus("closed");
    };
  }, [limit]);

  return { status, events };
}
