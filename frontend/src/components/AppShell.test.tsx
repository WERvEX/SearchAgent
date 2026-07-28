import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/I18nProvider";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders the application work surface and switches panels", async () => {
    const onPanelChange = vi.fn();

    render(
      <AppShell
        activePanel="research"
        onPanelChange={onPanelChange}
        left={<div>History list</div>}
        main={<div>Research workspace</div>}
        right={<div>Event stream</div>}
        detailsOpen
      />,
    );

    expect(screen.getByRole("banner")).toHaveTextContent("SearchAgent");
    expect(screen.getByText("History list")).toBeInTheDocument();
    expect(screen.getByText("Research workspace")).toBeInTheDocument();
    expect(screen.getByText("Event stream")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(onPanelChange).toHaveBeenCalledWith("settings");
  });

  it("uses an overlay history below lg and a two-column desktop research layout", () => {
    render(
      <AppShell
        activePanel="research"
        onPanelChange={vi.fn()}
        left={<div>History list</div>}
        main={<div>Research workspace</div>}
        right={<div>Event stream</div>}
      />,
    );

    expect(screen.getByTestId("app-shell-header")).toHaveClass("min-h-14", "flex-wrap");
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toHaveClass("flex-wrap");
    expect(screen.getByTestId("app-shell-layout")).toHaveClass("grid-cols-1", "lg:grid-cols-[280px_minmax(0,1fr)]");
    expect(screen.getByTestId("app-shell-history")).toHaveClass("hidden", "lg:block", "lg:border-r");
    expect(screen.getByTestId("app-shell-main")).toHaveClass("min-w-0", "overflow-hidden");
    expect(screen.queryByTestId("app-shell-sidepanel")).not.toBeInTheDocument();
  });

  it("exposes toggle button state with aria-pressed", () => {
    render(
      <AppShell
        activePanel="settings"
        onPanelChange={vi.fn()}
        left={<div>History list</div>}
        main={<div>Research workspace</div>}
        right={<div>Event stream</div>}
      />,
    );

    expect(screen.getByRole("button", { name: /research/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /settings/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches the shell copy to Chinese and persists the selected locale", async () => {
    const user = userEvent.setup();
    localStorage.clear();

    render(
      <I18nProvider>
        <AppShell
          activePanel="research"
          onPanelChange={vi.fn()}
          left={<div>History list</div>}
          main={<div>Research workspace</div>}
          right={<div>Event stream</div>}
        />
      </I18nProvider>,
    );

    const chineseButton = screen.getByRole("button", { name: "Switch language to Chinese" });
    expect(screen.getByRole("group", { name: "Language selector" })).toBeInTheDocument();
    expect(chineseButton).toHaveTextContent("中文");
    expect(chineseButton).toHaveAttribute("aria-pressed", "false");

    await user.click(chineseButton);

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "研究" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换语言为中文" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "切换语言为中文" })).toHaveClass("bg-zinc-900", "text-white");
    expect(localStorage.getItem("searchagent.locale")).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
