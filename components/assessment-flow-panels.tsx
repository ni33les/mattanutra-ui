"use client";

import {
  CheckIcon,
  ShieldCheckIcon
} from "@heroicons/react/20/solid";
import { cx } from "@/components/nutrition-flow/ui";

type PrecisionProgress = Readonly<{
  essentialRemaining: number;
  progress: number;
}>;

type PrecisionUi = Readonly<{
  formulaPrecision: string;
  precisionHint: (progress: number, essentialRemaining: number) => string;
  precisionMarks: readonly [string, string, string];
}>;

type TrustItem = Readonly<{
  body: string;
  title: string;
}>;

type StepperSection = Readonly<{
  complete: boolean;
  id: string;
  title: string;
}>;

export function PrecisionGauge({
  ariaLabel,
  labels,
  progress
}: Readonly<{
  ariaLabel: string;
  labels: readonly [string, string, string];
  progress: number;
}>) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex justify-end">
        <span className="text-xs font-semibold tabular-nums text-[var(--mn-teal)]">
          {progress}%
        </span>
      </div>
      <progress
        aria-label={ariaLabel}
        className="mn-progress mn-progress--thin"
        max={100}
        value={progress}
      />
      <div className="mt-2 grid grid-cols-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span>{labels[0]}</span>
        <span className="text-center">{labels[1]}</span>
        <span className="text-right">{labels[2]}</span>
      </div>
    </div>
  );
}

export function QuestionnairePrecisionMeter({
  precision,
  ui
}: Readonly<{
  precision: PrecisionProgress;
  ui: PrecisionUi;
}>) {
  return (
    <aside className="mn-questionnaire-meter" aria-label={ui.formulaPrecision}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mn-questionnaire-meter__label">{ui.formulaPrecision}</p>
          <p className="mn-questionnaire-meter__hint">
            {ui.precisionHint(precision.progress, precision.essentialRemaining)}
          </p>
        </div>
        <p className="mn-questionnaire-meter__value">
          {precision.progress}
          <span>%</span>
        </p>
      </div>
      <progress
        aria-label={ui.formulaPrecision}
        className="mn-progress mn-progress--soft mt-4"
        max={100}
        value={precision.progress}
      />
      <div className="mn-questionnaire-meter__marks">
        <span>{ui.precisionMarks[0]}</span>
        <span>{ui.precisionMarks[1]}</span>
        <span>{ui.precisionMarks[2]}</span>
      </div>
    </aside>
  );
}

export function AssessmentIntroNote({
  body,
  firstName,
  greeting
}: Readonly<{
  body: string;
  firstName: string | null;
  greeting: string;
}>) {
  return (
    <div className="mn-assessment-honesty">
      <div aria-hidden={true} className="mn-assessment-honesty__mark">&quot;</div>
      <div className="min-w-0">
        {firstName ? (
          <p className="mn-assessment-honesty__greeting">{greeting}</p>
        ) : null}
        <p>{body}</p>
      </div>
    </div>
  );
}

export function AssessmentTrustStrip({
  items
}: Readonly<{
  items: readonly TrustItem[];
}>) {
  return (
    <div className="mn-assessment-trust-strip">
      {items.map((item) => (
        <div key={item.title} className="mn-assessment-trust-item">
          <ShieldCheckIcon aria-hidden={true} className="size-5 shrink-0" />
          <div className="min-w-0">
            <p className="mn-assessment-trust-item__title">{item.title}</p>
            <p className="mn-assessment-trust-item__body">{item.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AssessmentStepper({
  ariaLabel,
  currentIndex,
  onSelect,
  phases,
  sections,
  stages
}: Readonly<{
  ariaLabel: string;
  currentIndex: number;
  onSelect: (index: number) => void;
  phases: readonly string[];
  sections: readonly StepperSection[];
  stages: readonly string[];
}>) {
  return (
    <nav aria-label={ariaLabel}>
      <ol className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        {sections.map((section, index) => {
          const active = index === currentIndex;
          const done = index < currentIndex || section.complete;

          return (
            <li key={section.id}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                className={cx(
                  "flex h-full w-full flex-col gap-1 rounded-[0.85rem] border px-3 py-3 text-left shadow-sm transition",
                  active
                    ? "border-[var(--mn-teal)] bg-[linear-gradient(180deg,#fff,var(--mn-mint))] text-[var(--mn-ink)] shadow-[0_14px_34px_-26px_rgba(45,143,114,0.6)]"
                    : done
                      ? "border-[var(--mn-teal-deep)] bg-[var(--mn-mint)] text-[var(--mn-ink)] hover:border-[var(--mn-teal)]"
                      : "border-[var(--mn-line)] bg-[var(--mn-paper)] hover:border-[color-mix(in_srgb,var(--mn-gold)_45%,transparent)]"
                )}
                onClick={() => onSelect(index)}
              >
                <span
                  className={cx(
                    "flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]",
                    active || done ? "text-[var(--mn-teal-deep)]" : "text-muted-foreground"
                  )}
                >
                  <span
                    className={cx(
                      "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                      active
                        ? "bg-[var(--mn-teal)] text-white"
                        : done
                          ? "bg-[var(--mn-teal-deep)] text-white"
                          : "bg-[var(--mn-cream-deep)] text-muted-foreground"
                    )}
                  >
                    {done && !active ? (
                      <CheckIcon aria-hidden={true} className="size-3.5" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="hidden sm:inline">
                    {phases[index] ?? phases[0] ?? ""}
                  </span>
                </span>
                <span
                  className={cx(
                    "hidden text-sm font-semibold tracking-normal sm:block",
                    active || done ? "text-[var(--mn-ink)]" : "text-muted-foreground"
                  )}
                >
                  {stages[index] ?? section.title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
