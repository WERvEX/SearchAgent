import type { ReactNode } from "react";
import { History, Settings, Telescope } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

export type AppPanel = "research" | "settings";

export type AppShellProps = {
  left: ReactNode;
  main: ReactNode;
  right: ReactNode;
  activePanel: AppPanel;
  onPanelChange: (panel: AppPanel) => void;
};

export function AppShell({ left, main, right, activePanel, onPanelChange }: AppShellProps) {
  const { locale, setLocale, t } = useI18n();
  const languageButtonClass = (active: boolean) =>
    `inline-flex h-8 min-w-9 items-center justify-center rounded-md px-2 text-xs font-medium ${
      active
        ? "bg-zinc-900 text-white"
        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
    }`;

  return (
    <div className="app-shell min-h-screen bg-zinc-50 text-zinc-950 xl:h-screen xl:overflow-hidden">
      <header
        data-testid="app-shell-header"
        className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 xl:h-14 xl:min-h-0 xl:flex-nowrap xl:py-0"
      >
        <div className="flex min-w-0 items-center gap-2 font-semibold">
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
        className="grid flex-1 grid-cols-1 gap-4 p-4 xl:h-[calc(100vh-3.5rem)] xl:min-h-0 xl:grid-cols-[280px_minmax(0,1fr)_340px] xl:gap-0 xl:p-0"
      >
        <aside
          data-testid="app-shell-history"
          className="app-shell-pane min-w-0 bg-white xl:border-r xl:border-zinc-200"
        >
          {left}
        </aside>
        <main
          data-testid="app-shell-main"
          className="app-shell-pane app-shell-main min-w-0 bg-zinc-50"
        >
          {main}
        </main>
        <aside
          data-testid="app-shell-sidepanel"
          className="app-shell-pane order-3 min-w-0 bg-white xl:order-3 xl:border-l xl:border-zinc-200"
        >
          {right}
        </aside>
      </div>
    </div>
  );
}
