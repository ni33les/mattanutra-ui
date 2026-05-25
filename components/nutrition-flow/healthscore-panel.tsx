"use client";

import {
  AdjustmentsHorizontalIcon,
  ArrowRightIcon,
  BeakerIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type {
  HealthScoreGapCard,
  HealthScoreMethodCard,
  HealthScorePageAiCard,
  HealthScoreResult,
  LocalizedHealthScoreText
} from "@/lib/health-score";
import { resolveLocalizedText, type Locale } from "@/lib/i18n";
import { paymentCheckoutPath } from "@/lib/payment-paths";
import { cx } from "@/components/nutrition-flow/ui";

const pageCopy = {
  en: {
    bodyClass: "leading-7",
    progress: [
      ["Discover", "Assessment complete"],
      ["Score", "Your HealthScore is ready"],
      ["Reveal", "Unlock your plan"]
    ],
    heroEyebrow: "Your free assessment result",
    heroTitle(score: number) {
      return `Your HealthScore is ${score}.`;
    },
    heroCta: "Unlock my Right Amount Plan",
    heroSecondary: "See what shaped it",
    scoreLabel: "HealthScore",
    scoreOutOf: "/100",
    percentile: "Percentile",
    median: "Reference median",
    spectrumStart: "Needs attention",
    spectrumMid: "Median",
    spectrumEnd: "Excellent",
    defaultBandLine:
      "Your score is built from five weighted pillars, safety flags, symptoms, goals, and any verified lab or wearable data you supplied.",
    gapEyebrow: "Assessment revealed",
    gapTitle: "Three things a generic vitamin quiz would have walked straight past.",
    gapBody:
      "These are the specific signals in your answers that shape your formula, laid out in full, nothing held back.",
    fallbackGaps: [
      {
        body: "Your lowest pillar shows where the first practical change should start.",
        headline: "The clearest gap is not hidden",
        tag: "Signal",
        value: "01"
      },
      {
        body: "Your goals change which nutrients or products earn space in the plan.",
        headline: "Your goals change the order",
        tag: "Signal",
        value: "02"
      },
      {
        body: "Medication, diet pattern, country, and routine context stay visible before anything is suggested.",
        headline: "Safety context stays in the room",
        tag: "Signal",
        value: "03"
      }
    ],
    pillarsEyebrow: "Five-pillar model",
    pillarsTitle: "A fixed scoring model across five domains, not a guess.",
    whatCaught: "What we caught",
    fallbackFindingTitle: "Your HealthScore has a clear starting point",
    fallbackFindingBody:
      "The lowest pillar and safety context decide what the plan should prioritise first.",
    subtractionEyebrow: "The subtraction beat",
    subtractionTitle: "Your right amount is what remains after the unsuitable options are removed.",
    evaluatedFallback: "evaluated",
    setAsideFallback: "set aside",
    chosenFallback: "right for your score",
    methodEyebrow: "Method",
    methodTitle:
      "A fixed scoring model across five domains, not a guess and not an average of strangers.",
    fallbackMethodCards: [
      {
        body: "The score is computed before AI writes a single line of copy.",
        title: "Score first"
      },
      {
        body: "Only the strongest assessment signals are shown on the page.",
        title: "Signals selected by code"
      },
      {
        body: "AI can phrase the page, but it cannot change your score, flags, counts, or findings.",
        title: "Copy locked to facts"
      }
    ],
    trustLine:
      "Locked facts render immediately. If AI copy is unavailable, deterministic fallback copy keeps the page usable.",
    pricingEyebrow: "Choose your level of guidance",
    pricingTitle: "Unlock the plan that matches your next step.",
    pricingBody:
      "Start with a one-time Right Amount Formula, or choose 90-Day Wellness Concierge if you want ongoing support as your routine changes.",
    preparing: "Preparing...",
    selectionError: "We could not start your plan. Please try again.",
    plans: [
      {
        badge: "Limited time offer",
        cta: "Unlock my formula",
        description:
          "Your personalised supplement formula with precise dosing, timing, safety checks, and product direction.",
        eyebrow: "One-time plan",
        features: [
          "Personalised supplement formula",
          "Body-size adjusted dose ranges",
          "Timing and usage instructions",
          "Medication and lab fit checks",
          "Recommended product sources and alternatives",
          "60-day reassessment prompt"
        ],
        fine: "One-time payment · Lifetime access to this plan",
        guarantee: "Clarity Guarantee",
        guaranteeBody:
          "If your plan does not feel clear and useful, we will make it right or refund you within 7 days.",
        name: "Right Amount Formula",
        price: "690",
        save: "Save 30%",
        term: "one-time",
        was: "THB 990"
      },
      {
        badge: "Most adaptive",
        cta: "Start wellness concierge",
        description:
          "Ongoing support that adapts your formula, foods, and daily routine over 90 days.",
        eyebrow: "90-day support",
        features: [
          "Includes the Right Amount Formula",
          "Daily guidance on foods and routines",
          "Sleep, energy and habits support",
          "Supplement timing and adherence help",
          "Weekly progress summaries",
          "Priority review as your data changes"
        ],
        fine: "Full access for 90 days · Cancel anytime",
        guarantee: "7-Day Satisfaction Guarantee",
        guaranteeBody:
          "Try the concierge support risk-free. Cancel within 7 days for a full refund.",
        name: "90-Day Wellness Concierge",
        price: "1,590",
        save: "Save 16%",
        term: "for 90 days",
        was: "THB 1,890"
      }
    ]
  },
  th: {
    bodyClass: "leading-8 [word-break:keep-all]",
    progress: [
      ["ค้นพบ", "แบบประเมินเสร็จแล้ว"],
      ["ให้คะแนน", "คะแนนสุขภาพพร้อมแล้ว"],
      ["เปิดแผน", "ปลดล็อกแผนของคุณ"]
    ],
    heroEyebrow: "ผลประเมินฟรีของคุณ",
    heroTitle(score: number) {
      return `คะแนนสุขภาพของคุณคือ ${score}`;
    },
    heroCta: "ปลดล็อกแผนปริมาณที่พอดี",
    heroSecondary: "ดูสิ่งที่ใช้คำนวณ",
    scoreLabel: "คะแนนสุขภาพ",
    scoreOutOf: "/100",
    percentile: "เปอร์เซ็นไทล์",
    median: "ค่ากลางอ้างอิง",
    spectrumStart: "ควรใส่ใจ",
    spectrumMid: "ค่ากลาง",
    spectrumEnd: "ดีเยี่ยม",
    defaultBandLine:
      "คะแนนนี้คำนวณจากเสาหลักห้าด้าน ธงความเหมาะสม อาการ เป้าหมาย และข้อมูลแล็บหรืออุปกรณ์ที่คุณให้มา",
    gapEyebrow: "สิ่งที่แบบประเมินพบ",
    gapTitle: "สามเรื่องที่แบบทดสอบวิตามินทั่วไปมักมองข้าม",
    gapBody:
      "นี่คือสัญญาณเฉพาะจากคำตอบของคุณที่มีผลต่อสูตร โดยแสดงอย่างชัดเจน",
    fallbackGaps: [
      {
        body: "เสาหลักที่ต่ำที่สุดบอกว่าควรเริ่มปรับจากจุดไหนก่อน",
        headline: "ช่องว่างที่ชัดที่สุดไม่ได้ถูกซ่อนไว้",
        tag: "สัญญาณ",
        value: "01"
      },
      {
        body: "เป้าหมายของคุณเปลี่ยนลำดับของสารอาหารหรือผลิตภัณฑ์ที่ควรอยู่ในแผน",
        headline: "เป้าหมายของคุณเปลี่ยนลำดับ",
        tag: "สัญญาณ",
        value: "02"
      },
      {
        body: "บริบทยา รูปแบบอาหาร ประเทศ และกิจวัตรยังถูกนำมาพิจารณาก่อนแนะนำสิ่งใด",
        headline: "บริบทความเหมาะสมยังอยู่ในภาพ",
        tag: "สัญญาณ",
        value: "03"
      }
    ],
    pillarsEyebrow: "โมเดลห้าเสาหลัก",
    pillarsTitle: "โมเดลคะแนนคงที่ห้าด้าน ไม่ใช่การเดา",
    whatCaught: "สิ่งที่เราจับได้",
    fallbackFindingTitle: "คะแนนสุขภาพของคุณมีจุดเริ่มต้นที่ชัดเจน",
    fallbackFindingBody:
      "เสาหลักที่ต่ำที่สุดและบริบทความเหมาะสมเป็นตัวกำหนดว่าแผนควรเริ่มจากอะไร",
    subtractionEyebrow: "จังหวะการคัดออก",
    subtractionTitle: "ปริมาณที่พอดีคือสิ่งที่เหลือหลังตัดตัวเลือกที่ไม่เหมาะออก",
    evaluatedFallback: "ประเมิน",
    setAsideFallback: "ตัดออก",
    chosenFallback: "เหมาะกับคะแนนของคุณ",
    methodEyebrow: "วิธีคำนวณ",
    methodTitle:
      "โมเดลคะแนนคงที่ห้าด้าน ไม่ใช่การเดา และไม่ใช่ค่าเฉลี่ยของคนอื่น",
    fallbackMethodCards: [
      {
        body: "คะแนนถูกคำนวณก่อนที่ AI จะเขียนข้อความบนหน้า",
        title: "คำนวณคะแนนก่อน"
      },
      {
        body: "หน้าจะแสดงเฉพาะสัญญาณจากแบบประเมินที่สำคัญที่สุด",
        title: "เลือกสัญญาณด้วยโค้ด"
      },
      {
        body: "AI เขียนภาษาได้ แต่เปลี่ยนคะแนน ธง จำนวน หรือสิ่งที่พบไม่ได้",
        title: "ข้อความถูกล็อกกับข้อเท็จจริง"
      }
    ],
    trustLine:
      "ข้อเท็จจริงที่ล็อกไว้จะแสดงทันที หาก AI ยังไม่พร้อม ระบบจะใช้ข้อความสำรองที่กำหนดไว้",
    pricingEyebrow: "เลือกระดับคำแนะนำ",
    pricingTitle: "ปลดล็อกแผนที่เหมาะกับขั้นต่อไปของคุณ",
    pricingBody:
      "เริ่มด้วยสูตรปริมาณที่พอดีแบบครั้งเดียว หรือเลือกผู้ช่วยดูแลสุขภาพ 90 วัน หากต้องการการสนับสนุนต่อเนื่อง",
    preparing: "กำลังเตรียม...",
    selectionError: "ไม่สามารถเริ่มแผนได้ กรุณาลองอีกครั้ง",
    plans: [
      {
        badge: "ข้อเสนอพิเศษ",
        cta: "ปลดล็อกสูตรของฉัน",
        description:
          "สูตรอาหารเสริมส่วนตัว พร้อมปริมาณ เวลาใช้ การตรวจสอบความเหมาะสม และทิศทางผลิตภัณฑ์",
        eyebrow: "แผนครั้งเดียว",
        features: [
          "สูตรอาหารเสริมส่วนตัว",
          "ช่วงปริมาณที่ปรับตามร่างกาย",
          "คำแนะนำเวลาและวิธีใช้",
          "ตรวจสอบความเหมาะสมกับยาและแล็บ",
          "แหล่งผลิตภัณฑ์และทางเลือก",
          "แจ้งเตือนประเมินซ้ำใน 60 วัน"
        ],
        fine: "ชำระครั้งเดียว · เข้าถึงแผนนี้ได้ตลอด",
        guarantee: "รับประกันความชัดเจน",
        guaranteeBody:
          "หากแผนไม่ชัดเจนหรือไม่มีประโยชน์ เราจะปรับให้หรือคืนเงินภายใน 7 วัน",
        name: "สูตรปริมาณที่พอดี",
        price: "690",
        save: "ประหยัด 30%",
        term: "ครั้งเดียว",
        was: "THB 990"
      },
      {
        badge: "ปรับตัวได้ดีที่สุด",
        cta: "เริ่มผู้ช่วยดูแลสุขภาพ",
        description:
          "การสนับสนุนต่อเนื่องที่ปรับสูตร อาหาร และกิจวัตรประจำวันตลอด 90 วัน",
        eyebrow: "ดูแล 90 วัน",
        features: [
          "รวมสูตรปริมาณที่พอดี",
          "คำแนะนำอาหารและกิจวัตรรายวัน",
          "สนับสนุนการนอน พลังงาน และนิสัย",
          "ช่วยเรื่องเวลาใช้และความสม่ำเสมอ",
          "สรุปความคืบหน้ารายสัปดาห์",
          "ทบทวนเมื่อข้อมูลเปลี่ยน"
        ],
        fine: "เข้าถึงเต็มรูปแบบ 90 วัน · ยกเลิกได้",
        guarantee: "รับประกัน 7 วัน",
        guaranteeBody:
          "ลองใช้แบบไม่มีความเสี่ยง ยกเลิกภายใน 7 วันเพื่อรับเงินคืนเต็มจำนวน",
        name: "ผู้ช่วยดูแลสุขภาพ 90 วัน",
        price: "1,590",
        save: "ประหยัด 16%",
        term: "90 วัน",
        was: "THB 1,890"
      }
    ]
  }
} as const;

type PricePlan = (typeof pageCopy.en.plans)[number] | (typeof pageCopy.th.plans)[number];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function scorePosition(score: number) {
  return clamp(((score - 30) / 62) * 100);
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);

    query.addEventListener("change", listener);

    return () => query.removeEventListener("change", listener);
  }, []);

  return reduced;
}

