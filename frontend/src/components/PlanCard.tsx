import { CheckCircle2, Play, Route } from "lucide-react";
import type { PlanArtifact } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";

export function PlanCard({
  plan,
  current,
  executable,
  pending,
  onExecute,
}: {
  plan: PlanArtifact;
  current: boolean;
  executable: boolean;
  pending: boolean;
  onExecute: (version: number) => void;
}) {
  const { t } = useI18n();
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-teal-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {current ? t("plan.ready") : t("plan.superseded")}
          </div>
          <h3 className="mt-1 font-semibold text-zinc-950">{t("plan.version", { version: plan.version })}</h3>
        </div>
        <Route className="h-5 w-5 text-zinc-400" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-700">{plan.summary}</p>
      <ol className="mt-4 space-y-3">
        {plan.steps.map((step, index) => (
          <li key={`${step.seq}-${index}`} className="flex gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
              {step.seq || index + 1}
            </span>
            <span>
              <span className="block font-medium text-zinc-900">{step.title}</span>
              {step.description ? <span className="mt-0.5 block text-zinc-500">{step.description}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {current ? (
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-zinc-200 pt-4">
          <span className="text-xs text-zinc-500">{t("plan.continueToRevise")}</span>
          <button
            type="button"
            className="nav-button-active"
            disabled={!executable || pending}
            onClick={() => onExecute(plan.version)}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {pending ? t("plan.executing") : t("plan.execute")}
          </button>
        </div>
      ) : null}
    </>
  );

  if (!current) {
    return (
      <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-zinc-600">
        <summary className="cursor-pointer text-sm font-medium">{t("plan.oldVersion", { version: plan.version })}</summary>
        <div className="mt-4">{content}</div>
      </details>
    );
  }

  return (
    <section data-testid="plan-card" className="rounded-xl border border-teal-200 bg-white p-5 shadow-sm">
      {content}
    </section>
  );
}
