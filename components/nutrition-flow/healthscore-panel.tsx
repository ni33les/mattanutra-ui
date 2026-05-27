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
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type {
  HealthScoreGapCard,
  HealthScoreMethodCard,
  HealthScorePageAiCard,
  HealthScoreResult,
  LocalizedHealthScoreText
} from "@/lib/health-score";
import type { Locale } from "@/lib/i18n";
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
    heroGreeting(firstName: string) {
      return `Ready when you are, ${firstName}.`;
    },
    heroTitle(score: number) {
      return `Your HealthScore is ${score}.`;
    },
    defaultHeroBody:
      "We read your goals, daily routine, safety context, and the way you actually live, then turned them into one number and the pattern underneath it.",
    heroCta: "Unlock my Right Amount Plan",
    heroSecondary: "See what shaped it",
    scoreLabel: "HealthScore",
    scoreOutOf: "/100",
    topTier: "Top tier",
    percentile: "Percentile",
    median: "Reference median",
    spectrumStart: "30",
    spectrumEnd: "92",
    spectrumTypical: "Typical finisher",
    spectrumYou: "YOU",
    spectrumWhere: "Where you are",
    spectrumGapAhead: "How far ahead you sit",
    spectrumGapBehind: "Gap to typical finisher",
    spectrumHeadroom: "Headroom to 92",
    defaultBandLine:
      "Your score is built from five weighted pillars, safety flags, symptoms, goals, and any verified lab or wearable data you supplied.",
    bandLabels: {
      "Needs attention": "Needs attention",
      "Good, with a clear gap": "Good, with a clear gap",
      Strong: "Strong",
      Excellent: "Excellent"
    },
    pillarLabels: {
      activity: "Activity & Fitness",
      biomarkers: "Biomarkers",
      habits: "Health Habits",
      nutrition: "Nutrition & Diet",
      sleep: "Sleep & Recovery",
      stress: "Stress & Balance"
    },
    tagLabels: {
      digestion: "Digestion",
      energy: "Energy",
      fitness: "Fitness",
      focus: "Focus",
      heart: "Heart",
      immune: "Immune",
      mood: "Mood",
      sleep: "Sleep"
    },
    scoreMeaningEyebrow(score: number) {
      return `What ${score} actually means`;
    },
    fallbackScoreMeaning(score: number, percentile: number) {
      return `You are ahead of about ${percentile}% of people who finish this assessment. The last points are the hardest, and the most personal.`;
    },
    fallbackScoreMeaningSub:
      "A higher score is not about chasing everything at once. It is about the few specific refinements that still matter for your pattern.",
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
    pillarEyebrow: "Your pattern, pillar by pillar",
    pillarsTitle: "A fixed scoring model across five domains, not a guess.",
    highestLeverageLabel: "Your highest-leverage move",
    whatCaught: "What we caught",
    whatCaughtSub: "Laid out in full, nothing held back.",
    fallbackFindingTitle: "Your HealthScore has a clear starting point",
    fallbackFindingBody:
      "The lowest pillar and safety context decide what the plan should prioritise first.",
    subtractionEyebrow: "How your formula was built",
    subtractionTitle: "Your right amount is what remains after the unsuitable options are removed.",
    evaluatedFallback: "evaluated",
    setAsideFallback: "set aside",
    chosenFallback: "right for your score",
    methodEyebrow: "How MattaNutra thinks",
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
      "Your number is computed by the same rules every time: traceable, point by point. This is wellness guidance, not a diagnosis, and it is built to be shared with your doctor.",
    pricingEyebrow: "Choose your next step",
    pricingTitle: "Unlock the plan that fits how much support you want.",
    pricingBody:
      "Choose the one-time Right Amount Formula for immediate clarity, or the 90-Day Living Protocol for ongoing help turning the plan into daily habits.",
    preparing: "Preparing...",
    selectionError: "We could not start your plan. Please try again.",
    plans: [
      {
        badge: "Limited time offer",
        cta: "Get the Right Amount Formula",
        description:
          "Your personalised supplement formula with precise dosing, timing, and product guidance.",
        eyebrow: "One-time plan",
        features: [
          "Personalised supplement formula",
          "Body-size adjusted dose ranges",
          "Timing and usage instructions",
          "Medication and lab safety flags",
          "Recommended products and alternatives",
          "60-day reassessment prompt"
        ],
        fine: "One-time payment · Lifetime access",
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
        badge: "Most popular",
        cta: "Start Living Protocol",
        description:
          "Keep your right amount right as life changes, with food guidance and ongoing adjustments.",
        eyebrow: "90-day AI support",
        extraBlocks: [
          {
            body:
              "When something runs low, learn the everyday foods naturally rich in it, or skip the supplement when your meals already cover it.",
            icon: "❘❘",
            title: "Which Foods Give You What You Need"
          },
          {
            body: "Improve sleep quality, boost energy, and build better daily habits.",
            icon: "☾",
            title: "Sleep, Energy and Habits Guidance"
          }
        ],
        features: [
          "Learn which everyday foods give you what you need",
          "Supplement timing and adherence support",
          "Weekly progress summaries",
          "Priority review as your data changes"
        ],
        fine: "One payment · 90 days of support · Renew anytime",
        guarantee: "7-Day Satisfaction Guarantee",
        guaranteeBody:
          "Give Living Protocol a real try. If anything is not right, tell us and we will fix it, or refund you in full within 7 days.",
        includes: "Includes Right Amount Formula Plan.",
        name: "Living Protocol",
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
    heroGreeting(firstName: string) {
      return `พร้อมแล้วสำหรับคุณ ${firstName}`;
    },
    heroTitle(score: number) {
      return `คะแนนสุขภาพของคุณคือ ${score}`;
    },
    defaultHeroBody:
      "เราอ่านเป้าหมาย กิจวัตร บริบทความเหมาะสม และชีวิตจริงของคุณ แล้วแปลงเป็นคะแนนเดียวพร้อมรูปแบบที่อยู่ข้างใต้",
    heroCta: "ปลดล็อกแผนปริมาณที่พอดี",
    heroSecondary: "ดูสิ่งที่ใช้คำนวณ",
    scoreLabel: "คะแนนสุขภาพ",
    scoreOutOf: "/100",
    topTier: "ระดับสูง",
    percentile: "เปอร์เซ็นไทล์",
    median: "ค่ากลางอ้างอิง",
    spectrumStart: "30",
    spectrumEnd: "92",
    spectrumTypical: "ผู้ทำแบบประเมินทั่วไป",
    spectrumYou: "คุณ",
    spectrumWhere: "ตำแหน่งของคุณ",
    spectrumGapAhead: "ระยะที่คุณอยู่ข้างหน้า",
    spectrumGapBehind: "ช่องว่างถึงค่าทั่วไป",
    spectrumHeadroom: "พื้นที่ปรับถึง 92",
    defaultBandLine:
      "คะแนนนี้คำนวณจากเสาหลักห้าด้าน ธงความเหมาะสม อาการ เป้าหมาย และข้อมูลแล็บหรืออุปกรณ์ที่คุณให้มา",
    bandLabels: {
      "Needs attention": "ต้องให้ความสำคัญ",
      "Good, with a clear gap": "ดี และมีช่องว่างที่ชัดเจน",
      Strong: "แข็งแรง",
      Excellent: "ยอดเยี่ยม"
    },
    pillarLabels: {
      activity: "กิจกรรมและความฟิต",
      biomarkers: "ตัวชี้วัดสุขภาพ",
      habits: "พฤติกรรมสุขภาพ",
      nutrition: "โภชนาการและอาหาร",
      sleep: "การนอนและการฟื้นตัว",
      stress: "ความเครียดและสมดุล"
    },
    tagLabels: {
      digestion: "ระบบย่อย",
      energy: "พลังงาน",
      fitness: "ฟิตเนส",
      focus: "โฟกัส",
      heart: "หัวใจ",
      immune: "ภูมิคุ้มกัน",
      mood: "อารมณ์",
      sleep: "การนอน"
    },
    scoreMeaningEyebrow(score: number) {
      return `${score} คะแนนหมายความว่าอะไร`;
    },
    fallbackScoreMeaning(score: number, percentile: number) {
      return `คุณอยู่ข้างหน้าประมาณ ${percentile}% ของคนที่ทำแบบประเมินนี้ คะแนนที่เหลือคือจุดที่เฉพาะตัวที่สุด`;
    },
    fallbackScoreMeaningSub:
      "คะแนนที่สูงขึ้นไม่ได้มาจากการไล่ทำทุกอย่างพร้อมกัน แต่มาจากการปรับไม่กี่จุดที่ยังสำคัญกับรูปแบบของคุณ",
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
    pillarEyebrow: "รูปแบบของคุณ ทีละเสาหลัก",
    pillarsTitle: "โมเดลคะแนนคงที่ห้าด้าน ไม่ใช่การเดา",
    highestLeverageLabel: "จุดที่ให้แรงส่งสูงที่สุด",
    whatCaught: "สิ่งที่เราจับได้",
    whatCaughtSub: "แสดงอย่างชัดเจน ไม่ปิดบัง",
    fallbackFindingTitle: "คะแนนสุขภาพของคุณมีจุดเริ่มต้นที่ชัดเจน",
    fallbackFindingBody:
      "เสาหลักที่ต่ำที่สุดและบริบทความเหมาะสมเป็นตัวกำหนดว่าแผนควรเริ่มจากอะไร",
    subtractionEyebrow: "สูตรของคุณถูกสร้างอย่างไร",
    subtractionTitle: "ปริมาณที่พอดีคือสิ่งที่เหลือหลังตัดตัวเลือกที่ไม่เหมาะออก",
    evaluatedFallback: "ประเมิน",
    setAsideFallback: "ตัดออก",
    chosenFallback: "เหมาะกับคะแนนของคุณ",
    methodEyebrow: "วิธีคิดของ MattaNutra",
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
      "คะแนนของคุณคำนวณด้วยกฎเดียวกันทุกครั้ง ตรวจสอบย้อนกลับได้ทีละจุด นี่คือข้อมูลสุขภาวะ ไม่ใช่การวินิจฉัย และออกแบบมาให้คุยต่อกับแพทย์ได้",
    pricingEyebrow: "เลือกขั้นต่อไป",
    pricingTitle: "ปลดล็อกแผนที่ตรงกับระดับการสนับสนุนที่คุณต้องการ",
    pricingBody:
      "เลือกสูตรปริมาณที่พอดีแบบครั้งเดียวเพื่อความชัดเจนทันที หรือเลือก Living Protocol 90 วันสำหรับการช่วยเปลี่ยนแผนเป็นกิจวัตรจริง",
    preparing: "กำลังเตรียม...",
    selectionError: "ไม่สามารถเริ่มแผนได้ กรุณาลองอีกครั้ง",
    plans: [
      {
        badge: "ข้อเสนอพิเศษ",
        cta: "รับสูตรปริมาณที่พอดี",
        description:
          "สูตรอาหารเสริมส่วนตัว พร้อมปริมาณ เวลาใช้ และคำแนะนำผลิตภัณฑ์",
        eyebrow: "แผนครั้งเดียว",
        features: [
          "สูตรอาหารเสริมส่วนตัว",
          "ช่วงปริมาณที่ปรับตามร่างกาย",
          "คำแนะนำเวลาและวิธีใช้",
          "ธงความปลอดภัยจากยาและแล็บ",
          "ผลิตภัณฑ์ที่แนะนำและทางเลือก",
          "แจ้งเตือนประเมินซ้ำใน 60 วัน"
        ],
        fine: "ชำระครั้งเดียว · เข้าถึงได้ตลอด",
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
        badge: "นิยมที่สุด",
        cta: "เริ่ม Living Protocol",
        description:
          "รักษาปริมาณที่พอดีให้ยังพอดีเมื่อชีวิตเปลี่ยน พร้อมคำแนะนำอาหารและการปรับต่อเนื่อง",
        eyebrow: "AI ดูแล 90 วัน",
        extraBlocks: [
          {
            body:
              "เมื่อบางอย่างยังขาด ให้รู้ว่าอาหารประจำวันชนิดใดมีสิ่งนั้นตามธรรมชาติ หรือข้ามอาหารเสริมได้เมื่อมื้ออาหารครอบคลุมแล้ว",
            icon: "❘❘",
            title: "อาหารชนิดใดให้สิ่งที่คุณต้องการ"
          },
          {
            body: "ช่วยปรับคุณภาพการนอน พลังงาน และนิสัยประจำวันให้ดีขึ้น",
            icon: "☾",
            title: "คำแนะนำเรื่องการนอน พลังงาน และนิสัย"
          }
        ],
        features: [
          "เรียนรู้ว่าอาหารประจำวันชนิดใดให้สิ่งที่คุณต้องการ",
          "ช่วยเรื่องเวลาใช้และความสม่ำเสมอของอาหารเสริม",
          "สรุปความคืบหน้ารายสัปดาห์",
          "ทบทวนเมื่อข้อมูลเปลี่ยน"
        ],
        fine: "ชำระครั้งเดียว · ดูแล 90 วัน · ต่ออายุได้",
        guarantee: "รับประกันความพึงพอใจ 7 วัน",
        guaranteeBody:
          "ลองใช้ Living Protocol อย่างจริงจัง หากมีสิ่งใดไม่ตรงใจ บอกเรา เราจะปรับให้หรือคืนเงินเต็มจำนวนภายใน 7 วัน",
        includes: "รวมแผนสูตรปริมาณที่พอดี",
        name: "Living Protocol",
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

function useInViewOnce<T extends HTMLElement>(margin = "0px 0px -12% 0px") {
  const reducedMotion = useReducedMotion();
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }

    const element = ref.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const prepareFrame = window.requestAnimationFrame(() => setVisible(false));

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          window.cancelAnimationFrame(prepareFrame);
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin, threshold: 0.1 }
    );

    observer.observe(element);

    const fallback = window.setTimeout(() => setVisible(true), 1800);

    return () => {
      window.cancelAnimationFrame(prepareFrame);
      window.clearTimeout(fallback);
      observer.disconnect();
    };
  }, [margin, reducedMotion]);

  return { ref, visible: visible || reducedMotion } as const;
}

