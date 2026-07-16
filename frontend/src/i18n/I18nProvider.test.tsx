import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  I18nProvider,
  LOCALE_STORAGE_KEY,
  resolveInitialLocale,
  useI18n,
} from "./I18nProvider";

describe("I18nProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "en";
  });

  afterEach(() => vi.restoreAllMocks());

  it("prefers a valid saved locale over browser languages", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");

    expect(resolveInitialLocale({ languages: ["zh-TW", "en-US"], language: "zh-TW" })).toBe("en");
  });

  it("uses Simplified Chinese for a browser language beginning with zh", () => {
    expect(resolveInitialLocale({ languages: ["fr-FR", "zh-HK"], language: "en-US" })).toBe("zh-CN");
  });

  it("falls back to English when no saved or Chinese browser locale is available", () => {
    expect(resolveInitialLocale({ languages: ["de-DE"], language: "de-DE" })).toBe("en");
  });

  it("ignores an invalid saved locale", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "fr");

    expect(resolveInitialLocale({ languages: ["zh-CN"], language: "zh-CN" })).toBe("zh-CN");
  });

  it("falls back to browser detection when reading storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(resolveInitialLocale({ languages: ["zh-HK"], language: "en-US" })).toBe("zh-CN");
  });

  it("persists manual changes, syncs document language, and interpolates messages", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;
    const { result } = renderHook(() => useI18n(), { wrapper });

    act(() => result.current.setLocale("zh-CN"));

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(result.current.t("app.selectedProfile", { name: "Qwen" })).toBe("当前配置：Qwen");
  });

  it("still switches locale when writing storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;
    const { result } = renderHook(() => useI18n(), { wrapper });

    act(() => result.current.setLocale("zh-CN"));

    expect(result.current.locale).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("restores a persisted choice through StrictMode remounts", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StrictMode>
        <I18nProvider>{children}</I18nProvider>
      </StrictMode>
    );
    const first = renderHook(() => useI18n(), { wrapper });
    act(() => first.result.current.setLocale("zh-CN"));
    first.unmount();

    const second = renderHook(() => useI18n(), { wrapper });

    expect(second.result.current.locale).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
