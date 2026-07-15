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

    await expect(api.getConversation(99)).rejects.toMatchObject({
      message: "Conversation not found",
      status: 404,
    });
  });

  it("keeps the backend-wrapped preference value shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ key: "max_sources", value: { value: 12 } }),
      }),
    );

    const result = await api.getPreference("max_sources");
    const wrappedPreferenceValue: { value: unknown } = result.value;

    expect(result).toEqual({ key: "max_sources", value: { value: 12 } });
    expect(wrappedPreferenceValue).toEqual({ value: 12 });
    expect(result.value.value).toBe(12);
  });

  it("builds direct report download endpoints without requesting a fake PDF export", () => {
    expect(api.markdownDownloadUrl(7)).toBe("/api/reports/7/download.md");
    expect(api.pdfDownloadUrl(7)).toBe("/api/reports/7/download.pdf");
    expect("exportPdf" in api).toBe(false);
  });

  it("uses the backend create payload and masked read shape for llm profiles", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 7,
        name: "local",
        provider: "openai_compatible",
        base_url: "http://localhost:11434/v1",
        model: "qwen",
        api_key: "sk-s****",
        params: { temperature: 0 },
        is_default: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      name: "local",
      provider: "openai_compatible",
      base_url: "http://localhost:11434/v1",
      model: "qwen",
      api_key: "sk-secret",
      params: { temperature: 0 },
      is_default: true,
    };
    type CreatedProfile = Awaited<ReturnType<typeof api.createLLMProfile>>;
    type HasMaskedApiKeyField = "api_key_masked" extends keyof CreatedProfile ? true : false;
    const hasMaskedApiKeyField: HasMaskedApiKeyField = false;

    const result = await api.createLLMProfile(payload);

    expect(fetchMock).toHaveBeenCalledWith("/api/settings/llm-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(result.api_key).toBe("sk-s****");
    expect(result).not.toHaveProperty("api_key_masked");
    expect(hasMaskedApiKeyField).toBe(false);
  });
});
