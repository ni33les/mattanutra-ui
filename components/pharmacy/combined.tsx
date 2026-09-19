"use client";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { Check, LoaderCircle } from "lucide-react";
import { SafeImage } from "@/components/safe-image";
import {
  visibleFormulaIngredients,
  localizedDoseText,
  localizedSupplementName,
} from "@/components/formulation-support-helpers";
import { formatCurrencyAmount } from "@/lib/currencies";
import { pharmacyCopy } from "@/lib/pharmacy-copy";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { trackBpmEvent } from "@/lib/bpm-client";
import {
  pharmacyPresentationPhase,
  pharmacyRainWords,
  pharmacyRainStyle,
  type PharmacyPhase,
} from "@/lib/pharmacy-presentation";
import type { FormulationResult } from "@/lib/formulation-types";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import type { PharmacyOrderReceipt } from "@/lib/pharmacy-orders";
import type { Locale } from "@/lib/i18n";
import { useCombinedResult } from "@/components/pharmacy/use-combined-result";
import { usePharmacyOrder } from "@/components/pharmacy/use-pharmacy-order";
import { usePharmacyAnimation } from "@/components/pharmacy/use-pharmacy-animation";
import { combinedCopy } from "@/components/pharmacy/combined-copy";
import { PharmacyLineConnect } from "@/components/pharmacy/line-connect";
import "./combined.css";

const subscribeOrigin = () => () => {};
const readOrigin = () => window.location.origin;
const serverOrigin = () => "";
const stops = [
  {
    left: 24,
    top: 34,
    delay: 120,
    resolve: 350,
    rotation: -8,
    color: "var(--mn-ink)",
  },
  {
    left: 76,
    top: 38,
    delay: 330,
    resolve: 815,
    rotation: 7,
    color: "var(--mn-teal)",
  },
  {
    left: 30,
    top: 76,
    delay: 540,
    resolve: 1280,
    rotation: -3,
    color: "var(--mn-gold)",
  },
];
const particles = [
  [-156, -82, 40, 7],
  [-108, 106, 90, 9],
  [-58, -124, 150, 6],
  [-202, 28, 200, 8],
  [168, -86, 55, 8],
  [112, 110, 120, 6],
  [54, -132, 180, 9],
  [206, 38, 230, 7],
  [-176, 82, 110, 5],
  [184, 94, 165, 5],
  [-24, 132, 215, 7],
  [28, 126, 260, 6],
];

