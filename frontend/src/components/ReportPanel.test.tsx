import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportPanel } from "./ReportPanel";

const report = {
  id: 7,
  project_id: 2,
  version: 1,
  format: "md",
  content_md: [
    "# 研究报告",
    "",
    "## 研究目标",
    "",
    "分析产业趋势。",
    "",
    "### 执行摘要",
    "",
    "市场正在扩张[^1][^2]，无效引用保留为普通序号[^9]。",
    "",
    "### 供给分析",
    "",
    "供给仍然集中。[1]",
    "",
    "## 参考来源",
    "",
    "[^1]: [第一来源](https://example.com/one)",
    "[^2]: [第二来源](https://example.com/two)",
  ].join("\n"),
  file_path: null,
  created_at: "2026-07-07T00:00:00",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReportPanel", () => {
  it("renders structured collapsible sections and canonical citation links", () => {
    render(
      <ReportPanel
        report={report}
        markdownUrl="/api/reports/7/download.md"
        pdfUrl="/api/reports/7/download.pdf"
        onLoadReport={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "研究报告" })).toBeInTheDocument();
    expect(screen.getByText("研究目标")).toBeInTheDocument();
    expect(screen.getByText("执行摘要")).toBeInTheDocument();
    expect(screen.getByText("供给分析")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Markdown" })).toHaveAttribute("href", "/api/reports/7/download.md");
    expect(screen.getAllByRole("link", { name: "1" })[0]).toHaveAttribute("href", "#source-1");
    expect(screen.queryByText("[^1]")).not.toBeInTheDocument();
    expect(screen.getByText(/References|参考来源/).closest("details")).not.toHaveAttribute("open");
  });

  it("loads the selected report with an exact load action", async () => {
    const onLoadReport = vi.fn();
    render(
      <ReportPanel
        report={null}
        markdownUrl="/api/reports/7/download.md"
        pdfUrl="/api/reports/7/download.pdf"
        onLoadReport={onLoadReport}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Load" }));
    expect(onLoadReport).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  });

  it("generates a PDF blob and starts a browser download", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["%PDF-test"], { type: "application/pdf" }),
    }));
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:report"),
      revokeObjectURL: vi.fn(),
    });

    render(
      <ReportPanel
        report={report}
        markdownUrl="/api/reports/7/download.md"
        pdfUrl="/api/reports/7/download.pdf"
        onLoadReport={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/reports/7/download.pdf"));
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });

  it("shows the backend PDF error and allows retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Chromium is unavailable" }),
    }));
    render(
      <ReportPanel
        report={report}
        markdownUrl="/api/reports/7/download.md"
        pdfUrl="/api/reports/7/download.pdf"
        onLoadReport={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chromium is unavailable");
    expect(screen.getByRole("button", { name: "Retry PDF" })).toBeInTheDocument();
  });
});
