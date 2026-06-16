"use client";

import Image from "next/image";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import {
  DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT,
  type HealthScoreGapCard,
  type HealthScoreMethodCard,
  type HealthScorePageAiCard,
  type HealthScoreResult,
  type LocalizedHealthScoreText,
} from "@/lib/health-score";
import type { Locale } from "@/lib/i18n";
import {
  pageCopy,
  type HealthScorePageCopy,
  type PricePlan,
} from "@/components/nutrition-flow/healthscore-panel-copy";
import { paymentCheckoutPath } from "@/lib/payment-paths";
import { cx } from "@/components/nutrition-flow/ui";

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
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
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
      { rootMargin: margin, threshold: 0.1 },
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
  delay = 0,
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
        "reveal",
        delay === 1 && "d1",
        delay === 2 && "d2",
        delay === 3 && "d3",
        delay === 4 && "d4",
        visible && "in",
        className,
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
  value,
}: Readonly<{
  active?: boolean;
  className?: string;
  duration?: number;
  value: number;
}>) {
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reducedMotion || !active) {
      return undefined;
    }

    let frame = 0;
    let startedAt: number | null = null;

    function tick(now: number) {
      if (startedAt === null) {
        startedAt = now;
        setDisplay(0);
      }

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

  return (
    <span className={className}>
      {reducedMotion || !active ? value : display}
    </span>
  );
}

function renderInlineMarkup(value: string) {
  const pieces = value.split(/(<\/?(?:b|em)>)/gi);
  const active: Array<"b" | "em"> = [];
  const nodes: ReactNode[] = [];

  pieces.forEach((piece, index) => {
    const tag = piece.toLowerCase();

    if (tag === "<b>" || tag === "<em>") {
      active.push(tag.slice(1, -1) as "b" | "em");
      return;
    }

    if (tag === "</b>" || tag === "</em>") {
      const closing = tag.slice(2, -1);
      const activeIndex = active.lastIndexOf(closing as "b" | "em");

      if (activeIndex >= 0) {
        active.splice(activeIndex, 1);
      }
      return;
    }

    if (!piece) {
      return;
    }

    const key = `${index}-${piece}`;
    const current = active.at(-1);

    if (current === "b") {
      nodes.push(<b key={key}>{piece}</b>);
      return;
    }

    if (current === "em") {
      nodes.push(<em key={key}>{piece}</em>);
      return;
    }

    nodes.push(piece);
  });

  return nodes;
}

const thaiScriptPattern = /[\u0E00-\u0E7F]/;
const cjkScriptPattern = /[\u3400-\u9FFF]/;

function textFitsLocale(value: string, locale: Locale) {
  const hasThai = thaiScriptPattern.test(value);
  const hasCjk = cjkScriptPattern.test(value);

  if (locale === "th") {
    return hasThai;
  }

  if (locale === "zh-CN") {
    return hasCjk;
  }

  return !hasThai && !hasCjk;
}

function localizedLegacyText(
  value: string | null | undefined,
  locale: Locale,
  fallback = "",
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
  fallback = "",
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
  locale: Locale,
) {
  return localize(value, locale);
}

function aiCardBody(
  card: HealthScorePageAiCard | undefined,
  locale: Locale,
  fallback: string,
) {
  return localize(card?.body, locale, fallback);
}

function displayBand(band: string, locale: Locale) {
  const labels = pageCopy[locale].bandLabels;
  const normalized = band
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    labels[band as keyof typeof labels] ??
    labels[normalized as keyof typeof labels] ??
    band
  );
}

function displayPillarLabel(
  pillar: ReturnType<typeof normalizedPillars>[number],
  locale: Locale,
) {
  const labels = pageCopy[locale].pillarLabels;

  return (
    labels[pillar.id as keyof typeof labels] ??
    localizedLegacyText(pillar.label, locale)
  );
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
      fillClass: domain.score >= 50 ? "hi" as const : "lo" as const,
      goalLinked: false,
      id: domain.id,
      isHero: false,
      label: domain.label,
      tag: null,
      value: domain.score,
    }))
  );
}

