import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanPanel } from "./PlanPanel";

describe("PlanPanel", () => {
  it("submits an approval decision with the selected option", async () => {
    const onApprove = vi.fn();

    render(
      <PlanPanel
        awaitingDecision
        pending={false}
        plan={{
          summary: "Compare search APIs",
          options: [
            { id: "A", title: "Pricing focus" },
            { id: "B", title: "Quality focus" },
          ],
        }}
        onApprove={onApprove}
        onReplan={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText("Quality focus"));
    await userEvent.click(screen.getByRole("button", { name: /approve plan/i }));

    expect(onApprove).toHaveBeenCalledWith({ approved: true, chosen_option: "B" });
  });

  it("submits a replan decision with feedback", async () => {
    const onReplan = vi.fn();

    render(
      <PlanPanel
        awaitingDecision
        pending={false}
        plan={{ summary: "Compare search APIs", options: [{ id: "A", title: "Pricing focus" }] }}
        onApprove={vi.fn()}
        onReplan={onReplan}
      />,
    );

    await userEvent.type(screen.getByLabelText("Replan feedback"), "Need broader coverage");
    await userEvent.click(screen.getByRole("button", { name: /replan/i }));

    expect(onReplan).toHaveBeenCalledWith({ approved: false, feedback: "Need broader coverage" });
  });

  it("disables decision controls while a resume request is pending", () => {
    render(
      <PlanPanel
        awaitingDecision
        pending
        plan={{ summary: "Compare search APIs", options: [{ id: "A", title: "Pricing focus" }] }}
        onApprove={vi.fn()}
        onReplan={vi.fn()}
      />,
    );

    expect(screen.getByText("Submitting decision")).toBeInTheDocument();
    expect(screen.getByLabelText("Pricing focus")).toBeDisabled();
    expect(screen.getByLabelText("Replan feedback")).toBeDisabled();
    expect(screen.getByRole("button", { name: /approve plan/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /replan/i })).toBeDisabled();
  });
});
