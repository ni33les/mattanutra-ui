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

const fitzpatrickSkinToneColors: Record<string, string> = {
  I: "#f8dfc8",
  II: "#eec29a",
  III: "#d6a071",
  IV: "#a66c45",
  V: "#744222",
  VI: "#3b2116"
};

export function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function pillClasses(selected: boolean) {
  return cx(
    "rounded-md border px-4 py-2 text-sm font-semibold transition",
    selected
      ? "border-[#1FA77A] bg-[#1FA77A] text-white"
      : "border-foreground/10 bg-white text-[#20343A] hover:border-[#1FA77A]/40 hover:bg-[#1FA77A]/5"
  );
}

export function cardOptionClasses(selected: boolean) {
  return cx(
    "rounded-md border px-4 py-3 text-left text-sm font-semibold transition",
    selected
      ? "border-[#1FA77A] bg-[#1FA77A] text-white"
      : "border-foreground/10 bg-white text-[#20343A] hover:border-[#1FA77A]/40 hover:bg-[#1FA77A]/5"
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
      <div className="rounded-lg bg-white p-5 ring-1 ring-foreground/10 sm:p-6">
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
            className="mt-3 rounded-md bg-[#1FA77A] px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#188a65]"
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
        framed
          ? "rounded-lg border border-foreground/10 bg-white px-4 py-4 shadow-sm"
          : "bg-background/95 px-1 py-2 backdrop-blur",
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
      <div className="mt-2 h-2 overflow-hidden rounded-full border border-foreground/10 bg-background">
        <div
          className="h-full rounded-full bg-[#1FA77A] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
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
    <section className="divide-y divide-foreground/10 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-foreground/10">
      <div className="px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p
              className={cx(
                "flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]",
                done ? "text-[#1FA77A]" : "text-[#3A7BD5]"
              )}
            >
              <span
                className={cx(
                  "size-1.5 rounded-full",
                  done ? "bg-[#1FA77A]" : "bg-[#3A7BD5]"
                )}
              />
              {sectionLabel}
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[#20343A]">{title}</h2>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
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
      <div className="px-5 py-6 sm:p-6">
        <div className="space-y-7">{children}</div>
      </div>
      {footer ? (
        <div className="bg-background/60 px-5 py-4 sm:px-6">
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[#20343A]">{label}</p>
        </div>
      ) : null}
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      {why ? (
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {why}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
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
    <div className="flex flex-wrap gap-2">
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
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {options.map((option) => {
        const isSelected = selected === option.value;

        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            className={cx(
              "aspect-square rounded-md border-2 bg-white p-1 transition duration-150 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]/25",
              isSelected
                ? "border-[#1FA77A] shadow-sm ring-2 ring-[#1FA77A]/25"
                : cx(
                    "border-foreground/10 hover:border-[#1FA77A]/40 hover:bg-[#1FA77A]/5 hover:opacity-100",
                    hasSelection && "opacity-35 saturate-75"
                  )
            )}
            onClick={() => onSelect(option.value)}
          >
            <span
              aria-hidden={true}
              className="block size-full rounded-[4px] border border-black/10"
              style={{
                backgroundColor:
                  fitzpatrickSkinToneColors[option.value] ?? "#f8dfc8"
              }}
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              blocked && "cursor-not-allowed opacity-45"
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
    <div className="flex flex-wrap gap-2">
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