function RevealBlock({
  children,
  className = "",
  delay = 0
}: Readonly<{
  children: ReactNode;
  className?: string;
  delay?: 0 | 1 | 2 | 3 | 4;
}>) {
  const { ref, visible } = useInViewOnce<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cx(
        "motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out",
        delay === 1 && "motion-safe:delay-75",
        delay === 2 && "motion-safe:delay-150",
        delay === 3 && "motion-safe:delay-300",
        delay === 4 && "motion-safe:delay-[420ms]",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className
      )}
    >
      {children}
    </div>
  );
}

function CountUpNumber({
  active = true,
  className,
  duration = 900,
  value
}: Readonly<{
  active?: boolean;
  className?: string;
  duration?: number;
  value: number;
}>) {
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (reducedMotion || !active) {
      return undefined;
    }

    let frame = 0;
    const startedAt = performance.now();

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
  }, [active, duration, reducedMotion, value]);

  return <span className={className}>{reducedMotion || !active ? value : display}</span>;
}

function stripInlineMarkup(value: string) {
  return value.replace(/<\/?b>/g, "");
}

const thaiScriptPattern = /[\u0E00-\u0E7F]/;

function textFitsLocale(value: string, locale: Locale) {
  const hasThai = thaiScriptPattern.test(value);

  if (locale === "th") {
    return hasThai;
  }

  return !hasThai;
}

