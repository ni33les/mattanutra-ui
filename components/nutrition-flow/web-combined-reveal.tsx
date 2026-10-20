"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { PharmacyRevealShell, PharmacyIngredientCards, PharmacyProductCard, PharmacyPlanInvitation } from "@/components/pharmacy/reveal-presentation";
import { combinedCopy } from "@/components/pharmacy/combined-copy";
import { WebRevealRecovery } from "./web-preparation-panel";
import { webProductCopy } from "./web-product-copy";
import { useVisibleWebMilestones } from "./use-visible-web-milestones";
import { productRecommendationOptionsForResult, selectProductRecommendationOption, resultHasPendingProductRecommendations, selectedStackCoverage } from "@/components/formulation-results-helpers";
import { visibleFormulaIngredients, localizedSupplementName, localizedIngredientRationale } from "@/components/formulation-support-helpers";
import { getLocalizedText, revealFinalCopy } from "@/components/formulation-reveal-copy";
import { WebMatchingAdvice } from "@/components/web-health-advice";
import { firstNameFromFormulation } from "@/lib/assessment-first-name";
import { formatCurrencyAmount } from "@/lib/currencies";
import { reduceSelectionCoverage } from "@/lib/matcher/selection-coverage";
import { trackWebProductMilestone } from "@/lib/meta-client";
import { trackBpmEvent } from "@/lib/bpm-client";
import { nutritionRevealPath } from "@/lib/nutrition-paths";
import { webRevealProgress } from "@/lib/web-reveal-progress";
import type { FormulationResult, RecommendedProduct } from "@/lib/formulation-types";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import type { Locale } from "@/lib/i18n";
import "./web-preparation.css";

const productId = (product: RecommendedProduct) => product.productId ?? product.id;
const productAmount = (product: RecommendedProduct) => product.price?.amount ?? product.retailer?.unitPriceAmount;

