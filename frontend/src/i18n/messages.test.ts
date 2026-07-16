import { describe, expect, it, vi } from "vitest";
import {
  translateEventStatus,
  translateLifecycleEvent,
  translateRole,
  translateStatus,
  type MessageKey,
} from "./messages";

describe("known message translations", () => {
  it("returns inherited property names unchanged without calling an invalid key", () => {
    const t = vi.fn((key: MessageKey) => key);

    for (const value of ["constructor", "toString"]) {
      expect(translateStatus(t, value)).toBe(value);
      expect(translateRole(t, value)).toBe(value);
      expect(translateEventStatus(t, value)).toBe(value);
      expect(translateLifecycleEvent(t, value)).toBe(value);
    }

    expect(t).not.toHaveBeenCalled();
  });
});
