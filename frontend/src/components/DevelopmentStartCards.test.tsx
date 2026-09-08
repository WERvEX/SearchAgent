import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoryAnalysisCard, RepositoryContextCard } from "./DevelopmentStartCards";

describe("repository kickoff cards", () => {
  it("submits an explicit local path or skips", async () => {
    const onSubmit = vi.fn();
    render(<RepositoryContextCard onSubmit={onSubmit} />);
    const analyze = screen.getByRole("button", { name: "分析仓库" });
    expect(analyze).toBeDisabled();
    await userEvent.type(screen.getByLabelText("代码库绝对路径"), "D:\\Projects\\demo");
    await userEvent.click(analyze);
    expect(onSubmit).toHaveBeenCalledWith("D:\\Projects\\demo", []);
    await userEvent.click(screen.getByRole("button", { name: "跳过" }));
    expect(onSubmit).toHaveBeenLastCalledWith(null);
  });

  it("renders repository evidence and supports confirmation", async () => {
    const onReview = vi.fn();
    render(<RepositoryAnalysisCard snapshot={{
      repository_name: "demo", branch: "main", scan_status: "complete", frameworks: ["React"],
      languages: [{ extension: ".ts", files: 3 }], relevant_files: [{ id: "repo_0001", path: "src/app.ts" }],
    }} onReview={onReview} />);
    expect(screen.getByText("demo / main")).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "确认上下文" }));
    expect(onReview).toHaveBeenCalledWith(true);
  });
});
