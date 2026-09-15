"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight, LoaderCircle } from "lucide-react";
import { SafeImage } from "@/components/safe-image";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { assessmentPollKey, fetchFunnelJson, pollFunnelStatus } from "@/lib/funnel-polling";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import type { Locale } from "@/lib/i18n";
import { positionPharmacyFlight } from "@/components/pharmacy/waiting-flight";

const copy = {
  en: { kicker: "Your pharmacy plan", title: "Finding your right amount.", body: "We’re bringing your answers and this pharmacy’s products together into a plan for you.",
    estimate: "This usually takes about a minute.", words: ["Vitamin D3", "Magnesium", "Omega-3", "Zinc", "Vitamin C", "Vitamin B12", "Calcium", "Iron", "Vitamin K2", "CoQ10", "Collagen", "Probiotics", "Creatine", "Selenium", "Biotin", "Vitamin E", "Vitamin B6", "Folate"],
    steps: ["Your answers", "Your supplement plan", "Products at this pharmacy"], saving: "Saving your questionnaire", working: "Preparing your recommendation", note: "Your recommendation will open here when it’s ready. No online payment — pay at the pharmacy counter.",
    error: "This is taking longer than expected. Your saved answers are safe. Try again to continue.", retry: "Try again" },
  th: { kicker: "แผนสำหรับคุณที่ร้านยา", title: "กำลังหาปริมาณที่พอดีสำหรับคุณ", body: "เรากำลังนำคำตอบของคุณมาจัดแผนอาหารเสริมจากผลิตภัณฑ์ของร้านยานี้",
    estimate: "โดยปกติใช้เวลาประมาณ 1 นาที", words: ["วิตามินดี 3", "แมกนีเซียม", "โอเมกา 3", "สังกะสี", "วิตามินซี", "วิตามินบี 12", "แคลเซียม", "ธาตุเหล็ก", "วิตามินเค 2", "โคคิวเท็น", "คอลลาเจน", "โพรไบโอติก", "ครีเอทีน", "ซีลีเนียม", "ไบโอติน", "วิตามินอี", "วิตามินบี 6", "โฟเลต"],
    steps: ["คำตอบของคุณ", "แผนอาหารเสริมของคุณ", "ผลิตภัณฑ์ที่ร้านยา"], saving: "กำลังบันทึกแบบสอบถาม", working: "กำลังจัดทำคำแนะนำ", note: "เมื่อพร้อมแล้ว คำแนะนำจะแสดงที่หน้านี้ ไม่ต้องชำระเงินออนไลน์ — ชำระที่เคาน์เตอร์ร้านยา",
    error: "ขั้นตอนนี้ใช้เวลานานกว่าปกติ คำตอบที่บันทึกไว้ยังอยู่ โปรดลองอีกครั้งเพื่อดำเนินการต่อ", retry: "ลองอีกครั้ง" },
  "zh-CN": { kicker: "您的药房方案", title: "正在寻找适合您的用量", body: "我们正在结合您的回答与这家药房的产品，为您制定营养补充方案。",
    estimate: "通常大约需要一分钟。", words: ["维生素D3", "镁", "Omega-3", "锌", "维生素C", "维生素B12", "钙", "铁", "维生素K2", "辅酶Q10", "胶原蛋白", "益生菌", "肌酸", "硒", "生物素", "维生素E", "维生素B6", "叶酸"],
    steps: ["您的回答", "您的营养补充方案", "药房的产品"], saving: "正在保存问卷", working: "正在准备您的建议", note: "准备好后，您的建议会自动显示。无需在线付款，请在药房柜台付款。",
    error: "此步骤比预期更久。已保存的回答仍然保留，请重试以继续。", retry: "重试" }
};

