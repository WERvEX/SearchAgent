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
      />,
    );

    expect(screen.getByRole("banner")).toHaveTextContent("SearchAgent");
    expect(screen.getByText("History list")).toBeInTheDocument();
    expect(screen.getByText("Research workspace")).toBeInTheDocument();
    expect(screen.getByText("Event stream")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(onPanelChange).toHaveBeenCalledWith("settings");
  });

  it("uses a stacked responsive shell below xl while preserving the desktop pane contract", () => {
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
    expect(screen.getByTestId("app-shell-layout")).toHaveClass("grid-cols-1", "xl:grid-cols-[280px_minmax(0,1fr)_340px]");
    expect(screen.getByTestId("app-shell-history")).toHaveClass("min-w-0", "xl:border-r", "xl:border-zinc-200");
    expect(screen.getByTestId("app-shell-history")).not.toHaveClass("order-2", "order-1", "xl:order-1");
    expect(screen.getByTestId("app-shell-main")).toHaveClass("app-shell-main", "min-w-0");
    expect(screen.getByTestId("app-shell-main")).not.toHaveClass("order-1", "order-2", "xl:order-2");
    expect(screen.getByTestId("app-shell-sidepanel")).toHaveClass("order-3", "xl:order-3");
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
    expect(chineseButton).toHaveTextContent("中文");
    expect(chineseButton).toHaveAttribute("aria-pressed", "false");

    await user.click(chineseButton);

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "研究" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换语言为中文" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("searchagent.locale")).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
