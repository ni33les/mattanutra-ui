"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  HealthScoreDomain,
  HealthScoreResult,
  LocalizedHealthScoreText
} from "@/lib/health-score";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type { Locale } from "@/lib/i18n";
import { nutritionRefinePath } from "@/lib/nutrition-paths";
import { cx } from "@/components/nutrition-flow/ui";

function getDomainTone(score: number) {
  if (score >= 80) {
    return {
      bg: "bg-[var(--mn-mint)]",
      ring: "ring-[color-mix(in_srgb,var(--mn-teal-deep)_20%,transparent)]",
      text: "text-[var(--mn-teal-deep)]"
    };
  }

  if (score >= 50) {
    return {
      bg: "bg-[var(--mn-mint-deep)]",
      ring: "ring-[color-mix(in_srgb,var(--mn-teal)_20%,transparent)]",
      text: "text-[var(--mn-teal-deep)]"
    };
  }

  return {
    bg: "bg-red-50",
    ring: "ring-red-200",
    text: "text-red-600"
  };
}

const healthScoreChartColors = [
  "var(--mn-teal-deep)",
  "var(--mn-teal)",
  "var(--mn-gold)",
  "var(--mn-error)",
  "var(--mn-sand-deep)",
  "var(--mn-teal-light)"
];

const healthScoreDomainTones = ["blue", "green", "amber", "red", "purple", "cyan"] as const;

function polarPoint(center: number, radius: number, angleDegrees: number) {
  const angleRadians = ((angleDegrees - 90) * Math.PI) / 180;

  return {
    x: center + radius * Math.cos(angleRadians),
    y: center + radius * Math.sin(angleRadians)
  };
}

