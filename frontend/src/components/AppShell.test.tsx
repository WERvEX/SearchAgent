import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
    expect(screen.getByRole("navigation", { name: "Primary" })).toHaveClass("flex-wrap");
    expect(screen.getByTestId("app-shell-layout")).toHaveClass("grid-cols-1", "xl:grid-cols-[280px_minmax(0,1fr)_340px]");
    expect(screen.getByTestId("app-shell-history")).toHaveClass("order-2", "xl:order-1");
    expect(screen.getByTestId("app-shell-main")).toHaveClass("order-1", "min-w-0", "xl:order-2");
    expect(screen.getByTestId("app-shell-sidepanel")).toHaveClass("order-3", "xl:order-3");
  });
});
