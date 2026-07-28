import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanningQuestionCard } from "./PlanningQuestionCard";

const questions = [
  {
    id: "region",
    prompt: "研究哪个地区？",
    allow_custom: true,
    options: [
      { id: "china", label: "中国", description: "关注全国市场" },
      { id: "global", label: "全球" },
    ],
  },
  {
    id: "period",
    prompt: "采用什么时间范围？",
    allow_custom: true,
    options: [
      { id: "one-year", label: "近一年" },
      { id: "three-years", label: "近三年" },
    ],
  },
];

describe("PlanningQuestionCard", () => {
  it("requires every answer and submits preset plus custom choices", async () => {
    const onSubmit = vi.fn();
    render(<PlanningQuestionCard questions={questions} active onSubmit={onSubmit} />);

    const submit = screen.getByRole("button", { name: "Submit answers" });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: /中国/ }));
    await userEvent.click(screen.getAllByRole("radio", { name: "Enter my own answer" })[1]);
    await userEvent.type(screen.getByLabelText("采用什么时间范围？ Enter my own answer"), "2024 至 2026");
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(
      [
        { question_id: "region", option_id: "china" },
        { question_id: "period", text: "2024 至 2026" },
      ],
      expect.stringContaining("研究哪个地区？：中国"),
    );
  });

  it("renders persisted answers as a disabled history card", () => {
    render(
      <PlanningQuestionCard
        questions={questions}
        answers={[
          { question_id: "region", option_id: "global" },
          { question_id: "period", text: "2025 年" },
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: "全球" })).toBeChecked();
    expect(screen.getByLabelText("采用什么时间范围？ Enter my own answer")).toHaveValue("2025 年");
    expect(screen.queryByRole("button", { name: "Submit answers" })).not.toBeInTheDocument();
  });
});
