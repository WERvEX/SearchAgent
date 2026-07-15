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
  it("uses the active conversation before a research thread is available", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

    const { result } = renderHook(() => useEventStream({ threadId: null, conversationId: 4 }));

    expect(MockEventSource.instance?.url).toBe("/events?conversation_id=4&replay_limit=100");
    act(() => {
      MockEventSource.instance?.listeners.get("research.started")?.({
        data: JSON.stringify({ thread_id: "thread-1", conversation_id: 4, project_id: 2 }),
        lastEventId: "evt-1",
      } as MessageEvent<string>);
      MockEventSource.instance?.listeners.get("research.started")?.({
        data: JSON.stringify({ thread_id: "thread-2", conversation_id: 5, project_id: 2 }),
        lastEventId: "evt-2",
      } as MessageEvent<string>);
    });

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0]).toEqual(expect.objectContaining({ id: "evt-1" }));
  });

  it("keeps distinct active-run lifecycle events within the local display count", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

    const { result, unmount } = renderHook(() =>
      useEventStream({ threadId: "thread-1", conversationId: 1, replayLimit: 100, displayLimit: 2 }),
    );

    expect(result.current.status).toBe("connecting");
    expect(MockEventSource.instance?.url).toBe("/events?thread_id=thread-1&replay_limit=100");

    act(() => {
      MockEventSource.instance?.onopen?.();
      MockEventSource.instance?.listeners.get("research.started")?.({
        data: JSON.stringify({
          thread_id: "thread-1",
          conversation_id: 1,
          project_id: 2,
        }),
        lastEventId: "evt-1",
      } as MessageEvent<string>);
      MockEventSource.instance?.listeners.get("research.plan_ready")?.({
        data: JSON.stringify({
          thread_id: "another-thread",
          conversation_id: 1,
          project_id: 2,
          option_count: 3,
        }),
        lastEventId: "evt-2",
      } as MessageEvent<string>);
      MockEventSource.instance?.listeners.get("research.completed")?.({
        data: JSON.stringify({
          thread_id: "thread-1",
          conversation_id: 1,
          project_id: 2,
        }),
        lastEventId: "evt-3",
      } as MessageEvent<string>);
      MockEventSource.instance?.listeners.get("research.completed")?.({
        data: JSON.stringify({
          thread_id: "thread-1",
          conversation_id: 1,
          project_id: 2,
        }),
        lastEventId: "evt-3",
      } as MessageEvent<string>);
    });

    await waitFor(() => expect(result.current.status).toBe("open"));
    expect(result.current.events).toEqual([
      expect.objectContaining({ id: "evt-3", event: "research.completed" }),
      expect.objectContaining({ id: "evt-1", event: "research.started" }),
    ]);

    unmount();
    expect(MockEventSource.instance?.closed).toBe(true);
  });
});
