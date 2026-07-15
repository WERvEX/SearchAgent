import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEventStream } from "./useEventStream";

class MockEventSource {
  static instance: MockEventSource | null = null;

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly listeners = new Map<string, (message: MessageEvent<string>) => void>();
  closed = false;

  constructor(public readonly url: string) {
    MockEventSource.instance = this;
  }

  close() {
    this.closed = true;
  }

  addEventListener(type: string, listener: (message: MessageEvent<string>) => void) {
    this.listeners.set(type, listener);
  }
}

describe("useEventStream", () => {
  it("keeps distinct active-run progress events within the local display count", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

    const { result, unmount } = renderHook(() => useEventStream({ threadId: "thread-1", replayLimit: 100, displayLimit: 2 }));

    expect(result.current.status).toBe("connecting");
    expect(MockEventSource.instance?.url).toBe("/events?thread_id=thread-1&replay_limit=100");

    act(() => {
      MockEventSource.instance?.onopen?.();
      MockEventSource.instance?.listeners.get("research.progress")?.({
        data: JSON.stringify({
          schema_version: 1,
          kind: "research.progress",
          occurred_at: "2026-07-15T10:30:00Z",
          thread_id: "thread-1",
          conversation_id: 1,
          project_id: 2,
          phase: "search",
          message: "First",
          data: {},
        }),
        lastEventId: "evt-1",
      } as MessageEvent<string>);
      MockEventSource.instance?.listeners.get("research.progress")?.({
        data: JSON.stringify({
          schema_version: 1,
          kind: "research.progress",
          occurred_at: "2026-07-15T10:31:00Z",
          thread_id: "another-thread",
          conversation_id: 1,
          project_id: 2,
          phase: "search",
          message: "Ignored",
          data: {},
        }),
        lastEventId: "evt-2",
      } as MessageEvent<string>);
      MockEventSource.instance?.listeners.get("research.progress")?.({
        data: JSON.stringify({
          schema_version: 1,
          kind: "research.progress",
          occurred_at: "2026-07-15T10:32:00Z",
          thread_id: "thread-1",
          conversation_id: 1,
          project_id: 2,
          phase: "write",
          message: "Second",
          data: {},
        }),
        lastEventId: "evt-3",
      } as MessageEvent<string>);
      MockEventSource.instance?.listeners.get("research.progress")?.({
        data: JSON.stringify({
          schema_version: 1,
          kind: "research.progress",
          occurred_at: "2026-07-15T10:32:00Z",
          thread_id: "thread-1",
          conversation_id: 1,
          project_id: 2,
          phase: "write",
          message: "Second replay",
          data: {},
        }),
        lastEventId: "evt-3",
      } as MessageEvent<string>);
    });

    await waitFor(() => expect(result.current.status).toBe("open"));
    expect(result.current.events).toEqual([
      expect.objectContaining({ id: "evt-3", data: expect.objectContaining({ message: "Second" }) }),
      expect.objectContaining({ id: "evt-1", data: expect.objectContaining({ message: "First" }) }),
    ]);

    unmount();
    expect(MockEventSource.instance?.closed).toBe(true);
  });
});