function fallbackGapCards(
  result: HealthScoreResult,
  locale: Locale,
): HealthScoreGapCard[] {
  const lowest = lowestDomain(result);
  const cards: HealthScoreGapCard[] = pageCopy[locale].fallbackGaps.map(
    (card) => ({
      ...card,
    }),
  );

  if (lowest) {
    cards[0] = {
      body: lowest.description || cards[0].body,
      headline: lowest.label,
      tag: cards[0].tag,
      value: `${lowest.score}`,
    };
  }

  return cards;
}

function gapCards(result: HealthScoreResult, locale: Locale) {
  const seeds =
    result.pageContent?.copySeeds.gapTrio ?? fallbackGapCards(result, locale);

  return seeds.slice(0, 3);
}

function methodCards(
  result: HealthScoreResult,
  locale: Locale,
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
      icon: "spark",
    },
  ];
}

type HealthScoreViewModel = Readonly<{
  bandLine: string;
  bandPill: string;
  copy: HealthScorePageCopy;
  findings: ReturnType<typeof findings>;
  findingsEyebrow: string;
  findingsHeadline: string;
  findingsSub: string;
  firstName?: string;
  gapCards: HealthScoreGapCard[];
  heroBody: string;
  heroTitle: string;
  highestLeverageBody: string;
  locale: Locale;
  median: number;
  methodCards: HealthScoreMethodCard[];
  methodHeadline: string;
  opportunityPill: string;
  pillarHeadline: string;
  pillars: ReturnType<typeof normalizedPillars>;
  percentile: number;
  relativityHeadline: string;
  relativitySub: string;
  result: HealthScoreResult;
  score: number;
  spectrum: Readonly<{
    gapLeft: number;
    gapWidth: number;
    legendCaptions: readonly [string, string, string];
    medianMarker: number;
    scoreMarker: number;
  }>;
  strengthNote: string;
  subtraction: Readonly<{
    body: string;
    labels: readonly [string, string, string];
    numbers: readonly [number, number, number];
  }>;
}>;