export function PharmacyCombined({
  locale,
  sourceLocale,
  slug,
  pharmacyName,
  planId,
  revision,
  initial,
  initialResult,
  initialReceipt = null,
}: {
  locale: Locale;
  sourceLocale: Locale;
  slug: string;
  pharmacyName: string;
  planId: string;
  revision: number;
  initial: NutritionJourneySnapshot | null;
  initialResult: FormulationResult | null;
  initialReceipt?: PharmacyOrderReceipt | null;
}) {
  const work = useCombinedResult({
    planId,
    locale: sourceLocale,
    initial,
    initialResult,
    frozen: Boolean(initialReceipt),
  });
  const result = initialReceipt ? initialResult : work.result;
  const order = usePharmacyOrder({
    planId,
    slug,
    locale,
    revision: work.snapshot?.revision ?? revision,
    initialReceipt,
    enabled: work.ready,
  });
  const c = combinedCopy[locale],
    p = pharmacyCopy[locale];
  const root = useRef<HTMLElement | null>(null);
  const [animatedPhase, setAnimatedPhase] = useState<PharmacyPhase>("inputs");
  const ready = work.ready && order.loaded;
  usePharmacyAnimation(
    root,
    ready,
    work.failed,
    setAnimatedPhase,
    work.ready,
  );
  const phase = pharmacyPresentationPhase({
    phase: animatedPhase,
    formulaReady: Boolean(result),
    ready,
    failed: work.failed,
  });
  const ingredients = visibleFormulaIngredients(
    result?.supplementBreakdown ?? [],
  ).sort((a, b) => a.effectivenessRank - b.effectivenessRank);
  const name =
    result?.firstName || result?.assessmentSummary.firstName || c.you;
  const emitted = useRef(new Set<string>());
  useEffect(() => {
    const event = ready
      ? "formulation_page_viewed"
      : "pharmacy_processing_viewed";
    const key = `${planId}:${work.snapshot?.revision ?? revision}:${event}`;
    if (emitted.current.has(key)) return;
    emitted.current.add(key);
    trackBpmEvent(event, {
      eventType: "funnel",
      locale,
      properties: {
        planId,
        revision: work.snapshot?.revision ?? revision,
        pageKey: window.location.pathname + window.location.search,
      },
    });
  }, [locale, planId, revision, ready, work.snapshot?.revision]);
  const deepLink = pharmacyPath(locale, slug, "plan", {
    plan: planId,
    order: order.receipt?.id,
  });
  const origin = useSyncExternalStore(
    subscribeOrigin,
    readOrigin,
    serverOrigin,
  );
  const link = origin + deepLink;
  const status =
    phase === "inputs"
      ? c.combining
      : phase === "rain"
        ? c.rain
        : phase === "clarity"
          ? c.clarity
          : phase === "waiting"
            ? c.waiting
          : phase === "failed"
            ? c.failed
            : `${c.matching} ${c.personalised} ${c.matchingEnd}`;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      order.setCopied(true);
    } catch {
      order.setError(p.error);
    }
  }
  const activeIds = new Set(order.active.map((line) => line.productId));
  const shown = order.receipt?.lines ?? order.lines;
  const retry = () => {
    order.retryQuote();
    work.retry();
  };
  return (
    <div id="mn-pharmacy-combined" data-testid="pharmacy-combined">
      <section
        ref={root}
        className="mn-window"
        data-phase={phase}
        data-testid={ready ? "pharmacy-order" : undefined}
        aria-labelledby="mn-combined-title"
        aria-busy={!ready && !work.failed}
      >
        <div className="mn-flight-layer" aria-hidden="true">
              <svg
                className="mn-clarity-orbit"
                viewBox="0 0 650 360"
                focusable="false"
              >
                <path className="mn-clarity-path-glow" pathLength="100" />
                <path className="mn-clarity-path" pathLength="100" />
              </svg>
              <span className="mn-clarity-logo-shell">
                <SafeImage
                  className="mn-clarity-logo"
                  src="/assets/pharmacy/combined/leaf.webp"
                  alt=""
                  width={92}
                  height={92}
                />
                <span className="mn-leading-spark" />
              </span>
        </div>
        <div className="mn-top">
          <div className="mn-brand-lockup">
            <SafeImage
              className="mn-brand-mark"
              src="/assets/pharmacy/combined/leaf.webp"
              alt=""
              width={38}
              height={38}
            />
            <strong className="mn-brand">
              Matta<span>Nutra</span>
            </strong>
          </div>

        </div>
        <h2 id="mn-combined-title">{c.title}</h2>
        <div className="mn-status-row">
          <div className="mn-status" aria-live="polite">
            <span className="mn-status-single" hidden={phase === "ready"}>
              {status}
            </span>
            <div className="mn-status-final" hidden={phase !== "ready"}>
              <span className="mn-status-kicker">{c.complete}</span>
              <h3 className="mn-status-payoff">{c.payoff}</h3>
            </div>
          </div>
          <div className="mn-guide" aria-hidden="true">
            {(["thinking", "comparing", "celebrate"] as const).map((pose) => (
              <SafeImage
                key={pose}
                className={`mn-guide-${pose}`}
                src={`/assets/library/nong/nong-${pose === "celebrate" ? "energetic" : pose}.webp`}
                alt=""
                width={74}
                height={78}
              />
            ))}
          </div>
        </div>
        {!ready && !work.failed && (
          <div className="mn-estimate">
            <p>{c.estimate}</p>
            {(phase === "waiting" || phase === "matching") && (
              <p className="mn-processing-activity" data-testid="pharmacy-processing-activity" role="status">
                <LoaderCircle aria-hidden="true" size={22} />
                {result ? `${c.matching} ${c.personalised} ${c.matchingEnd}` : c.waiting}
              </p>
            )}
          </div>
        )}
        <div className="mn-stage" role="group" aria-label={p.preparing}>
          <div
            className={`mn-layer mn-analysis ${work.ready ? "is-complete" : ""}`}
          >
            <div>
              <div className="mn-analysis-grid">
                {c.inputs.map((label, index) => (
                  <div
                    key={label}
                    className={`mn-analysis-tile ${work.ready ? "is-active" : ""}`}
                    data-analysis-step={index}
                  >
                    <span className="mn-analysis-name">{label}</span>
                  </div>
                ))}
              </div>
              <div className="mn-analysis-caption">{c.caption}</div>
            </div>
          </div>
          <div className="mn-layer mn-rain" aria-hidden="true">
            <div className="mn-core">
              <div>
                <span className="text-small">{c.possibilities}</span>
              </div>
            </div>
            {(animatedPhase === "rain" || animatedPhase === "clarity") &&
              !ready &&
              pharmacyRainWords.map((word, i) => {
                const v = pharmacyRainStyle(i);
                return (
                  <span
                    key={word}
                    className="mn-rain-chip text-small"
                    style={
                      {
                        "--x": `${v.x}%`,
                        "--delay": `${v.delay}s`,
                        "--duration": `${v.duration}s`,
                        "--drift": `${v.drift}px`,
                      } as CSSProperties
                    }
                  >
                    {localizedSupplementName(word, word, locale)}
                  </span>
                );
              })}
          </div>
          <div className="mn-layer mn-clarity" aria-hidden="true">
            <div className="mn-clarity-visual">
              {stops.map((stop, i) => (
                <span
                  key={i}
                  className="mn-clarity-question"
                  data-clarity-question
                  style={
                    {
                      "--question-left": `${stop.left}%`,
                      "--question-top": `${stop.top}%`,
                      "--question-delay": `${stop.delay}ms`,
                      "--resolve-delay": `${stop.resolve}ms`,
                      "--question-rotate": `${stop.rotation}deg`,
                      "--question-color": stop.color,
                    } as CSSProperties
                  }
                >
                  ?
                </span>
              ))}
              {stops.map((stop, i) => (
                <span
                  key={i}
                  className="mn-tap"
                  data-clarity-tap
                  style={
                    {
                      "--question-left": `${stop.left}%`,
                      "--question-top": `${stop.top}%`,
                      "--tap-delay": `${stop.resolve}ms`,
                    } as CSSProperties
                  }
                />
              ))}
              <span className="mn-tap mn-final-tap" data-final-tap />
              {particles.map(([x, y, delay, size], i) => (
                <span
                  key={i}
                  className="mn-clarity-particle"
                  style={
                    {
                      "--x": `${x}px`,
                      "--y": `${y}px`,
                      "--delay": `${delay}ms`,
                      "--size": `${size}px`,
                      "--particle-color": [
                        "var(--mn-gold-soft)",
                        "var(--mn-teal)",
                        "var(--mn-gold)",
                        "var(--mn-green)",
                        "var(--mn-green)",
                        "var(--mn-teal)",
                        "var(--mn-teal)",
                        "var(--mn-gold)",
                        "var(--mn-gold)",
                        "var(--mn-teal)",
                        "var(--mn-green)",
                        "var(--mn-gold-tint)",
                      ][i],
                    } as CSSProperties
                  }
                />
              ))}

            </div>
          </div>
          <div className="mn-layer mn-result" aria-hidden={!result}>
            <div className="mn-selected-wrap">
              <h3 className="mn-selected-label">
                {result ? ingredients.length : ""}{" "}
                {locale === "en" && ingredients.length === 1
                  ? "ingredient selected for"
                  : c.selected}{" "}
                <em>{name}</em>
              </h3>
              <div className="mn-selected-grid">
                {ingredients.map((ingredient, i) => (
                  <div
                    className="mn-nutrient"
                    key={ingredient.id}
                    style={{ "--i": i } as CSSProperties}
                  >
                    <strong>
                      {localizedSupplementName(
                        ingredient.supplement,
                        ingredient.id,
                        locale,
                      )}
                    </strong>
                    <span className="text-small">
                      {localizedDoseText(ingredient.dailyDose, locale)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mn-group-flow">
              <h3 className="mn-flow-copy">
                {c.matching} <span>{c.personalised}</span> {c.matchingEnd}
              </h3>
              <div className="mn-flow-mark" aria-hidden="true" />
            </div>
            <div className="mn-products" aria-label={p.products}>
              {shown.map((line) => {
                const product = result?.recommendations.find(
                  (item) => (item.productId ?? item.id) === line.productId,
                );
                const included = activeIds.has(line.productId);
                return (
                  <div
                    className={`mn-product ${included ? "" : "is-excluded"}`}
                    key={line.productId}
                  >
                    <SafeImage
                      className="mn-packshot-photo"
                      src={line.imageUrl}
                      alt=""
                      width={156}
                      height={260}
                    />
                    <div className="mn-match text-small">
                      <Check size={15} aria-hidden="true" />
                      {c.matched}
                    </div>
                    <div className="mn-product-name text-small">
                      {line.name}
                    </div>
                    <div className="mn-coverage text-small">
                      {product?.covers
                        .map((id) => {
                          const ingredient = ingredients.find(
                            (item) => item.id === id,
                          );
                          return localizedSupplementName(
                            ingredient?.supplement ?? id,
                            id,
                            locale,
                          );
                        })
                        .join(" · ")}
                    </div>
                    <label className="mn-product-order">
                      <input
                        type="checkbox"
                        className="mn-product-check"
                        aria-label={line.name}
                        checked={included}
                        disabled={order.busy || Boolean(order.receipt)}
                        onChange={(e) => {
                          order.setSelected((ids) =>
                            e.target.checked
                              ? [...ids, line.productId]
                              : ids.filter((id) => id !== line.productId),
                          );
                          order.setKey(crypto.randomUUID());
                        }}
                      />
                      <span className="mn-product-price">
                        {formatCurrencyAmount(
                          locale,
                          line.unitPrice * line.quantity,
                          line.currency,
                        )}
                        <small>
                          {p.quantity}: {line.quantity}
                        </small>
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {work.failed && !work.ready && (
          <div className="mn-recovery" role="alert">
            <p>{c.failed}</p>
            <button
              className="mn-recovery-button"
              data-testid="pharmacy-progress-retry"
              onClick={retry}
            >
              {p.retry}
            </button>
          </div>
        )}
        <p className="mn-ready" aria-live="polite">
          {ready ? c.ready : ""}
        </p>
        <section
          className="mn-transaction"
          aria-labelledby="mn-order-title"
          hidden={!ready}
        >
          <p className="mn-order-kicker">
            {c.at} {pharmacyName}
          </p>
          <h3 id="mn-order-title">
            {order.receipt ? p.confirmed : c.orderTitle}
          </h3>
          <p className="mn-order-help">{order.receipt ? p.unpaid : c.help}</p>
          <div
            className="mn-order-summary"
            data-testid="pharmacy-order-summary"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="mn-order-count">
              {order.loaded ? order.active.length : "—"} {c.items}
            </span>
            <strong className="mn-order-total">
              {order.loaded
                ? formatCurrencyAmount(locale, order.total, order.currency)
                : "—"}
            </strong>
          </div>
          {order.receipt ? (
            <div className="mn-order-success" role="status">
              <strong>
                {p.reference}: {order.receipt.reference}
              </strong>
              <span>
                {order.receipt.customerName} · {p.unpaid}
              </span>
            </div>
          ) : order.loaded && !order.lines.length && !order.error ? (
            <p>{p.noProducts}</p>
          ) : (
            <form
              className="mn-order-form"
              onSubmit={(e) => {
                e.preventDefault();
                void order.submit();
              }}
            >
              <label className="mn-name-label" htmlFor="mn-customer-name">
                {p.name}
              </label>
              <p className="mn-name-help">{p.nameHint}</p>
              <input
                className="mn-name-input"
                id="mn-customer-name"
                autoComplete="off"
                maxLength={120}
                required
                value={order.name}
                disabled={!order.loaded || order.busy}
                onChange={(e) => {
                  order.setName(e.target.value);
                  order.setKey(crypto.randomUUID());
                }}
              />
              <p className="mn-counter-note">
                {p.pay}. {p.paymentHint}
              </p>
              <p className="mn-pre-confirm">{c.preConfirm}</p>
              <button
                className="mn-confirm-btn"
                type="submit"
                disabled={
                  !order.loaded ||
                  order.busy ||
                  !order.selected.length ||
                  !order.name.trim() ||
                  !order.key
                }
              >
                {order.busy ? p.sending : p.confirm}
              </button>
            </form>
          )}
          {order.error && (
            <div className="mn-order-error" role="alert">
              {order.error}
              <button
                onClick={() => {
                  order.retryQuote();
                  if (order.error === p.refresh) work.retry();
                }}
              >
                {p.retry}
              </button>
            </div>
          )}
        </section>
        <section
          className="mn-coffee"
          aria-labelledby="mn-coffee-title"
          hidden={!ready}
        >
          <div className="mn-coffee-intro">
            <SafeImage
              src="/assets/library/nong/nong-coffee.webp"
              alt=""
              width={160}
              height={220}
            />
            <div>
              <p className="mn-order-kicker">{c.later}</p>
              <h3 id="mn-coffee-title">{c.coffeeTitle}</h3>
              <p className="mn-coffee-copy">{c.coffeeBody}</p>
              <p className="mn-nong-quote">{c.quote}</p>
            </div>
          </div>
          <div className="mn-return-path">
            {work.ready && <PharmacyLineConnect planId={planId} slug={slug} locale={locale} orderId={order.receipt?.id} />}
            <p className="mn-choice-or">{c.or}</p>
            <a
              className="mn-read-now"
              data-testid="pharmacy-deep-dive-link"
              href={deepLink}
            >
              {c.read}
            </a>
            <div className="mn-browser-fallback">
              <p className="mn-browser-label">{c.noLine}</p>
              <p className="mn-browser-note">{c.save}</p>
              <div className="mn-plan-url-card">
                <a className="mn-plan-url" href={deepLink}>
                  {link.replace(/^https?:\/\//, "")}
                </a>
                <button
                  className="mn-copy-link"
                  type="button"
                  onClick={() => void copyLink()}
                >
                  {order.copied ? p.copied : c.copy}
                </button>
              </div>
              <p className="mn-copy-status" aria-live="polite">
                {order.copied ? c.copied : ""}
              </p>
            </div>
            <p className="mn-print-note">{c.print}</p>
          </div>
        </section>
      </section>
    </div>
  );
}
