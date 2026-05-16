"use client";

import { useState, type ReactNode } from "react";
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
  done: boolean;
  number: number;
  sectionLabel: string;
  stepLabel: string;
  title: string;
}>;

type SectionProgressProps = Readonly<{
  className?: string;
  framed?: boolean;
  progress: number;
  progressLabel: string;
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
  progress,
  progressLabel
}: SectionProgressProps) {
  return (
    <div
      className={cx(
        framed
          ? "rounded-lg border border-foreground/10 bg-white px-4 py-3 shadow-sm"
          : "px-1 py-1",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {progressLabel}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#20343A]">
          {progress}%
        </p>
      </div>
      <div className="mt-1.5 h-1 rounded-md bg-background">
        <div
          className="h-full rounded-md bg-[#1FA77A] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function SectionCard({
  children,
  done,
  number,
  sectionLabel,
  stepLabel,
  title
}: SectionCardProps) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-foreground/10 sm:p-6">
      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cx(
                "flex size-8 items-center justify-center rounded-md text-sm font-semibold text-white",
                done ? "bg-[#1FA77A]" : "bg-[#3A7BD5]"
              )}
            >
              {done ? "✓" : number}
            </div>
            <h2 className="text-lg font-semibold text-[#20343A]">{title}</h2>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#3A7BD5]">
              {stepLabel}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {sectionLabel}
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-6">{children}</div>
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
  infoLabel,
  label,
  required = false,
  requiredLabel,
  why
}: QuestionProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {why ? (
          <QuestionLabelPopover
            infoLabel={infoLabel}
            label={label}
            text={why}
          />
        ) : (
          <p className="text-sm font-semibold text-[#20343A]">{label}</p>
        )}
        {required ? (
          <span className="rounded-full bg-[#1FA77A]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1FA77A]">
            {requiredLabel}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function QuestionLabelPopover({
  infoLabel,
  label,
  text
}: Readonly<{ infoLabel: string; label: string; text: string }>) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span
      className="relative inline-flex max-w-full"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={`${infoLabel}: ${label}`}
        className="cursor-help rounded-sm text-left text-sm font-semibold text-[#20343A] underline decoration-foreground/20 decoration-dotted underline-offset-4 transition hover:text-[#245f9f] focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]/25"
        onBlur={() => setIsOpen(false)}
        onClick={() => setIsOpen((current) => !current)}
        onFocus={() => setIsOpen(true)}
      >
        {label}
      </button>
      <span
        role="tooltip"
        className={cx(
          "absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-md bg-[#20343A] px-3 py-2 text-left text-xs font-medium normal-case leading-5 tracking-normal text-white shadow-lg sm:left-1/2 sm:-translate-x-1/2",
          isOpen ? "block" : "hidden"
        )}
      >
        {text}
      </span>
    </span>
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