function buildHealthScoreViewModel({
  firstName,
  locale,
  result,
}: Readonly<{
  firstName?: string;
  locale: Locale;
  result: HealthScoreResult;
}>): HealthScoreViewModel {
  const copy = pageCopy[locale];
  const page = result.pageContent;
  const ai = page?.aiCopy;
  const score = page?.locked.score ?? result.score;
  const median = page?.locked.median ?? page?.copySeeds.relativity.spectrumMedian ?? 60;
  const percentile = page?.locked.percentile ?? 0;
  const relativity = page?.copySeeds.relativity;
  const subtraction = page?.locked.subtraction ?? {
    chosen: 8,
    evaluated: DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT,
    mode: "nutrients" as const,
    setAside: DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT - 8,
  };
  const subtractionSeed = page?.copySeeds.subtraction;
  const scoreMarker = relativity?.spectrumYouPct ?? scorePosition(score);
  const medianMarker = relativity?.spectrumMedianPct ?? scorePosition(median);

  return {
    bandLine: localizedLegacyText(
      page?.copySeeds.bandLine,
      locale,
      copy.defaultBandLine,
    ),
    bandPill: localizedLegacyText(
      page?.copySeeds.bandPill,
      locale,
      displayBand(result.band, locale),
    ),
    copy,
    findings: findings(result, locale),
    findingsEyebrow:
      page?.copySeeds.findingsMode === "strengths"
        ? copy.pillarsEyebrow
        : copy.whatCaught,
    findingsHeadline: localizedLegacyText(
      page?.copySeeds.findingsHeadline,
      locale,
      copy.gapTitle,
    ),
    findingsSub: localizedLegacyText(
      page?.copySeeds.findingsSub,
      locale,
      copy.whatCaughtSub,
    ),
    firstName,
    gapCards: gapCards(result, locale),
    heroBody: localize(
      ai?.heroBody,
      locale,
      localizedLegacyText(
        page?.copySeeds.heroBody ?? result.summary,
        locale,
        copy.defaultHeroBody,
      ),
    ),
    heroTitle: localizedLegacyText(
      page?.copySeeds.goalMirror,
      locale,
      copy.heroTitle(score),
    ),
    highestLeverageBody: localizedLegacyText(
      page?.copySeeds.highestLeverage?.text,
      locale,
      "",
    ),
    locale,
    median,
    methodCards: methodCards(result, locale),
    methodHeadline: localizedLegacyText(
      page?.copySeeds.methodHeadline,
      locale,
      copy.methodTitle,
    ),
    opportunityPill: localizedLegacyText(
      page?.copySeeds.opportunityPill,
      locale,
      percentile >= 80 ? copy.topTier : copy.pillOpportunity,
    ),
    pillarHeadline: localizedLegacyText(
      page?.copySeeds.pillarHeadline,
      locale,
      copy.pillarsTitle,
    ),
    pillars: normalizedPillars(result),
    percentile,
    relativityHeadline: localizedLegacyText(
      relativity?.headline,
      locale,
      copy.fallbackScoreMeaning(score, percentile),
    ),
    relativitySub: localize(
      ai?.relativitySub,
      locale,
      localizedLegacyText(relativity?.sub, locale, copy.fallbackScoreMeaningSub),
    ),
    result,
    score,
    spectrum: {
      gapLeft: relativity?.spectrumGapLeftPct ?? Math.min(scoreMarker, medianMarker),
      gapWidth:
        relativity?.spectrumGapWidthPct ?? Math.abs(scoreMarker - medianMarker),
      legendCaptions: relativity?.legendCaptions ?? [
        copy.spectrumWhere,
        score >= median ? copy.spectrumGapAhead : copy.spectrumGapBehind,
        copy.spectrumHeadroom,
      ],
      medianMarker,
      scoreMarker,
    },
    strengthNote: localizedLegacyText(
      page?.copySeeds.strengthNote,
      locale,
      "",
    ),
    subtraction: {
      body: localizedLegacyText(
        subtractionSeed?.body,
        locale,
        copy.subtractionTitle,
      ),
      labels: [
        localizedLegacyText(
          subtractionSeed?.labelEvaluated,
          locale,
          copy.evaluatedFallback,
        ),
        localizedLegacyText(
          subtractionSeed?.labelSetAside,
          locale,
          copy.setAsideFallback,
        ),
        localizedLegacyText(
          subtractionSeed?.labelChosen,
          locale,
          copy.chosenFallback,
        ),
      ],
      numbers: [
        subtraction.evaluated,
        subtraction.setAside,
        subtraction.chosen,
      ],
    },
  };
}

function ScoreSpectrum({
  model,
}: Readonly<{
  model: HealthScoreViewModel;
}>) {
  const { copy, median, score, spectrum } = model;
  const { ref, visible } = useInViewOnce<HTMLDivElement>();
  const ahead = score >= median;
  const medianMarkerElement = (
    <div
      className="marker med"
      style={{ left: `${spectrum.medianMarker}%` }}
    >
      <span className="cap bot">
        {copy.spectrumTypical} · {median}
      </span>
    </div>
  );
  const scoreMarkerElement = (
    <div
      className="marker you"
      style={{ left: `${spectrum.scoreMarker}%` }}
    >
      <span className="cap top">
        {copy.spectrumYou} · {score}
      </span>
    </div>
  );

  return (
    <div className="spectrum" ref={ref}>
      <div className="spec-track">
        <div className="spec-bar" />
        <div className="spec-grow">{copy.spectrumHeadroom}</div>
        {spectrum.gapWidth > 0 ? (
          <div
            aria-hidden={true}
            className="spec-gap"
            style={{ left: `${spectrum.gapLeft}%`, width: `${spectrum.gapWidth}%` }}
          />
        ) : null}
        <div
          aria-hidden={true}
          className="spec-fill"
          style={{ width: visible ? `${spectrum.scoreMarker}%` : 0 }}
        />
        {ahead ? medianMarkerElement : scoreMarkerElement}
        {ahead ? scoreMarkerElement : medianMarkerElement}
      </div>
      <div className="spec-ends">
        <span>{copy.spectrumStart}</span>
        <span>{copy.spectrumEnd}</span>
      </div>
      <div className="spec-legend">
        <span className="inline-flex items-center gap-1.5">
          <span className="lg-sw bg-[var(--mn-teal-deep)]" />
          {spectrum.legendCaptions[0]}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="lg-sw border border-dashed border-[var(--mn-teal)] bg-[color-mix(in_srgb,var(--mn-teal)_10%,transparent)]" />
          {spectrum.legendCaptions[1]}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="lg-sw bg-[linear-gradient(90deg,var(--mn-teal-glow),transparent)]" />
          {spectrum.legendCaptions[2]}
        </span>
      </div>
    </div>
  );
}

