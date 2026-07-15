import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCcw } from "lucide-react";

export type PlanOption = {
  id: string;
  title: string;
  description?: string;
};

export type ResearchPlan = {
  summary?: string;
  options?: PlanOption[];
};

type PlanPanelProps = {
  awaitingDecision: boolean;
  pending: boolean;
  plan: ResearchPlan | null;
  onApprove: (decision: { approved: true; chosen_option: string }) => void;
  onReplan: (decision: { approved: false; feedback: string }) => void;
};

export function PlanPanel({ awaitingDecision, pending, plan, onApprove, onReplan }: PlanPanelProps) {
  const options = useMemo(() => plan?.options ?? [], [plan]);
  const defaultChoice = options[0]?.id ?? "";
  const [chosen, setChosen] = useState(defaultChoice);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!chosen && defaultChoice) {
      setChosen(defaultChoice);
      return;
    }

    if (chosen && !options.some((option) => option.id === chosen)) {
      setChosen(defaultChoice);
    }
  }, [chosen, defaultChoice, options]);

  return (
    <section className="flex h-full flex-col bg-white">
      <div className="border-b border-zinc-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-950">Plan confirmation</h2>
          <span className="text-xs text-zinc-500">
            {pending ? "Submitting decision" : awaitingDecision ? "Waiting for decision" : "No pending decision"}
          </span>
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          {plan?.summary ?? "Start a research request to generate a plan."}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {options.length > 0 ? (
          options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-3 text-sm"
            >
              <input
                type="radio"
                name="plan-option"
                aria-label={option.title}
                checked={chosen === option.id}
                disabled={pending}
                onChange={() => setChosen(option.id)}
              />
              <span className="min-w-0">
                <span className="block font-medium text-zinc-950">{option.title}</span>
                {option.description ? <span className="block text-zinc-500">{option.description}</span> : null}
              </span>
            </label>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-zinc-200 p-3 text-sm text-zinc-500">
            No plan options available yet.
          </div>
        )}

        <div>
          <label htmlFor="replan-feedback" className="mb-2 block text-sm font-medium text-zinc-700">
            Replan feedback
          </label>
          <textarea
            id="replan-feedback"
            className="h-24 w-full rounded-md border border-zinc-300 p-3 text-sm"
            value={feedback}
            disabled={pending}
            onChange={(event) => setFeedback(event.target.value)}
            aria-label="Replan feedback"
          />
        </div>
      </div>

      <div className="flex gap-2 border-t border-zinc-200 p-4">
        <button
          type="button"
          className="nav-button-active"
          disabled={!awaitingDecision || pending || !chosen}
          onClick={() => onApprove({ approved: true, chosen_option: chosen })}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Approve plan
        </button>
        <button
          type="button"
          className="nav-button"
          disabled={!awaitingDecision || pending}
          onClick={() => onReplan({ approved: false, feedback })}
        >
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Replan
        </button>
      </div>
    </section>
  );
}
