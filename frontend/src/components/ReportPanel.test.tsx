import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportPanel } from "./ReportPanel";

describe("ReportPanel", () => {
  it("renders markdown and browser download links", () => {
    render(
      <ReportPanel
        report={{
          id: 7,
          project_id: 2,
          version: 1,
          format: "md",
          content_md: "# Findings\n\n- Source [1]",
          file_path: null,
          created_at: "2026-07-07T00:00:00",
        }}
        markdownUrl="/api/reports/7/download.md"
        pdfUrl="/api/reports/7/download.pdf"
        onLoadReport={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Findings" })).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /markdown/i })).toHaveAttribute("href", "/api/reports/7/download.md");
    expect(screen.getByRole("link", { name: /pdf/i })).toHaveAttribute("href", "/api/reports/7/download.pdf");
  });

  it("loads the selected report and links its markdown download", async () => {
    const onLoadReport = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportPanel
        report={null}
        markdownUrl="/api/reports/7/download.md"
        pdfUrl="/api/reports/7/download.pdf"
        onLoadReport={onLoadReport}
      />,
    );

    await user.click(screen.getByRole("button", { name: /load/i }));

    expect(onLoadReport).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: /markdown/i })).toHaveAttribute("href", "/api/reports/7/download.md");
    expect(screen.getByRole("link", { name: /pdf/i })).toHaveAttribute("href", "/api/reports/7/download.pdf");
  });
});