/** Web adapter for the pharmacy presentation. All payment and order work stays in web checkout. */
export function WebCombinedReveal({ locale, planId, result, snapshot, failed, retry }: {
  locale: Locale; planId: string; result: FormulationResult | null;
  snapshot: NutritionJourneySnapshot | null; failed: boolean; retry: () => void;
}) {
  const c = webProductCopy[locale], shared = combinedCopy[locale], detailCopy = revealFinalCopy[locale];
  const root = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false), [copyFailed, setCopyFailed] = useState(false);
  const formula = result?.access === "full" && snapshot && snapshot.revision === result.assessmentRevision
    && snapshot.formulaVersion === result.formulaVersion ? result : null;
  const ingredients = visibleFormulaIngredients(formula?.supplementBreakdown ?? []).sort((a, b) => a.effectivenessRank - b.effectivenessRank);
  const option = formula ? selectProductRecommendationOption(productRecommendationOptionsForResult(formula), "balanced") : undefined;
  const summary = option?.productRecommendations ?? formula?.productRecommendations;
  const ready = Boolean(formula && snapshot?.readyForReveal && !snapshot.refreshPending && !snapshot.failed
    && (summary?.runId ?? null) === snapshot.productRunId && !resultHasPendingProductRecommendations(formula));
  const products = ready ? option?.recommendations ?? formula?.recommendations ?? [] : [];
  const progress = webRevealProgress({ ready, failed, formulaReady: Boolean(formula), snapshot });
  const runId = ready ? summary?.runId : undefined;
  const matching = summary?.matching;
  const matchedOption = matching?.options.find(candidate => candidate.candidateKey === matching.selectedCandidateKey);
  // A different run or assessment revision must never inherit an old basket selection.
  const identity = `${planId}:${formula?.assessmentRevision}:${formula?.selectionRevision}:${runId}:${matching?.selectedCandidateKey}:${products.map(productId).join(",")}`;
  const [selection, setSelection] = useState<{ identity: string; ids: string[] } | null>(null);
  const selectedIds = selection?.identity === identity ? selection.ids : products.map(productId);
  const selected = products.filter(product => selectedIds.includes(productId(product)));
  const removed = products.filter(product => !selectedIds.includes(productId(product)));
  const coverage = reduceSelectionCoverage(matchedOption?.coverageSnapshot, selectedIds);
  const basketCoverage = removed.length ? coverage.coveragePercent : selectedStackCoverage(summary, products);
  const retailer = [...(option?.retailerOptions ?? [])].filter(item => item.organisationId && item.organisationName).sort((a, b) =>
    (b.supplementProductCoveragePercent ?? 0) - (a.supplementProductCoveragePercent ?? 0) ||
    (b.totalPlanCoveragePercent ?? 0) - (a.totalPlanCoveragePercent ?? 0) ||
    (a.subtotalAmount ?? Infinity) - (b.subtotalAmount ?? Infinity) || (a.etaDate ?? "").localeCompare(b.etaDate ?? ""))[0];
  const currency = retailer?.currency ?? selected.find(product => product.price?.currency)?.price?.currency ?? products[0]?.price?.currency ?? "THB";
  const hasPrice = (product: RecommendedProduct) => Number.isFinite(productAmount(product)) && Number(productAmount(product)) > 0;
  const priced = products.every(hasPrice);
  const selectedPriced = selected.every(hasPrice);
  const total = !removed.length && Number.isFinite(retailer?.subtotalAmount) ? Number(retailer!.subtotalAmount)
    : selected.reduce((sum, product) => sum + Number(productAmount(product) ?? 0), 0);
  const params = new URLSearchParams({ plan: planId, selected: selectedIds.join(","), removed: removed.map(productId).join(","),
    ...(runId ? { run: runId } : {}), ...(matching?.selectedCandidateKey ? { option: matching.selectedCandidateKey } : {}),
    ...(formula?.assessmentRevision != null ? { revision: String(formula.assessmentRevision) } : {}),
    ...(formula?.selectionRevision != null ? { selectionRevision: String(formula.selectionRevision) } : {}),
    ...(retailer?.organisationId ? { retailer: retailer.organisationId } : {}) });
  const checkoutHref = ready && selectedPriced && selectedIds.length ? `/${locale}/basket/checkout?${params}` : "";
  const affected = coverage.status === "verified"
    ? coverage.needCoverage.filter(need => coverage.removedNeedIds.includes(need.id)).map(need => getLocalizedText(need.displayName, locale))
    : [...new Set(removed.flatMap(product => product.covers))].map(id => localizedSupplementName(ingredients.find(item => item.id === id)?.supplement ?? id, id, locale));
  useVisibleWebMilestones(root, { enabled: Boolean(formula), planId, locale, revision: formula?.assessmentRevision ?? 0,
    formulaVersion: formula?.formulaVersion, runId: priced ? runId : undefined });

  function toggle(id: string, included: boolean) {
    const ids = included ? [...new Set([...selectedIds, id])] : selectedIds.filter(value => value !== id);
    setSelection({ identity, ids });
    trackBpmEvent("product_basket_edited", { eventType: "funnel", locale, planId,
      properties: { planId, revision: formula?.assessmentRevision, runId, journeyVersion: "web-products-v1", selectedItemIds: ids, productId: id, included } });
  }
  function confirmBasket() {
    if (!checkoutHref) return;
    void trackWebProductMilestone("basket", { planId, locale, revision: formula?.assessmentRevision ?? 0,
      runId, selectedItemIds: selectedIds, candidateKey: matching?.selectedCandidateKey, selectionRevision: formula?.selectionRevision });
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(nutritionRevealPath(locale, planId), window.location.origin).href);
      setCopied(true); setCopyFailed(false);
    } catch { setCopyFailed(true); }
  }

  return <div ref={root} data-testid="web-product-journey" data-stage={ready ? "ready" : formula ? "products" : "formula"}>
    <PharmacyRevealShell locale={locale} ready={ready} failed={failed} formulaReady={Boolean(formula)} preserveProgress
      title={c.ready} showEstimate={false}
      status={ready || failed ? c[progress] : <span className="mn-web-progress">
        <LoaderCircle className="mn-web-progress-spinner" aria-hidden="true" />
        <span>{c[progress]}</span>
      </span>}
      inputs={shared.inputs.map((label, index) => index === 3 ? c.availableProducts : label)}
      recovery={<WebRevealRecovery failed={failed} ready={ready} locale={locale} planId={planId} retry={retry} />}
      result={formula ? <>
        <div data-web-result-stage={ingredients.length ? "formula" : undefined}>
          <PharmacyIngredientCards locale={locale} ingredients={ingredients} name={firstNameFromFormulation(formula) || shared.you}
            details={ingredient => <div className="mn-web-ingredient-detail">
              <p>{getLocalizedText(ingredient.whyThisIsForYou ?? ingredient.forYou ?? ingredient.rationale, locale)}</p>
              <details><summary>{detailCopy.nutrientWhy}</summary>
                {ingredient.whyThisIsForYou && <p>{getLocalizedText(ingredient.whyThisIsForYou, locale)}</p>}
                <p>{localizedIngredientRationale(ingredient, locale)}</p>
                {ingredient.decision && <p>{getLocalizedText(ingredient.decision, locale)}</p>}
                {ingredient.safety?.message && <p className="mn-web-caution">{getLocalizedText(ingredient.safety.message, locale)}</p>}
                {ingredient.cautions?.map(caution => <p key={caution.id} className="mn-web-caution">{getLocalizedText(caution.body, locale)}</p>)}
              </details>
            </div>} />
        </div>
        <div className="mn-group-flow"><h3 className="mn-flow-copy">{c.availableProducts}</h3><div className="mn-flow-mark" aria-hidden="true" /></div>
        {ready && <div id="products" className="mn-products" data-web-result-stage={products.length && priced ? "products" : undefined}>
          {products.map(product => <PharmacyProductCard key={productId(product)} locale={locale} imageUrl={product.imageUrl} name={product.name}
            coverage={product.covers.map(id => localizedSupplementName(ingredients.find(item => item.id === id)?.supplement ?? id, id, locale)).join(" · ")}
            price={Number.isFinite(productAmount(product)) ? formatCurrencyAmount(locale, Number(productAmount(product)), product.price?.currency ?? currency) : "—"}
            quantity={1} selected={selectedIds.includes(productId(product))} onChange={included => toggle(productId(product), included)} />)}
        </div>}
      </> : undefined}>
      {ready && <>
        {matchedOption && <div className="mn-web-matching-advice"><WebMatchingAdvice advice={matchedOption.advice} locale={locale} selected showDetails={false} /></div>}
        <section className="mn-transaction" aria-labelledby="mn-web-order-title" data-testid="web-basket">
          <h3 id="mn-web-order-title">{c.reviewBasket}</h3><p className="mn-order-help">{shared.help}</p>
          <div className="mn-order-summary" aria-live="polite" aria-atomic="true"><span className="mn-order-count">{selected.length} {shared.items}</span>
            <strong className="mn-order-total">{selectedPriced ? formatCurrencyAmount(locale, total, currency) : "—"}</strong></div>
          {!!products.length && <p className="mn-web-coverage">{c.coverage}: {basketCoverage == null ? "—" : `${Math.round(basketCoverage)}%`}</p>}
          {!!removed.length && <div className="mn-web-basket-impact" data-testid="basket-selection-impact" role="status">
            <p>{coverage.status === "verified" ? c.subset : c.unknownCoverage}</p>
            {!!affected.length && <p>{c.affected}: {affected.join(" · ")}</p>}<p>{c.fullFormula}</p>
          </div>}
          {!products.length ? <p>{c.noProducts}</p> : <>
            <p className="mn-pre-confirm">{c.free}</p>
            <p className="mn-pre-confirm">{selectedPriced ? c.deliveryNext : c.pricingPending}</p>
            {checkoutHref ? <Link className="mn-confirm-btn" href={checkoutHref} onClick={confirmBasket}>{c.continue}</Link>
              : <button className="mn-confirm-btn" disabled>{selectedIds.length ? c.continue : c.empty}</button>}
          </>}
        </section>
        <PharmacyPlanInvitation locale={locale}>
          <Link className="mn-read-now" href={`/${locale}/nutrition/plan?plan=${encodeURIComponent(planId)}`}>{c.plan}</Link>
          <Link className="mn-read-now" href={`/${locale}/nutrition/healthscore?plan=${encodeURIComponent(planId)}&view=optional`}>{c.health}</Link>
          <p className="mn-browser-note">{c.saved}</p>
          <div className="mn-plan-url-card">
            <a className="mn-plan-url" href={nutritionRevealPath(locale, planId)}>{nutritionRevealPath(locale, planId)}</a>
            <button className="mn-copy-link" type="button" onClick={() => void copyLink()}>{copied ? c.copied : c.copy}</button>
          </div>
          {copyFailed && <p role="status">{c.copyFailed}</p>}
        </PharmacyPlanInvitation>
      </>}
    </PharmacyRevealShell>
  </div>;
}
