import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEventStream } from "./useEventStream";

class MockEventSource {
  static instance: MockEventSource | null = null;

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((message: MessageEvent<string>) => void) | null = null;
  closed = false;

  constructor(public readonly url: string) {
    MockEventSource.instance = this;
  }

  close() {
    this.closed = true;
  }
}

describe("useEventStream", () => {
  it("opens the event stream and keeps the newest events first", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

    const { result, unmount } = renderHook(() => useEventStream(2));

    expect(result.current.status).toBe("connecting");
    expect(MockEventSource.instance?.url).toBe("/events?limit=2");

    act(() => {
      MockEventSource.instance?.onopen?.();
      MockEventSource.instance?.onmessage?.({
        data: JSON.stringify({ step: 1 }),
        lastEventId: "evt-1",
        type: "message",
      } as MessageEvent<string>);
      MockEventSource.instance?.onmessage?.({
        data: JSON.stringify({ step: 2 }),
        lastEventId: "evt-2",
        type: "message",
      } as MessageEvent<string>);
      MockEventSource.instance?.onmessage?.({
        data: JSON.stringify({ step: 3 }),
        lastEventId: "evt-3",
        type: "message",
      } as MessageEvent<string>);
    });

    await waitFor(() => expect(result.current.status).toBe("open"));
    expect(result.current.events).toEqual([
      { id: "evt-3", event: "message", data: { step: 3 } },
      { id: "evt-2", event: "message", data: { step: 2 } },
    ]);

    unmount();
    expect(MockEventSource.instance?.closed).toBe(true);
  });
});
