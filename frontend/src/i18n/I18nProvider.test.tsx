import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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

  it("persists manual changes, syncs document language, and interpolates messages", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;
    const { result } = renderHook(() => useI18n(), { wrapper });

    act(() => result.current.setLocale("zh-CN"));

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(result.current.t("app.selectedProfile", { name: "Qwen" })).toBe("当前配置：Qwen");
  });
});
