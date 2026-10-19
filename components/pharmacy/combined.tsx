"use client";
import {
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  visibleFormulaIngredients,
  localizedSupplementName,
} from "@/components/formulation-support-helpers";
import { formatCurrencyAmount } from "@/lib/currencies";
import { pharmacyCopy } from "@/lib/pharmacy-copy";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { trackBpmEvent } from "@/lib/bpm-client";
import type { FormulationResult } from "@/lib/formulation-types";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import type { PharmacyOrderReceipt } from "@/lib/pharmacy-orders";
import type { Locale } from "@/lib/i18n";
import { useCombinedResult } from "@/components/pharmacy/use-combined-result";
import { usePharmacyOrder } from "@/components/pharmacy/use-pharmacy-order";
import { combinedCopy } from "@/components/pharmacy/combined-copy";
import { PharmacyLineConnect } from "@/components/pharmacy/line-connect";
import { PharmacyRevealShell, PharmacyIngredientCards, PharmacyProductCard, PharmacyPlanInvitation } from "@/components/pharmacy/reveal-presentation";

const subscribeOrigin = () => () => {};
const readOrigin = () => window.location.origin;
const serverOrigin = () => "";
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
  const ready = work.ready && order.loaded;
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
  return <PharmacyRevealShell locale={locale} ready={ready} failed={work.failed} formulaReady={Boolean(result)}
    matchingReady={work.ready} readyTestId="pharmacy-order"
    result={<>
      <PharmacyIngredientCards locale={locale} ingredients={ingredients} name={name} />
      <div className="mn-group-flow">
        <h3 className="mn-flow-copy">{c.matching} <span>{c.personalised}</span> {c.matchingEnd}</h3>
        <div className="mn-flow-mark" aria-hidden="true" />
      </div>
      <div className="mn-products" aria-label={p.products}>
        {shown.map(line => {
          const product = result?.recommendations.find(item => (item.productId ?? item.id) === line.productId);
          return <PharmacyProductCard key={line.productId} locale={locale} imageUrl={line.imageUrl}
            name={line.name} selected={activeIds.has(line.productId)} disabled={order.busy || Boolean(order.receipt)}
            quantity={line.quantity} price={formatCurrencyAmount(locale, line.unitPrice * line.quantity, line.currency)}
            coverage={product?.covers.map(id => {
              const ingredient = ingredients.find(item => item.id === id);
              return localizedSupplementName(ingredient?.supplement ?? id, id, locale);
            }).join(" · ")}
            onChange={included => {
              order.setSelected(ids => included ? [...ids, line.productId] : ids.filter(id => id !== line.productId));
              order.setKey(crypto.randomUUID());
            }} />;
        })}
      </div>
    </>}
    recovery={work.failed && !work.ready ? <div className="mn-recovery" role="alert">
      <p>{c.failed}</p><button className="mn-recovery-button" data-testid="pharmacy-progress-retry" onClick={retry}>{p.retry}</button>
    </div> : null}>
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
    <PharmacyPlanInvitation locale={locale} hidden={!ready}>
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
    </PharmacyPlanInvitation>
  </PharmacyRevealShell>;
}
