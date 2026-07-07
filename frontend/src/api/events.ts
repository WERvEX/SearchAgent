import type { ServerEvent } from "./types";

export function subscribeToEvents(options: {
  limit?: number;
  onOpen?: () => void;
  onEvent: (event: ServerEvent) => void;
  onError?: () => void;
}): () => void {
  const query = options.limit === undefined ? "" : `?limit=${options.limit}`;
  const source = new EventSource(`/events${query}`);
  source.onopen = () => options.onOpen?.();
  source.onerror = () => options.onError?.();
  source.onmessage = (message) => {
    const data = JSON.parse(message.data) as Record<string, unknown>;
    options.onEvent({ id: message.lastEventId || undefined, event: message.type, data });
  };
  return () => source.close();
}
