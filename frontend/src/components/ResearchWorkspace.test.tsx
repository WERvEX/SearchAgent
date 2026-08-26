import { render, screen, within } from "@testing-library/react";
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

  it("submits clarification answers while awaiting clarification", async () => {
    const onClarify = vi.fn();
    render(
      <ResearchWorkspace
        conversation={{ id: 4, title: "Search API evaluation", status: "idle", created_at: "", updated_at: "", messages: [], projects: [] }}
        profileId={7}
        runPhase="awaiting_clarification"
        onStart={vi.fn()}
        onClarify={onClarify}
      />,
    );
    await userEvent.type(screen.getByLabelText("Additional research detail"), "Europe in 2025");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onClarify).toHaveBeenCalledWith("Europe in 2025");
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
    expect(screen.getByRole("status")).toHaveTextContent("Starting research");

    rerender(
      <ResearchWorkspace
        conversation={conversation}
        profileId={7}
        runPhase="active"
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Research in progress");
  });

  it("locks the workflow mode after a conversation has started", () => {
    render(
      <ResearchWorkspace
        conversation={{
          id: 4,
          title: "Search API evaluation",
          status: "completed",
          created_at: "",
          updated_at: "",
          messages: [{ id: 1, role: "user", content: "Compare API pricing", meta: null }],
          projects: [],
        }}
        profileId={7}
        runPhase="completed"
        workflowMode="development_start"
        onStart={vi.fn()}
      />,
    );

    expect(screen.queryByRole("group", { name: "工作流模式" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("工作流模式：项目/功能启动，已锁定")).toBeInTheDocument();
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

  it("renders messages and final output in the same scroll timeline", () => {
    render(
      <ResearchWorkspace
        conversation={{
          id: 4,
          title: "Search API evaluation",
          status: "completed",
          created_at: "",
          updated_at: "",
          messages: [{ id: 11, role: "user", content: "Compare API pricing", meta: null }],
          projects: [],
        }}
        profileId={7}
        runPhase="completed"
        onStart={vi.fn()}
        timelineContent={<div>Final research output</div>}
      />,
    );

    const timeline = screen.getByTestId("research-timeline");
    expect(within(timeline).getByText("Compare API pricing")).toBeInTheDocument();
    expect(within(timeline).getByText("Final research output")).toBeInTheDocument();
    expect(timeline).not.toContainElement(screen.getByLabelText("Research request"));
  });

  it("opens contextual execution details from the research title bar", async () => {
    const onToggleDetails = vi.fn();
    render(
      <ResearchWorkspace
        conversation={{
          id: 4,
          title: "Search API evaluation",
          status: "executing",
          created_at: "",
          updated_at: "",
          messages: [],
          projects: [],
        }}
        profileId={7}
        runPhase="executing"
        executionProgress={{ completed: 2, total: 5 }}
        onToggleDetails={onToggleDetails}
        onSend={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Executing 2/5" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(onToggleDetails).toHaveBeenCalledOnce();
  });
});
