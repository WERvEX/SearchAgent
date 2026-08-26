import { useMemo, useState, type ComponentPropsWithoutRef } from "react";
import Markdown from "markdown-to-jsx";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileDown,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import type { ReportRead } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { parseReportMarkdown, type ReportSection } from "./reportMarkdown";

function MarkdownLink({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) {
  if (href.startsWith("#source-")) {
    return (
      <sup className="mx-0.5 inline-flex align-super text-[0.72em] leading-none">
        <a
          {...props}
          href={href}
          className="rounded bg-teal-50 px-1 py-0.5 font-semibold text-teal-700 hover:bg-teal-100"
        >
          {children}
        </a>
      </sup>
    );
  }
  return <a {...props} href={href} target="_blank" rel="noreferrer" className="font-medium text-teal-700 underline decoration-teal-200 underline-offset-2 hover:decoration-teal-600">{children}</a>;
}

function RichMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      options={{
        overrides: {
          a: { component: MarkdownLink },
          p: { props: { className: "my-3 text-[15px] leading-7 text-zinc-700" } },
          h2: { props: { className: "mb-3 mt-6 text-xl font-semibold text-zinc-950" } },
          h3: { props: { className: "mb-2 mt-5 text-base font-semibold text-zinc-900" } },
          ul: { props: { className: "my-3 list-disc space-y-1 pl-6 text-[15px] leading-7 text-zinc-700" } },
          ol: { props: { className: "my-3 list-decimal space-y-1 pl-6 text-[15px] leading-7 text-zinc-700" } },
          blockquote: { props: { className: "my-4 border-l-4 border-teal-300 bg-teal-50 px-4 py-2 text-zinc-700" } },
          table: { props: { className: "my-4 w-full border-collapse overflow-hidden rounded-lg text-sm" } },
          th: { props: { className: "border border-zinc-300 bg-zinc-100 px-3 py-2 text-left font-semibold" } },
          td: { props: { className: "border border-zinc-200 px-3 py-2 align-top text-zinc-700" } },
          code: { props: { className: "rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.9em] text-zinc-800" } },
          pre: { props: { className: "my-4 overflow-auto rounded-xl bg-zinc-950 p-4 text-sm text-zinc-100" } },
          strong: { props: { className: "font-semibold text-zinc-950" } },
        },
      }}
    >
      {children}
    </Markdown>
  );
}