// A bounded, decorative rain and flight inspired by the supplied mockup.
// Only real readiness advances the steps; no timers, particle allocation or extra polling.
const waitingAnimationStyles = `
  .mn-pharmacy-progress { position: relative; isolation: isolate; }
  .mn-pharmacy-waiting-content { position: relative; z-index: 1; }
  .mn-pharmacy-waiting-content > :is(p, h1, [role="status"], [role="alert"]) { background: var(--mn-cream); }
  .mn-pharmacy-waiting-placeholder { height: 6rem; }
  .mn-pharmacy-waiting-art { position: absolute; inset: 0; overflow: hidden; pointer-events: none; --start-y: 2rem; }
  .mn-pharmacy-waiting-rain, .mn-pharmacy-waiting-flight { position: absolute; inset: 0; container-type: size; overflow: hidden; }
  .mn-pharmacy-waiting-rain { z-index: 0; }
  .mn-pharmacy-waiting-flight { z-index: 2; }
  .mn-pharmacy-waiting-nong { position: absolute; left: 0; top: 0; width: 6rem; height: 6rem; z-index: 1; transform: translate3d(calc(50cqw - 50%), var(--start-y), 0); }
  .mn-pharmacy-waiting-word { position: absolute; top: -3rem; left: clamp(0px, var(--x), calc(100% - 8rem)); padding: 4px 8px; border-radius: 999px; background: var(--mn-cream); color: var(--mn-teal-deep); font-size: .75rem; line-height: 1.4; white-space: nowrap; opacity: 0; }
  .mn-pharmacy-waiting-word:nth-of-type(3n) { color: var(--mn-gold); }
  .mn-pharmacy-waiting-word:nth-of-type(3n + 1) { color: var(--mn-ink-soft); }
  .mn-pharmacy-waiting-spark { position: absolute; color: var(--mn-gold); font-style: normal; opacity: 0; }
  .mn-pharmacy-waiting-spark:nth-of-type(1) { left: 5%; top: 30%; }
  .mn-pharmacy-waiting-spark:nth-of-type(2) { left: -8%; top: 55%; animation-delay: -.5s; }
  .mn-pharmacy-waiting-spark:nth-of-type(3) { left: -20%; top: 75%; animation-delay: -1s; }
  @media (min-width: 640px) {
    .mn-pharmacy-waiting-art { --start-y: 5rem; }
    .mn-pharmacy-waiting-placeholder { height: 9rem; }
    .mn-pharmacy-waiting-nong { width: 8rem; height: 9rem; }
    .mn-pharmacy-waiting-word { font-size: .875rem; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .mn-pharmacy-waiting-art[data-active="true"] .mn-pharmacy-waiting-nong { offset-path: var(--flight-path, none); offset-anchor: 50% 100%; offset-rotate: 0deg; animation: mn-pharmacy-nong-flight 18s ease-in-out infinite; filter: drop-shadow(0 0 8px var(--mn-gold-tint)); }
    .mn-pharmacy-waiting-word { animation: mn-pharmacy-word-rain var(--duration) var(--delay) linear infinite; }
    .mn-pharmacy-waiting-spark { animation-name: mn-pharmacy-spark; animation-duration: 1.5s; animation-timing-function: ease-out; animation-iteration-count: infinite; }
  }
  @media (prefers-reduced-motion: reduce) { .mn-pharmacy-waiting-word, .mn-pharmacy-waiting-spark { display: none; } }
  @keyframes mn-pharmacy-nong-flight {
    0% { offset-distance: 0%; opacity: 0; transform: rotate(-12deg); }
    5% { opacity: 1; }
    25%, 38% { offset-distance: var(--first-stop, 30%); opacity: 1; transform: rotate(0deg); }
    60%, 72% { offset-distance: var(--second-stop, 65%); opacity: 1; transform: rotate(0deg); }
    90%, 100% { offset-distance: 100%; opacity: 0; transform: rotate(12deg); }
  }
  @keyframes mn-pharmacy-word-rain {
    0% { opacity: 0; transform: translate3d(0, 0, 0) rotate(-5deg); }
    12% { opacity: .75; }
    82% { opacity: .6; }
    100% { opacity: 0; transform: translate3d(var(--drift), calc(100cqh + 6rem), 0) rotate(7deg); }
  }
  @keyframes mn-pharmacy-spark {
    0%, 100% { opacity: 0; transform: scale(.4); }
    35% { opacity: .8; transform: scale(1); }
    80% { opacity: 0; transform: translate(-8px, 10px) scale(.4); }
  }
`;

/** Honest stages, not a simulated percentage or the HealthScore waiting screen. */
export function PharmacyProgressView({ locale, stage = 0, failed = false, onRetry }: {
  locale: Locale; stage?: number; failed?: boolean; onRetry?: () => void;
}) {
  const c = copy[locale];
  const working = !failed && stage < 3;
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !working) return;
    const position = () => positionPharmacyFlight(section);
    position();
    const observer = new ResizeObserver(position);
    observer.observe(section);
    return () => observer.disconnect();
  }, [working, locale]);
  return <section ref={sectionRef} data-testid="pharmacy-progress" className="mn-pharmacy-progress w-full text-center" aria-busy={working}>
    <style>{waitingAnimationStyles}</style>
    <div data-testid="pharmacy-waiting-art" className="mn-pharmacy-waiting-art" data-active={working} aria-hidden="true">
      <div className="mn-pharmacy-waiting-flight">
      <div className="mn-pharmacy-waiting-nong">
        <SafeImage src="/assets/library/nong/nong-thinking.webp" alt="" width={128} height={150} className="mx-auto size-24 object-contain sm:h-36 sm:w-32" />
        {working && [0, 1, 2].map(index => <i key={index} className="mn-pharmacy-waiting-spark">✦</i>)}
      </div>
      </div>
      <div className="mn-pharmacy-waiting-rain">
      {working && [...c.words, ...c.words].map((word, index) => <span key={index} className="mn-pharmacy-waiting-word"
        style={{ "--x": `${3 + (index * 29) % 90}%`, "--delay": `${-(index * 2.37) % 10}s`,
          "--duration": `${8 + (index % 6) * .6}s`, "--drift": `${(index % 2 ? 1 : -1) * (8 + index % 4 * 4)}px` } as CSSProperties}>{word}</span>)}
      </div>
    </div>
    <div className="mn-pharmacy-waiting-content mx-auto w-full max-w-3xl px-6 py-8 sm:py-20">
    <div className="mn-pharmacy-waiting-placeholder" aria-hidden="true" />
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
    </div>
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
