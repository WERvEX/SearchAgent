import { describe, expect, it, vi } from "vitest";
import { api } from "./client";

describe("api client", () => {
  it("creates conversations through the backend proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        title: "Demo",
        status: "new",
        created_at: "2026-07-07T00:00:00",
        updated_at: "2026-07-07T00:00:00",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.createConversation("Demo");

    expect(fetchMock).toHaveBeenCalledWith("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Demo" }),
    });
    expect(result.title).toBe("Demo");
  });

  it("raises the backend detail when a request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: "Conversation not found" }),
      }),
    );

    await expect(api.getConversation(99)).rejects.toThrow("Conversation not found");
  });
});