function SectionCard({ section, tone = "default" }: { section: ReportSection; tone?: "default" | "highlight" }) {
  return (
    <details open className={`group rounded-xl border ${
      tone === "highlight" ? "border-teal-200 bg-teal-50/60" : "border-zinc-200 bg-white"
    }`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 marker:hidden">
        <ChevronRight className="h-4 w-4 text-zinc-400 transition group-open:rotate-90" aria-hidden="true" />
        <h3 className={`${tone === "highlight" ? "text-base" : "text-sm"} font-semibold text-zinc-950`}>{section.title}</h3>
      </summary>
      <div className="border-t border-zinc-200/80 px-5 py-3">
        <RichMarkdown>{section.markdown}</RichMarkdown>
      </div>
    </details>
  );
}

export function ReportPanel({
  report,
  markdownUrl,
  pdfUrl,
  jsonUrl,
  onLoadReport,
  versions = [],
  selectedReportId = null,
  onSelectReport,
  embedded = false,
}: {
  report: ReportRead | null;
  markdownUrl: string | null;
  pdfUrl: string | null;
  jsonUrl?: string | null;
  onLoadReport: () => void;
  versions?: Array<{ id: number; project_id?: number; version: number; created_at: string }>;
  selectedReportId?: number | null;
  onSelectReport?: (reportId: number) => void;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [pdfPending, setPdfPending] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const parsed = useMemo(
    () => report ? parseReportMarkdown(report.content_md) : null,
    [report],
  );
  const rawText = report?.content_text ?? report?.content_md ?? "";

  async function downloadPdf() {
    if (!pdfUrl || !report || pdfPending) {
      return;
    }
    setPdfPending(true);
    setPdfError(null);
    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        let detail = "";
        try {
          const body = await response.json();
          detail = typeof body.detail === "string" ? body.detail : "";
        } catch {
          detail = "";
        }
        throw new Error(detail || t("report.pdfFailed"));
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `report-v${report.version}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setPdfError(error instanceof Error && error.message ? error.message : t("report.pdfFailed"));
    } finally {
      setPdfPending(false);
    }
  }

  return (
    <section
      data-testid="report-panel"
      className={embedded ? "overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-sm" : "border-t border-zinc-200 bg-zinc-50"}
    >
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-white p-4">
        <button type="button" className="flex min-w-0 items-start gap-2 text-left" onClick={() => setExpanded((current) => !current)}>
          {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />}
          <span>
            <h2 className="block truncate text-base font-semibold text-zinc-950">{parsed?.title ?? t("report.title")}</h2>
            {report ? <span className="mt-0.5 block text-xs text-zinc-500">v{report.version}</span> : null}
          </span>
        </button>
        <div className="flex flex-wrap justify-end gap-2">
          {versions.length > 1 ? (
            <select
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700"
              aria-label={t("report.version")}
              value={selectedReportId ?? ""}
              onChange={(event) => onSelectReport?.(Number(event.target.value))}
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {t("report.versionOption", { project: version.project_id ?? "-", version: version.version })}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className="nav-button" onClick={onLoadReport}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("report.load")}
          </button>
          {markdownUrl ? (
            <a className="nav-button" href={markdownUrl} download>
              <Download className="h-4 w-4" aria-hidden="true" />
              Markdown
            </a>
          ) : null}
          {jsonUrl ? <a className="nav-button" href={jsonUrl} download><Download className="h-4 w-4" aria-hidden="true" />JSON</a> : null}
          {pdfUrl ? (
            <button type="button" className="nav-button-active" onClick={downloadPdf} disabled={pdfPending || !report}>
              <FileDown className={`h-4 w-4 ${pdfPending ? "animate-pulse" : ""}`} aria-hidden="true" />
              {pdfPending ? t("report.generatingPdf") : t("report.downloadPdf")}
            </button>
          ) : null}
        </div>
      </div>
      {pdfError ? (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{pdfError}</span>
          <button type="button" className="inline-flex items-center gap-1 font-medium underline" onClick={downloadPdf}>
            <RotateCcw className="h-3.5 w-3.5" />{t("report.retryPdf")}
          </button>
        </div>
      ) : null}
      {expanded ? (
        <article className="space-y-3 p-4 sm:p-5">
          {report?.format === "json" ? <pre className="overflow-auto rounded-xl bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">{rawText}</pre> : !parsed ? <p className="text-sm text-zinc-500">{t("report.empty")}</p> : (
            <>
              {parsed.objective ? <SectionCard section={parsed.objective} tone="highlight" /> : null}
              {parsed.summary ? <SectionCard section={parsed.summary} tone="highlight" /> : null}
              {parsed.sections.map((section) => <SectionCard key={section.id} section={section} />)}
              {parsed.references.length ? (
                <details className="group rounded-xl border border-zinc-200 bg-white">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-zinc-900 marker:hidden">
                    <ChevronRight className="h-4 w-4 text-zinc-400 transition group-open:rotate-90" />
                    {t("report.references")}
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-500">{parsed.references.length}</span>
                  </summary>
                  <ol className="space-y-2 border-t border-zinc-200 p-4">
                    {parsed.references.map((reference) => {
                      let host = "";
                      try {
                        host = new URL(reference.url).hostname.replace(/^www\./, "");
                      } catch {
                        host = "";
                      }
                      return (
                        <li id={`source-${reference.id}`} key={reference.id} className="scroll-mt-6 rounded-lg border border-transparent p-2 text-sm target:border-teal-300 target:bg-teal-50">
                          <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-xs font-semibold text-zinc-600">{reference.id}</span>
                          <a href={reference.url} target="_blank" rel="noreferrer" className="font-medium text-teal-700 hover:underline">{reference.title}</a>
                          {host ? <span className="ml-2 text-xs text-zinc-400">{host}</span> : null}
                        </li>
                      );
                    })}
                  </ol>
                </details>
              ) : null}
            </>
          )}
        </article>
      ) : null}
    </section>
  );
}
