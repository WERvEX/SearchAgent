import type { ReactNode } from "react";
import { Activity, History, PanelLeft, Settings, Telescope, X } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

export type AppPanel = "research" | "settings";

export type AppShellProps = {
  left: ReactNode;
  main: ReactNode;
  right: ReactNode;
  activePanel: AppPanel;
  onPanelChange: (panel: AppPanel) => void;
  historyCollapsed?: boolean;
  mobileHistoryOpen?: boolean;
  detailsOpen?: boolean;
  onToggleHistory?: () => void;
  onCloseHistory?: () => void;
  onToggleDetails?: () => void;
};

export function AppShell({
  left,
  main,
  right,
  activePanel,
  onPanelChange,
  historyCollapsed = false,
  mobileHistoryOpen = false,
  detailsOpen = false,
  onToggleHistory,
  onCloseHistory,
  onToggleDetails,
}: AppShellProps) {
  const { locale, setLocale, t } = useI18n();
  const languageButtonClass = (active: boolean) =>
    `inline-flex h-8 min-w-9 items-center justify-center rounded-md px-2 text-xs font-medium ${
      active
        ? "bg-zinc-900 text-white"
        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
    }`;

  return (
    <div className="app-shell h-screen overflow-hidden bg-zinc-50 text-zinc-950">
      <header
        data-testid="app-shell-header"
        className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 lg:h-14 lg:min-h-0 lg:flex-nowrap lg:py-0"
      >
        <div className="flex min-w-0 items-center gap-2 font-semibold">
          <button
            type="button"
            className={`nav-button px-2 ${historyCollapsed ? "" : "lg:hidden"}`}
            aria-label={t("conversation.open")}
            onClick={onToggleHistory}
          >
            <PanelLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <Telescope className="h-5 w-5 text-teal-700" aria-hidden="true" />
          <span>SearchAgent</span>
        </div>
        <nav className="flex w-full flex-wrap items-center gap-1 sm:w-auto xl:w-auto xl:flex-nowrap" aria-label={t("shell.primaryNavigation")}>
          <button
            type="button"
            className={activePanel === "research" ? "nav-button-active" : "nav-button"}
            aria-pressed={activePanel === "research"}
            onClick={() => onPanelChange("research")}
          >
            <History className="h-4 w-4" aria-hidden="true" />
            <span>{t("shell.research")}</span>
          </button>
          {activePanel === "research" ? (
            <button type="button" className={detailsOpen ? "nav-button-active" : "nav-button"} aria-pressed={detailsOpen} onClick={onToggleDetails}>
              <Activity className="h-4 w-4" aria-hidden="true" />
              <span>{t("progress.title")}</span>
            </button>
          ) : null}
          <button
            type="button"
            className={activePanel === "settings" ? "nav-button-active" : "nav-button"}
            aria-pressed={activePanel === "settings"}
            onClick={() => onPanelChange("settings")}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span>{t("shell.settings")}</span>
          </button>
          <div className="ml-auto flex h-9 items-center border-l border-zinc-200 pl-1 sm:ml-1" role="group" aria-label={t("shell.languageSelector")}>
            <button
              type="button"
              className={languageButtonClass(locale === "zh-CN")}
              aria-label={t("shell.switchToChinese")}
              aria-pressed={locale === "zh-CN"}
              onClick={() => setLocale("zh-CN")}
            >
              中文
            </button>
            <button
              type="button"
              className={languageButtonClass(locale === "en")}
              aria-label={t("shell.switchToEnglish")}
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
          </div>
        </nav>
      </header>
      <div
        data-testid="app-shell-layout"
        className={`grid min-h-0 flex-1 grid-cols-1 lg:h-[calc(100vh-3.5rem)] ${
          activePanel === "settings"
            ? historyCollapsed
              ? "lg:grid-cols-[56px_minmax(0,1fr)_340px]"
              : "lg:grid-cols-[280px_minmax(0,1fr)_340px]"
            : historyCollapsed
              ? "lg:grid-cols-[56px_minmax(0,1fr)]"
              : "lg:grid-cols-[280px_minmax(0,1fr)]"
        }`}
      >
        <aside
          data-testid="app-shell-history"
          className={`${mobileHistoryOpen ? "fixed" : "hidden"} inset-y-0 left-0 z-40 w-[280px] min-w-0 bg-white shadow-xl lg:static lg:z-auto lg:block lg:w-auto lg:border-r lg:border-zinc-200 lg:shadow-none`}
        >
          {left}
        </aside>
        <main
          data-testid="app-shell-main"
          className="min-h-0 min-w-0 overflow-hidden bg-zinc-50"
        >
          {main}
        </main>
        {activePanel === "settings" ? (
          <aside data-testid="app-shell-sidepanel" className="hidden min-w-0 overflow-hidden border-l border-zinc-200 bg-white lg:block">
            {right}
          </aside>
        ) : null}
      </div>
      {activePanel === "research" && detailsOpen ? (
        <aside
          data-testid="app-shell-sidepanel"
          className="fixed inset-y-0 right-0 z-50 w-full max-w-[380px] overflow-hidden border-l border-zinc-200 bg-white shadow-2xl"
        >
          <button type="button" className="absolute right-2 top-2 z-10 rounded-md p-2 hover:bg-zinc-100" aria-label="Close details" onClick={onToggleDetails}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          {right}
        </aside>
      ) : null}
      {mobileHistoryOpen ? <button type="button" aria-label="Close history overlay" className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onCloseHistory} /> : null}
    </div>
  );
}
