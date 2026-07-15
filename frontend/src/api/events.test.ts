import { describe, expect, it, vi } from "vitest";
import { parseResearchLifecycleEvent, subscribeToEvents } from "./events";

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

const planReadyPayload = {
  thread_id: "thread-42",
  conversation_id: 4,
  project_id: 9,
  option_count: 2,
};

describe("research event transport", () => {
  it("parses a real research lifecycle payload", () => {
    expect(parseResearchLifecycleEvent("42", "research.plan_ready", JSON.stringify(planReadyPayload))).toEqual({
      id: "42",
      event: "research.plan_ready",
      data: planReadyPayload,
    });
  });

  it("subscribes to named lifecycle events with thread and replay parameters", () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    const onEvent = vi.fn();

    subscribeToEvents({ threadId: "thread 42", replayLimit: 25, onEvent });

    expect(MockEventSource.instance?.url).toBe("/events?thread_id=thread+42&replay_limit=25");
    MockEventSource.instance?.listeners.get("research.plan_ready")?.({
      data: JSON.stringify(planReadyPayload),
      lastEventId: "42",
    } as MessageEvent<string>);

    expect(onEvent).toHaveBeenCalledWith({ id: "42", event: "research.plan_ready", data: planReadyPayload });
  });

  it("uses the active conversation filter until the research thread is known", () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

    subscribeToEvents({ threadId: null, conversationId: 4, replayLimit: 25, onEvent: vi.fn() });

    expect(MockEventSource.instance?.url).toBe("/events?conversation_id=4&replay_limit=25");
  });
});
