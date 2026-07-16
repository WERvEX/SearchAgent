import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResearchWorkspace } from "./ResearchWorkspace";

describe("ResearchWorkspace", () => {
  it("shows conversation history and starts research with the trimmed message", async () => {
    const onStart = vi.fn();

    render(
      <ResearchWorkspace
        conversation={{
          id: 4,
          title: "Search API evaluation",
          status: "idle",
          created_at: "",
          updated_at: "",
          messages: [
            { id: 11, role: "user", content: "Compare API pricing", meta: null },
            { id: 12, role: "assistant", content: "Drafted plan", meta: null },
          ],
          projects: [],
        }}
        profileId={7}
        runPhase="idle"
        onStart={onStart}
      />,
    );

    expect(screen.getByText("Compare API pricing")).toBeInTheDocument();
    expect(screen.getByText("Drafted plan")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Research request"), "  Investigate rate limits  ");
    await userEvent.click(screen.getByRole("button", { name: /start/i }));

    expect(onStart).toHaveBeenCalledWith("Investigate rate limits");
    expect(screen.getByLabelText("Research request")).toHaveValue("");
  });

  it("disables research start when no profile is selected", () => {
    render(
      <ResearchWorkspace
        conversation={{
          id: 4,
          title: "Search API evaluation",
          status: "idle",
          created_at: "",
          updated_at: "",
          messages: [],
          projects: [],
        }}
        profileId={null}
        runPhase="idle"
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
  });

  it("disables research start while a run is pending or active", () => {
    const conversation = {
      id: 4,
      title: "Search API evaluation",
      status: "idle",
      created_at: "",
      updated_at: "",
      messages: [],
      projects: [],
    };

    const { rerender } = render(
      <ResearchWorkspace
        conversation={conversation}
        profileId={7}
        runPhase="starting"
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();

    rerender(
      <ResearchWorkspace
        conversation={conversation}
        profileId={7}
        runPhase="active"
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
  });

  it("re-enables research start after a completed run", () => {
    render(
      <ResearchWorkspace
        conversation={{
          id: 4,
          title: "Search API evaluation",
          status: "idle",
          created_at: "",
          updated_at: "",
          messages: [],
          projects: [],
        }}
        profileId={7}
        runPhase="completed"
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText("Research completed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
  });
});
