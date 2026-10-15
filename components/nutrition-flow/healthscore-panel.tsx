"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { trackMetaEvent } from "@/lib/meta-client";
import { trackBpmEvent } from "@/lib/bpm-client";
import {
  DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT,
  type HealthScorePageAiCard,
  type HealthScoreResult,
  type LocalizedHealthScoreText,
} from "@/lib/health-score";
import type { Locale } from "@/lib/i18n";
import { pageCopy } from "@/components/nutrition-flow/healthscore-panel-copy";
import {
  healthScoreV8Copy,
  type HealthScoreV8Copy,
} from "@/components/nutrition-flow/healthscore-v8-copy";
import { paymentCheckoutPath } from "@/lib/payment-paths";
import { cx } from "@/components/nutrition-flow/ui";
import "./healthscore-v8.css";

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
) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return localizedLegacyText(value, locale);
  }

  return value[locale] || "";
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
) {
  return localize(card?.body, locale);
}

function aiCardHeadline(
  card: HealthScorePageAiCard | undefined,
  locale: Locale,
) {
  return localize(card?.headline ?? card?.title, locale);
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



function buildHealthScoreViewModel({
  firstName,
  locale,
  result,
}: Readonly<{ firstName?: string; locale: Locale; result: HealthScoreResult }>) {
  const page = result.pageContent;
  const ai = page?.aiCopy;
  const subtraction = page?.locked.subtraction ?? {
    chosen: null,
    evaluated: DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT,
    setAside: null,
  };
  return {
    firstName,
    locale,
    score: page?.locked.score ?? result.score,
    band: displayBand(page?.locked.band ?? result.band, locale),
    pillars: normalizedPillars(result),
    heroTitle: localize(ai?.heroTitle, locale),
    heroBody: localize(ai?.heroBody, locale),
    bandLine: localize(ai?.bandLine, locale),
    highestLeverageBody: localize(ai?.highestLeverageBody, locale),
    strengthNote: localize(ai?.strengthNote, locale),
    subtractionBody: localize(ai?.subtractionBody, locale),
    findings: (ai?.findings ?? []).map((aiCard) => ({
      headline: aiCardHeadline(aiCard, locale),
      body: aiCardBody(aiCard, locale),
    })).filter((card) => card.headline && card.body).slice(0, 3),
    evaluated: subtraction.evaluated,
    chosen: subtraction.chosen,
  };
}

type HealthScoreViewModel = ReturnType<typeof buildHealthScoreViewModel>;

function Lines({ text }: Readonly<{ text: string }>) {
  return text.split("\n").map((line, index) => (
    <span key={index}>{index > 0 ? <br /> : null}{line}</span>
  ));
}

function PaymentNote({ copy }: Readonly<{ copy: HealthScoreV8Copy }>) {
  return <p className="payment-note">{copy.once} · {copy.noSub}<br />{copy.separate}</p>;
}

function PaymentMethods({ copy }: Readonly<{ copy: HealthScoreV8Copy }>) {
  return (
    <>
      <div className="payment-methods" aria-label={copy.paymentLabel}>
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM14 13h3v3h-3zM19 13h2v5h-2zM13 19h4v2h-4zM19 20h2v1h-2z" /></svg>
          {copy.paymentPromptPay}
        </span>
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3 9h18v3H3zM5 15h5v1H5z" /></svg>
          {copy.paymentCards}
        </span>
      </div>
      <p className="stripe-note">{copy.stripe}</p>
    </>
  );
}

function SamplePlan({ locale, copy }: Readonly<{ locale: Locale; copy: HealthScoreV8Copy }>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  // The supplied example is available in English and Thai; its illustrative
  // nature and all surrounding controls remain localized in Chinese as well.
  const mediaLocale = locale === "th" ? "th" : "en";

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const pauseWhenHidden = () => {
      if (document.visibilityState !== "visible") video.pause();
    };
    const observer = typeof IntersectionObserver === "undefined" ? null
      : new IntersectionObserver(([entry]) => {
        if (!entry?.isIntersecting) video.pause();
      });
    observer?.observe(video);
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      video.pause();
    };
  }, [mediaLocale]);

  async function play(replay = false) {
    const video = videoRef.current;
    if (!video) return;
    if (replay) video.currentTime = 0;
    if (!replay && !video.paused) {
      video.pause();
      return;
    }
    setFailed(false);
    try {
      await video.play();
    } catch {
      setFailed(true);
    }
  }

  return (
    <section className="section sample-section" aria-labelledby="sample-title">
      <div className="sample-intro">
        <div className="eyebrow">{copy.sampleEye}</div>
        <h2 id="sample-title">{copy.sampleTitle}</h2>
        <p id="sample-description">{copy.sampleSub}</p>
      </div>
      <div className="sample-player">
        <video
          key={mediaLocale}
          ref={videoRef}
          id="sample-video"
          controls muted playsInline preload="none"
          width="720" height="1280"
          poster={`/healthscore/v8-4/poster-${mediaLocale}.webp`}
          aria-label={copy.sampleVideoLabel}
          aria-describedby="sample-description sample-cost"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setFailed(true)}
        >
          <source src={`/healthscore/v8-4/sample-${mediaLocale}.mp4`} type="video/mp4" />
          {copy.sampleFallback}
        </video>
        <div className="sample-controls">
          <button type="button" onClick={() => void play()} aria-controls="sample-video">{playing ? copy.samplePause : copy.samplePlay}</button>
          <button type="button" onClick={() => void play(true)} aria-controls="sample-video">{copy.sampleReplay}</button>
        </div>
        {failed ? <p role="status" className="sample-cost">{copy.sampleFallback}</p> : null}
      </div>
      <p className="sample-cost" id="sample-cost">{copy.sampleNote}</p>
    </section>
  );
}

