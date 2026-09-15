"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight, LoaderCircle } from "lucide-react";
import { SafeImage } from "@/components/safe-image";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { assessmentPollKey, fetchFunnelJson, pollFunnelStatus } from "@/lib/funnel-polling";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import type { Locale } from "@/lib/i18n";

const copy = {
  en: { kicker: "Your pharmacy plan", title: "Finding your right amount.", body: "We’re bringing your answers and this pharmacy’s products together into a plan for you.",
    estimate: "This usually takes about a minute.", words: ["Vitamin D3", "Magnesium", "Omega-3", "Zinc", "Vitamin C", "Vitamin B12"],
    steps: ["Your answers", "Your supplement plan", "Products at this pharmacy"], saving: "Saving your questionnaire", working: "Preparing your recommendation", note: "Your recommendation will open here when it’s ready. No online payment — pay at the pharmacy counter.",
    error: "This is taking longer than expected. Your saved answers are safe. Try again to continue.", retry: "Try again" },
  th: { kicker: "แผนสำหรับคุณที่ร้านยา", title: "กำลังหาปริมาณที่พอดีสำหรับคุณ", body: "เรากำลังนำคำตอบของคุณมาจัดแผนอาหารเสริมจากผลิตภัณฑ์ของร้านยานี้",
    estimate: "โดยปกติใช้เวลาประมาณ 1 นาที", words: ["วิตามินดี 3", "แมกนีเซียม", "โอเมกา 3", "สังกะสี", "วิตามินซี", "วิตามินบี 12"],
    steps: ["คำตอบของคุณ", "แผนอาหารเสริมของคุณ", "ผลิตภัณฑ์ที่ร้านยา"], saving: "กำลังบันทึกแบบสอบถาม", working: "กำลังจัดทำคำแนะนำ", note: "เมื่อพร้อมแล้ว คำแนะนำจะแสดงที่หน้านี้ ไม่ต้องชำระเงินออนไลน์ — ชำระที่เคาน์เตอร์ร้านยา",
    error: "ขั้นตอนนี้ใช้เวลานานกว่าปกติ คำตอบที่บันทึกไว้ยังอยู่ โปรดลองอีกครั้งเพื่อดำเนินการต่อ", retry: "ลองอีกครั้ง" },
  "zh-CN": { kicker: "您的药房方案", title: "正在寻找适合您的用量", body: "我们正在结合您的回答与这家药房的产品，为您制定营养补充方案。",
    estimate: "通常大约需要一分钟。", words: ["维生素D3", "镁", "Omega-3", "锌", "维生素C", "维生素B12"],
    steps: ["您的回答", "您的营养补充方案", "药房的产品"], saving: "正在保存问卷", working: "正在准备您的建议", note: "准备好后，您的建议会自动显示。无需在线付款，请在药房柜台付款。",
    error: "此步骤比预期更久。已保存的回答仍然保留，请重试以继续。", retry: "重试" }
};

// Decorative motion stays inside the existing illustration space. It never drives progress.
const waitingAnimationStyles = `
  .mn-pharmacy-waiting-art { position: relative; height: 6rem; max-width: 24rem; margin-inline: auto; pointer-events: none; }
  .mn-pharmacy-waiting-nong { position: relative; width: 6rem; height: 6rem; margin-inline: auto; }
  .mn-pharmacy-waiting-word { position: absolute; width: calc(50% - 3.75rem); color: var(--mn-teal-deep); font-size: .625rem; line-height: 1.4; }
  .mn-pharmacy-waiting-word:nth-of-type(odd) { left: 0; }
  .mn-pharmacy-waiting-word:nth-of-type(even) { right: 0; }
  @media (min-width: 640px) {
    .mn-pharmacy-waiting-art, .mn-pharmacy-waiting-nong { height: 9rem; }
    .mn-pharmacy-waiting-nong { width: 8rem; }
    .mn-pharmacy-waiting-word { width: calc(50% - 4.75rem); font-size: .75rem; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .mn-pharmacy-waiting-art[data-active="true"] .mn-pharmacy-waiting-nong { animation: mn-pharmacy-nong-drift 5s ease-in-out infinite; }
    .mn-pharmacy-waiting-word { animation: mn-pharmacy-word-drift 9s var(--delay) ease-in-out infinite; }
  }
  @media (prefers-reduced-motion: reduce) { .mn-pharmacy-waiting-word { display: none; } }
  @keyframes mn-pharmacy-nong-drift {
    0%, 100% { transform: translate(0, 0) rotate(-2deg); }
    50% { transform: translate(3px, -5px) rotate(2deg); }
  }
  @keyframes mn-pharmacy-word-drift {
    0%, 100% { opacity: 0; transform: translateY(10px) rotate(-4deg); }
    25%, 65% { opacity: .7; }
    90% { opacity: 0; transform: translateY(-12px) rotate(4deg); }
  }
`;