function CountUpNumber({
  className,
  value
}: Readonly<{
  className?: string;
  value: number;
}>) {
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }

    let frame = 0;
    const startedAt = performance.now();
    const duration = 900;

    function tick(now: number) {
      const progress = clamp((now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplay(Math.round(value * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, value]);

  return <span className={className}>{reducedMotion ? value : display}</span>;
}

function localize(
  value: LocalizedHealthScoreText | undefined,
  locale: Locale,
  fallback = ""
) {
  return resolveLocalizedText(value, locale) || fallback;
}

export function localizeHealthScoreText(
  value: LocalizedHealthScoreText | undefined,
  locale: Locale
) {
  return localize(value, locale);
}

function aiCardHeadline(
  card: HealthScorePageAiCard | undefined,
  locale: Locale,
  fallback: string
) {
  return localize(card?.headline ?? card?.title, locale, fallback);
}

function aiCardBody(
  card: HealthScorePageAiCard | undefined,
  locale: Locale,
  fallback: string
) {
  return localize(card?.body, locale, fallback);
}

function lowestDomain(result: HealthScoreResult) {
  return [...result.domains].sort((left, right) => left.score - right.score)[0];
}

function normalizedPillars(result: HealthScoreResult) {
  return (
    result.pageContent?.locked.pillars ??
    result.domains.map((domain) => ({
      goalLinked: false,
      id: domain.id,
      label: domain.label,
      tag: null,
      value: domain.score
    }))
  );
}

function fallbackGapCards(
  result: HealthScoreResult,
  locale: Locale
): HealthScoreGapCard[] {
  const lowest = lowestDomain(result);
  const cards: HealthScoreGapCard[] = pageCopy[locale].fallbackGaps.map((card) => ({
    ...card
  }));

  if (lowest) {
    cards[0] = {
      body: lowest.description || cards[0].body,
      headline: lowest.label,
      tag: cards[0].tag,
      value: `${lowest.score}`
    };
  }

  return cards;
}

function gapCards(result: HealthScoreResult, locale: Locale) {
  const seeds = result.pageContent?.copySeeds.gapTrio ?? fallbackGapCards(result, locale);

  return seeds.slice(0, 3);
}

function methodCards(
  result: HealthScoreResult,
  locale: Locale
): HealthScoreMethodCard[] {
  return (
    result.pageContent?.copySeeds.methodCards ??
    pageCopy[locale].fallbackMethodCards
  ).slice(0, 3);
}

function findings(result: HealthScoreResult, locale: Locale) {
  const seedFindings = result.pageContent?.copySeeds.findings;

  if (seedFindings && seedFindings.length > 0) {
    return seedFindings.slice(0, 3);
  }

  const lowest = lowestDomain(result);

  return [
    {
      body: lowest?.description ?? pageCopy[locale].fallbackFindingBody,
      code: lowest?.id ?? "LOWEST_PILLAR",
      headline: lowest?.label ?? pageCopy[locale].fallbackFindingTitle,
      icon: "spark"
    }
  ];
}

function HealthScoreProgress({
  locale
}: Readonly<{
  locale: Locale;
}>) {
  const copy = pageCopy[locale];

  return (
    <div
      aria-label="HealthScore assessment progress"
      className="grid overflow-hidden rounded-lg bg-white ring-1 ring-[var(--mn-line)] md:grid-cols-3"
    >
      {copy.progress.map(([title, body], index) => {
        const complete = index === 0;
        const active = index === 1;

        return (
          <div
            className={cx(
              "flex items-center gap-3 p-4 md:p-5",
              complete
                ? "bg-[var(--mn-teal)] text-white"
                : active
                  ? "bg-[var(--mn-ink)] text-white"
                  : "bg-white text-[var(--mn-ink)]"
            )}
            key={title}
          >
            <span
              className={cx(
                "grid size-9 shrink-0 place-items-center rounded-full border text-xs font-bold",
                complete || active
                  ? "border-white bg-white text-[var(--mn-teal-deep)]"
                  : "border-[var(--mn-line)] bg-[var(--mn-paper)] text-[var(--mn-ash)]"
              )}
            >
              {complete ? "OK" : `0${index + 1}`}
            </span>
            <span className="min-w-0">
              <strong className="block text-sm">{title}</strong>
              <span
                className={cx(
                  "block text-xs",
                  complete || active ? "text-white/75" : "text-[var(--mn-ash)]"
                )}
              >
                {body}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ScoreSpectrum({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const copy = pageCopy[locale];
  const score = result.pageContent?.locked.score ?? result.score;
  const median = result.pageContent?.locked.median ?? 64;
  const marker = scorePosition(score);
  const medianMarker = scorePosition(median);

  return (
    <div className="mt-8">
      <div className="relative h-4 rounded-full bg-[linear-gradient(90deg,#E46A4E_0%,#E7B85D_36%,#5FAE9F_72%,#1B6F68_100%)] shadow-inner">
        <span
          aria-hidden={true}
          className="absolute top-1/2 h-8 w-px -translate-y-1/2 bg-white/70"
          style={{ left: `${medianMarker}%` }}
        />
        <span
          aria-label={`${copy.scoreLabel} ${score}`}
          className="absolute top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[0.65rem] font-bold text-[var(--mn-teal-deep)] shadow-[0_8px_28px_rgba(18,82,76,0.22)] ring-4 ring-white/55 motion-safe:transition-[left] motion-safe:duration-700"
          style={{ left: `${marker}%` }}
        >
          {score}
        </span>
      </div>
      <div className="mt-3 flex justify-between gap-3 text-[0.7rem] font-semibold uppercase tracking-normal text-[var(--mn-ash)]">
        <span>{copy.spectrumStart}</span>
        <span>{copy.spectrumMid} {median}</span>
        <span>{copy.spectrumEnd}</span>
      </div>
    </div>
  );
}

function HealthScoreHero({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const copy = pageCopy[locale];
  const page = result.pageContent;
  const score = page?.locked.score ?? result.score;
  const ai = page?.aiCopy;
  const heroTitle = localize(ai?.heroTitle, locale, copy.heroTitle(score));
  const heroBody = localize(ai?.heroBody, locale, page?.copySeeds.heroBody ?? result.summary);
  const bandLine = localize(
    ai?.bandLine,
    locale,
    page?.copySeeds.bandLine ?? copy.defaultBandLine
  );
  const percentile = page?.locked.percentile ?? null;

  return (
    <header className="space-y-8">
      <HealthScoreProgress locale={locale} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.78fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-normal text-[var(--mn-teal-deep)]">
            {copy.heroEyebrow}
          </p>
          <h1
            className={cx(
              "mt-5 max-w-5xl font-serif text-5xl font-medium leading-[1.04] tracking-normal text-[var(--mn-ink)] sm:text-6xl lg:text-7xl",
              locale === "en" ? "text-balance" : "break-words"
            )}
          >
            {heroTitle}
          </h1>
          <p
            className={cx(
              "mt-6 max-w-3xl text-lg text-[var(--mn-ink-soft)]",
              copy.bodyClass
            )}
          >
            {heroBody}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link className="mn-primary-button" href="#pricing">
              {copy.heroCta}
              <ArrowRightIcon aria-hidden={true} className="size-4" />
            </Link>
            <Link className="mn-secondary-button" href="#signals">
              {copy.heroSecondary}
            </Link>
          </div>
        </div>

        <aside className="rounded-lg bg-white p-6 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)] sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-normal text-[var(--mn-ash)]">
                {copy.scoreLabel}
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--mn-teal-deep)]">
                {result.band}
              </p>
            </div>
            {percentile !== null ? (
              <span className="rounded-full bg-[var(--mn-mint)] px-3 py-1 text-xs font-bold text-[var(--mn-teal-deep)]">
                {copy.percentile}: {percentile}
              </span>
            ) : null}
          </div>

          <div className="mt-8 flex items-end justify-center gap-3">
            <CountUpNumber
              className="font-serif text-8xl font-medium leading-none tracking-normal text-[var(--mn-ink)]"
              value={score}
            />
            <span className="pb-3 text-lg font-semibold text-[var(--mn-ash)]">
              {copy.scoreOutOf}
            </span>
          </div>

          <ScoreSpectrum locale={locale} result={result} />

          <p
            className={cx(
              "mt-6 rounded-lg bg-[var(--mn-gold-tint)] p-4 text-sm text-[#6d5427]",
              copy.bodyClass
            )}
          >
            {bandLine}
          </p>
        </aside>
      </div>
    </header>
  );
}

function GapCards({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const copy = pageCopy[locale];
  const page = result.pageContent;
  const ai = page?.aiCopy;
  const title = localize(ai?.paywallTitle, locale, copy.gapTitle);
  const body = localize(ai?.paywallSubtitle, locale, copy.gapBody);
  const cards = gapCards(result, locale);

  return (
    <section className="pt-2" id="signals">
      <div className="grid gap-5 lg:grid-cols-[0.84fr_1.16fr] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-normal text-[var(--mn-teal-deep)]">
            {copy.gapEyebrow}
          </p>
          <h2 className="mt-3 font-serif text-4xl font-medium leading-tight tracking-normal text-[var(--mn-ink)]">
            {title}
          </h2>
        </div>
        <p className={cx("text-lg text-[var(--mn-ink-soft)]", copy.bodyClass)}>
          {body}
        </p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {cards.map((card, index) => {
          const aiCard = ai?.gapTrio?.[index];

          return (
            <article
              className="rounded-lg bg-white p-6 ring-1 ring-[var(--mn-line)] motion-safe:transition motion-safe:duration-300 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[var(--mn-shadow-card)]"
              key={`${card.tag}-${card.value}-${index}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-normal text-[var(--mn-teal-deep)]">
                  {card.tag}
                </span>
                <span className="font-serif text-4xl font-medium leading-none text-[var(--mn-gold)]">
                  {card.value}
                </span>
              </div>
              <h3 className="mt-5 text-xl font-semibold leading-snug text-[var(--mn-ink)]">
                {aiCardHeadline(aiCard, locale, card.headline)}
              </h3>
              <p className={cx("mt-3 text-sm text-[var(--mn-ink-soft)]", copy.bodyClass)}>
                {aiCardBody(aiCard, locale, card.body)}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PillarBars({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const copy = pageCopy[locale];
  const [mounted, setMounted] = useState(false);
  const pillars = normalizedPillars(result);
  const page = result.pageContent;
  const relativity = page?.copySeeds.relativity;
  const ai = page?.aiCopy;
  const headline = localize(
    ai?.relativityHeadline,
    locale,
    relativity?.headline ?? copy.pillarsTitle
  );
  const sub = localize(ai?.relativitySub, locale, relativity?.sub ?? result.summary);
  const highestLeverage = page?.copySeeds.highestLeverage;
  const strengthNote = page?.copySeeds.strengthNote;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section className="rounded-lg bg-[var(--mn-paper)] p-5 ring-1 ring-[var(--mn-line)] sm:p-7">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-normal text-[var(--mn-teal-deep)]">
            {copy.pillarsEyebrow}
          </p>
          <h2 className="mt-3 font-serif text-4xl font-medium leading-tight tracking-normal text-[var(--mn-ink)]">
            {headline}
          </h2>
          <p className={cx("mt-4 text-base text-[var(--mn-ink-soft)]", copy.bodyClass)}>
            {sub}
          </p>
          {highestLeverage ? (
            <div className="mt-6 rounded-lg bg-white p-5 ring-1 ring-[var(--mn-line)]">
              <p className="text-xs font-bold uppercase tracking-normal text-[var(--mn-gold)]">
                {highestLeverage.pillar}
              </p>
              <p className={cx("mt-2 text-sm text-[var(--mn-ink-soft)]", copy.bodyClass)}>
                {highestLeverage.text}
              </p>
            </div>
          ) : null}
          {strengthNote ? (
            <p className={cx("mt-4 text-sm text-[var(--mn-ink-soft)]", copy.bodyClass)}>
              {strengthNote}
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          {pillars.map((pillar) => (
            <div className="rounded-lg bg-white p-4 ring-1 ring-[var(--mn-line)]" key={pillar.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-semibold leading-snug text-[var(--mn-ink)]">
                    {pillar.label}
                  </h3>
                  {pillar.tag ? (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-[var(--mn-teal-deep)]">
                      {pillar.tag}
                    </p>
                  ) : null}
                </div>
                <span className="font-serif text-3xl font-medium leading-none text-[var(--mn-ink)]">
                  {pillar.value}
                </span>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--mn-cream-deep)]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--mn-gold)_0%,var(--mn-teal)_100%)] motion-safe:transition-[width] motion-safe:duration-700 motion-reduce:transition-none"
                  style={{ width: mounted ? `${clamp(pillar.value)}%` : 0 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FindingIcon({
  index
}: Readonly<{
  index: number;
}>) {
  const className = "size-5";

  if (index === 1) {
    return <ShieldCheckIcon aria-hidden={true} className={className} />;
  }

  if (index === 2) {
    return <ClipboardDocumentCheckIcon aria-hidden={true} className={className} />;
  }

  return <SparklesIcon aria-hidden={true} className={className} />;
}

function FindingsSection({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const copy = pageCopy[locale];
  const page = result.pageContent;
  const ai = page?.aiCopy;
  const items = findings(result, locale);

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-normal text-[var(--mn-teal-deep)]">
            {page?.copySeeds.findingsMode === "strengths" ? copy.pillarsEyebrow : copy.whatCaught}
          </p>
          <h2 className="mt-3 font-serif text-4xl font-medium leading-tight tracking-normal text-[var(--mn-ink)]">
            {copy.whatCaught}
          </h2>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {items.map((item, index) => {
          const aiCard = ai?.findings?.[index];

          return (
            <article
              className="rounded-lg bg-white p-6 ring-1 ring-[var(--mn-line)]"
              key={`${item.code}-${index}`}
            >
              <div className="grid size-11 place-items-center rounded-lg bg-[var(--mn-mint)] text-[var(--mn-teal-deep)]">
                <FindingIcon index={index} />
              </div>
              <h3 className="mt-5 text-xl font-semibold leading-snug text-[var(--mn-ink)]">
                {aiCardHeadline(aiCard, locale, item.headline)}
              </h3>
              <p className={cx("mt-3 text-sm text-[var(--mn-ink-soft)]", copy.bodyClass)}>
                {aiCardBody(aiCard, locale, item.body)}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SubtractionBeat({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const copy = pageCopy[locale];
  const page = result.pageContent;
  const ai = page?.aiCopy;
  const subtraction = page?.locked.subtraction ?? {
    chosen: 8,
    evaluated: 120,
    mode: "nutrients" as const,
    setAside: 112
  };
  const seed = page?.copySeeds.subtraction;
  const body = localize(ai?.subtractionBody, locale, seed?.body ?? copy.subtractionTitle);
  const labels = [
    seed?.labelEvaluated ?? copy.evaluatedFallback,
    seed?.labelSetAside ?? copy.setAsideFallback,
    seed?.labelChosen ?? copy.chosenFallback
  ];
  const numbers = [subtraction.evaluated, subtraction.setAside, subtraction.chosen];

  return (
    <section className="rounded-lg bg-[var(--mn-ink)] p-6 text-white sm:p-8">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-bold uppercase tracking-normal text-[var(--mn-gold-soft)]">
          {copy.subtractionEyebrow}
        </p>
        <h2 className="mt-3 font-serif text-4xl font-medium leading-tight tracking-normal">
          {copy.subtractionTitle}
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
          {numbers.map((number, index) => (
            <div className="contents" key={`${labels[index]}-${number}`}>
              <div className="rounded-lg bg-white/8 p-5 ring-1 ring-white/12">
                <CountUpNumber
                  className="font-serif text-6xl font-medium leading-none tracking-normal text-white"
                  value={number}
                />
                <p className="mt-2 text-sm font-semibold uppercase tracking-normal text-white/65">
                  {labels[index]}
                </p>
              </div>
              {index < 2 ? (
                <ArrowRightIcon
                  aria-hidden={true}
                  className="mx-auto hidden size-6 text-[var(--mn-gold-soft)] md:block"
                />
              ) : null}
            </div>
          ))}
        </div>
        <p className={cx("mx-auto mt-8 max-w-3xl text-base text-white/75", copy.bodyClass)}>
          {body}
        </p>
      </div>
    </section>
  );
}

function MethodCards({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const copy = pageCopy[locale];
  const page = result.pageContent;
  const ai = page?.aiCopy;
  const headline = localize(
    ai?.methodHeadline,
    locale,
    page?.copySeeds.methodHeadline ?? copy.methodTitle
  );
  const cards = methodCards(result, locale);
  const icons = [BeakerIcon, AdjustmentsHorizontalIcon, LockClosedIcon];

  return (
    <section className="rounded-lg bg-[var(--mn-sand-soft)] px-5 py-10 ring-1 ring-[var(--mn-sand-deep)] sm:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-bold uppercase tracking-normal text-[var(--mn-teal-deep)]">
          {copy.methodEyebrow}
        </p>
        <h2 className="mt-3 font-serif text-4xl font-medium leading-tight tracking-normal text-[var(--mn-ink)]">
          {headline}
        </h2>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {cards.map((card, index) => {
          const Icon = icons[index] ?? BeakerIcon;
          const aiCard = ai?.methodCards?.[index];

          return (
            <article
              className={cx(
                "rounded-lg p-6 ring-1",
                index === 0
                  ? "bg-[var(--mn-ink)] text-white ring-white/10"
                  : "bg-white text-[var(--mn-ink)] ring-[var(--mn-line)]"
              )}
              key={`${card.title}-${index}`}
            >
              <div
                className={cx(
                  "grid size-11 place-items-center rounded-lg",
                  index === 0
                    ? "bg-white/10 text-[var(--mn-gold-soft)]"
                    : "bg-[var(--mn-mint)] text-[var(--mn-teal-deep)]"
                )}
              >
                <Icon aria-hidden={true} className="size-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold leading-snug">
                {aiCardHeadline(aiCard, locale, card.title)}
              </h3>
              <p
                className={cx(
                  "mt-3 text-sm",
                  copy.bodyClass,
                  index === 0 ? "text-white/75" : "text-[var(--mn-ink-soft)]"
                )}
              >
                {aiCardBody(aiCard, locale, card.body)}
              </p>
            </article>
          );
        })}
      </div>
      <p className={cx("mx-auto mt-6 max-w-3xl text-center text-sm text-[var(--mn-ink-soft)]", copy.bodyClass)}>
        {copy.trustLine}
      </p>
    </section>
  );
}

function PriceCard({
  disabled = false,
  featured = false,
  isPending = false,
  onSelect,
  pendingLabel,
  plan
}: Readonly<{
  disabled?: boolean;
  featured?: boolean;
  isPending?: boolean;
  onSelect: () => void;
  pendingLabel: string;
  plan: PricePlan;
}>) {
  return (
    <article
      className={cx(
        "relative flex flex-col rounded-lg p-6 ring-1 sm:p-8",
        featured
          ? "bg-[var(--mn-ink)] text-white ring-[color-mix(in_srgb,var(--mn-teal-light)_60%,transparent)]"
          : "bg-white text-[var(--mn-ink)] ring-[var(--mn-line)]"
      )}
    >
      <span
        className={cx(
          "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full px-4 py-2 text-center text-[0.65rem] font-bold uppercase tracking-normal",
          featured
            ? "bg-[var(--mn-gold)] text-white"
            : "bg-[var(--mn-gold-tint)] text-[var(--mn-gold)]"
        )}
      >
        {plan.badge}
      </span>
      <p
        className={cx(
          "mt-4 text-xs font-bold uppercase tracking-normal",
          featured ? "text-[var(--mn-teal-light)]" : "text-[var(--mn-teal-deep)]"
        )}
      >
        {plan.eyebrow}
      </p>
      <h3 className="mt-3 font-serif text-3xl font-medium leading-tight tracking-normal">
        {plan.name}
      </h3>
      <p
        className={cx(
          "mt-3 min-h-12 text-sm leading-6",
          featured ? "text-white/70" : "text-[var(--mn-ink-soft)]"
        )}
      >
        {plan.description}
      </p>
      <div
        className={cx(
          "my-6 border-y py-5",
          featured ? "border-white/15" : "border-[var(--mn-line)]"
        )}
      >
        <p className={cx("text-sm", featured ? "text-white/55" : "text-[var(--mn-ash)]")}>
          <s>{plan.was}</s>{" "}
          <span className={cx("font-bold uppercase", featured ? "text-[var(--mn-gold-soft)]" : "text-[var(--mn-gold)]")}>
            {plan.save}
          </span>
        </p>
        <p className="mt-2 flex flex-wrap items-end gap-2">
          <span className={cx("pb-2 text-sm font-bold", featured ? "text-[var(--mn-teal-light)]" : "text-[var(--mn-teal-deep)]")}>
            THB
          </span>
          <strong className="font-serif text-6xl font-medium leading-none tracking-normal">
            {plan.price}
          </strong>
          <span className={cx("pb-2 text-xs font-bold uppercase tracking-normal", featured ? "text-[var(--mn-teal-light)]" : "text-[var(--mn-teal-deep)]")}>
            {plan.term}
          </span>
        </p>
        <p className={cx("mt-2 text-xs", featured ? "text-white/55" : "text-[var(--mn-ash)]")}>
          {plan.fine}
        </p>
      </div>
      <button
        className={cx(
          "inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold uppercase tracking-normal",
          featured
            ? "bg-white text-[var(--mn-teal-deep)] hover:bg-[var(--mn-cream)]"
            : "bg-[var(--mn-teal)] text-white hover:bg-[var(--mn-teal-deep)]",
          disabled ? "cursor-not-allowed opacity-50" : ""
        )}
        disabled={disabled}
        onClick={onSelect}
        type="button"
      >
        {isPending ? pendingLabel : plan.cta}
        {isPending ? null : <ArrowRightIcon aria-hidden={true} className="size-4" />}
      </button>
      <ul className="mt-6 space-y-3">
        {plan.features.map((feature) => (
          <li
            className={cx(
              "flex gap-3 text-sm leading-6",
              featured ? "text-white/75" : "text-[var(--mn-ink-soft)]"
            )}
            key={feature}
          >
            <CheckCircleIcon
              aria-hidden={true}
              className={cx(
                "mt-0.5 size-4 shrink-0",
                featured ? "text-[var(--mn-teal-light)]" : "text-[var(--mn-teal)]"
              )}
            />
            {feature}
          </li>
        ))}
      </ul>
      <div
        className={cx(
          "mt-auto grid grid-cols-[2.5rem_1fr] gap-3 rounded-lg p-4 text-sm leading-6",
          featured
            ? "bg-white/8 text-white/75 ring-1 ring-white/15"
            : "bg-[var(--mn-gold-tint)] text-[#6d5427]"
        )}
      >
        <ShieldCheckIcon
          aria-hidden={true}
          className={cx(
            "size-10 rounded-full p-2 ring-1",
            featured
              ? "text-[var(--mn-gold-soft)] ring-[var(--mn-gold-soft)]"
              : "text-[var(--mn-gold)] ring-[var(--mn-gold)]"
          )}
        />
        <div>
          <strong className={cx("block", featured ? "text-white" : "text-[var(--mn-ink)]")}>
            {plan.guarantee}
          </strong>
          <p>{plan.guaranteeBody}</p>
        </div>
      </div>
    </article>
  );
}

function PricingSection({
  locale,
  planId
}: Readonly<{
  locale: Locale;
  planId?: string;
}>) {
  const copy = pageCopy[locale];
  const [pendingPlan, setPendingPlan] = useState<AssessmentPlan | null>(null);

  async function startPlan(plan: AssessmentPlan) {
    if (!planId || pendingPlan) {
      return;
    }

    setPendingPlan(plan);
    window.location.href = paymentCheckoutPath(locale, {
      plan,
      planId,
      sourceSurface: "healthscore"
    });
  }

  return (
    <section id="pricing">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-bold uppercase tracking-normal text-[var(--mn-teal-deep)]">
          {copy.pricingEyebrow}
        </p>
        <h2 className="mt-3 font-serif text-4xl font-medium leading-tight tracking-normal text-[var(--mn-ink)]">
          {copy.pricingTitle}
        </h2>
        <p className={cx("mt-4 text-lg text-[var(--mn-ink-soft)]", copy.bodyClass)}>
          {copy.pricingBody}
        </p>
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {copy.plans.map((plan, index) => (
          <PriceCard
            disabled={!planId || Boolean(pendingPlan)}
            featured={index === 1}
            isPending={
              (index === 0 && pendingPlan === "precision") ||
              (index === 1 && pendingPlan === "pro")
            }
            key={plan.name}
            onSelect={() => void startPlan(index === 0 ? "precision" : "pro")}
            pendingLabel={copy.preparing}
            plan={plan}
          />
        ))}
      </div>
    </section>
  );
}

function HealthScoreExperience({
  locale,
  planId,
  result,
  showPricing
}: Readonly<{
  locale: Locale;
  planId?: string;
  result: HealthScoreResult;
  showPricing: boolean;
}>) {
  const stableResult = useMemo(() => result, [result]);

  return (
    <section className="space-y-14">
      <HealthScoreHero locale={locale} result={stableResult} />
      <GapCards locale={locale} result={stableResult} />
      <PillarBars locale={locale} result={stableResult} />
      <FindingsSection locale={locale} result={stableResult} />
      <SubtractionBeat locale={locale} result={stableResult} />
      <MethodCards locale={locale} result={stableResult} />
      {showPricing ? <PricingSection locale={locale} planId={planId} /> : null}
    </section>
  );
}

export function HealthScorePanel({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  return (
    <div className="mt-10">
      <HealthScoreExperience
        locale={locale}
        result={result}
        showPricing={false}
      />
    </div>
  );
}

export function HealthScorePaymentPanel({
  locale,
  planId,
  result
}: Readonly<{
  locale: Locale;
  planId?: string;
  result: HealthScoreResult;
}>) {
  return (
    <HealthScoreExperience
      locale={locale}
      planId={planId}
      result={result}
      showPricing={true}
    />
  );
}