function radarPolygonPoints(
  domains: HealthScoreResult["domains"],
  center: number,
  radius: number,
  scale = 1
) {
  return domains
    .map((domain, index) => {
      const point = polarPoint(
        center,
        radius * scale * (domain.score / 100),
        (360 / domains.length) * index
      );

      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(" ");
}

function HealthScoreRadar({
  result
}: Readonly<{
  result: HealthScoreResult;
}>) {
  const size = 260;
  const center = size / 2;
  const radius = 88;
  const domainCount = Math.max(result.domains.length, 1);

  return (
    <div className="flex h-full rounded-2xl bg-[var(--mn-paper)] p-2 ring-1 ring-[var(--mn-line)] sm:p-3">
      <div className="flex flex-1 items-center justify-center">
        <svg
          aria-label="Domain shape"
          className="h-[14rem] w-full max-w-[40rem] sm:h-[17.5rem] lg:h-[16.75rem]"
          role="img"
          viewBox={`0 0 ${size} ${size}`}
        >
          {[0.25, 0.5, 0.75, 1].map((level) => (
            <polygon
              key={level}
              fill="none"
              points={radarPolygonPoints(result.domains, center, radius, level)}
              stroke="var(--mn-line)"
              strokeWidth="1.4"
            />
          ))}
          {result.domains.map((domain, index) => {
            const outer = polarPoint(
              center,
              radius,
              (360 / domainCount) * index
            );

            return (
              <line
                key={domain.id}
                stroke="var(--mn-line)"
                strokeWidth="1.4"
                x1={center}
                x2={outer.x}
                y1={center}
                y2={outer.y}
              />
            );
          })}
          <polygon
            fill="color-mix(in srgb, var(--mn-teal) 22%, transparent)"
            points={radarPolygonPoints(result.domains, center, radius)}
            stroke="var(--mn-teal)"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          {result.domains.map((domain, index) => {
            const point = polarPoint(
              center,
              radius * (domain.score / 100),
              (360 / domainCount) * index
            );

            return (
              <circle
                key={domain.id}
                cx={point.x}
                cy={point.y}
                fill={
                  healthScoreChartColors[
                    index % healthScoreChartColors.length
                  ]
                }
                r="4.5"
                stroke="#ffffff"
                strokeWidth="2"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function HealthScoreVisuals({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const labels =
    locale === "th"
      ? {
          domains: "ภาพรวม 6 ด้าน"
        }
      : {
          domains: "6-domain snapshot"
        };

  return (
    <div className="mt-5 sm:mt-6">
      <div className="rounded-2xl bg-[var(--mn-paper)] p-4 ring-1 ring-[var(--mn-line)] sm:p-6">
        <p className="text-center font-[family:var(--mn-font-mono)] text-xs font-semibold uppercase tracking-[0.12em] text-[var(--mn-ink)]">
          {labels.domains}
        </p>
        <div className="mt-4">
          <DomainSnapshot result={result} />
        </div>
      </div>
    </div>
  );
}

function DomainSnapshot({
  result
}: Readonly<{
  result: HealthScoreResult;
}>) {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {result.domains.map((domain, index) => {
          const tone = getDomainTone(domain.score);
          const domainTone =
            healthScoreDomainTones[index % healthScoreDomainTones.length];

          return (
            <div
              key={domain.id}
              className="mn-health-domain"
              data-domain-tone={domainTone}
            >
              <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
                <span className="min-w-0 font-semibold text-[var(--mn-ink)]">
                  {domain.label}
                </span>
                <span className={cx("font-semibold", tone.text)}>
                  {domain.score}
                </span>
              </div>
              <progress
                aria-label={`${domain.label} score`}
                className="mn-progress mn-progress--soft mt-2"
                max={100}
                value={domain.score}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function lowestDomainAdvice(domain: HealthScoreDomain, locale: Locale) {
  if (locale === "th") {
    return `คะแนนด้าน ${domain.label} ของคุณ (${domain.score}/100) ยังมีพื้นที่ให้ปรับปรุง ${domain.description} จุดนี้เป็นพื้นที่ที่ชัดที่สุดในการเริ่มปรับแผนสุขภาพของคุณ`;
  }

  return `Your ${domain.label} score (${domain.score}/100) has room to improve. ${domain.description} This is the clearest place to focus first.`;
}

export function localizeHealthScoreText(
  value: LocalizedHealthScoreText | undefined,
  locale: Locale
) {
  if (typeof value === "string") {
    return value;
  }

  if (!value) {
    return "";
  }

  return value[locale] || value.en || value.th || "";
}

function HealthScoreAdvice({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const lowest = [...result.domains].sort((a, b) => a.score - b.score)[0];
  const fallbackImprovement =
    (locale === "th"
      ? `${result.headline} ใช้คะแนนนี้เป็นจุดเริ่มต้น โดยรักษาด้านที่ทำได้ดีไว้ และให้ความสำคัญกับพื้นที่คะแนนต่ำสุดก่อน`
      : `${result.headline} Use this as a practical starting point: protect the areas already working well, then focus first on this lowest-scoring domain.`);
  const storedFocus = localizeHealthScoreText(
    result.advice?.focusArea,
    locale
  );
  const storedImprovement = localizeHealthScoreText(
    result.advice?.howToImprove,
    locale
  );
  const fallbackFocus = storedFocus || lowestDomainAdvice(lowest, locale);
  const fallbackHowToImprove = storedImprovement || fallbackImprovement;
  const overview =
    localizeHealthScoreText(result.advice?.overview, locale) ||
    `${fallbackFocus} ${fallbackHowToImprove}`;

  return (
    <div className="mt-5 rounded-2xl bg-[var(--mn-paper)] p-5 ring-1 ring-[var(--mn-line)] sm:mt-6 sm:p-6">
      <div className="flex gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FFF8E8]">
          <ExclamationTriangleIcon
            aria-hidden={true}
            className="size-5 text-[#D97706]"
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm leading-6 text-muted-foreground">
            {overview}
          </p>
        </div>
      </div>
    </div>
  );
}

export function HealthScorePanel({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const labels =
    locale === "th"
      ? {
          domains: "ภาพรวม 6 ด้าน",
          score: "คะแนนสุขภาพ"
        }
      : {
          domains: "6-domain snapshot",
          score: "HealthScore"
        };

  return (
    <div className="mt-10 rounded-2xl bg-[var(--mn-mint)] p-4 ring-1 ring-[var(--mn-line)] sm:p-7">
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-stretch">
        <div className="flex min-w-0 flex-col">
          <div className="mn-health-score-card">
            <p className="text-center font-[family:var(--mn-font-mono)] text-xs font-semibold uppercase tracking-[0.12em] text-[var(--mn-ink)]">
              {labels.score}
            </p>
            <div className="flex items-end justify-center gap-3">
              <span className="text-6xl font-semibold tracking-normal text-[var(--mn-ink)] sm:text-8xl">
                {result.score}
              </span>
              <span className="pb-2 text-lg font-semibold text-muted-foreground sm:pb-3 sm:text-xl">
                /100
              </span>
            </div>
            <p className="inline-flex self-center rounded-full bg-[color-mix(in_srgb,var(--mn-teal)_10%,transparent)] px-4 py-1.5 text-sm font-semibold text-[var(--mn-teal-deep)]">
              {result.band}
            </p>
          </div>
        </div>

        <HealthScoreRadar result={result} />
      </div>
      <HealthScoreVisuals locale={locale} result={result} />
      <HealthScoreAdvice locale={locale} result={result} />
    </div>
  );
}

const paymentCopy = {
  en: {
    progress: [
      ["Discover", "We understand you"],
      ["Personalise", "Your HealthScore is ready"],
      ["Reveal", "Unlock your plan"]
    ],
    heroEyebrow: "Your free assessment result",
    heroTitle(score: number) {
      return `Your HealthScore is ${score}.`;
    },
    heroAccent: "And now we know so much more.",
    heroBody:
      "We analysed your answers to prepare your Right Amount Plan. The next step turns your score pattern into specific supplement priorities, dose guidance and product direction.",
    heroPrimary: "Unlock my Right Amount Plan",
    heroSecondary: "What my plan includes",
    scoreLabel: "HealthScore",
    keyFinding: "Key finding",
    keyFindingBody:
      "The goal is not more supplements. It is a more precise plan built around what your score says is most likely to move.",
    opportunityEyebrow: "Clearest opportunity",
    opportunityTitle: "Where your plan begins",
    opportunityBody:
      "MattaNutra does not assume everyone needs the same stack. Your paid plan starts with the area most likely to improve your overall score, while protecting what is already working.",
    signalsEyebrow: "Assessment revealed",
    signalsTitle: "Three personalised signals from your answers.",
    signalsBody:
      "These are the reasons your paid plan should not look like a generic multivitamin recommendation.",
    fallbackSignals: [
      [
        "Focus the lowest-scoring domain first",
        "Your plan starts where your HealthScore shows the clearest opportunity."
      ],
      [
        "Choose precision over more pills",
        "The aim is to reduce wasted supplement spend and avoid a long generic stack."
      ],
      [
        "Make the plan specific",
        "Your formula should reflect your answers, goals, country, budget and safety context."
      ]
    ],
    includesEyebrow: "What your plan will include",
    includesTitle:
      "Your Right Amount Plan turns the score into exact next steps.",
    includesBody:
      "The free HealthScore shows the pattern. The paid plan gives the formula, dose, safety checks and purchase direction.",
    includes: [
      [
        "Your personalised formula",
        "Specific supplement priorities selected for your score, goals and questionnaire answers."
      ],
      [
        "Dose and timing guidance",
        "Clear instructions for how much to take, when to take it and how to use it consistently."
      ],
      [
        "Safety and fit checks",
        "Medication, lab, pregnancy, allergy and preference context stays visible before recommendations are made."
      ],
      [
        "Trusted product direction",
        "Product options and alternatives that reduce pharmacy-aisle confusion."
      ]
    ],
    pricingEyebrow: "Choose your level of guidance",
    pricingTitle: "Unlock the plan that matches your next step.",
    pricingBody:
      "Start with a one-time Right Amount Formula, or choose 90-Day Wellness Concierge if you want ongoing support as your routine changes.",
    preparing: "Preparing...",
    selectionError:
      "We could not start your plan. Please try again.",
    plans: [
      {
        badge: "Limited time offer",
        eyebrow: "One-time plan",
        name: "Right Amount Formula",
        description:
          "Your personalised supplement formula with precise dosing, timing and product guidance.",
        was: "THB 990",
        save: "Save 30%",
        price: "690",
        term: "one-time",
        fine: "One-time payment · Lifetime access to this plan",
        cta: "Unlock my formula",
        features: [
          "Personalised supplement formula",
          "Body-size adjusted dose ranges",
          "Timing and usage instructions",
          "Medication and lab fit checks",
          "Recommended product sources and alternatives",
          "60-day reassessment prompt"
        ],
        guarantee: "Clarity Guarantee",
        guaranteeBody:
          "If your plan does not feel clear and useful, we will make it right or refund you within 7 days."
      },
      {
        badge: "Most adaptive",
        eyebrow: "90-day support",
        name: "90-Day Wellness Concierge",
        description:
          "Ongoing support that adapts your plan to your daily life.",
        was: "THB 1,890",
        save: "Save 16%",
        price: "1,590",
        term: "for 90 days",
        fine: "Full access for 90 days · Cancel anytime",
        cta: "Start wellness concierge",
        features: [
          "Includes the Right Amount Formula",
          "Daily guidance on foods and routines",
          "Sleep, energy and habits support",
          "Supplement timing and adherence help",
          "Weekly progress summaries",
          "Priority review as your data changes"
        ],
        guarantee: "7-Day Satisfaction Guarantee",
        guaranteeBody:
          "Try the concierge support risk-free. Cancel within 7 days for a full refund."
      }
    ]
  },
  th: {
    progress: [
      ["ค้นพบ", "เราเข้าใจข้อมูลของคุณ"],
      ["ปรับให้เหมาะ", "HealthScore พร้อมแล้ว"],
      ["เปิดแผน", "ปลดล็อกแผนของคุณ"]
    ],
    heroEyebrow: "ผลประเมินฟรีของคุณ",
    heroTitle(score: number) {
      return `HealthScore ของคุณคือ ${score}`;
    },
    heroAccent: "และตอนนี้เรารู้บริบทของคุณมากขึ้น",
    heroBody:
      "เราวิเคราะห์คำตอบของคุณเพื่อเตรียม Right Amount Plan ขั้นต่อไปจะแปลงรูปแบบคะแนนเป็นลำดับความสำคัญ ปริมาณ และทิศทางผลิตภัณฑ์ที่ชัดเจน",
    heroPrimary: "ปลดล็อก Right Amount Plan",
    heroSecondary: "แผนนี้มีอะไรบ้าง",
    scoreLabel: "HealthScore",
    keyFinding: "สิ่งที่พบ",
    keyFindingBody:
      "เป้าหมายไม่ใช่การเพิ่มอาหารเสริมให้มากขึ้น แต่คือการเลือกแผนที่แม่นยำขึ้นจากสิ่งที่คะแนนของคุณบอก",
    opportunityEyebrow: "โอกาสที่ชัดที่สุด",
    opportunityTitle: "จุดเริ่มต้นของแผน",
    opportunityBody:
      "MattaNutra ไม่ได้ถือว่าทุกคนต้องใช้ชุดเดียวกัน แผนแบบชำระเงินจะเริ่มจากด้านที่มีโอกาสช่วยคะแนนรวมมากที่สุด พร้อมรักษาสิ่งที่คุณทำได้ดีอยู่แล้ว",
    signalsEyebrow: "สิ่งที่แบบประเมินบอก",
    signalsTitle: "สามสัญญาณส่วนตัวจากคำตอบของคุณ",
    signalsBody:
      "นี่คือเหตุผลที่แผนของคุณไม่ควรเป็นคำแนะนำวิตามินรวมแบบทั่วไป",
    fallbackSignals: [
      [
        "เริ่มจากด้านที่คะแนนต่ำสุด",
        "แผนจะเริ่มจากจุดที่ HealthScore แสดงโอกาสชัดที่สุด"
      ],
      [
        "เลือกความแม่นยำมากกว่าจำนวนเม็ด",
        "เป้าหมายคือเลี่ยงการซื้ออาหารเสริมที่ไม่จำเป็น"
      ],
      [
        "ทำให้แผนเฉพาะกับคุณ",
        "สูตรควรสะท้อนคำตอบ เป้าหมาย ประเทศ งบประมาณ และบริบทด้านความเหมาะสมของคุณ"
      ]
    ],
    includesEyebrow: "สิ่งที่อยู่ในแผน",
    includesTitle: "Right Amount Plan แปลงคะแนนเป็นขั้นตอนที่ชัดเจน",
    includesBody:
      "HealthScore ฟรีแสดงรูปแบบ ส่วนแผนแบบชำระเงินจะให้สูตร ปริมาณ การตรวจสอบความเหมาะสม และทิศทางการซื้อ",
    includes: [
      [
        "สูตรส่วนตัวของคุณ",
        "ลำดับความสำคัญของอาหารเสริมที่เลือกจากคะแนน เป้าหมาย และคำตอบของคุณ"
      ],
      [
        "ปริมาณและเวลาใช้",
        "คำแนะนำว่าควรใช้เท่าไร เมื่อไร และใช้อย่างไรให้สม่ำเสมอ"
      ],
      [
        "ตรวจสอบความเหมาะสม",
        "บริบทยา ผลแล็บ การตั้งครรภ์ ภูมิแพ้ และความชอบยังถูกนำมาพิจารณาก่อนแนะนำ"
      ],
      [
        "ทิศทางผลิตภัณฑ์ที่เชื่อถือได้",
        "ตัวเลือกผลิตภัณฑ์และทางเลือกที่ช่วยลดความสับสนเวลาเลือกซื้อ"
      ]
    ],
    pricingEyebrow: "เลือกระดับคำแนะนำ",
    pricingTitle: "ปลดล็อกแผนที่เหมาะกับขั้นต่อไปของคุณ",
    pricingBody:
      "เริ่มด้วย Right Amount Formula แบบครั้งเดียว หรือเลือก Wellness Concierge 90 วัน หากต้องการการสนับสนุนต่อเนื่อง",
    preparing: "กำลังเตรียม...",
    selectionError: "ไม่สามารถเริ่มแผนได้ กรุณาลองอีกครั้ง",
    plans: [
      {
        badge: "ข้อเสนอพิเศษ",
        eyebrow: "แผนครั้งเดียว",
        name: "Right Amount Formula",
        description:
          "สูตรอาหารเสริมส่วนตัว พร้อมปริมาณ เวลาใช้ และทิศทางผลิตภัณฑ์",
        was: "THB 990",
        save: "ประหยัด 30%",
        price: "690",
        term: "ครั้งเดียว",
        fine: "ชำระครั้งเดียว · เข้าถึงแผนนี้ได้ตลอด",
        cta: "ปลดล็อกสูตรของฉัน",
        features: [
          "สูตรอาหารเสริมส่วนตัว",
          "ช่วงปริมาณที่ปรับตามร่างกาย",
          "คำแนะนำเวลาและวิธีใช้",
          "ตรวจสอบความเหมาะสมกับยาและแล็บ",
          "แหล่งผลิตภัณฑ์และทางเลือก",
          "แจ้งเตือนประเมินซ้ำใน 60 วัน"
        ],
        guarantee: "รับประกันความชัดเจน",
        guaranteeBody:
          "หากแผนไม่ชัดเจนหรือไม่มีประโยชน์ เราจะปรับให้หรือคืนเงินภายใน 7 วัน"
      },
      {
        badge: "ปรับตัวได้ดีที่สุด",
        eyebrow: "ดูแล 90 วัน",
        name: "90-Day Wellness Concierge",
        description: "การสนับสนุนต่อเนื่องที่ปรับตามชีวิตประจำวันของคุณ",
        was: "THB 1,890",
        save: "ประหยัด 16%",
        price: "1,590",
        term: "90 วัน",
        fine: "เข้าถึงเต็มรูปแบบ 90 วัน · ยกเลิกได้",
        cta: "เริ่ม Wellness Concierge",
        features: [
          "รวม Right Amount Formula",
          "คำแนะนำอาหารและกิจวัตรรายวัน",
          "สนับสนุนการนอน พลังงาน และนิสัย",
          "ช่วยเรื่องเวลาใช้และความสม่ำเสมอ",
          "สรุปความคืบหน้ารายสัปดาห์",
          "ทบทวนเมื่อข้อมูลเปลี่ยน"
        ],
        guarantee: "รับประกัน 7 วัน",
        guaranteeBody:
          "ลองใช้แบบไม่มีความเสี่ยง ยกเลิกภายใน 7 วันเพื่อรับเงินคืนเต็มจำนวน"
      }
    ]
  }
} as const;

function scoreCircumference(radius: number) {
  return 2 * Math.PI * radius;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

function scoreBandTone(score: number) {
  if (score >= 80) return "Excellent start";
  if (score >= 65) return "Strong foundation";
  if (score >= 50) return "Ready to improve";
  return "Clear opportunity";
}

function planFocusItems(lowest: HealthScoreDomain, locale: Locale) {
  if (locale === "th") {
    return [
      ["รักษาสิ่งที่ทำได้ดี", "ด้านที่คะแนนสูงอยู่แล้วไม่ควรถูกทำให้ซับซ้อนเกินไป"],
      ["เริ่มจากจุดที่ชัดที่สุด", `${lowest.label} เป็นพื้นที่ที่ควรจัดลำดับก่อน`],
      ["รู้ปริมาณที่เหมาะกับคุณ", "สูตรจะใช้เป้าหมาย ความชอบ และบริบทด้านความเหมาะสมร่วมกัน"]
    ] as const;
  }

  return [
    ["Protect what is working", "Your stronger domains should not be made more complicated."],
    ["Start where it matters", `${lowest.label} is the clearest area to prioritise first.`],
    ["Know your right amount", "Your formula uses your goals, preferences and fit context together."]
  ] as const;
}

function paywallSignals(result: HealthScoreResult, locale: Locale) {
  const stored = result.advice?.paywallFeatures
    ?.map((feature) => [
      localizeHealthScoreText(feature.name, locale),
      localizeHealthScoreText(feature.description, locale)
    ] as const)
    .filter(([name, body]) => name && body)
    .slice(0, 3);

  if (stored?.length === 3) {
    return stored;
  }

  return paymentCopy[locale].fallbackSignals;
}

function ScoreSummaryCard({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const labels = paymentCopy[locale];
  const radius = 102;
  const circumference = scoreCircumference(radius);
  const score = clampScore(result.score);
  const offset = circumference * (1 - score / 100);

  return (
    <aside
      aria-label={labels.scoreLabel}
      className="rounded-[2rem] bg-[var(--mn-paper)] p-6 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)] sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.18em] text-[var(--mn-ash)]">
            {labels.scoreLabel}
          </p>
          <strong className="mt-1 block text-[var(--mn-ink)]">
            {scoreBandTone(score)}
          </strong>
        </div>
        <span className="rounded-full bg-[var(--mn-mint)] px-3 py-1 text-xs font-bold text-[var(--mn-teal-deep)]">
          {result.band}
        </span>
      </div>

      <div className="mx-auto mt-6 grid size-64 max-w-full place-items-center">
        <svg
          aria-hidden={true}
          className="col-start-1 row-start-1 size-64 -rotate-90"
          viewBox="0 0 240 240"
        >
          <defs>
            <linearGradient id="healthscore-payment-gradient" x1="0" x2="1">
              <stop offset="0" stopColor="var(--mn-gold-soft)" />
              <stop offset="0.54" stopColor="var(--mn-teal-light)" />
              <stop offset="1" stopColor="var(--mn-teal)" />
            </linearGradient>
          </defs>
          <circle
            cx="120"
            cy="120"
            fill="none"
            r={radius}
            stroke="var(--mn-cream-deep)"
            strokeWidth="14"
          />
          <circle
            cx="120"
            cy="120"
            fill="none"
            r={radius}
            stroke="url(#healthscore-payment-gradient)"
            strokeDasharray={circumference.toFixed(2)}
            strokeDashoffset={offset.toFixed(2)}
            strokeLinecap="round"
            strokeWidth="14"
          />
        </svg>
        <div className="col-start-1 row-start-1 text-center">
          <div className="font-serif text-7xl font-medium leading-none tracking-normal text-[var(--mn-ink)]">
            {result.score}
          </div>
          <div className="mn-mono-label mt-1 text-xs font-bold uppercase tracking-[0.1em] text-[var(--mn-ash)]">
            /100
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {result.domains.map((domain) => (
          <div
            className="grid grid-cols-[minmax(7.5rem,0.85fr)_1fr_2rem] items-center gap-3 text-xs font-bold text-[var(--mn-ink-soft)]"
            key={domain.id}
          >
            <span>{domain.label}</span>
            <progress
              aria-label={`${domain.label} score`}
              className="mn-progress mn-progress--soft"
              max={100}
              value={domain.score}
            />
            <span className="mn-mono-label text-right text-[0.7rem] text-[var(--mn-ink)]">
              {domain.score}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-[var(--mn-radius-md)] bg-[var(--mn-gold-tint)] p-4 text-sm leading-6 text-[#6d5427]">
        <strong>{labels.keyFinding}:</strong> {labels.keyFindingBody}
      </div>
    </aside>
  );
}

function HealthScorePaymentProgress({ locale }: Readonly<{ locale: Locale }>) {
  const labels = paymentCopy[locale];

  return (
    <div
      aria-label="Assessment progress"
      className="grid overflow-hidden rounded-[var(--mn-radius-md)] bg-[var(--mn-paper)] ring-1 ring-[var(--mn-line)] md:grid-cols-3"
    >
      {labels.progress.map(([title, body], index) => {
        const done = index === 0;
        const active = index === 1;

        return (
          <div
            className={cx(
              "flex items-center gap-3 p-4 md:p-5",
              active ? "bg-[var(--mn-mint)]" : ""
            )}
            key={title}
          >
            <span
              className={cx(
                "grid size-9 shrink-0 place-items-center rounded-full border text-xs font-bold",
                done
                  ? "border-[var(--mn-teal)] bg-[var(--mn-teal)] text-white"
                  : active
                    ? "border-[var(--mn-teal)] bg-white text-[var(--mn-teal-deep)]"
                    : "border-[var(--mn-line)] bg-white text-[var(--mn-ash)]"
              )}
            >
              {done ? "✓" : `0${index + 1}`}
            </span>
            <span>
              <strong className="block text-sm text-[var(--mn-ink)]">
                {title}
              </strong>
              <span className="block text-xs text-[var(--mn-ash)]">
                {body}
              </span>
            </span>
          </div>
        );
      })}
    </div>
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
  plan: (typeof paymentCopy.en.plans)[number] | (typeof paymentCopy.th.plans)[number];
}>) {
  return (
    <article
      className={cx(
        "relative flex flex-col rounded-[1.75rem] p-6 ring-1 sm:p-8",
        featured
          ? "bg-[var(--mn-ink)] text-white ring-[color-mix(in_srgb,var(--mn-teal-light)_60%,transparent)]"
          : "bg-[var(--mn-paper)] text-[var(--mn-ink)] ring-[var(--mn-line)]"
      )}
    >
      <span
        className={cx(
          "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full px-4 py-2 text-center text-[0.65rem] font-bold uppercase tracking-[0.16em]",
          featured
            ? "bg-[var(--mn-gold)] text-white"
            : "bg-[var(--mn-gold-tint)] text-[var(--mn-gold)]"
        )}
      >
        {plan.badge}
      </span>
      <p
        className={cx(
          "mn-mono-label mt-4 text-xs font-bold uppercase tracking-[0.16em]",
          featured ? "text-[var(--mn-teal-light)]" : "text-[var(--mn-teal-deep)]"
        )}
      >
        {plan.eyebrow}
      </p>
      <h3 className="mt-3 font-serif text-3xl font-medium leading-tight">
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
        <p
          className={cx(
            "text-sm",
            featured ? "text-white/55" : "text-[var(--mn-ash)]"
          )}
        >
          <s>{plan.was}</s>{" "}
          <span
            className={cx(
              "font-bold uppercase",
              featured ? "text-[var(--mn-gold-soft)]" : "text-[var(--mn-gold)]"
            )}
          >
            {plan.save}
          </span>
        </p>
        <p className="mt-2 flex flex-wrap items-end gap-2">
          <span
            className={cx(
              "pb-2 text-sm font-bold",
              featured ? "text-[var(--mn-teal-light)]" : "text-[var(--mn-teal-deep)]"
            )}
          >
            THB
          </span>
          <strong className="font-serif text-6xl font-medium leading-none tracking-normal">
            {plan.price}
          </strong>
          <span
            className={cx(
              "mn-mono-label pb-2 text-xs font-bold uppercase tracking-[0.12em]",
              featured ? "text-[var(--mn-teal-light)]" : "text-[var(--mn-teal-deep)]"
            )}
          >
            {plan.term}
          </span>
        </p>
        <p
          className={cx(
            "mt-2 text-xs",
            featured ? "text-white/55" : "text-[var(--mn-ash)]"
          )}
        >
          {plan.fine}
        </p>
      </div>
      <button
        className={cx(
          "inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold uppercase tracking-[0.08em]",
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
        {isPending ? null : (
          <ArrowRightIcon aria-hidden={true} className="size-4" />
        )}
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
          "mt-auto grid grid-cols-[2.5rem_1fr] gap-3 rounded-[var(--mn-radius-md)] p-4 text-sm leading-6",
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
          <strong
            className={cx(
              "block",
              featured ? "text-white" : "text-[var(--mn-ink)]"
            )}
          >
            {plan.guarantee}
          </strong>
          <p>{plan.guaranteeBody}</p>
        </div>
      </div>
    </article>
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
  const router = useRouter();
  const labels = paymentCopy[locale];
  const [pendingPlan, setPendingPlan] = useState<AssessmentPlan | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const lowest = [...result.domains].sort((a, b) => a.score - b.score)[0];
  const signals = paywallSignals(result, locale);
  const focusItems = planFocusItems(lowest, locale);
  const unlockHref = planId ? nutritionRefinePath(locale, planId) : "#pricing";
  const paywallTitle =
    localizeHealthScoreText(result.advice?.paywallTitle, locale) ||
    labels.signalsTitle;
  const paywallSubtitle =
    localizeHealthScoreText(result.advice?.paywallSubtitle, locale) ||
    labels.signalsBody;

  async function startPlan(plan: AssessmentPlan) {
    if (!planId || pendingPlan) {
      return;
    }

    setSelectionError("");
    setPendingPlan(plan);

    try {
      const response = await fetch(`/api/assessment/${encodeURIComponent(planId)}`, {
        body: JSON.stringify({
          intent: "process",
          locale,
          plan
        }),
        cache: "no-store",
        headers: {
          "content-type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        throw new Error("Unable to start plan");
      }

      router.push(nutritionRefinePath(locale, planId));
    } catch {
      setPendingPlan(null);
      setSelectionError(labels.selectionError);
    }
  }

  return (
    <section className="space-y-16">
      <header className="space-y-10">
        <HealthScorePaymentProgress locale={locale} />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.82fr)] lg:items-center">
          <div>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
              {labels.heroEyebrow}
            </p>
            <h1 className="mt-5 font-serif text-5xl font-medium leading-[1.04] tracking-normal text-[var(--mn-ink)] text-balance sm:text-6xl lg:text-7xl">
              {labels.heroTitle(result.score)}{" "}
              <span className="italic text-[var(--mn-teal-deep)]">
                {labels.heroAccent}
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--mn-ink-soft)]">
              {labels.heroBody}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link className="mn-primary-button" href="#pricing">
                {labels.heroPrimary}
                <ArrowRightIcon aria-hidden={true} className="size-4" />
              </Link>
              <Link className="mn-secondary-button" href="#includes">
                {labels.heroSecondary}
              </Link>
            </div>
          </div>
          <ScoreSummaryCard locale={locale} result={result} />
        </div>
      </header>

      <section className="rounded-[2rem] bg-[var(--mn-paper)] p-5 ring-1 ring-[var(--mn-line)] sm:p-6 lg:grid lg:grid-cols-[0.9fr_1.1fr] lg:gap-6">
        <div className="rounded-[1.5rem] bg-[var(--mn-ink)] p-7 text-white">
          <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.18em] text-[var(--mn-gold-soft)]">
            {labels.opportunityEyebrow}
          </p>
          <div className="mt-8 font-serif text-7xl font-medium leading-none tracking-normal">
            {lowest.score}
            <span className="text-2xl text-white/55">/100</span>
          </div>
          <h2 className="mt-6 text-3xl font-medium">{lowest.label}</h2>
          <p className="mt-3 text-sm leading-6 text-white/70">
            {lowest.description}
          </p>
        </div>
        <div className="p-2 pt-7 lg:p-7">
          <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.18em] text-[var(--mn-teal-deep)]">
            {labels.opportunityTitle}
          </p>
          <h2 className="mt-3 font-serif text-3xl font-medium leading-tight text-[var(--mn-ink)] sm:text-4xl">
            {paywallTitle}
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--mn-ink-soft)]">
            {paywallSubtitle}
          </p>
          <div className="mt-6 grid gap-3">
            {focusItems.map(([title, body]) => (
              <div
                className="flex gap-3 rounded-[var(--mn-radius-md)] bg-[var(--mn-mint)] p-4 text-sm leading-6 text-[var(--mn-ink-soft)]"
                key={title}
              >
                <CheckCircleIcon
                  aria-hidden={true}
                  className="mt-0.5 size-5 shrink-0 text-[var(--mn-teal)]"
                />
                <span>
                  <strong className="text-[var(--mn-teal-deep)]">
                    {title}
                  </strong>{" "}
                  {body}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
          <div>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.18em] text-[var(--mn-teal-deep)]">
              {labels.signalsEyebrow}
            </p>
            <h2 className="mt-3 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)]">
              {labels.signalsTitle}
            </h2>
          </div>
          <p className="text-lg leading-8 text-[var(--mn-ink-soft)]">
            {labels.signalsBody}
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {signals.map(([title, body], index) => (
            <article
              className="rounded-[1.5rem] bg-[var(--mn-paper)] p-6 ring-1 ring-[var(--mn-line)]"
              key={title}
            >
              <div
                className={cx(
                  "grid size-12 place-items-center rounded-[var(--mn-radius-md)]",
                  index === 1
                    ? "bg-[var(--mn-gold-tint)] text-[var(--mn-gold)]"
                    : "bg-[var(--mn-mint)] text-[var(--mn-teal-deep)]"
                )}
              >
                <SparklesIcon aria-hidden={true} className="size-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold leading-snug text-[var(--mn-ink)]">
                {title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[var(--mn-ink-soft)]">
                {body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="rounded-[2rem] bg-[var(--mn-sand-soft)] px-5 py-10 ring-1 ring-[var(--mn-sand-deep)] sm:px-8"
        id="includes"
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.18em] text-[var(--mn-teal-deep)]">
            {labels.includesEyebrow}
          </p>
          <h2 className="mt-3 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)]">
            {labels.includesTitle}
          </h2>
          <p className="mt-4 text-lg leading-8 text-[var(--mn-ink-soft)]">
            {labels.includesBody}
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {labels.includes.map(([title, body], index) => (
            <article
              className={cx(
                "rounded-[1.5rem] p-6 ring-1",
                index === 0
                  ? "bg-[var(--mn-ink)] text-white ring-white/10"
                  : "bg-[var(--mn-paper)] text-[var(--mn-ink)] ring-[var(--mn-line)]"
              )}
              key={title}
            >
              <div
                className={cx(
                  "grid size-11 place-items-center rounded-[var(--mn-radius-md)]",
                  index === 0
                    ? "bg-white/10 text-[var(--mn-gold-soft)]"
                    : "bg-[var(--mn-mint)] text-[var(--mn-teal-deep)]"
                )}
              >
                {index === 2 ? (
                  <ShieldCheckIcon aria-hidden={true} className="size-5" />
                ) : index === 3 ? (
                  <LockClosedIcon aria-hidden={true} className="size-5" />
                ) : (
                  <SparklesIcon aria-hidden={true} className="size-5" />
                )}
              </div>
              <h3 className="mt-5 text-xl font-semibold leading-snug">
                {title}
              </h3>
              <p
                className={cx(
                  "mt-3 text-sm leading-6",
                  index === 0 ? "text-white/75" : "text-[var(--mn-ink-soft)]"
                )}
              >
                {body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.18em] text-[var(--mn-teal-deep)]">
            {labels.pricingEyebrow}
          </p>
          <h2 className="mt-3 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)]">
            {labels.pricingTitle}
          </h2>
          <p className="mt-4 text-lg leading-8 text-[var(--mn-ink-soft)]">
            {labels.pricingBody}
          </p>
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {labels.plans.map((plan, index) => (
            <PriceCard
              disabled={!planId || Boolean(pendingPlan)}
              featured={index === 1}
              isPending={
                (index === 0 && pendingPlan === "precision") ||
                (index === 1 && pendingPlan === "pro")
              }
              key={plan.name}
              onSelect={() => void startPlan(index === 0 ? "precision" : "pro")}
              pendingLabel={labels.preparing}
              plan={plan}
            />
          ))}
        </div>
        {selectionError ? (
          <p className="mt-4 text-center text-sm font-semibold text-[var(--mn-error)]">
            {selectionError}
          </p>
        ) : null}
        {!planId ? (
          <p className="mt-4 text-center text-sm text-[var(--mn-ash)]">
            <Link className="font-semibold text-[var(--mn-teal-deep)]" href={unlockHref}>
              {labels.heroPrimary}
            </Link>
          </p>
        ) : null}
      </section>
    </section>
  );
}
