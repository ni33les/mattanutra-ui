"use client";
import { useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { SafeImage } from "@/components/safe-image";
import { PharmacyGuide } from "@/components/pharmacy/guide";
import { localizedDoseText, localizedSupplementName } from "@/components/formulation-support-helpers";
import { pharmacyCopy } from "@/lib/pharmacy-copy";
import { MAGIC_DUST_CAPACITY, pharmacyPresentationPhase, pharmacyRainWords, pharmacyRainStyle, type PharmacyPhase } from "@/lib/pharmacy-presentation";
import type { FormulationIngredient } from "@/lib/formulation-types";
import type { Locale } from "@/lib/i18n";
import { usePharmacyAnimation } from "@/components/pharmacy/use-pharmacy-animation";
import { combinedCopy } from "@/components/pharmacy/combined-copy";
import "./combined.css";

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

export type PharmacyRevealShellProps = {
  locale: Locale;
  ready: boolean;
  failed: boolean;
  formulaReady: boolean;
  matchingReady?: boolean;
  result?: ReactNode;
  children?: ReactNode;
  waitingDetails?: ReactNode;
  recovery?: ReactNode;
  status?: ReactNode;
  title?: ReactNode;
  estimate?: ReactNode;
  showEstimate?: boolean;
  inputs?: readonly string[];
  testId?: string;
  readyTestId?: string;
  preserveProgress?: boolean;
  rootRef?: RefObject<HTMLDivElement | null>;
};

/** Shared presentation only. Each channel retains its own generation, pricing and order adapter. */
export function PharmacyRevealShell({ locale, ready, failed, formulaReady,
  matchingReady = ready, result, children, waitingDetails, recovery, status: customStatus,
  title, estimate, showEstimate = true, inputs, testId = "pharmacy-combined", readyTestId, preserveProgress = false, rootRef,
}: PharmacyRevealShellProps) {
  const c = combinedCopy[locale], p = pharmacyCopy[locale];
  const root = useRef<HTMLElement | null>(null);
  const [animatedPhase, setAnimatedPhase] = useState<PharmacyPhase>("inputs");
  const [startedPending] = useState(!ready);
  usePharmacyAnimation(root, ready, failed, setAnimatedPhase, matchingReady);
  const phase = pharmacyPresentationPhase({ phase: animatedPhase, formulaReady, ready, failed });
  const status = customStatus ?? (phase === "inputs" ? c.combining : phase === "rain" ? c.rain
    : phase === "clarity" ? c.clarity : phase === "waiting" ? c.waiting : phase === "failed" ? c.failed
    : `${c.matching} ${c.personalised} ${c.matchingEnd}`);
  return <div ref={rootRef} id="mn-pharmacy-combined" data-testid={testId}
    data-channel={preserveProgress ? "web" : "pharmacy"}>
    <section ref={root} className="mn-window" data-phase={phase}
      data-formula-ready={formulaReady} data-preserve-progress={preserveProgress}
      data-started-pending={startedPending} data-testid={ready ? readyTestId : undefined}
      aria-labelledby="mn-combined-title" aria-busy={!ready && !failed && !(preserveProgress && formulaReady)}>
        <div className="mn-flight-layer" aria-hidden="true">
              <div className="mn-magic-dust">
                {Array.from({ length: MAGIC_DUST_CAPACITY }, (_, index) => (
                  <span key={index} className="mn-dust-particle" />
                ))}
              </div>
              <span className="mn-clarity-logo-shell">
                <SafeImage
                  className="mn-clarity-logo"
                  src="/assets/pharmacy/combined/leaf.webp"
                  alt=""
                  width={92}
                  height={92}
                />
              </span>
        </div>
      <h2 id="mn-combined-title">{title ?? c.title}</h2>
      <div className="mn-status-row">
        <div className="mn-status" aria-live="polite">
          <span className="mn-status-single" hidden={phase === "ready"}>{status}</span>
          <div className="mn-status-final" hidden={phase !== "ready"}>
            <span className="mn-status-kicker">{c.complete}</span>
            <h3 className="mn-status-payoff">{c.payoff}</h3>
          </div>
        </div>
        <PharmacyGuide />
      </div>
      {showEstimate && ((!ready && !failed) || (preserveProgress && startedPending)) && <div className="mn-estimate">
        <p>{estimate ?? c.estimate}</p>
        {(phase === "waiting" || phase === "matching" || (preserveProgress && startedPending)) && <p className="mn-processing-activity" data-testid="pharmacy-processing-activity" role="status">
          {!ready && !failed && <LoaderCircle aria-hidden="true" size={22} />}
          {ready ? c.ready : customStatus ?? (failed ? c.failed : formulaReady ? `${c.matching} ${c.personalised} ${c.matchingEnd}` : c.waiting)}
        </p>}
      </div>}
      {waitingDetails}
      <div className="mn-stage" role="group" aria-label={p.preparing}>
          <div
            className={`mn-layer mn-analysis ${matchingReady ? "is-complete" : ""}`}
          >
            <div>
              <div className="mn-analysis-grid">
                {(inputs ?? c.inputs).map((label, index) => (
                  <div
                    key={index}
                    className={`mn-analysis-tile ${matchingReady ? "is-active" : ""}`}
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
        <div className="mn-layer mn-result" aria-hidden={!formulaReady}>{result}</div>
      </div>
      {recovery}
      <p className="mn-ready" aria-live="polite">{ready ? c.ready : ""}</p>
      {children}
    </section>
  </div>;
}

export function PharmacyIngredientCards({ locale, ingredients, name, details }: {
  locale: Locale; ingredients: FormulationIngredient[]; name: string;
  details?: (ingredient: FormulationIngredient) => ReactNode;
}) {
  const c = combinedCopy[locale];
  return <div className="mn-selected-wrap" data-result-stage="formula">
    <h3 className="mn-selected-label">{ingredients.length}{" "}
      {locale === "en" && ingredients.length === 1 ? "ingredient selected for" : c.selected}{" "}<em>{name}</em>
    </h3>
    <div className="mn-selected-grid">
      {ingredients.map((ingredient, i) => <div className="mn-nutrient" key={ingredient.id} style={{ "--i": i } as CSSProperties}>
        <strong>{localizedSupplementName(ingredient.supplement, ingredient.id, locale)}</strong>
        <span className="text-small">{localizedDoseText(ingredient.dailyDose, locale)}</span>
        {details && <div className="mn-nutrient-details">{details(ingredient)}</div>}
      </div>)}
    </div>
  </div>;
}

export function PharmacyProductCard({ locale, imageUrl, name, coverage, price, quantity, selected,
  disabled = false, onChange, children, badge }: {
  locale: Locale; imageUrl?: string | null; name: string; coverage?: ReactNode; price: ReactNode;
  quantity?: number; selected: boolean; disabled?: boolean; onChange: (selected: boolean) => void;
  children?: ReactNode; badge?: ReactNode;
}) {
  const c = combinedCopy[locale], p = pharmacyCopy[locale];
  return <div className={`mn-product ${selected ? "" : "is-excluded"}`}>
    {badge !== undefined && <div className="mn-product-badge-slot">{badge}</div>}
    <SafeImage className="mn-packshot-photo" src={imageUrl} alt="" width={156} height={260} />
    <div className="mn-match text-small"><Check size={15} aria-hidden="true" />{c.matched}</div>
    <div className="mn-product-name text-small">{name}</div>
    <div className="mn-coverage text-small">{coverage}</div>
    <label className="mn-product-order">
      <input type="checkbox" className="mn-product-check" aria-label={name} checked={selected}
        disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span className="mn-product-price">{price}{quantity != null && <small>{p.quantity}: {quantity}</small>}</span>
    </label>
    {children}
  </div>;
}

export function PharmacyPlanInvitation({ locale, children, hidden = false }: {
  locale: Locale; children: ReactNode; hidden?: boolean;
}) {
  const c = combinedCopy[locale];
  return <section className="mn-coffee" aria-labelledby="mn-coffee-title" hidden={hidden}>
    <div className="mn-coffee-intro">
      <SafeImage src="/assets/library/nong/nong-coffee.webp" alt="" width={160} height={220} />
      <div>
        <p className="mn-order-kicker">{c.later}</p>
        <h3 id="mn-coffee-title">{c.coffeeTitle}</h3>
        <p className="mn-coffee-copy">{c.coffeeBody}</p>
        <p className="mn-nong-quote">{c.quote}</p>
      </div>
    </div>
    <div className="mn-return-path">{children}</div>
  </section>;
}
