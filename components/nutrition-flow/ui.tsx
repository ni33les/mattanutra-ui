"use client";

import { type ReactNode } from "react";
import { HighlightedBrandText } from "@/components/highlighted-brand-text";

type Option = Readonly<{
  label: string;
  value: string;
}>;

type ScaleOption = Option &
  Readonly<{
    tone: string;
  }>;

export function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function pillClasses(selected: boolean) {
  return cx(
    "mn-pill",
    selected ? "mn-pill--selected" : "mn-pill--idle"
  );
}

export function cardOptionClasses(selected: boolean) {
  return cx(
    "mn-option-card",
    selected ? "mn-option-card--selected" : "mn-option-card--idle"
  );
}

type SectionCardProps = Readonly<{
  children: ReactNode;
  description?: string;
  done: boolean;
  footer?: ReactNode;
  sectionLabel: string;
  stepLabel: string;
  supportingNote?: string;
  title: string;
}>;

type SectionProgressProps = Readonly<{
  className?: string;
  framed?: boolean;
  hint: string;
  label: string;
  marks: readonly [string, string, string];
  progress: number;
}>;

type ProcessingPanelProps = Readonly<{
  error: string;
  onRetry: () => void;
  retryLabel: string;
  subtitle: string;
  title: string;
}>;

export function ProcessingPanel({
  error,
  onRetry,
  retryLabel,
  subtitle,
  title
}: ProcessingPanelProps) {
  return (
    <section className="w-full">
      <div className="mn-processing-card">
        <h1 className="text-xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-2xl">
          <HighlightedBrandText text={title} />
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {subtitle}
        </p>

      {error ? (
        <div className="mt-5">
          <p className="text-sm font-medium text-red-600">{error}</p>
          <button
            type="button"
            className="mn-primary-button mt-3"
            onClick={onRetry}
          >
            {retryLabel}
          </button>
        </div>
      ) : null}
      </div>
    </section>
  );
}

export function SectionProgress({
  className,
  framed = false,
  hint,
  label,
  marks,
  progress,
}: SectionProgressProps) {
  return (
    <div
      className={cx(
        framed ? "mn-section-progress--framed" : "mn-section-progress",
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-[#1FA77A]" />
          {label}
        </p>
        <p className="text-2xl font-semibold tracking-normal text-[#1FA77A]">
          {progress}
          <span className="ml-0.5 text-sm font-semibold text-muted-foreground">
            %
          </span>
        </p>
      </div>
      <progress
        aria-label={label}
        className="mn-progress mt-2"
        max={100}
        value={progress}
      />
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span>{marks[0]}</span>
        <span className="text-center">{marks[1]}</span>
        <span className="text-right">{marks[2]}</span>
      </div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

export function SectionCard({
  children,
  description,
  done,
  footer,
  sectionLabel,
  stepLabel,
  supportingNote,
  title
}: SectionCardProps) {
  return (
    <section className="mn-section-card">
      <div className="mn-section-card__header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p
              className={cx(
                "mn-section-card__kicker",
                done ? "mn-section-card__kicker--done" : "mn-section-card__kicker--active"
              )}
            >
              {sectionLabel}
            </p>
            <h2 className="mn-section-card__title">{title}</h2>
            {description ? (
              <p className="mn-section-card__copy">
                {description}
              </p>
            ) : null}
          </div>
          <div className="max-w-xl text-left lg:max-w-sm lg:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {stepLabel}
            </p>
            {supportingNote ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {supportingNote}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mn-section-card__body">
        <div className="space-y-7">{children}</div>
      </div>
      {footer ? (
        <div className="mn-section-card__footer">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

type QuestionProps = Readonly<{
  children: React.ReactNode;
  hint?: string;
  infoLabel: string;
  label: string;
  required?: boolean;
  requiredLabel?: string;
  why?: string;
}>;

export function Question({
  children,
  hint,
  infoLabel: _infoLabel,
  label,
  required: _required = false,
  requiredLabel: _requiredLabel,
  why
}: QuestionProps) {
  return (
    <div>
      {label ? (
        <div className="mn-question__heading">
          <p className="mn-question__label">{label}</p>
        </div>
      ) : null}
      {hint ? <p className="mn-question__hint">{hint}</p> : null}
      {why ? (
        <p className="mn-question__why">
          {why}
        </p>
      ) : null}
      <div className="mn-question__control">{children}</div>
    </div>
  );
}

type PillGroupProps = Readonly<{
  multi?: boolean;
  onSelect?: (value: string) => void;
  onToggle?: (value: string) => void;
  options: readonly Option[];
  selected: string | string[];
}>;

export function PillGroup({
  multi = false,
  onSelect,
  onToggle,
  options,
  selected
}: PillGroupProps) {
  return (
    <div className="mn-pill-group">
      {options.map((option) => {
        const isSelected = Array.isArray(selected)
          ? selected.includes(option.value)
          : selected === option.value;

        return (
          <button
            key={option.value}
            type="button"
            className={pillClasses(isSelected)}
            onClick={() =>
              multi ? onToggle?.(option.value) : onSelect?.(option.value)
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type SkinToneGroupProps = Readonly<{
  onSelect: (value: string) => void;
  options: readonly Option[];
  selected: string;
}>;

export function SkinToneGroup({ onSelect, options, selected }: SkinToneGroupProps) {
  const hasSelection = Boolean(selected);

  return (
    <div className="mn-skin-grid">
      {options.map((option) => {
        const isSelected = selected === option.value;

        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            className={cx(
              "mn-skin-button",
              isSelected
                ? "mn-skin-button--selected"
                : cx(
                    "mn-skin-button--idle",
                    hasSelection && "mn-skin-button--muted"
                  )
            )}
            onClick={() => onSelect(option.value)}
          >
            <span
              aria-hidden={true}
              className="mn-skin-swatch"
              data-skin-tone={option.value}
            />
          </button>
        );
      })}
    </div>
  );
}

type OptionGridProps = Readonly<{
  max?: number;
  onToggle: (value: string) => void;
  options: readonly Option[];
  selected: string[];
}>;

export function OptionGrid({ max, onToggle, options, selected }: OptionGridProps) {
  return (
    <div className="mn-option-grid">
      {options.map((option) => {
        const isSelected = selected.includes(option.value);
        const blocked = Boolean(max && selected.length >= max && !isSelected);

        return (
          <button
            key={option.value}
            type="button"
            disabled={blocked}
            className={cx(
              cardOptionClasses(isSelected),
              blocked && "mn-option-card--blocked"
            )}
            onClick={() => onToggle(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type ScaleGroupProps = Readonly<{
  onSelect: (value: string) => void;
  options: readonly ScaleOption[];
  selected: string;
}>;

export function ScaleGroup({ onSelect, options, selected }: ScaleGroupProps) {
  return (
    <div className="mn-scale-group">
      {options.map((option) => {
        const isSelected = selected === option.value;

        return (
          <button
            key={option.value}
            type="button"
            className={pillClasses(isSelected)}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
