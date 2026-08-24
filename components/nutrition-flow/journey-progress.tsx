"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalculatingWait } from "@/components/chat-questionnaire/calculating-wait";
import { getWelcomeCopy } from "@/components/chat-questionnaire/questionnaire-welcome";
import "@/components/chat-questionnaire/chat-questionnaire.css";
import type { Locale } from "@/lib/i18n";
import { nutritionRevealPath } from "@/lib/nutrition-paths";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import type { JourneyWorkTimeline } from "@/lib/nutrition-journey-status";

const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_ATTEMPTS = 80;

const formulaCopy = {
  en: {
    kicker: "Thank you",
    title: "Your formula is being prepared",
    body: "MattaNutra is building your personalised formula and matching the right products. This normally takes several seconds.",
    building: "Preparing your formula…",
    note: "Please keep this page open.",
    error: "We could not finish this step. Your completed work is saved.",
    retry: "Try again"
  },
  th: {
    kicker: "ขอบคุณค่ะ",
    title: "กำลังจัดสูตรของคุณ",
    body: "MattaNutra กำลังจัดทำสูตรเฉพาะบุคคลและจับคู่สินค้าที่เหมาะกับคุณ โดยปกติใช้เวลาเพียงไม่กี่วินาทีค่ะ",
    building: "กำลังจัดสูตรของคุณ…",
    note: "กรุณาเปิดหน้านี้ไว้นะคะ",
    error: "ขั้นตอนนี้ยังทำไม่สำเร็จ งานที่เสร็จแล้วถูกบันทึกไว้",
    retry: "ลองอีกครั้ง"
  },
  "zh-CN": {
    kicker: "谢谢",
    title: "正在准备你的配方",
    body: "MattaNutra 正在为你制定个性化配方并匹配产品，通常只需几秒钟。",
    building: "正在准备你的配方…",
    note: "请保持此页面打开。",
    error: "这一步没能完成。已完成的部分已保存。",
    retry: "再试一次"
  }
} satisfies Record<
  Locale,
  {
    body: string;
    building: string;
    error: string;
    kicker: string;
    note: string;
    retry: string;
    title: string;
  }
>;

type JourneyProgressProps = Readonly<{
  initial: NutritionJourneySnapshot;
  locale: Locale;
  planId: string;
}>;

export function JourneyProgress({
  initial,
  locale,
  planId
}: JourneyProgressProps) {
  const router = useRouter();
  const labels = formulaCopy[locale];
  const support = getWelcomeCopy(locale === "zh-CN" ? "en" : locale);
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
    <CalculatingWait
      copy={{
        body: labels.body,
        disclaimer: support.calcDisclaimer,
        kicker: labels.kicker,
        line: support.calcLine,
        note: failed ? null : labels.note,
        status: failed ? labels.error : labels.building,
        title: labels.title
      }}
      spinning={!failed}
      testId="journey-progress"
    >
      {failed ? (
        <button
          type="button"
          className="mn-quiz-calc__ready-btn"
          data-testid="journey-progress-retry"
          onClick={() => {
            void retry();
          }}
        >
          {labels.retry}
        </button>
      ) : null}
    </CalculatingWait>
  );
}