function localizedLegacyText(
  value: string | null | undefined,
  locale: Locale,
  fallback = ""
) {
  if (!value) {
    return fallback;
  }

  if (!textFitsLocale(value, locale)) {
    return fallback;
  }

  return value;
}

function localize(
  value: LocalizedHealthScoreText | undefined,
  locale: Locale,
  fallback = ""
) {
  if (!value) {
    return fallback;
  }

  if (typeof value === "string") {
    return localizedLegacyText(value, locale, fallback);
  }

  return value[locale] || fallback;
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

function displayBand(band: string, locale: Locale) {
  const labels = pageCopy[locale].bandLabels;
  const normalized = band
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return labels[band as keyof typeof labels] ?? labels[normalized as keyof typeof labels] ?? band;
}

function displayPillarLabel(
  pillar: ReturnType<typeof normalizedPillars>[number],
  locale: Locale
) {
  const labels = pageCopy[locale].pillarLabels;

  return labels[pillar.id as keyof typeof labels] ?? localizedLegacyText(pillar.label, locale);
}

function displayPillarTag(tag: string | null | undefined, locale: Locale) {
  if (!tag) {
    return null;
  }

  if (textFitsLocale(tag, locale)) {
    return tag;
  }

  const labels = pageCopy[locale].tagLabels;

  return tag
    .split("/")
    .map((part) => {
      const key = part.trim().toLowerCase();

      return labels[key as keyof typeof labels] ?? part.trim();
    })
    .join(" / ");
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
      className="mx-auto flex w-full max-w-3xl items-center justify-center gap-1.5 font-[family:var(--mn-font-mono)] text-[0.68rem]"
    >
      {copy.progress.map(([title, body], index) => {
        const complete = index === 0;
        const active = index === 1;

        return (
          <div className="flex items-center gap-1.5" key={title}>
            {index > 0 ? (
              <span
                aria-hidden={true}
                className="h-px w-4 bg-[var(--mn-line)] sm:w-7"
              />
            ) : null}
            <span
              className={cx(
                "inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-[var(--mn-ash-soft)] sm:px-3",
                active && "bg-white text-[var(--mn-ink)] shadow-[var(--mn-shadow-soft)]",
                complete && "text-[var(--mn-teal-deep)]"
              )}
            >
              <span
                className={cx(
                  "grid size-[1.125rem] place-items-center rounded-full border text-[0.58rem] font-bold",
                  complete
                    ? "border-[var(--mn-teal-deep)] bg-[var(--mn-teal-deep)] text-white"
                    : active
                      ? "border-2 border-[var(--mn-teal)] text-[var(--mn-teal)]"
                      : "border-current"
                )}
              >
                {complete ? "✓" : index + 1}
              </span>
              <span className="hidden font-semibold sm:inline">{title}</span>
              <span className="sr-only">{body}</span>
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
  const gapLeft = Math.min(marker, medianMarker);
  const gapWidth = Math.abs(marker - medianMarker);
  const { ref, visible } = useInViewOnce<HTMLDivElement>();
  const ahead = score >= median;

  return (
    <div className="mx-auto mt-8 max-w-2xl" ref={ref}>
      <div className="relative h-16 sm:h-14">
        <div className="absolute inset-x-0 top-6 h-2.5 overflow-hidden rounded-full bg-[linear-gradient(90deg,#E7DFCB_36%,#E3EEE6_70%,var(--mn-teal-glow))]" />
        {gapWidth > 0 ? (
          <div
            aria-hidden={true}
            className="absolute top-[1.125rem] h-[1.125rem] rounded border border-dashed border-[var(--mn-teal)] bg-[color-mix(in_srgb,var(--mn-teal)_10%,transparent)]"
            style={{ left: `${gapLeft}%`, width: `${gapWidth}%` }}
          />
        ) : null}
        <div
          aria-hidden={true}
          className="absolute left-0 top-6 h-2.5 rounded-full bg-[linear-gradient(90deg,var(--mn-teal-deep),var(--mn-teal-light))] shadow-[0_0_0_1px_rgba(31,110,88,.18)] motion-safe:transition-[width] motion-safe:duration-[1600ms] motion-safe:ease-out"
          style={{ width: visible ? `${marker}%` : 0 }}
        />
        <div
          className="absolute top-2 h-10 w-px bg-[var(--mn-ink-soft)]"
          style={{ left: `${medianMarker}%` }}
        >
          <span className="absolute bottom-[-1.35rem] left-1/2 -translate-x-1/2 whitespace-nowrap font-[family:var(--mn-font-mono)] text-[0.58rem] text-[var(--mn-ink-soft)]">
            {copy.spectrumTypical} · {median}
          </span>
        </div>
        <div
          className="absolute top-0 h-12 w-0.5 bg-[var(--mn-teal-deep)]"
          style={{ left: `${marker}%` }}
        >
          <span className="absolute top-[-1.35rem] left-1/2 -translate-x-1/2 whitespace-nowrap font-[family:var(--mn-font-mono)] text-[0.62rem] font-bold text-[var(--mn-teal-deep)]">
            {copy.spectrumYou} · {score}
          </span>
        </div>
      </div>
      <div className="mt-6 flex justify-between font-[family:var(--mn-font-mono)] text-[0.62rem] text-[var(--mn-ash-soft)]">
        <span>{copy.spectrumStart}</span>
        <span>{copy.spectrumEnd}</span>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 font-[family:var(--mn-font-mono)] text-[0.68rem] text-[var(--mn-ash)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3.5 rounded-sm bg-[var(--mn-teal-deep)]" />
          {copy.spectrumWhere}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3.5 rounded-sm border border-dashed border-[var(--mn-teal)] bg-[color-mix(in_srgb,var(--mn-teal)_10%,transparent)]" />
          {ahead ? copy.spectrumGapAhead : copy.spectrumGapBehind}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3.5 rounded-sm bg-[linear-gradient(90deg,var(--mn-teal-glow),transparent)]" />
          {copy.spectrumHeadroom}
        </span>
      </div>
    </div>
  );
}

function HealthScoreHero({
  firstName,
  locale,
  result
}: Readonly<{
  firstName?: string;
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const copy = pageCopy[locale];
  const page = result.pageContent;
  const score = page?.locked.score ?? result.score;
  const ai = page?.aiCopy;
  const heroTitle = localize(
    ai?.heroTitle,
    locale,
    localizedLegacyText(page?.copySeeds.goalMirror, locale, copy.heroTitle(score))
  );
  const heroBody = localize(
    ai?.heroBody,
    locale,
    localizedLegacyText(page?.copySeeds.heroBody ?? result.summary, locale, copy.defaultHeroBody)
  );
  const bandLine = localize(
    ai?.bandLine,
    locale,
    localizedLegacyText(page?.copySeeds.bandLine, locale, copy.defaultBandLine)
  );
  const percentile = page?.locked.percentile ?? null;
  const { ref: scoreRef, visible: scoreVisible } = useInViewOnce<HTMLDivElement>();

  return (
    <header className="space-y-8 text-center">
      <HealthScoreProgress locale={locale} />
      <div className="mx-auto max-w-5xl pt-10 sm:pt-14">
        <RevealBlock>
          <p className="font-[family:var(--mn-font-mono)] text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[var(--mn-teal-deep)]">
            {copy.heroEyebrow}
          </p>
        </RevealBlock>
        <RevealBlock delay={1}>
          {firstName ? (
            <p className="mt-4 text-sm font-semibold text-[var(--mn-gold)]">
              {copy.heroGreeting(firstName)}
            </p>
          ) : null}
          <h1
            className={cx(
              "mn-hero-title mx-auto mt-5 max-w-[16ch] font-serif text-[clamp(2rem,5.4vw,3.4rem)] font-medium leading-[1.08] tracking-normal text-[var(--mn-ink)]",
              locale === "en" ? "text-balance" : "break-words"
            )}
          >
            {heroTitle}
          </h1>
        </RevealBlock>
        <RevealBlock delay={2}>
          <p
            className={cx(
              "mn-hero-subtitle mx-auto mt-5 max-w-[54ch] text-[1.05rem] text-[var(--mn-ink-soft)]",
              copy.bodyClass
            )}
          >
            {heroBody}
          </p>
        </RevealBlock>

        <RevealBlock delay={3}>
          <aside
            className="relative mx-auto mt-12 max-w-[47.5rem] overflow-hidden rounded-3xl border border-[var(--mn-line)] bg-[var(--mn-paper)] px-5 py-8 shadow-[var(--mn-shadow-card)] before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-[linear-gradient(90deg,var(--mn-teal-deep),var(--mn-teal-light),var(--mn-gold-soft))] sm:px-10 sm:py-10"
            ref={scoreRef}
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full bg-[var(--mn-gold-tint)] px-3 py-1.5 font-[family:var(--mn-font-mono)] text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#8a6d23]">
                {displayBand(result.band, locale)}
              </span>
            {percentile !== null ? (
              <span className="rounded-full bg-[var(--mn-mint)] px-3 py-1.5 font-[family:var(--mn-font-mono)] text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[var(--mn-teal-deep)]">
                {percentile >= 80 ? copy.topTier : `${copy.percentile}: ${percentile}`}
              </span>
            ) : null}
            </div>

            <div className="mt-5 flex items-start justify-center">
            <CountUpNumber
                active={scoreVisible}
                className="font-serif text-[clamp(6rem,17vw,9.75rem)] font-light leading-[0.9] tracking-[-0.04em] text-[var(--mn-ink)]"
                duration={1100}
              value={score}
            />
              <span className="mt-4 font-[family:var(--mn-font-mono)] text-[clamp(1.25rem,4vw,2.1rem)] font-semibold text-[var(--mn-ash-soft)]">
              {copy.scoreOutOf}
            </span>
          </div>

          <ScoreSpectrum locale={locale} result={result} />

          <p
            className={cx(
                "mx-auto mt-7 max-w-[46ch] text-base text-[var(--mn-ink-soft)]",
              copy.bodyClass
            )}
          >
            {bandLine}
          </p>
          </aside>
        </RevealBlock>
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
  const score = page?.locked.score ?? result.score;
  const percentile = page?.locked.percentile ?? 0;
  const relativity = page?.copySeeds.relativity;
  const title = localize(
    ai?.relativityHeadline,
    locale,
    localizedLegacyText(relativity?.headline, locale, copy.fallbackScoreMeaning(score, percentile))
  );
  const body = localize(
    ai?.relativitySub,
    locale,
    localizedLegacyText(relativity?.sub, locale, copy.fallbackScoreMeaningSub)
  );
  const cards = gapCards(result, locale);

  return (
    <section className="pt-2" id="signals">
      <RevealBlock className="max-w-[60ch]">
        <p className="font-[family:var(--mn-font-mono)] text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[var(--mn-teal-deep)]">
          {copy.scoreMeaningEyebrow(score)}
          </p>
        <h2 className="mt-3 font-serif text-[clamp(1.65rem,3.6vw,2.4rem)] font-medium leading-[1.08] tracking-normal text-[var(--mn-ink)] text-balance">
            {title}
          </h2>
        <p className={cx("mt-4 max-w-[54ch] text-[1.05rem] text-[var(--mn-ink-soft)]", copy.bodyClass)}>
          {body}
        </p>
      </RevealBlock>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {cards.map((card, index) => {
          const aiCard = ai?.gapTrio?.[index];
          const fallbackCard = copy.fallbackGaps[index] ?? card;
          const tag = localizedLegacyText(card.tag, locale, fallbackCard.tag);

          return (
            <RevealBlock delay={(index + 1) as 1 | 2 | 3} key={`${card.tag}-${card.value}-${index}`}>
              <article className="relative h-full rounded-2xl border border-[var(--mn-line)] bg-[var(--mn-paper)] p-6 shadow-[var(--mn-shadow-soft)] motion-safe:transition motion-safe:duration-300 motion-safe:hover:-translate-y-1">
                <span className="font-[family:var(--mn-font-mono)] text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[var(--mn-ash-soft)]">
                    {tag}
                  </span>
                <div className="mt-2 font-serif text-4xl font-medium leading-none text-[var(--mn-teal-deep)]">
                  {card.value}
                </div>
                <h3 className="mt-3 text-lg font-semibold leading-snug text-[var(--mn-ink)]">
                {aiCardHeadline(
                  aiCard,
                  locale,
                  localizedLegacyText(card.headline, locale, fallbackCard.headline)
                )}
              </h3>
              <p className={cx("mt-3 text-sm text-[var(--mn-ink-soft)]", copy.bodyClass)}>
                {aiCardBody(
                  aiCard,
                  locale,
                  localizedLegacyText(card.body, locale, fallbackCard.body)
                )}
              </p>
            </article>
            </RevealBlock>
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
  const pillars = normalizedPillars(result);
  const page = result.pageContent;
  const ai = page?.aiCopy;
  const headline = localize(
    ai?.pillarHeadline,
    locale,
    localizedLegacyText(page?.copySeeds.pillarHeadline, locale, copy.pillarsTitle)
  );
  const highestLeverage = page?.copySeeds.highestLeverage;
  const highestLeverageBody = localize(
    ai?.highestLeverageBody,
    locale,
    localizedLegacyText(
      highestLeverage?.text ? stripInlineMarkup(highestLeverage.text) : "",
      locale,
      ""
    )
  );
  const strengthNote = localize(
    ai?.strengthNote,
    locale,
    localizedLegacyText(page?.copySeeds.strengthNote, locale, "")
  );
  const { ref, visible } = useInViewOnce<HTMLDivElement>();
  const leveragePillar = highestLeverage
    ? pillars.find((pillar) => pillar.label === highestLeverage.pillar)
    : pillars.slice().sort((left, right) => left.value - right.value)[0];

  return (
    <section>
      <RevealBlock className="max-w-[60ch]">
        <p className="font-[family:var(--mn-font-mono)] text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[var(--mn-teal-deep)]">
          {copy.pillarEyebrow}
          </p>
        <h2 className="mt-3 font-serif text-[clamp(1.65rem,3.6vw,2.4rem)] font-medium leading-[1.08] tracking-normal text-[var(--mn-ink)] text-balance">
            {headline}
          </h2>
      </RevealBlock>

      <RevealBlock delay={1}>
        <div
          className="mt-8 rounded-3xl border border-[var(--mn-line)] bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-soft)] sm:p-8"
          ref={ref}
        >
          {pillars.map((pillar) => (
            (() => {
              const pillarTag = displayPillarTag(pillar.tag, locale);

              return (
            <div
              className={cx(
                "grid gap-2 border-b border-[var(--mn-line)] py-4 last:border-b-0 sm:grid-cols-[11rem_1fr_3.5rem] sm:items-center sm:gap-4",
                leveragePillar?.id === pillar.id &&
                  "rounded-2xl border-b-0 bg-[var(--mn-mint)] px-4 sm:-mx-4"
              )}
              key={pillar.id}
            >
              <div className="min-w-0">
                <h3 className="flex flex-col gap-1 text-[0.95rem] font-semibold leading-snug text-[var(--mn-ink)]">
                    {displayPillarLabel(pillar, locale)}
                  {pillarTag ? (
                    <span className={cx(
                      "w-fit rounded-full bg-[var(--mn-mint)] px-2 py-0.5 font-[family:var(--mn-font-mono)] text-[0.58rem] font-semibold text-[var(--mn-teal-deep)]",
                      locale === "en" && "uppercase tracking-[0.12em]"
                    )}>
                      {pillarTag}
                    </span>
                  ) : null}
                </h3>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--mn-cream-deep)]">
                <div
                  className={cx(
                    "h-full rounded-full motion-safe:transition-[width] motion-safe:duration-[1300ms] motion-safe:ease-out",
                    pillar.value >= 70
                      ? "bg-[linear-gradient(90deg,var(--mn-teal-deep),var(--mn-teal-light))]"
                      : "bg-[linear-gradient(90deg,#C98A2B,var(--mn-gold-soft))]"
                  )}
                  style={{ width: visible ? `${clamp(pillar.value)}%` : 0 }}
                />
              </div>
              <span className="font-[family:var(--mn-font-mono)] text-sm font-semibold text-[var(--mn-ink)] sm:text-right">
                  {pillar.value}
                </span>
            </div>
              );
            })()
          ))}
          {highestLeverageBody ? (
            <div className="mt-6 rounded-r-2xl border-l-4 border-[var(--mn-teal)] bg-[var(--mn-mint)] px-5 py-4">
              <p className="text-sm font-semibold text-[var(--mn-teal-deep)]">
                {copy.highestLeverageLabel}
              </p>
              <p className={cx("mt-2 text-sm text-[var(--mn-ink-soft)]", copy.bodyClass)}>
                {highestLeverageBody}
              </p>
            </div>
          ) : null}
          {strengthNote ? (
            <p className={cx("mt-4 text-sm text-[var(--mn-ash)]", copy.bodyClass)}>
              {strengthNote}
            </p>
          ) : null}
        </div>
      </RevealBlock>
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
  const headline = localize(
    ai?.findingsHeadline,
    locale,
    localizedLegacyText(page?.copySeeds.findingsHeadline, locale, copy.gapTitle)
  );
  const sub = localize(
    ai?.findingsSub,
    locale,
    localizedLegacyText(page?.copySeeds.findingsSub, locale, copy.whatCaughtSub)
  );

  return (
    <section>
      <RevealBlock className="max-w-[60ch]">
        <p className="font-[family:var(--mn-font-mono)] text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[var(--mn-teal-deep)]">
            {page?.copySeeds.findingsMode === "strengths" ? copy.pillarsEyebrow : copy.whatCaught}
          </p>
        <h2 className="mt-3 font-serif text-[clamp(1.65rem,3.6vw,2.4rem)] font-medium leading-[1.08] tracking-normal text-[var(--mn-ink)] text-balance">
            {headline}
          </h2>
        <p className={cx("mt-4 text-[1.05rem] text-[var(--mn-ink-soft)]", copy.bodyClass)}>
          {sub}
        </p>
      </RevealBlock>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {items.map((item, index) => {
          const aiCard = ai?.findings?.[index];
          const isSingle = items.length === 1;
          const fallbackCard = copy.fallbackGaps[index] ?? {
            body: copy.fallbackFindingBody,
            headline: copy.fallbackFindingTitle
          };

          return (
            <RevealBlock
              className={isSingle ? "md:col-span-3" : ""}
              delay={(index + 1) as 1 | 2 | 3}
              key={`${item.code}-${index}`}
            >
              <article
                className={cx(
                  "h-full min-h-56 rounded-2xl border border-[var(--mn-line)] bg-[var(--mn-paper)] p-6 shadow-[var(--mn-shadow-soft)]",
                  isSingle && "border-[var(--mn-teal-glow)]"
                )}
              >
                <div className="grid size-10 place-items-center rounded-xl bg-[var(--mn-mint)] text-[var(--mn-teal-deep)]">
                <FindingIcon index={index} />
                </div>
                <h3 className="mt-5 text-xl font-semibold leading-snug text-[var(--mn-ink)]">
                {aiCardHeadline(
                  aiCard,
                  locale,
                  localizedLegacyText(item.headline, locale, fallbackCard.headline)
                )}
              </h3>
              <p className={cx("mt-3 text-sm text-[var(--mn-ink-soft)]", copy.bodyClass)}>
                {aiCardBody(
                  aiCard,
                  locale,
                  localizedLegacyText(item.body, locale, fallbackCard.body)
                )}
              </p>
            </article>
            </RevealBlock>
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
  const body = localize(
    ai?.subtractionBody,
    locale,
    localizedLegacyText(seed?.body, locale, copy.subtractionTitle)
  );
  const labels = [
    localizedLegacyText(seed?.labelEvaluated, locale, copy.evaluatedFallback),
    localizedLegacyText(seed?.labelSetAside, locale, copy.setAsideFallback),
    localizedLegacyText(seed?.labelChosen, locale, copy.chosenFallback)
  ];
  const numbers = [subtraction.evaluated, subtraction.setAside, subtraction.chosen];
  const { ref, visible } = useInViewOnce<HTMLDivElement>();

  return (
    <section>
      <RevealBlock>
        <div
          className="rounded-3xl border border-[var(--mn-line)] bg-[linear-gradient(160deg,var(--mn-paper),var(--mn-cream-deep))] px-5 py-12 text-center shadow-[var(--mn-shadow-soft)] sm:px-10"
          ref={ref}
        >
          <p className="font-[family:var(--mn-font-mono)] text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[var(--mn-teal-deep)]">
          {copy.subtractionEyebrow}
        </p>
          <div className="mt-6 grid gap-5 sm:flex sm:items-end sm:justify-center sm:gap-x-7 lg:gap-x-12">
            {numbers.map((number, index) => (
              <div
                className="grid gap-4 sm:grid-cols-[minmax(7rem,auto)_auto] sm:items-center sm:gap-7"
                key={`${labels[index]}-${number}`}
              >
                <div className="flex min-w-0 flex-col items-center">
                  <CountUpNumber
                    active={visible}
                    className={cx(
                      "font-serif font-light leading-none tracking-normal",
                      index === 0 &&
                        "text-[clamp(3.25rem,15vw,5.125rem)] text-[var(--mn-ash-soft)] sm:text-[clamp(3rem,8vw,5.125rem)]",
                      index === 1 &&
                        "text-[clamp(3.25rem,15vw,5.125rem)] text-[var(--mn-ink-soft)] sm:text-[clamp(3rem,8vw,5.125rem)]",
                      index === 2 &&
                        "text-[clamp(4rem,18vw,7rem)] text-[var(--mn-teal-deep)] sm:text-[clamp(4.4rem,12vw,8rem)]"
                    )}
                    duration={900 + index * 200}
                    value={number}
                  />
                  <p
                    className={cx(
                      "mt-2 max-w-[11rem] text-center font-[family:var(--mn-font-mono)] text-[0.68rem] font-semibold leading-[1.35]",
                      locale === "en" && "uppercase tracking-[0.12em]",
                      index === 2 ? "text-[var(--mn-teal-deep)]" : "text-[var(--mn-ash)]"
                    )}
                  >
                    {labels[index]}
                  </p>
                </div>
                {index < 2 ? (
                  <ArrowRightIcon
                    aria-hidden={true}
                    className="mx-auto size-5 rotate-90 text-[var(--mn-ash-soft)] sm:mb-8 sm:size-7 sm:rotate-0"
                  />
                ) : null}
              </div>
            ))}
          </div>
          <p className={cx("mx-auto mt-7 max-w-[58ch] text-base text-[var(--mn-ink-soft)]", copy.bodyClass)}>
          {body}
        </p>
      </div>
      </RevealBlock>
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
    localizedLegacyText(page?.copySeeds.methodHeadline, locale, copy.methodTitle)
  );
  const cards = methodCards(result, locale);
  const icons = [BeakerIcon, AdjustmentsHorizontalIcon, LockClosedIcon];

  return (
    <section>
      <RevealBlock className="max-w-[60ch]">
        <p className="font-[family:var(--mn-font-mono)] text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[var(--mn-teal-deep)]">
          {copy.methodEyebrow}
        </p>
        <h2 className="mt-3 font-serif text-[clamp(1.65rem,3.6vw,2.4rem)] font-medium leading-[1.08] tracking-normal text-[var(--mn-ink)] text-balance">
          {headline}
        </h2>
      </RevealBlock>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {cards.map((card, index) => {
          const Icon = icons[index] ?? BeakerIcon;
          const aiCard = ai?.methodCards?.[index];
          const fallbackCard = copy.fallbackMethodCards[index] ?? card;

          return (
            <RevealBlock delay={(index + 1) as 1 | 2 | 3} key={`${card.title}-${index}`}>
              <article className="h-full rounded-2xl border border-[var(--mn-line)] bg-[var(--mn-paper)] p-6 shadow-[var(--mn-shadow-soft)]">
                <div className="font-serif text-3xl leading-none text-[var(--mn-teal-glow)]">
                  {index + 1}
              </div>
                <h3 className="mt-3 text-base font-semibold leading-snug text-[var(--mn-ink)]">
                {aiCardHeadline(
                  aiCard,
                  locale,
                  localizedLegacyText(card.title, locale, fallbackCard.title)
                )}
              </h3>
                <p className={cx("mt-2 text-sm text-[var(--mn-ink-soft)]", copy.bodyClass)}>
                {aiCardBody(
                  aiCard,
                  locale,
                  localizedLegacyText(card.body, locale, fallbackCard.body)
                )}
              </p>
                <Icon aria-hidden={true} className="mt-5 size-5 text-[var(--mn-teal-deep)]" />
            </article>
            </RevealBlock>
          );
        })}
      </div>
      <RevealBlock delay={2}>
        <div className="mt-7 flex items-start gap-3 rounded-2xl bg-[var(--mn-mint)] px-5 py-4 text-[var(--mn-teal-deep)]">
          <CheckCircleIcon aria-hidden={true} className="mt-0.5 size-5 shrink-0" />
          <p className={cx("text-sm", copy.bodyClass)}>{copy.trustLine}</p>
        </div>
      </RevealBlock>
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
  const extraBlocks = "extraBlocks" in plan ? plan.extraBlocks : undefined;
  const includes = "includes" in plan ? plan.includes : undefined;

  return (
    <article
      className={cx(
        "relative flex flex-col rounded-3xl p-6 shadow-[var(--mn-shadow-soft)] sm:p-8",
        featured
          ? "bg-[linear-gradient(165deg,#11385C_0%,var(--mn-ink)_70%)] text-white"
          : "border border-[var(--mn-line)] bg-[var(--mn-paper)] text-[var(--mn-ink)]"
      )}
    >
      <span
        className={cx(
          "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full px-4 py-2 text-center font-[family:var(--mn-font-mono)] text-[0.64rem] font-semibold uppercase tracking-[0.16em] whitespace-nowrap",
          featured
            ? "bg-[linear-gradient(90deg,var(--mn-gold),var(--mn-gold-soft))] text-[#3a2d08]"
            : "bg-[var(--mn-gold-tint)] text-[#8a6d23]"
        )}
      >
        {plan.badge}
      </span>
      <p
        className={cx(
          "mt-3 flex items-center gap-2 font-[family:var(--mn-font-mono)] text-[0.68rem] font-semibold uppercase tracking-[0.13em]",
          featured ? "text-[var(--mn-teal-light)]" : "text-[var(--mn-teal-deep)]"
        )}
      >
        <span
          className={cx(
            "grid size-8 place-items-center rounded-lg",
            featured
              ? "bg-white/10 text-[var(--mn-teal-light)]"
              : "bg-[var(--mn-mint)] text-[var(--mn-teal-deep)]"
          )}
        >
          {featured ? "♡" : "◎"}
        </span>
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
          "mt-5",
          featured ? "text-white" : "text-[var(--mn-ink)]"
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
          "mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-sm font-bold",
          featured
            ? "bg-[var(--mn-teal-light)] text-[#06281d] hover:bg-[var(--mn-teal-glow)]"
            : "bg-[var(--mn-teal-deep)] text-white hover:bg-[var(--mn-teal)]",
          disabled ? "cursor-not-allowed opacity-50" : ""
        )}
        disabled={disabled}
        onClick={onSelect}
        type="button"
      >
        {isPending ? pendingLabel : plan.cta}
        {isPending ? null : <ArrowRightIcon aria-hidden={true} className="size-4" />}
      </button>
      {includes ? (
        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/15 p-4 text-sm text-white/90">
          <CheckCircleIcon aria-hidden={true} className="size-5 text-[var(--mn-teal-light)]" />
          <span>{includes}</span>
          <span className="ml-auto font-[family:var(--mn-font-mono)] text-[0.68rem] uppercase tracking-[0.14em] text-[var(--mn-gold-soft)]">
            PLUS
          </span>
        </div>
      ) : null}
      {extraBlocks?.map((block) => (
        <div className="mt-5 flex items-start gap-3" key={block.title}>
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[var(--mn-teal-light)]">
            {block.icon}
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">{block.title}</h4>
            <p className="mt-1 text-sm leading-6 text-white/70">{block.body}</p>
          </div>
        </div>
      ))}
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
          "mt-6 grid grid-cols-[2.5rem_1fr] gap-3 rounded-2xl p-4 text-sm leading-6",
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
      <RevealBlock className="max-w-[64ch]">
        <p className="font-[family:var(--mn-font-mono)] text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[var(--mn-teal-deep)]">
          {copy.pricingEyebrow}
        </p>
        <h2 className="mt-3 font-serif text-[clamp(1.65rem,3.6vw,2.4rem)] font-medium leading-[1.08] tracking-normal text-[var(--mn-ink)] text-balance">
          {copy.pricingTitle}
        </h2>
        <p className={cx("mt-4 max-w-[54ch] text-[1.05rem] text-[var(--mn-ink-soft)]", copy.bodyClass)}>
          {copy.pricingBody}
        </p>
      </RevealBlock>
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {copy.plans.map((plan, index) => (
          <RevealBlock delay={(index + 1) as 1 | 2} key={plan.name}>
            <PriceCard
              disabled={!planId || Boolean(pendingPlan)}
              featured={index === 1}
              isPending={
                (index === 0 && pendingPlan === "precision") ||
                (index === 1 && pendingPlan === "pro")
              }
              onSelect={() => void startPlan(index === 0 ? "precision" : "pro")}
              pendingLabel={copy.preparing}
              plan={plan}
            />
          </RevealBlock>
        ))}
      </div>
    </section>
  );
}

function HealthScoreExperience({
  firstName,
  locale,
  planId,
  result,
  showPricing
}: Readonly<{
  firstName?: string;
  locale: Locale;
  planId?: string;
  result: HealthScoreResult;
  showPricing: boolean;
}>) {
  return (
    <section className="space-y-14">
      <HealthScoreHero firstName={firstName} locale={locale} result={result} />
      <GapCards locale={locale} result={result} />
      <PillarBars locale={locale} result={result} />
      <FindingsSection locale={locale} result={result} />
      <SubtractionBeat locale={locale} result={result} />
      <MethodCards locale={locale} result={result} />
      {showPricing ? <PricingSection locale={locale} planId={planId} /> : null}
    </section>
  );
}

export function HealthScorePanel({
  firstName,
  locale,
  result
}: Readonly<{
  firstName?: string;
  locale: Locale;
  result: HealthScoreResult;
}>) {
  return (
    <div className="mt-10">
      <HealthScoreExperience
        firstName={firstName}
        locale={locale}
        result={result}
        showPricing={false}
      />
    </div>
  );
}

export function HealthScorePaymentPanel({
  firstName,
  locale,
  planId,
  result
}: Readonly<{
  firstName?: string;
  locale: Locale;
  planId?: string;
  result: HealthScoreResult;
}>) {
  return (
    <HealthScoreExperience
      firstName={firstName}
      locale={locale}
      planId={planId}
      result={result}
      showPricing={true}
    />
  );
}
