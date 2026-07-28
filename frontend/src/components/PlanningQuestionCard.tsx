import { useMemo, useState } from "react";
import { CheckCircle2, CircleHelp, Send } from "lucide-react";
import type { PlanningAnswer, PlanningQuestion } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";

const CUSTOM = "__custom__";

export function PlanningQuestionCard({
  questions,
  answers = [],
  active = false,
  pending = false,
  onSubmit,
}: {
  questions: PlanningQuestion[];
  answers?: PlanningAnswer[];
  active?: boolean;
  pending?: boolean;
  onSubmit?: (answers: PlanningAnswer[], displayMessage: string) => void;
}) {
  const { t } = useI18n();
  const initialSelections = useMemo(
    () => Object.fromEntries(answers.map((answer) => [
      answer.question_id,
      answer.option_id ?? CUSTOM,
    ])),
    [answers],
  );
  const initialCustom = useMemo(
    () => Object.fromEntries(answers.map((answer) => [
      answer.question_id,
      answer.text ?? "",
    ])),
    [answers],
  );
  const [selections, setSelections] = useState<Record<string, string>>(initialSelections);
  const [customValues, setCustomValues] = useState<Record<string, string>>(initialCustom);

  const complete = questions.every((question) => {
    const selection = selections[question.id];
    return Boolean(selection && (selection !== CUSTOM || customValues[question.id]?.trim()));
  });

  function submit() {
    if (!complete || pending) {
      return;
    }
    const structured = questions.map<PlanningAnswer>((question) => {
      const selection = selections[question.id];
      return selection === CUSTOM
        ? { question_id: question.id, text: customValues[question.id].trim() }
        : { question_id: question.id, option_id: selection };
    });
    const displayMessage = questions.map((question) => {
      const answer = structured.find((item) => item.question_id === question.id);
      const selected = question.options.find((option) => option.id === answer?.option_id);
      return `${question.prompt}：${selected?.label ?? answer?.text ?? ""}`;
    }).join("\n");
    onSubmit?.(structured, displayMessage);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm" data-testid="planning-question-card">
      <header className="flex items-center gap-2 border-b border-teal-100 bg-teal-50 px-4 py-3">
        {active ? <CircleHelp className="h-4 w-4 text-teal-700" /> : <CheckCircle2 className="h-4 w-4 text-teal-700" />}
        <h3 className="text-sm font-semibold text-teal-950">
          {active ? t("planningQuestions.title") : t("planningQuestions.answered")}
        </h3>
      </header>
      <div className="space-y-5 p-4">
        {questions.map((question, questionIndex) => (
          <fieldset key={question.id} className="space-y-2" disabled={!active || pending}>
            <legend className="mb-2 text-sm font-medium text-zinc-900">
              <span className="mr-2 text-xs font-semibold text-teal-700">{questionIndex + 1}</span>
              {question.prompt}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {question.options.map((option) => {
                const selected = selections[question.id] === option.id;
                return (
                  <label
                    key={option.id}
                    className={`cursor-pointer rounded-xl border p-3 transition ${
                      selected ? "border-teal-500 bg-teal-50 ring-1 ring-teal-500" : "border-zinc-200 hover:border-zinc-300"
                    } ${!active ? "cursor-default" : ""}`}
                  >
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name={question.id}
                        value={option.id}
                        checked={selected}
                        onChange={() => setSelections((current) => ({ ...current, [question.id]: option.id }))}
                        className="mt-0.5 accent-teal-700"
                      />
                      <span>
                        <span className="block text-sm font-medium text-zinc-900">{option.label}</span>
                        {option.description ? <span className="mt-1 block text-xs leading-5 text-zinc-500">{option.description}</span> : null}
                      </span>
                    </span>
                  </label>
                );
              })}
              {question.allow_custom ? (
                <label className={`rounded-xl border p-3 ${
                  selections[question.id] === CUSTOM ? "border-teal-500 bg-teal-50 ring-1 ring-teal-500" : "border-zinc-200"
                } ${active ? "cursor-pointer" : "cursor-default"}`}>
                  <span className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    <input
                      type="radio"
                      name={question.id}
                      value={CUSTOM}
                      checked={selections[question.id] === CUSTOM}
                      onChange={() => setSelections((current) => ({ ...current, [question.id]: CUSTOM }))}
                      className="accent-teal-700"
                    />
                    {t("planningQuestions.custom")}
                  </span>
                  {selections[question.id] === CUSTOM ? (
                    <textarea
                      className="mt-3 min-h-20 w-full resize-y rounded-lg border border-zinc-300 bg-white p-2 text-sm outline-none focus:border-teal-500"
                      value={customValues[question.id] ?? ""}
                      onChange={(event) => setCustomValues((current) => ({ ...current, [question.id]: event.target.value }))}
                      placeholder={t("planningQuestions.customPlaceholder")}
                      aria-label={`${question.prompt} ${t("planningQuestions.custom")}`}
                    />
                  ) : null}
                </label>
              ) : null}
            </div>
          </fieldset>
        ))}
        {active ? (
          <div className="flex justify-end border-t border-zinc-100 pt-3">
            <button type="button" className="nav-button-active" disabled={!complete || pending} onClick={submit}>
              <Send className="h-4 w-4" aria-hidden="true" />
              {pending ? t("planningQuestions.submitting") : t("planningQuestions.submit")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