function HealthScoreHero({
  model,
}: Readonly<{
  model: HealthScoreViewModel;
}>) {
  const {
    bandLine,
    bandPill,
    copy,
    firstName,
    heroBody,
    heroTitle,
    locale,
    opportunityPill,
    score,
  } = model;
  const { ref: scoreRef, visible: scoreVisible } =
    useInViewOnce<HTMLDivElement>();
  const headline = firstName
    ? locale === "en"
      ? heroTitle.replace(/^You\b/, "you")
      : heroTitle
    : heroTitle;

  return (
    <header className="hero wrap">
      <RevealBlock>
        <span className="eyebrow">
          {copy.assessmentComplete}
        </span>
      </RevealBlock>
      <RevealBlock delay={1}>
        <h1
          className={cx(
            "goalmirror",
            locale === "en" ? "text-balance" : "break-words",
          )}
        >
          {firstName ? `${firstName}, ` : null}
          {renderInlineMarkup(headline)}
        </h1>
      </RevealBlock>
      <RevealBlock delay={2}>
        <p className={cx("hero-sub", copy.bodyClass)}>
          {renderInlineMarkup(heroBody)}
        </p>
      </RevealBlock>

      <RevealBlock delay={3}>
        <aside
          className="scorecard"
          ref={scoreRef}
        >
          <div className="score-top">
            <span className="band-pill">
              {bandPill}
            </span>
            <span className="opp-pill">
              {opportunityPill}
            </span>
          </div>

          <div className="bignum">
            <CountUpNumber
              active={scoreVisible}
              duration={1100}
              value={score}
            />
            <span className="of">
              {copy.scoreOutOf}
            </span>
          </div>

          <p className={cx("scoreline", copy.bodyClass)}>
            {renderInlineMarkup(bandLine)}
          </p>

          <ScoreSpectrum model={model} />
        </aside>
      </RevealBlock>
    </header>
  );
}