function DetailedReport({ model, copy }: Readonly<{ model: HealthScoreViewModel; copy: HealthScoreV8Copy }>) {
  return (
    <section className="section report-section">
      <div className="report" id="full-report" aria-labelledby="report-title">
        <div className="report-heading">
          <h2 className="summary-label" id="report-title">{copy.reportTitle}</h2>
          <p className="summary-sub">{copy.reportSub}</p>
        </div>
        <div className="report-body">
          <div className="pillars">
            {model.pillars.map((pillar) => (
              <div className="pillar" key={pillar.id}>
                <div className="pillar-name">
                  {displayPillarLabel(pillar, model.locale)}
                  {pillar.goalLinked ? <small>{copy.goalLinked}</small> : null}
                </div>
                <div className="track" aria-hidden="true">
                  <div className={cx("fill", pillar.value < 50 && "low")} style={{ width: `${Math.max(0, Math.min(100, pillar.value))}%` }} />
                </div>
                <div className="value">{pillar.value}%</div>
              </div>
            ))}
          </div>
          {model.highestLeverageBody ? <p className="report-note">{renderInlineMarkup(model.highestLeverageBody)}</p> : null}
          {model.strengthNote ? <p className="method"><strong>{copy.strengthPrefix}</strong>{renderInlineMarkup(model.strengthNote)}</p> : null}
          <div className="method"><strong>{copy.reportMethodTitle}</strong><p>{copy.reportMethod}</p></div>
        </div>
      </div>
    </section>
  );
}

