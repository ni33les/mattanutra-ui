"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { PharmacyRevealShell, PharmacyIngredientCards, PharmacyProductCard, PharmacyPlanInvitation } from "@/components/pharmacy/reveal-presentation";
import { combinedCopy } from "@/components/pharmacy/combined-copy";
import { WebRevealRecovery } from "./web-preparation-panel";
import { webProductCopy } from "./web-product-copy";
import { SectionCard } from "./ui";
import { useWebBasketSelection } from "./use-web-basket-selection";
import { CheckoutPackaging, CheckoutPharmacyCare } from "@/components/retail-checkout/checkout-trust-hero";
import { useVisibleWebMilestones } from "./use-visible-web-milestones";
import { productRecommendationOptionsForResult, selectProductRecommendationOption, resultHasPendingProductRecommendations } from "@/components/formulation-results-helpers";
import { visibleFormulaIngredients, localizedSupplementName, localizedIngredientRationale } from "@/components/formulation-support-helpers";
import { getLocalizedText, revealFinalCopy } from "@/components/formulation-reveal-copy";
import { WebMatchingAdvice } from "@/components/web-health-advice";
import { firstNameFromFormulation } from "@/lib/assessment-first-name";
import { formatCurrencyAmount } from "@/lib/currencies";
import { reduceSelectionCoverage } from "@/lib/matcher/selection-coverage";
import { starterProductIds } from "@/lib/web-basket-selection";
import { trackWebProductMilestone } from "@/lib/meta-client";
import { trackBpmEvent } from "@/lib/bpm-client";
import { nutritionRevealPath } from "@/lib/nutrition-paths";
import { webRevealProgress } from "@/lib/web-reveal-progress";
import type { FormulationResult, LocalizedText, RecommendedProduct } from "@/lib/formulation-types";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import { resolveLocalizedText, type Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n-messages";
import "./web-preparation.css";

const productId = (product: RecommendedProduct) => product.productId ?? product.id;
const productAmount = (product: RecommendedProduct) => product.price?.amount ?? product.retailer?.unitPriceAmount;

/** Web adapter for the pharmacy presentation. All payment and order work stays in web checkout. */
export function WebCombinedReveal({ locale, planId, result, snapshot, failed, retry }: {
  locale: Locale; planId: string; result: FormulationResult | null;
  snapshot: NutritionJourneySnapshot | null; failed: boolean; retry: () => void;
}) {
  const c = webProductCopy[locale], shared = combinedCopy[locale], detailCopy = revealFinalCopy[locale];
  // Changing display language must never hide saved explanations or cautions.
  const generatedText = (value: LocalizedText) => getLocalizedText(value, locale)
    || resolveLocalizedText(value, snapshot?.locale ?? locale).trim();
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
  const catalogueUnavailable = ready && ingredients.length > 0 && products.length === 0
    && matching?.operationalStatus === "no_purchase"
    && matching.matchingDiagnostics?.reasonCode === "catalogue_empty";
  const matchedOption = matching?.options.find(candidate => candidate.candidateKey === matching.selectedCandidateKey);
  const allIds = products.map(productId);
  const starterIds = starterProductIds(allIds, matchedOption?.coverageSnapshot);
  // A different run or assessment revision must never inherit an old basket selection.
  const identity = `${planId}:${formula?.assessmentRevision}:${formula?.selectionRevision}:${runId}:${matching?.selectedCandidateKey}:${allIds.join(",")}`;
  const [selectedIds, setSelectedIds] = useWebBasketSelection(identity, allIds, starterIds);
  const isStarter = selectedIds.length === starterIds.length && starterIds.every(id => selectedIds.includes(id));
  const isAll = selectedIds.length === allIds.length && allIds.every(id => selectedIds.includes(id));
  const selected = products.filter(product => selectedIds.includes(productId(product)));
  const removed = products.filter(product => !selectedIds.includes(productId(product)));
  const coverage = reduceSelectionCoverage(matchedOption?.coverageSnapshot, selectedIds);
  const retailer = [...(option?.retailerOptions ?? [])].filter(item => item.organisationId && item.organisationName).sort((a, b) =>
    (b.supplementProductCoveragePercent ?? 0) - (a.supplementProductCoveragePercent ?? 0) ||
    (b.totalPlanCoveragePercent ?? 0) - (a.totalPlanCoveragePercent ?? 0) ||
    (a.subtotalAmount ?? Infinity) - (b.subtotalAmount ?? Infinity) || (a.etaDate ?? "").localeCompare(b.etaDate ?? ""))[0];
  const currency = retailer?.currency ?? selected.find(product => product.price?.currency)?.price?.currency ?? products[0]?.price?.currency ?? "THB";
  const pharmacyName = retailer?.organisationName?.trim();
  const pharmacyCity = retailer?.dispatchCity?.trim();
  const pharmacyLabel = pharmacyName && pharmacyCity
    ? c.pharmacyLocation.replace("{pharmacy}", pharmacyName).replace("{city}", pharmacyCity)
    : pharmacyName;
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
    setSelectedIds(ids);
    trackBpmEvent("product_basket_edited", { eventType: "funnel", locale, planId,
      properties: { planId, revision: formula?.assessmentRevision, runId, journeyVersion: "web-products-v1", selectedItemIds: ids, productId: id, included } });
  }
  function applyPreset(preset: "starter" | "all") {
    const ids = preset === "starter" ? starterIds : allIds;
    setSelectedIds(ids);
    trackBpmEvent("product_basket_edited", { eventType: "funnel", locale, planId,
      properties: { planId, revision: formula?.assessmentRevision, runId, journeyVersion: "web-products-v1", selectedItemIds: ids, preset } });
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
      status={progress === "calculating" ? "" : ready || failed ? c[progress] : <span className="mn-web-progress">
        <LoaderCircle className="mn-web-progress-spinner" aria-hidden="true" />
        <span>{c[progress]}</span>
      </span>}
      inputs={shared.inputs.map((label, index) => index === 3 ? catalogueUnavailable ? c.productAvailability : c.availableProducts : label)}
      recovery={<WebRevealRecovery failed={failed} ready={ready} locale={locale} planId={planId} retry={retry} />}
      result={formula ? <>
        <div data-web-result-stage={ingredients.length ? "formula" : undefined}>
          <PharmacyIngredientCards locale={locale} ingredients={ingredients} name={firstNameFromFormulation(formula) || shared.you}
            details={ingredient => <div className="mn-web-ingredient-detail">
              <p>{generatedText(ingredient.whyThisIsForYou ?? ingredient.forYou ?? ingredient.rationale)}</p>
              <details><summary>{detailCopy.nutrientWhy}</summary>
                {ingredient.whyThisIsForYou && <p>{generatedText(ingredient.whyThisIsForYou)}</p>}
                <p>{generatedText(ingredient.rationale) || localizedIngredientRationale(ingredient, locale)}</p>
                {ingredient.decision && <p>{generatedText(ingredient.decision)}</p>}
                {ingredient.safety?.message && <p className="mn-web-caution">{generatedText(ingredient.safety.message)}</p>}
                {ingredient.cautions?.map(caution => <p key={caution.id} className="mn-web-caution">{generatedText(caution.body)}</p>)}
              </details>
            </div>} />
        </div>
        {!catalogueUnavailable && <div className="mn-group-flow"><h3 className="mn-flow-copy">{ready && products.length ? c.starterTitle : c.availableProducts}</h3><div className="mn-flow-mark" aria-hidden="true" /></div>}
        {ready && products.length > 0 && <div className="mn-web-product-presets">
          <p>{products.length >= 2 ? c.starterHelp : c.selectionHelp}</p>
          <div className="mn-pill-group" role="group" aria-label={c.selectionPresets}>
            <button type="button" data-testid="starter-preset" aria-pressed={isStarter}
              className={`mn-pill ${isStarter ? "mn-pill--selected" : "mn-pill--idle"}`} onClick={() => applyPreset("starter")}>{c.startHere}</button>
            <button type="button" data-testid="all-products-preset" aria-pressed={isAll && !isStarter}
              className={`mn-pill ${isAll && !isStarter ? "mn-pill--selected" : "mn-pill--idle"}`} onClick={() => applyPreset("all")}>{c.allProducts}</button>
          </div>
        </div>}
        {ready && !catalogueUnavailable && <div id="products" className="mn-products" data-web-result-stage={products.length && priced ? "products" : undefined}>
          {products.map(product => <PharmacyProductCard key={productId(product)} locale={locale} imageUrl={product.imageUrl} name={product.name}
            coverage={product.covers.map(id => localizedSupplementName(ingredients.find(item => item.id === id)?.supplement ?? id, id, locale)).join(" · ")}
            price={Number.isFinite(productAmount(product)) ? formatCurrencyAmount(locale, Number(productAmount(product)), product.price?.currency ?? currency) : "—"}
            badge={starterIds.includes(productId(product)) && selectedIds.includes(productId(product)) ? <span className="mn-web-starter-badge text-small" data-testid="starter-product-badge">{c.starterBadge}</span> : null}
            quantity={1} selected={selectedIds.includes(productId(product))} onChange={included => toggle(productId(product), included)} />)}
        </div>}
      </> : undefined}>
      {ready && <>
        {matchedOption && <div className="mn-web-matching-advice"><WebMatchingAdvice advice={matchedOption.advice} locale={locale} selected showDetails={false} /></div>}
        {catalogueUnavailable ? <section className="mn-transaction" aria-labelledby="mn-web-availability-title" data-testid="web-product-unavailable">
          <h3 id="mn-web-availability-title">{c.productAvailability}</h3>
          <p className="mn-order-help" role="status">{c.productsUnavailable}</p>
          <p>{c.planSavedWithoutProducts}</p>
        </section> : <div className="mn-web-basket" data-testid="web-basket">
          <SectionCard done={false} title={c.reviewBasket} titleId="mn-web-order-title"
            description={<><strong>{t(locale, "customer.titleBar.logoTagline")}</strong><br />
              <span>{c.rightAmountBody}</span><br /><br />
              <strong>{c.selectionHelp}</strong><br />{c.selectionUpdates}</>}
            footer={!!products.length && <div className="space-y-3">
              {!selectedPriced && <p className="mn-section-card__copy">{c.pricingPending}</p>}
              {checkoutHref ? <Link className="mn-green-button w-full gap-2" href={checkoutHref} onClick={confirmBasket}>{c.continue}<ArrowRight size={18} aria-hidden="true" /></Link>
                : <button className="mn-green-button w-full gap-2 disabled:cursor-not-allowed disabled:opacity-50" disabled>{selectedIds.length ? c.continue : c.empty}<ArrowRight size={18} aria-hidden="true" /></button>}
              <p className="mn-section-card__copy mn-web-checkout-note">{c.reviewBeforePayment}</p>
            </div>}>
          <div className="mn-order-summary" aria-live="polite" aria-atomic="true"><span className="mn-order-count">{selected.length} {shared.items}</span>
            <strong className="mn-order-total">{selectedPriced ? new Intl.NumberFormat(locale, {
              style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 0
            }).format(total) : "—"}</strong></div>
          {!products.length ? <p>{c.noProducts}</p> : <>
            <p className="mn-web-payment-note">{c.selectionPayment}</p>
            <section className="mn-web-pharmacy-delivery" aria-labelledby="mn-web-pharmacy-title">
              <div className="mn-web-delivery-layout">
                <CheckoutPackaging locale={locale} compact />
                <div className="space-y-4">
                  <h3 id="mn-web-pharmacy-title">{pharmacyName ? c.pharmacyDeliveryFrom.replace("{pharmacy}", pharmacyName) : c.pharmacyDelivery}</h3>
                  <p>{pharmacyLabel ? <>{c.pharmacyLead}<strong>{pharmacyLabel}</strong>{c.pharmacyTail}</> : c.pharmacyFallback}</p>
                  <CheckoutPharmacyCare locale={locale} retailerName={pharmacyName ?? null} compact />
                </div>
              </div>
            </section>
          </>}
          </SectionCard>
        </div>}
        {!!removed.length && <div className="mn-web-selection-details">
          <div className="mn-web-basket-impact" data-testid="basket-selection-impact" role="status">
            <p>{coverage.status === "verified" ? c.subset : c.unknownCoverage}</p>
            {!!affected.length && <p>{c.affected}: {affected.join(" · ")}</p>}<p>{c.fullFormula}</p>
          </div>
        </div>}
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
