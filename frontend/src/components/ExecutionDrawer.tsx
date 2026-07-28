import { ExternalLink } from "lucide-react";
import type { ProjectExecutionDetail, ServerEvent } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { ProgressStream } from "./ProgressStream";

export function ExecutionDrawer({
  detail,
  streamStatus,
  events,
}: {
  detail: ProjectExecutionDetail | null;
  streamStatus: string;
  events: ServerEvent[];
}) {
  const { t } = useI18n();
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] pt-12">
      <div className="border-b border-zinc-200 px-4 pb-4">
        <h2 className="font-semibold text-zinc-950">{t("execution.details")}</h2>
        <p className="mt-1 text-xs text-zinc-500">{detail?.status ?? t("execution.noProject")}</p>
      </div>
      <div className="min-h-0 overflow-auto border-b border-zinc-200 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("execution.steps")}</h3>
        <div className="mt-3 space-y-2">
          {detail?.steps.length ? detail.steps.map((step) => (
            <div key={step.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-medium">{step.seq}. {step.title}</span>
                <span className="text-xs text-zinc-500">{step.status}</span>
              </div>
              {step.description ? <p className="mt-1 text-zinc-600">{step.description}</p> : null}
            </div>
          )) : <p className="text-sm text-zinc-500">{t("execution.noSteps")}</p>}
        </div>
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("execution.sources")}</h3>
        <div className="mt-3 space-y-2">
          {detail?.sources.length ? detail.sources.map((source) => (
            <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-zinc-200 p-3 text-sm hover:border-teal-300">
              <span className="flex items-center gap-2 font-medium text-zinc-900">
                {source.title || source.url}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {source.snippet ? <span className="mt-1 line-clamp-2 block text-xs text-zinc-500">{source.snippet}</span> : null}
            </a>
          )) : <p className="text-sm text-zinc-500">{t("execution.noSources")}</p>}
        </div>
      </div>
      <div className="min-h-0">
        <ProgressStream status={streamStatus} events={events} />
      </div>
    </div>
  );
}