function GapCards({
  model,
}: Readonly<{
  model: HealthScoreViewModel;
}>) {
  const {
    copy,
    gapCards: cards,
    locale,
    relativityHeadline,
    relativitySub,
    result,
    score,
  } = model;
  const ai = result.pageContent?.aiCopy;

  return (
    <section className="wrap" id="signals">
      <RevealBlock className="sec-head">
        <p className="eyebrow">
          {copy.scoreMeaningEyebrow(score)}
        </p>
        <h2 className={locale === "en" ? "text-balance" : ""}>
          {renderInlineMarkup(relativityHeadline)}
        </h2>
        <p className={copy.bodyClass}>
          {renderInlineMarkup(relativitySub)}
        </p>
      </RevealBlock>
      <div className="gaprow">
        {cards.map((card, index) => {
          const aiCard = ai?.gapTrio?.[index];
          const fallbackCard = copy.fallbackGaps[index] ?? card;
          const tag = localizedLegacyText(card.tag, locale, fallbackCard.tag);

          return (
            <RevealBlock
              delay={(index + 1) as 1 | 2 | 3}
              key={`${card.tag}-${card.value}-${index}`}
            >
              <article className="gapcard">
                <span className="gn">
                  {tag}
                </span>
                <div className="gpct">
                  {card.value}
                </div>
                <h3>
                  {renderInlineMarkup(localizedLegacyText(
                    card.headline,
                    locale,
                    fallbackCard.headline,
                  ))}
                </h3>
                <p className={copy.bodyClass}>
                  {renderInlineMarkup(aiCardBody(
                    aiCard,
                    locale,
                    localizedLegacyText(card.body, locale, fallbackCard.body),
                  ))}
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
  model,
}: Readonly<{
  model: HealthScoreViewModel;
}>) {
  const {
    copy,
    highestLeverageBody,
    locale,
    pillarHeadline,
    pillars,
    strengthNote,
  } = model;
  const { ref, visible } = useInViewOnce<HTMLDivElement>();

  return (
    <section className="wrap">
      <RevealBlock className="sec-head">
        <p className="eyebrow">
          {copy.pillarEyebrow}
        </p>
        <h2 className={locale === "en" ? "text-balance" : ""}>
          {renderInlineMarkup(pillarHeadline)}
        </h2>
      </RevealBlock>

      <RevealBlock delay={1}>
        <div
          className="pillars"
          ref={ref}
        >
          {pillars.map((pillar) =>
            (() => {
              const pillarTag = displayPillarTag(pillar.tag, locale);

              return (
                <div
                  className={cx(
                    "prow",
                    pillar.isHero && "hero",
                  )}
                  key={pillar.id}
                >
                  <div className="pname">
                    <h3>
                      {displayPillarLabel(pillar, locale)}
                      {pillarTag ? (
                        <span className="gtag">
                          {copy.goalLinkedLabel} · {pillarTag}
                        </span>
                      ) : null}
                    </h3>
                  </div>
                  <div className="ptrack">
                    <div
                      className={cx("pfill", pillar.fillClass)}
                      style={{ width: visible ? `${clamp(pillar.value)}%` : 0 }}
                    />
                  </div>
                  <span className="pval">
                    {pillar.value}%
                  </span>
                </div>
              );
            })(),
          )}
          {highestLeverageBody ? (
            <div className="leverbox">
              <p className={copy.bodyClass}>
                {renderInlineMarkup(highestLeverageBody)}
              </p>
            </div>
          ) : null}
          {strengthNote ? (
            <p
              className={cx(
                "notebox",
                copy.bodyClass,
              )}
            >
              {renderInlineMarkup(strengthNote)}
            </p>
          ) : null}
        </div>
      </RevealBlock>
    </section>
  );
}

function FindingsSection({
  model,
}: Readonly<{
  model: HealthScoreViewModel;
}>) {
  const {
    copy,
    findings: items,
    findingsEyebrow,
    findingsHeadline,
    findingsSub,
    locale,
    result,
  } = model;
  const ai = result.pageContent?.aiCopy;

  return (
    <section className="wrap">
      <RevealBlock className="sec-head">
        <p className="eyebrow">
          {findingsEyebrow}
        </p>
        <h2 className={locale === "en" ? "text-balance" : ""}>
          {renderInlineMarkup(findingsHeadline)}
        </h2>
        <p className={copy.bodyClass}>
          {renderInlineMarkup(findingsSub)}
        </p>
      </RevealBlock>
      <div className="finds">
        {items.map((item, index) => {
          const aiCard = ai?.findings?.[index];
          const isSingle = items.length === 1;
          const fallbackCard = copy.fallbackGaps[index] ?? {
            body: copy.fallbackFindingBody,
            headline: copy.fallbackFindingTitle,
          };

          return (
            <RevealBlock
              className={isSingle ? "mn-hs-find-single" : ""}
              delay={(index + 1) as 1 | 2 | 3}
              key={`${item.code}-${index}`}
            >
              <article
                className={cx(
                  "find",
                  index === 0 && "open",
                )}
              >
                <div className="fic">
                  {item.icon === "sun" ? "☼" : item.icon === "◎" ? "◎" : "✦"}
                </div>
                <h3>
                  {renderInlineMarkup(localizedLegacyText(
                    item.headline,
                    locale,
                    fallbackCard.headline,
                  ))}
                </h3>
                <p className={copy.bodyClass}>
                  {renderInlineMarkup(aiCardBody(
                    aiCard,
                    locale,
                    localizedLegacyText(item.body, locale, fallbackCard.body),
                  ))}
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
  model,
}: Readonly<{
  model: HealthScoreViewModel;
}>) {
  const { copy, locale, subtraction } = model;
  const { ref, visible } = useInViewOnce<HTMLDivElement>();

  return (
    <section className="wrap mn-hs-shortlist-section">
      <RevealBlock>
        <div
          className="subtract"
          ref={ref}
        >
          <p className="eyebrow">
            {copy.subtractionEyebrow}
          </p>
          <div className="subnums">
            {subtraction.numbers.map((number, index) => (
              <div
                className="contents"
                key={`${subtraction.labels[index]}-${number}`}
              >
                <div className={cx("subn", index === 0 ? "a" : index === 1 ? "b" : "c")}>
                  <CountUpNumber
                    active={visible}
                    className="n"
                    duration={900 + index * 200}
                    value={number}
                  />
                  <p
                    className={cx(
                      "l",
                      locale !== "en" && "normal-case tracking-normal",
                    )}
                  >
                    {subtraction.labels[index]}
                  </p>
                </div>
                {index < subtraction.numbers.length - 1 ? (
                  <ArrowRightIcon
                    aria-hidden={true}
                    className="subarrow"
                  />
                ) : null}
              </div>
            ))}
          </div>
          <p
            className={cx(
              "",
              copy.bodyClass,
            )}
          >
            {renderInlineMarkup(subtraction.body)}
          </p>
        </div>
      </RevealBlock>
    </section>
  );
}

function MethodCards({
  model,
}: Readonly<{
  model: HealthScoreViewModel;
}>) {
  const { copy, locale, methodCards: cards, methodHeadline, result } = model;
  const ai = result.pageContent?.aiCopy;

  return (
    <section className="wrap mn-hs-method-section">
      <RevealBlock className="sec-head">
        <p className="eyebrow">
          {copy.methodEyebrow}
        </p>
        <h2 className={locale === "en" ? "text-balance" : ""}>
          {renderInlineMarkup(methodHeadline)}
        </h2>
      </RevealBlock>
      <div className="method">
        {cards.map((card, index) => {
          const aiCard = ai?.methodCards?.[index];
          const fallbackCard = copy.fallbackMethodCards[index] ?? card;

          return (
            <RevealBlock
              delay={(index + 1) as 1 | 2 | 3}
              key={`${card.title}-${index}`}
            >
              <article className="mstep">
                <div className="mn">
                  {card.number ?? index + 1}
                </div>
                <h3>
                  {renderInlineMarkup(localizedLegacyText(
                    card.title,
                    locale,
                    fallbackCard.title,
                  ))}
                </h3>
                <p className={copy.bodyClass}>
                  {renderInlineMarkup(aiCardBody(
                    aiCard,
                    locale,
                    localizedLegacyText(card.body, locale, fallbackCard.body),
                  ))}
                </p>
              </article>
            </RevealBlock>
          );
        })}
      </div>
      <RevealBlock delay={2}>
        <div className="trustline">
          <CheckCircleIcon
            aria-hidden={true}
            className="mt-0.5 size-5 shrink-0"
          />
          <p className={cx("text-sm", copy.bodyClass)}>{copy.trustLine}</p>
        </div>
      </RevealBlock>
    </section>
  );
}

function TrustCard({ locale }: Readonly<{ locale: Locale }>) {
  const copy = pageCopy[locale];

  return (
    <section className="wrap mn-hs-trust-section">
      <RevealBlock>
        <div className="trustcard">
          {copy.trustCard.map((item, index) => (
            <div className="tc-col" key={item.title}>
              <span className="tc-ic" aria-hidden="true">
                {index === 0 ? (
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                ) : index === 1 ? (
                  <svg viewBox="0 0 24 24">
                    <path d="M12 4 2 9l10 5 10-5-10-5z" />
                    <path d="M6 11v4c0 1.5 3 3 6 3s6-1.5 6-3v-4" />
                    <path d="M22 9v5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24">
                    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                )}
              </span>
              <div className="tc-txt">
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </RevealBlock>
    </section>
  );
}

function PriceHeroIntro({
  firstName,
  locale,
}: Readonly<{
  firstName?: string;
  locale: Locale;
}>) {
  const copy = pageCopy[locale];
  const priceHero = copy.priceHero;
  const ctaEyebrow = firstName
    ? `${firstName} — ${priceHero.ctaEyebrow}`
    : priceHero.ctaEyebrow;

  return (
    <div className="priceHero">
      <div>
        <span className="eyebrow">{ctaEyebrow}</span>
        <h2>{priceHero.title}</h2>
        <p className={cx("p1", copy.bodyClass)}>
          {renderInlineMarkup(priceHero.body)}
        </p>
        <ul className="trustChecks">
          {priceHero.trustChecks.map((item) => (
            <li key={item}>
              <span className="tck">✓</span>
              {item}
            </li>
          ))}
        </ul>
        <p className={cx("p2", copy.bodyClass)}>
          {renderInlineMarkup(priceHero.service)}
        </p>
        <p className={cx("price-clarify", copy.bodyClass)}>
          {renderInlineMarkup(priceHero.clarify)}
        </p>
      </div>
      <figure
        aria-label={priceHero.alt}
        className="boxFigure"
      >
        <Image
          alt={priceHero.alt}
          height={760}
          src="/healthscore/box-v7.jpg"
          unoptimized={true}
          width={960}
        />
        <figcaption className="boxCaption">
          {priceHero.boxCaptionPrefix}{" "}
          <b>{priceHero.boxCaptionStrong}</b>{" "}
          {priceHero.boxCaptionSuffix}
        </figcaption>
      </figure>
    </div>
  );
}

function PromiseIcon({ index }: Readonly<{ index: number }>) {
  if (index === 0) {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="m20 20-5-5" />
      </svg>
    );
  }

  if (index === 1) {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M5 19s1-10 9-13c-1 6-4 11-9 13z" />
        <path d="M5 19c2-3 5-5 9-6" />
      </svg>
    );
  }

  if (index === 2) {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
    </svg>
  );
}

function PromiseStrip({ locale }: Readonly<{ locale: Locale }>) {
  const copy = pageCopy[locale];
  const tones = ["clarity", "guidance", "personalized", "confidence"] as const;

  return (
    <div className="promises">
      {copy.promises.map(([title, subtitle], index) => (
        <div className={cx("promise", tones[index])} key={title}>
          <PromiseIcon index={index} />
          <div className="pTxt">
            <span className="pTitle">{title}</span>
            <span className="pSub">{subtitle}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DecisionFrame({ locale }: Readonly<{ locale: Locale }>) {
  const copy = pageCopy[locale];

  return (
    <div className="decision">
      <span className="deye">{copy.decision.eyebrow}</span>
      <h3>{copy.decision.title}</h3>
      <p className={cx("dlead", copy.bodyClass)}>
        {copy.decision.lead}
      </p>
      <div className="decisionRows">
        <div className="drow">
          <p className={cx("dtxt", copy.bodyClass)}>
            {copy.decision.optionFormula}
          </p>
        </div>
        <div className="drow">
          <p className={cx("dtxt", copy.bodyClass)}>
            {copy.decision.optionProtocol}
          </p>
        </div>
      </div>
    </div>
  );
}

function PriceCard({
  disabled = false,
  featured = false,
  isPending = false,
  onSelect,
  pendingLabel,
  plan,
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
    <article className={cx("plan", featured && "dark")}>
      <span className={cx("badge", featured ? "badge-pop" : "badge-gold")}>
        {plan.badge}
      </span>
      <span className={cx("ptype", featured && "dk")}>
        <span className="tdot">{featured ? "♡" : "◎"}</span>
        {plan.eyebrow}
      </span>
      <h3>{plan.name}</h3>
      <p className={cx("pdesc", featured && "dk")}>
        {plan.description}
      </p>
      <div className="priceblk">
        <span className={cx("was", featured && "dk")}>{plan.was}</span>
        <span className={cx("save", featured ? "save-amber" : "save-green")}>
          {plan.save}
        </span>
      </div>
      <div className="priceblk big">
        <span className={cx("cur", featured && "dk")}>THB</span>
        <span className={cx("now", featured && "dk")}>{plan.price}</span>
        <span className={cx("per", featured && "dk")}>{plan.term}</span>
      </div>
      <p className={cx("subnote", featured && "dk")}>{plan.fine}</p>
      <button
        className={cx("btn", featured ? "btn-teal" : "btn-primary")}
        disabled={disabled}
        onClick={onSelect}
        type="button"
      >
        {isPending ? pendingLabel : plan.cta}
        {isPending ? null : (
          <ArrowRightIcon aria-hidden={true} className="size-4" />
        )}
      </button>
      {includes ? (
        <div className="includes">
          <span className="ck-t">✓</span>
          <span>{includes}</span>
          <span className="plus">PLUS</span>
        </div>
      ) : null}
      {extraBlocks?.map((block) => (
        <div className="featblock" key={block.title}>
          <div className="fbic">{block.icon}</div>
          <div>
            <h4>{block.title}</h4>
            <p>{block.body}</p>
          </div>
        </div>
      ))}
      <ul className={cx("feat", featured && "dk")}>
        {plan.features.map((feature) => (
          <li key={feature}>
            <span className="ck">✓</span>
            {feature}
          </li>
        ))}
      </ul>
      <div className={cx("guarantee", featured && "dk")}>
        <ShieldCheckIcon
          aria-hidden={true}
          className="gck"
        />
        <span>
          <b>{plan.guarantee}.</b> {plan.guaranteeBody}
        </span>
      </div>
    </article>
  );
}

function PricingSection({
  firstName,
  locale,
  planId,
}: Readonly<{
  firstName?: string;
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
      sourceSurface: "healthscore",
    });
  }

  return (
    <section className="wrap mn-hs-pricing-section" id="pricing">
      <RevealBlock>
        <PriceHeroIntro firstName={firstName} locale={locale} />
      </RevealBlock>
      <RevealBlock delay={1}>
        <PromiseStrip locale={locale} />
      </RevealBlock>
      <RevealBlock delay={2}>
        <DecisionFrame locale={locale} />
      </RevealBlock>
      <div className="pricing">
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
  showPricing,
}: Readonly<{
  firstName?: string;
  locale: Locale;
  planId?: string;
  result: HealthScoreResult;
  showPricing: boolean;
}>) {
  const rootRef = useRef<HTMLElement | null>(null);
  const model = buildHealthScoreViewModel({ firstName, locale, result });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      rootRef.current?.classList.add("is-enhanced");
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <section className="mn-healthscore-v7" ref={rootRef}>
      <HealthScoreHero model={model} />
      <GapCards model={model} />
      <PillarBars model={model} />
      <FindingsSection model={model} />
      <SubtractionBeat model={model} />
      <MethodCards model={model} />
      <TrustCard locale={locale} />
      {showPricing ? (
        <PricingSection firstName={firstName} locale={locale} planId={planId} />
      ) : null}
    </section>
  );
}

export function HealthScorePanel({
  firstName,
  locale,
  result,
}: Readonly<{
  firstName?: string;
  locale: Locale;
  result: HealthScoreResult;
}>) {
  return (
    <HealthScoreExperience
      firstName={firstName}
      locale={locale}
      result={result}
      showPricing={false}
    />
  );
}

export function HealthScorePaymentPanel({
  firstName,
  locale,
  planId,
  result,
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
