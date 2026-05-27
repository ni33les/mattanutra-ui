"use client";

import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { CheckIcon } from "@heroicons/react/24/solid";
import type { Locale } from "@/lib/i18n";

type NutritionProgressStage = "plan" | "quiz" | "reveal";

type NutritionProgressProps = Readonly<{
  className?: string;
  complete?: boolean;
  current: NutritionProgressStage;
  locale: Locale;
  pending?: boolean;
}>;

const stageOrder: NutritionProgressStage[] = ["quiz", "reveal", "plan"];

const labels = {
  en: {
    aria: "Nutrition progress",
    plan: {
      description: "We become your best nutrition guide",
      title: "Deliver"
    },
    quiz: {
      description: "We understand you",
      title: "Discover"
    },
    reveal: {
      description: "We reveal your formula",
      title: "Reveal"
    }
  },
  th: {
    aria: "ความคืบหน้าด้านโภชนาการ",
    plan: {
      description: "เราส่งมอบคู่มือโภชนาการที่เหมาะกับคุณ",
      title: "ส่งมอบแผน"
    },
    quiz: {
      description: "เราเข้าใจคะแนนสุขภาพของคุณ",
      title: "ค้นพบ"
    },
    reveal: {
      description: "เราแสดงสูตรของคุณ",
      title: "เปิดเผยแผน"
    }
  }
} satisfies Record<
  Locale,
  { aria: string } & Record<NutritionProgressStage, { description: string; title: string }>
>;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function NutritionProgress({
  className,
  complete: allComplete = false,
  current,
  locale,
  pending = false
}: NutritionProgressProps) {
  const currentIndex = Math.max(0, stageOrder.indexOf(current));
  const copy = labels[locale];

  return (
    <nav aria-label={copy.aria} className={className}>
      <ol
        role="list"
        className="divide-y divide-gray-300 rounded-md border border-gray-300 bg-white md:flex md:divide-y-0"
      >
        {stageOrder.map((stage, stageIndex) => {
          const complete = allComplete
            ? stageIndex <= currentIndex
            : stageIndex < currentIndex;
          const active = !allComplete && stageIndex === currentIndex;
          const content = (
            <span className="flex items-start px-4 py-3 text-sm font-medium sm:px-5 sm:py-4">
              <span
                className={cx(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center sm:size-10",
                  active && pending ? "" : "rounded-full border-2",
                  complete
                    ? "border-[var(--mn-gold)] bg-[var(--mn-gold)]"
                    : active
                      ? active && pending
                        ? ""
                        : "border-[var(--mn-gold)] bg-white"
                      : "border-gray-300 bg-white"
                )}
              >
                {complete ? (
                  <CheckIcon aria-hidden={true} className="size-5 text-white" />
                ) : active && pending ? (
                  <ArrowPathIcon
                    aria-hidden={true}
                    className="size-7 animate-spin text-[var(--mn-gold)] sm:size-8"
                    strokeWidth={2.6}
                  />
                ) : (
                  <span
                    className={cx(
                      "text-sm font-semibold",
                      active ? "text-[var(--mn-gold)]" : "text-gray-500"
                    )}
                  >
                    {String(stageIndex + 1).padStart(2, "0")}
                  </span>
                )}
              </span>
              <span className="ml-3 min-w-0 sm:ml-4">
                <span
                  className={cx(
                    "block text-base font-bold sm:text-lg",
                    complete || active ? "text-[var(--mn-ink)]" : "text-gray-500"
                  )}
                >
                  {copy[stage].title}
                </span>
                <span
                  className={cx(
                    "mt-1 block max-w-56 text-xs font-medium leading-5",
                    complete || active
                      ? "text-gray-500/80"
                      : "text-gray-400/70"
                  )}
                >
                  {copy[stage].description}
                </span>
              </span>
            </span>
          );

          return (
            <li key={stage} className="relative md:flex md:flex-1">
              <span
                aria-current={active ? "step" : undefined}
                className="flex w-full items-center"
              >
                {content}
              </span>

              {stageIndex !== stageOrder.length - 1 ? (
                <div
                  aria-hidden={true}
                  className="absolute right-0 top-0 hidden h-full w-5 md:block"
                >
                  <svg
                    fill="none"
                    viewBox="0 0 22 80"
                    preserveAspectRatio="none"
                    className="size-full text-gray-300"
                  >
                    <path
                      d="M0 -2L20 40L0 82"
                      stroke="currentcolor"
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
