import { describe, expect, it, vi } from "vitest";
import { parseResearchProgressEvent, subscribeToEvents } from "./events";

class MockEventSource {
  static instance: MockEventSource | null = null;

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly listeners = new Map<string, (message: MessageEvent<string>) => void>();

  constructor(public readonly url: string) {
    MockEventSource.instance = this;
  }

  addEventListener(type: string, listener: (message: MessageEvent<string>) => void) {
    this.listeners.set(type, listener);
  }

  close() {}
}

const progressPayload = {
  schema_version: 1,
  kind: "research.progress",
  occurred_at: "2026-07-15T10:30:00Z",
  thread_id: "thread-42",
  conversation_id: 4,
  project_id: 9,
  phase: "search",
  message: "Searching primary sources",
  data: { query: "SSE" },
};

describe("research event transport", () => {
  it("parses the stable research progress payload", () => {
    expect(parseResearchProgressEvent("42", JSON.stringify(progressPayload))).toEqual({
      id: "42",
      event: "research.progress",
      data: progressPayload,
    });
  });

  it("subscribes to named research.progress events with thread and replay parameters", () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    const onEvent = vi.fn();

    subscribeToEvents({ threadId: "thread 42", replayLimit: 25, onEvent });

    expect(MockEventSource.instance?.url).toBe("/events?thread_id=thread+42&replay_limit=25");
    MockEventSource.instance?.listeners.get("research.progress")?.({
      data: JSON.stringify(progressPayload),
      lastEventId: "42",
    } as MessageEvent<string>);

    expect(onEvent).toHaveBeenCalledWith({ id: "42", event: "research.progress", data: progressPayload });
  });
});
