"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { CheckIcon } from "@heroicons/react/24/solid";
import type { Locale } from "@/lib/i18n";
import { nutritionRevealPath } from "@/lib/nutrition-paths";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import type {
  JourneyWorkStageId,
  JourneyWorkStageState,
  JourneyWorkTimeline
} from "@/lib/nutrition-journey-status";

const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_ATTEMPTS = 80;
const STAGE_ORDER: readonly JourneyWorkStageId[] = [
  "healthscore",
  "formulation",
  "products"
];

const copy = {
  en: {
    aria: "Plan preparation",
    error: "We could not finish this step. Your completed work is saved.",
    retry: "Try again",
    title: "Preparing your plan",
    healthscore: "Calculating your Healthscore",
    formulation: "Creating your formulation",
    products: "Matching your products"
  },
  th: {
    aria: "ความคืบหน้าของแผน",
    error: "ขั้นตอนนี้ยังทำไม่สำเร็จ งานที่เสร็จแล้วถูกบันทึกไว้",
    retry: "ลองอีกครั้ง",
    title: "กำลังจัดแผนของคุณ",
    healthscore: "กำลังคำนวณ Healthscore",
    formulation: "กำลังสร้างสูตร",
    products: "กำลังจับคู่สินค้า"
  },
  "zh-CN": {
    aria: "方案准备进度",
    error: "这一步没能完成。已完成的部分已保存。",
    retry: "再试一次",
    title: "正在准备你的方案",
    healthscore: "正在计算 Healthscore",
    formulation: "正在创建配方",
    products: "正在匹配产品"
  }
} satisfies Record<
  Locale,
  {
    aria: string;
    error: string;
    retry: string;
    title: string;
  } & Record<JourneyWorkStageId, string>
>;

type JourneyProgressProps = Readonly<{
  initial: NutritionJourneySnapshot;
  locale: Locale;
  planId: string;
}>;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function JourneyProgress({
  initial,
  locale,
  planId
}: JourneyProgressProps) {
  const router = useRouter();
  const labels = copy[locale];
  const [timeline, setTimeline] = useState<JourneyWorkTimeline>(initial);
  const [attempts, setAttempts] = useState(0);
  const [fetchFailed, setFetchFailed] = useState(false);

  const goToReveal = useCallback(() => {
    router.replace(nutritionRevealPath(locale, planId));
  }, [locale, planId, router]);

  const loadSnapshot = useCallback(async () => {
    const response = await fetch(
      `/api/assessment/${encodeURIComponent(planId)}/journey`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error("Unable to load journey status");
    }

    return (await response.json()) as NutritionJourneySnapshot;
  }, [planId]);

  useEffect(() => {
    if (timeline.readyForReveal) {
      goToReveal();
    }
  }, [goToReveal, timeline.readyForReveal]);

  useEffect(() => {
    if (timeline.readyForReveal || timeline.failed || fetchFailed) {
      return;
    }

    if (attempts >= MAX_POLL_ATTEMPTS) {
      setFetchFailed(true);
      return;
    }

    const timer = window.setTimeout(() => {
      void loadSnapshot()
        .then((snapshot) => {
          setTimeline(snapshot);
          setAttempts((current) => current + 1);
        })
        .catch(() => {
          setFetchFailed(true);
        });
    }, POLL_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [
    attempts,
    fetchFailed,
    loadSnapshot,
    timeline.failed,
    timeline.readyForReveal
  ]);

  async function retry() {
    setFetchFailed(false);
    setAttempts(0);

    try {
      const snapshot = await loadSnapshot();
      setTimeline(snapshot);
    } catch {
      setFetchFailed(true);
    }
  }

  const failed = timeline.failed || fetchFailed;

  return (
    <section
      className="mx-auto w-full max-w-xl px-6 py-12 sm:px-8"
      data-testid="journey-progress"
    >
      <h1 className="font-serif text-2xl font-semibold tracking-normal text-[var(--mn-ink)] sm:text-3xl">
        {labels.title}
      </h1>
      <nav aria-label={labels.aria} className="mt-8">
        <ol className="space-y-0">
          {STAGE_ORDER.map((stage, index) => {
            const state: JourneyWorkStageState = timeline.stages[stage];
            const complete = state === "complete";
            const active = state === "active" && !failed;

            return (
              <li className="grid grid-cols-[40px_1fr] gap-4" key={stage}>
                <div className="flex flex-col items-center">
                  <span
                    className={cx(
                      "flex size-10 items-center justify-center rounded-full border-2",
                      complete
                        ? "border-[var(--mn-gold)] bg-[var(--mn-gold)]"
                        : active
                          ? "border-[var(--mn-gold)] bg-white"
                          : "border-gray-300 bg-white"
                    )}
                    aria-current={active ? "step" : undefined}
                  >
                    {complete ? (
                      <CheckIcon aria-hidden className="size-5 text-white" />
                    ) : active ? (
                      <ArrowPathIcon
                        aria-hidden
                        className="size-6 animate-spin text-[var(--mn-gold)]"
                        strokeWidth={2.4}
                      />
                    ) : (
                      <span className="text-sm font-semibold text-gray-400">
                        {index + 1}
                      </span>
                    )}
                  </span>
                  {index < STAGE_ORDER.length - 1 ? (
                    <span
                      aria-hidden
                      className={cx(
                        "mt-1 w-[2px] flex-1 min-h-[28px]",
                        complete ? "bg-[var(--mn-gold)]" : "bg-gray-200"
                      )}
                    />
                  ) : null}
                </div>
                <p
                  className={cx(
                    "pt-2 text-base font-medium",
                    complete || active
                      ? "text-[var(--mn-ink)]"
                      : "text-gray-400"
                  )}
                >
                  {labels[stage]}
                </p>
              </li>
            );
          })}
        </ol>
      </nav>
      {failed ? (
        <div className="mt-8 rounded-lg bg-white p-5 ring-1 ring-foreground/10">
          <p className="text-sm leading-6 text-muted-foreground">{labels.error}</p>
          <button
            type="button"
            className="mt-4 rounded-full bg-[var(--mn-ink)] px-4 py-2 text-sm font-medium text-white"
            data-testid="journey-progress-retry"
            onClick={() => {
              void retry();
            }}
          >
            {labels.retry}
          </button>
        </div>
      ) : null}
    </section>
  );
}
