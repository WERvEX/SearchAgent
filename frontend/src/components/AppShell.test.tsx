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
});
