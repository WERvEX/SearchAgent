import type { ReactNode } from "react";
import { History, Settings, Telescope } from "lucide-react";

export type AppPanel = "research" | "settings";

export type AppShellProps = {
  left: ReactNode;
  main: ReactNode;
  right: ReactNode;
  activePanel: AppPanel;
  onPanelChange: (panel: AppPanel) => void;
};

export function AppShell({ left, main, right, activePanel, onPanelChange }: AppShellProps) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4">
        <div className="flex items-center gap-2 font-semibold">
          <Telescope className="h-5 w-5 text-teal-700" aria-hidden="true" />
          <span>SearchAgent</span>
        </div>
        <nav className="flex items-center gap-1" aria-label="Primary">
          <button
            type="button"
            className={activePanel === "research" ? "nav-button-active" : "nav-button"}
            onClick={() => onPanelChange("research")}
          >
            <History className="h-4 w-4" aria-hidden="true" />
            <span>Research</span>
          </button>
          <button
            type="button"
            className={activePanel === "settings" ? "nav-button-active" : "nav-button"}
            onClick={() => onPanelChange("settings")}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span>Settings</span>
          </button>
        </nav>
      </header>
      <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="border-r border-zinc-200 bg-white">{left}</aside>
        <main className="min-w-0 bg-zinc-50">{main}</main>
        <aside className="border-l border-zinc-200 bg-white">{right}</aside>
      </div>
    </div>
  );
}