/** Honest stages, not a simulated percentage or the HealthScore waiting screen. */
export function PharmacyProgressView({ locale, stage = 0, failed = false, onRetry }: {
  locale: Locale; stage?: number; failed?: boolean; onRetry?: () => void;
}) {
  const c = copy[locale];
  const working = !failed && stage < 3;
  return <section data-testid="pharmacy-progress" className="mx-auto w-full max-w-3xl px-6 py-8 text-center sm:py-20" aria-busy={working}>
    <style>{waitingAnimationStyles}</style>
    <div data-testid="pharmacy-waiting-art" className="mn-pharmacy-waiting-art" data-active={working} aria-hidden="true">
      <div className="mn-pharmacy-waiting-nong">
        <SafeImage src="/assets/library/nong/nong-thinking.webp" alt="" width={128} height={150} className="mx-auto size-24 object-contain sm:h-36 sm:w-32" />
      </div>
      {working && c.words.map((word, index) => <span key={word} className="mn-pharmacy-waiting-word"
        style={{ top: `${Math.floor(index / 2) * 32 + 7}%`, "--delay": `${-index * 1.5}s` } as CSSProperties}>{word}</span>)}
    </div>
    <p className="mt-3 text-xs font-semibold sm:mt-5 uppercase tracking-[.18em] text-[var(--mn-teal-deep)]">{c.kicker}</p>
    <h1 className="mt-4 font-serif text-3xl leading-tight text-[var(--mn-ink)] sm:text-5xl">{c.title}</h1>
    <p className="mx-auto mt-3 max-w-xl text-sm leading-6 sm:mt-5 sm:text-base sm:leading-7 text-[var(--mn-ink-soft)]">{c.body}</p>
    {working && <p className="mt-2 text-sm text-[var(--mn-ink-soft)]">{c.estimate}</p>}
    <ol className="my-6 grid gap-2 sm:my-10 sm:gap-3 text-left sm:grid-cols-3 sm:text-center">
      {c.steps.map((label, index) => <li key={label} aria-current={index === stage ? "step" : undefined}
        className={`flex items-center gap-3 rounded-2xl border p-3 sm:flex-col sm:p-5 ${index <= stage ? "border-[var(--mn-teal)]/30 bg-[var(--mn-mint)]" : "border-[var(--mn-line)] bg-white/50"}`}>
        <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm ${index < stage ? "bg-[var(--mn-teal-deep)] text-white" : "border border-[var(--mn-line)] text-[var(--mn-ink-soft)]"}`}>
          {index < stage ? <Check aria-hidden="true" className="size-4" />
            : index === stage && index > 0 && !failed ? <LoaderCircle aria-hidden="true" className="size-5 motion-safe:animate-spin" />
            : index + 1}
        </span><span className="text-sm font-semibold">{label}</span>
      </li>)}
    </ol>
    <div role={failed ? "alert" : "status"} className="mx-auto max-w-lg text-sm leading-6 text-[var(--mn-ink-soft)]">
      {failed ? c.error : <><span className="mr-2 inline-block size-2 rounded-full bg-[var(--mn-teal)] motion-safe:animate-pulse" aria-hidden="true" />{stage === 0 ? c.saving : c.working}</>}
    </div>
    {failed && onRetry && <button type="button" data-testid="pharmacy-progress-retry" onClick={onRetry}
      className="mx-auto mt-5 inline-flex items-center gap-3 rounded-full bg-[var(--mn-teal-deep)] px-6 py-3 font-semibold text-white">{c.retry}<ArrowRight className="size-4" aria-hidden="true" /></button>}
    <p className="mx-auto mt-5 max-w-lg text-xs leading-6 sm:mt-8 sm:text-sm text-[var(--mn-ink-soft)]">{c.note}</p>
  </section>;
}

export function PharmacyProgress({ locale, sourceLocale, slug, planId, initial }: {
  locale: Locale; sourceLocale: Locale; slug: string; planId: string; initial: NutritionJourneySnapshot;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(initial);
  const [failed, setFailed] = useState(initial.failed);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const root = `/api/assessment/${encodeURIComponent(planId)}/journey`;
    async function observe() {
      if (attempt > 0) await fetchFunnelJson(root + "/retry", { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: sourceLocale }) });
      const outcome = await pollFunnelStatus<NutritionJourneySnapshot>({
        subscriptionKey: assessmentPollKey(planId, sourceLocale), signal: controller.signal,
        read: async signal => (await fetchFunnelJson<NutritionJourneySnapshot>(`${root}?locale=${sourceLocale}`, { signal })).data,
        onValue: value => setCurrent(value), ready: value => value.readyForReveal, failed: value => value.failed
      });
      if (controller.signal.aborted) return;
      if (outcome.status === "ready") router.replace(pharmacyPath(locale, slug, "reveal", { plan: planId }));
      else setFailed(true);
    }
    void observe().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt, locale, planId, router, slug, sourceLocale]);
  return <PharmacyProgressView locale={locale} stage={current.readyForReveal ? 3 : current.stages.formulation === "complete" ? 2 : 1} failed={failed}
    onRetry={() => { setFailed(false); setAttempt(n => n + 1); }} />;
}
