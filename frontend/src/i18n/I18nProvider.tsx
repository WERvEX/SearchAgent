import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { enMessages, zhCNMessages, type MessageKey } from "./messages";

export type Locale = "en" | "zh-CN";

export const LOCALE_STORAGE_KEY = "searchagent.locale";

type NavigatorLocale = Pick<Navigator, "language" | "languages">;
type InterpolationValues = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: InterpolationValues) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale() {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored === "en" || stored === "zh-CN" ? stored : null;
  } catch {
    return null;
  }
}

export function resolveInitialLocale(browser: NavigatorLocale = navigator): Locale {
  const stored = readStoredLocale();
  if (stored) {
    return stored;
  }

  const languages = [...(browser.languages ?? []), browser.language].filter(
    (language): language is string => typeof language === "string",
  );
  return languages.some((language) => language.toLowerCase().startsWith("zh")) ? "zh-CN" : "en";
}

function interpolate(message: string, values: InterpolationValues = {}) {
  return message.replace(/\{([^}]+)\}/g, (_, name: string) => String(values[name] ?? ""));
}

function getMessages(locale: Locale) {
  return locale === "zh-CN" ? zhCNMessages : enMessages;
}

function syncDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);
  const localeRef = useRef(locale);
  localeRef.current = locale;

  useEffect(() => {
    syncDocumentLocale(locale);
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    } catch {
      // Storage failures must not prevent language switching.
    }
  }, []);

  const t = useCallback<I18nContextValue["t"]>(
    (key, values) => interpolate(getMessages(localeRef.current)[key], values),
    [],
  );

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const defaultI18n: I18nContextValue = {
  locale: "en",
  setLocale: () => undefined,
  t: (key, values) => interpolate(enMessages[key], values),
};

export function useI18n() {
  return useContext(I18nContext) ?? defaultI18n;
}
