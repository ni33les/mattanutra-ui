"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import type {
  HealthScoreDomain,
  HealthScoreResult,
  LocalizedHealthScoreText
} from "@/lib/health-score";
import type { Locale } from "@/lib/i18n";
import { cx } from "@/components/nutrition-flow/ui";

function getDomainTone(score: number) {
  if (score >= 80) {
    return {
      bar: "bg-[#3A7BD5]",
      bg: "bg-[#EAF5FF]",
      ring: "ring-[#3A7BD5]/20",
      text: "text-[#2563EB]"
    };
  }

  if (score >= 50) {
    return {
      bar: "bg-[#1FA77A]",
      bg: "bg-[#EFFBF5]",
      ring: "ring-[#1FA77A]/20",
      text: "text-[#126b4f]"
    };
  }

  return {
    bar: "bg-red-500",
    bg: "bg-red-50",
    ring: "ring-red-200",
    text: "text-red-600"
  };
}

const healthScoreChartColors = [
  "#3A7BD5",
  "#1FA77A",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4"
];

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
    <div className="flex h-full rounded-2xl bg-white p-2 ring-1 ring-[#3A7BD5]/10 sm:p-3">
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
              stroke="#B9D3EE"
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
                stroke="#B9D3EE"
                strokeWidth="1.4"
                x1={center}
                x2={outer.x}
                y1={center}
                y2={outer.y}
              />
            );
          })}
          <polygon
            fill="rgba(31, 167, 122, 0.22)"
            points={radarPolygonPoints(result.domains, center, radius)}
            stroke="#1FA77A"
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
      <div className="rounded-2xl bg-white p-4 ring-1 ring-[#3A7BD5]/10 sm:p-6">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#20343A]">
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
          const accent =
            healthScoreChartColors[index % healthScoreChartColors.length];

          return (
            <div
              key={domain.id}
              className="min-w-0 rounded-xl border p-3"
              style={{
                backgroundColor: `${accent}14`,
                borderColor: `${accent}33`
              }}
            >
              <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
                <span className="min-w-0 font-semibold text-[#20343A]">
                  {domain.label}
                </span>
                <span className={cx("font-semibold", tone.text)}>
                  {domain.score}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80">
                <div
                  className={cx("h-full rounded-full", tone.bar)}
                  style={{ width: `${domain.score}%` }}
                />
              </div>
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
    <div className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-[#3A7BD5]/10 sm:mt-6 sm:p-6">
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
    <div className="mt-10 rounded-2xl bg-[#F7FAFD] p-4 ring-1 ring-[#3A7BD5]/10 sm:p-7">
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-stretch">
        <div className="flex min-w-0 flex-col">
          <div className="flex h-full min-h-[14rem] flex-col justify-between rounded-2xl bg-white p-5 text-center ring-1 ring-[#3A7BD5]/10 sm:min-h-0 sm:p-8">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#20343A]">
              {labels.score}
            </p>
            <div className="flex items-end justify-center gap-3">
              <span className="text-6xl font-semibold tracking-normal text-[#20343A] sm:text-8xl">
                {result.score}
              </span>
              <span className="pb-2 text-lg font-semibold text-muted-foreground sm:pb-3 sm:text-xl">
                /100
              </span>
            </div>
            <p className="inline-flex self-center rounded-full bg-[#1FA77A]/10 px-4 py-1.5 text-sm font-semibold text-[#126b4f]">
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