function HealthScoreExperience({
  firstName, locale, planId, result, showPricing,
}: Readonly<{
  firstName?: string;
  locale: Locale;
  planId?: string;
  result: HealthScoreResult;
  showPricing: boolean;
}>) {
  const copy = healthScoreV8Copy[locale];
  const model = buildHealthScoreViewModel({ firstName, locale, result });
  const rootRef = useRef<HTMLElement>(null);
  const trackedDisplay = useRef("");
  const navigationStarted = useRef(false);
  const [pending, setPending] = useState(false);
  const [showDock, setShowDock] = useState(false);
  const insight = model.findings[0];
  const hasShortlist = Number.isInteger(model.chosen) && (model.chosen ?? 0) > 0;
  const headline = model.heroTitle
    ? `${firstName ? `${firstName}, ` : ""}${firstName && locale === "en" ? model.heroTitle.replace(/^You\b/, "you") : model.heroTitle}`
    : firstName ? copy.heading.replace("{name}", firstName) : copy.headingNoName;

  useEffect(() => {
    const key = `${planId}:${locale}`;
    const recordDisplay = () => {
      if (!planId || document.visibilityState !== "visible" || trackedDisplay.current === key) return;
      trackedDisplay.current = key;
      trackBpmEvent("healthscore_viewed", { planId, locale, eventType: "funnel" });
    };
    recordDisplay();
    document.addEventListener("visibilitychange", recordDisplay);
    return () => document.removeEventListener("visibilitychange", recordDisplay);
  }, [planId, locale]);

  useEffect(() => {
    if (!showPricing || !planId || typeof IntersectionObserver === "undefined") return;
    const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-inline-buy]") ?? []);
    const first = buttons[0];
    if (!first) return;
    const update = () => {
      const pastHero = first.getBoundingClientRect().bottom <= 0;
      const anyVisible = buttons.some((button) => {
        const rect = button.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      });
      setShowDock(pastHero && !anyVisible);
    };
    const observer = new IntersectionObserver(update, { threshold: [0, 1] });
    buttons.forEach((button) => observer.observe(button));
    update();
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [planId, showPricing]);

  function startPlan() {
    if (!planId || navigationStarted.current) return;
    navigationStarted.current = true;
    setPending(true);
    void trackMetaEvent("SelectOffer", {
      planId, locale, offer: "precision", purchase_type: "plan", stage: "offer",
    });
    window.location.href = paymentCheckoutPath(locale, {
      plan: "precision", planId, sourceSurface: "healthscore",
    });
  }

  function buyButton(position: string, short = false) {
    return (
      <button
        type="button"
        className="buy"
        data-buy={position}
        data-inline-buy={position === "dock" ? undefined : ""}
        disabled={!planId || pending}
        aria-busy={pending}
        onClick={startPlan}
      >
        <span>{pending ? copy.opening : short ? copy.ctaShort : copy.cta}</span>
        <span className="arrow" aria-hidden="true">→</span>
      </button>
    );
  }

  return (
    <section className={cx("mn-healthscore-v8", !showPricing && "results-only")} ref={rootRef} data-testid="healthscore">
      <div className="wrap">
        <ol className="progress-nav" aria-label={copy.steps.join(" → ")}>
          {copy.steps.map((step, index) => (
            <li key={step} className={index === 0 ? "done" : index === 1 ? "current" : ""} aria-current={index === 1 ? "step" : undefined}>
              <span className="step-dot" aria-hidden="true">{index === 0 ? "✓" : index + 1}</span>{step}
            </li>
          ))}
        </ol>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-intro">
            <div className="eyebrow">{copy.complete}</div>
            <h1 className="hero-title" id="hero-title" data-testid="reveal-hero-name">{renderInlineMarkup(headline)}</h1>
            {model.heroBody ? <p className="goal-line">{renderInlineMarkup(model.heroBody)}</p> : null}
            <div className="scorecard">
              <div className="score-main">
                <div className="score-num" aria-label={`${copy.scoreLabel} ${model.score}/100`}>{model.score}<small>/100</small></div>
                <div><span className="band">{model.band}</span><p className="score-text">{renderInlineMarkup(model.bandLine)}</p></div>
              </div>
              <p className="score-disclaimer">{copy.scoreBasis}</p>
            </div>
            {insight ? <div className="insight"><h2>{renderInlineMarkup(insight.headline)}</h2><p>{renderInlineMarkup(insight.body)}</p></div> : null}
          </div>
          {showPricing ? (
            <div>
              <div className="offer">
                <div className="eyebrow">{copy.product}</div>
                <h2><Lines text={copy.offerTitle} /></h2>
                <p className="offer-sub">{copy.offerSub}</p>
                <ul className="offer-list">{copy.offerItems.map((item) => <li key={item}><span className="check" aria-hidden="true">✓</span><span>{item}</span></li>)}</ul>
                <div className="price-line"><span className="price">฿690</span><span className="small">{copy.once}<br />{copy.noSub}</span></div>
                {buyButton("hero")}
                <PaymentNote copy={copy} />
                <PaymentMethods copy={copy} />
                <a className="guarantee-link" href="#clarity">{copy.guaranteeLink}</a>
                <div className="hero-assurance"><strong>{copy.heroTrust}</strong><small>{copy.heroEducation}</small><span>Mahidol · Princeton · Stanford · Harvard</span></div>
              </div>
              <a className="read-results" href={model.findings.length ? "#insights" : "#full-report"}>{copy.readMore}</a>
            </div>
          ) : null}
        </section>

        {model.findings.length ? (
          <section className="section" id="insights" aria-labelledby="proof-title">
            <div className="section-head"><div><div className="eyebrow">{copy.proofEyebrow}</div><h2 id="proof-title"><Lines text={copy.proofTitle} /></h2></div><p>{copy.proofSub}</p></div>
            <div className={cx("findings", model.findings.length === 1 && "one", model.findings.length === 2 && "two")}>
              {model.findings.map((finding, index) => (
                <article className="finding" key={index}>
                  <span className="index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{renderInlineMarkup(finding.headline)}</h3><p>{renderInlineMarkup(finding.body)}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        <DetailedReport model={model} copy={copy} />
        <div className="proof-action">
          {hasShortlist ? (
            <div className="selection" data-testid="healthscore-shortlist">
              <div><h3>{copy.selectionTitle}</h3><p>{model.subtractionBody ? renderInlineMarkup(model.subtractionBody) : copy.selectionBody}</p></div>
              <div className="selection-numbers">
                <div className="stat"><strong>{model.evaluated}</strong><span>{copy.evaluated}</span></div>
                <span className="to" aria-hidden="true">→</span>
                <div className="stat"><strong aria-hidden="true">✓</strong><span>{copy.matched}</span></div>
                <span className="to" aria-hidden="true">→</span>
                <div className="stat"><strong>{model.chosen}</strong><span>{copy.chosen}</span></div>
              </div>
            </div>
          ) : null}
          {showPricing ? <div className="mid-action"><div><p>{copy.midTitle}</p><p className="small">{copy.midSub}</p></div>{buyButton("insights")}</div> : null}
        </div>

        {showPricing ? (
          <>
            <SamplePlan copy={copy} locale={locale} />
            <section className="section deliverable" aria-labelledby="inside-title">
              <div><div className="eyebrow">{copy.insideEye}</div><h2 id="inside-title"><Lines text={copy.insideTitle} /></h2><p>{copy.insideBody}</p><p className="note">{copy.insideNote}</p></div>
              <div className="plan-preview">
                <div className="doc-title"><div><div className="mini">{copy.docLabel}</div><h3>{copy.docTitle}</h3></div><span className="monogram" aria-hidden="true">M.</span></div>
                {copy.contents.map(([title, body], index) => <div className="plan-row" key={title}><span className="n" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><strong>{title}</strong><p>{body}</p></div></div>)}
              </div>
            </section>
            <div className="trust-band">{copy.trust.map(([title, body]) => <div className="trust-item" key={title}><h3>{title}</h3><p>{body}</p></div>)}</div>
            <section className="section" aria-labelledby="journey-title">
              <div className="section-head"><div><div className="eyebrow">{copy.journeyEye}</div><h2 id="journey-title"><Lines text={copy.journeyTitle} /></h2></div></div>
              <div className="steps">{copy.journey.map(([title, body], index) => <div className="journey-step" key={title}><span className="num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></div>)}</div>
              <figure className="delivery-box">
                <Image src="/healthscore/v8-4/box.webp" alt={copy.boxAlt} width={1536} height={1024} sizes="(max-width: 560px) calc(100vw - 32px), (max-width: 908px) calc(100vw - 48px), 860px" />
                <figcaption>{copy.boxCaption}</figcaption>
              </figure>
            </section>
            <section className="section" aria-labelledby="faq-title">
              <div className="faq-layout">
                <div><div className="eyebrow">{copy.faqEye}</div><h2 id="faq-title"><Lines text={copy.faqTitle} /></h2></div>
                <div className="faq">{copy.faqs.map(([question, answer], index) => <details key={question} id={`faq-${index}`}><summary><span>{question}</span><span className="plus" aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
              </div>
              <div className="guarantee" id="clarity"><Image src="/healthscore/v8-4/nong.webp" alt="" width={86} height={140} /><div><h3>{copy.guaranteeTitle}</h3><p>{copy.guaranteeBody}</p></div></div>
            </section>
            <section className="section">
              <div className="close-offer">
                <div><div className="eyebrow">{copy.closeEye}</div><h2><Lines text={copy.closeTitle} /></h2><p>{copy.closeBody}</p></div>
                <div><div className="price-line"><span className="price">฿690</span><span className="small">{copy.once}<br />{copy.noSub}</span></div>{buyButton("closing")}<PaymentNote copy={copy} /></div>
              </div>
            </section>
          </>
        ) : null}
      </div>
      {showPricing ? <aside className="dock" hidden={!showDock} aria-label={copy.product}><div className="wrap"><div><strong>฿690</strong><span className="dock-label">{copy.planPayment}</span><span className="small">{copy.separate}</span></div>{buyButton("dock", true)}</div></aside> : null}
    </section>
  );
}

export function HealthScorePanel(props: Readonly<{ firstName?: string; locale: Locale; result: HealthScoreResult }>) {
  return <HealthScoreExperience {...props} showPricing={false} />;
}

export function HealthScorePaymentPanel(props: Readonly<{ firstName?: string; locale: Locale; planId?: string; result: HealthScoreResult }>) {
  return <HealthScoreExperience {...props} showPricing={true} />;
}
