import Markdown from "markdown-to-jsx";
import { Download, FileDown, RefreshCw } from "lucide-react";
import type { ReportRead } from "../api/types";

export function ReportPanel({
  report,
  markdownUrl,
  pdfUrl,
  onLoadReport,
}: {
  report: ReportRead | null;
  markdownUrl: string | null;
  pdfUrl: string | null;
  onLoadReport: () => void;
}) {
  return (
    <section className="border-t border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
        <h2 className="text-sm font-semibold">Report</h2>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="nav-button" onClick={onLoadReport}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Load
          </button>
          {markdownUrl ? (
            <a className="nav-button" href={markdownUrl}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Markdown
            </a>
          ) : null}
          {pdfUrl ? (
            <a className="nav-button-active" href={pdfUrl}>
              <FileDown className="h-4 w-4" aria-hidden="true" />
              PDF
            </a>
          ) : null}
        </div>
      </div>
      <article className="prose prose-zinc max-w-none p-5 text-sm">
        {report ? <Markdown>{report.content_md}</Markdown> : <p>No report loaded.</p>}
      </article>
    </section>
  );
}
