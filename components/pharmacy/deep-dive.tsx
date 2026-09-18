"use client";

import { useState, type ReactNode } from "react";
import { SafeImage } from "@/components/safe-image";
import { getLocalizedText, localizedCategoryLabel, localizedCategoryExplanation, localizedContextChip } from "@/components/formulation-reveal-copy";
import { groupedFormulaIngredients, visibleFormulaIngredients, localizedDoseText, localizedSupplementName } from "@/components/formulation-support-helpers";
import { coveredRevealNeedCount } from "@/lib/marketing-coverage";
import { partitionWebMatchingAdvice } from "@/lib/web-health-advice";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { pharmacyCopy } from "@/lib/pharmacy-copy";
import { formatCurrencyAmount } from "@/lib/currencies";
import { localeHtmlLang, type Locale } from "@/lib/i18n";
import type { FormulationResult, FoodGapSupportVariant, LocalizedText, WebHealthAdvice } from "@/lib/formulation-types";
import type { HealthScoreResult } from "@/lib/health-score/v4-types";
import type { PharmacyOrderReceipt } from "@/lib/pharmacy-orders";
import { pharmacyDeepDiveCopy } from "./deep-dive-copy";
import styles from "./deep-dive.module.css";
import { PharmacyLineConnect } from "./line-connect";

const normalized = (value: string) => value.toLowerCase().replace(/[\s_:-]+/g, "");

function Chapter({ number, label, title, image }: { number: number; label: string; title: readonly string[]; image?: string }) {
  return <div className="ch">
    {image && <div className="ch-fig"><SafeImage src={`/assets/pharmacy/deep-dive/${image}.webp`} alt="" width={120} height={180} /></div>}
    <div className="ch-text"><div className="ch-meta"><span className="ch-num">{String(number).padStart(2, "0")}</span><span className="ch-label">{label}</span></div>
      <h2>{title[0]}<em>{title[1]}</em></h2>
    </div>
  </div>;
}

export function PharmacyDeepDive({ locale, slug, pharmacyName, planId, result, health, receipt, food, analysisNotice, retryFood }: {
  locale: Locale; slug: string; pharmacyName: string; planId: string; result: FormulationResult; health: HealthScoreResult | null;
  receipt: PharmacyOrderReceipt | null; food?: FoodGapSupportVariant; analysisNotice: ReactNode; retryFood: () => void;
}) {
  const c = pharmacyCopy[locale], d = pharmacyDeepDiveCopy[locale];
  const text = (value: LocalizedText | undefined) => value ? getLocalizedText(value, locale).trim() : "";
  const ingredients = visibleFormulaIngredients(result.supplementBreakdown).sort((a, b) => a.effectivenessRank - b.effectivenessRank);
  const groups = groupedFormulaIngredients(ingredients);
  const copy = health?.pageContent?.aiCopy;
  const selected = result.productRecommendations?.matching?.options.find(o => o.candidateKey === result.productRecommendations?.matching?.selectedCandidateKey);
  const medical = partitionWebMatchingAdvice([...(selected?.advice ?? []), ...ingredients.flatMap(i => i.safety?.advice ?? [])]).medical;
  const nameFor = (id: string) => {
    const ingredient = ingredients.find(i => normalized(i.id) === normalized(id.replace(/^supplement:/, "")));
    return ingredient ? localizedSupplementName(ingredient.supplement, ingredient.id, locale) : id;
  };
  const coverageRows = ingredients.map(i => {
    const row = result.productRecommendations?.needCoverage?.find(n => n.id === `supplement:${i.id}`);
    const value = row?.bestRejectedReason === "unknown" ? null : row?.coveragePercent;
    return { id: i.id, coveragePercent: typeof value === "number" && Number.isFinite(value) ? value : null };
  });
  const coverageKnown = coverageRows.every(row => row.coveragePercent !== null);
  const products = receipt ? receipt.lines.map(line => ({
    ...result.recommendations.find(p => (p.productId ?? p.id) === line.productId),
    id: line.productId, name: line.name, imageUrl: line.imageUrl, orderLine: line
  })) : result.recommendations.map(p => ({ ...p, orderLine: null }));
  const fullRecommendedBasket = !receipt || (products.length === result.recommendations.length &&
    result.recommendations.every(p => receipt.lines.some(line => line.productId === (p.productId ?? p.id))));
  const chapterLabels = [c.picture, c.noticed, c.thinking, c.ingredients, receipt ? c.ordered : c.products, c.foods, c.safety];
  const path = pharmacyPath(locale, slug, "plan", { plan: planId, order: receipt?.id });
  const back = pharmacyPath(locale, slug, "reveal", { plan: planId, order: receipt?.id });
  const [copied, setCopied] = useState(false), [copyFailed, setCopyFailed] = useState(false);
  const date = new Date(result.generatedAt);
  const ingredientAdvice = (id: string, label: string): WebHealthAdvice[] => medical.filter(a =>
    [normalized(id), normalized(label)].includes(normalized(a.ingredient)));
  const globalCautions = [...new Set((result.cautions ?? []).map(a => text(a.body)).filter(Boolean))];
  const recordedIngredientCautions = ingredients.filter(i => i.cautions?.some(a => text(a.body)) ||
    (!i.safety?.advice?.length && i.safety?.visibility === "visible" && text(i.safety.message)));

  return <article className={styles.deep} data-testid="pharmacy-deep-dive" lang={localeHtmlLang(locale)}>
    <div className="wrap">
      <div className="opening">
        <SafeImage src="/assets/pharmacy/deep-dive/coffee.webp" alt="" width={190} height={290} priority />
        <p className="kicker">{c.details}</p>
        <h1 className="thainame" aria-label={c.details}>{result.firstName || result.assessmentSummary.firstName ? d.forName(result.firstName || result.assessmentSummary.firstName!) : c.details}<span>.</span></h1>
        <div className="measure"><p>{d.opening}</p></div>
        <a className="back" href={back}>← {c.back}</a>
        {analysisNotice}
      </div>
      <nav className="nav" aria-label={c.details}><ul>{chapterLabels.map((label, index) => <li key={label}><a href={`#s0${index + 1}`}>{label}</a></li>)}</ul></nav>

      <section id="s01">
        <Chapter number={1} label={c.picture} title={d.pictureTitle} image="picture" />
        <div className="measure-wide">
          <p className="prose">{text(copy?.overview ?? copy?.heroBody) || result.assessmentSummary.profile}</p>
          <dl className="profile-facts">
            {[[d.goals, result.assessmentSummary.goals.map(v => localizedContextChip(v, locale)).join(" · ")],
              [d.profile, result.assessmentSummary.profile], [d.region, result.assessmentSummary.region],
              [d.constraints, result.assessmentSummary.constraints.map(v => localizedContextChip(v, locale)).join(" · ")]]
              .filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          {health && <aside className="aside"><h3>{c.score}: {health.score}</h3><p>{text(copy?.bandLine) || health.summary}</p></aside>}
          {text(copy?.strengthNote) && <p className="prose">{text(copy?.strengthNote)}</p>}
        </div>
      </section>
      <hr className="rule" />
      <section id="s02">
        <Chapter number={2} label={c.noticed} title={d.noticedTitle} image="noticed" />
        <div className="measure-wide">{copy?.findings?.length ? copy.findings.map((card, index) => <div className="obs" key={index}>
          <span className="obs-mark">{String(index + 1).padStart(2, "0")}</span><h3>{text(card.title ?? card.headline)}</h3><p className="prose">{text(card.body)}</p>
        </div>) : <p>{health ? d.noFindings : d.pending}</p>}</div>
      </section>
      <hr className="rule" />
      <section id="s03">
        <Chapter number={3} label={c.thinking} title={d.methodTitle} image="thinking" />
        <p className="measure-wide">{d.methodBody}</p>
        {copy?.methodCards?.length ? <div className="method">{copy.methodCards.map((card, index) => <div key={index}>
          <span className="n">{String(index + 1).padStart(2, "0")}</span><h3>{text(card.title ?? card.headline)}</h3><p className="prose">{text(card.body)}</p>
        </div>)}</div> : !health && <p>{d.pending}</p>}
      </section>
      <hr className="rule" />
      <section id="s04">
        <Chapter number={4} label={c.ingredients} title={[`${d.formulaTitle(ingredients.length)} `, d.formulaEmphasis]} />
        <div className="howto measure-wide"><h3>{d.howTo}</h3><p>{d.grouping}</p><dl>{groups.map(([category]) => <div key={category}>
          <dt>{localizedCategoryLabel(category, locale)}</dt><dd>{localizedCategoryExplanation(category, locale)}</dd>
        </div>)}</dl></div>
        {groups.map(([category, items]) => <div key={category}>
          <div className="tier-head"><span className="tier-name">{localizedCategoryLabel(category, locale)}</span><span className="tier-count">{items.length}</span></div>
          {items.map(i => {
            const name = localizedSupplementName(i.supplement, i.id, locale), dose = localizedDoseText(i.dailyDose, locale);
            const why = text(i.whyThisIsForYou) || [...new Set([text(i.forYou), text(i.whyThis ?? i.rationale)].filter(Boolean))].join("\n\n");
            const safety = [...new Set([...ingredientAdvice(i.id, name).map(a => text(a.message)), ...(i.cautions ?? []).map(a => text(a.body)),
              ...(!i.safety?.advice?.length && i.safety?.visibility === "visible" ? [text(i.safety.message)] : [])].filter(Boolean))];
            const coverage = coverageRows.find(row => row.id === i.id)?.coveragePercent;
            return <article className="nut" id={`ingredient-${encodeURIComponent(i.id)}`} key={i.id}>
              <div className="nut-top"><div><h3 className="nut-name">{name}</h3></div><div className="nut-dose dose">{dose}</div></div>
              <div className="nut-body measure-wide">
                <div data-testid="nutrient-why"><h4 className="why-label">{d.why}</h4><p className="prose">{why}</p></div>
                <div data-testid="nutrient-decision"><h4 className="why-label">{d.decision}</h4><p className="prose">{text(i.decision) || `${d.proposedDose}: ${dose}`}</p>
                  <p className="coverage">{d.coverage}: {coverage == null ? c.unknown : `${Math.ceil(Math.min(100, Math.max(0, coverage)))}%`}</p></div>
                {safety.length > 0 && <div className="safety" data-testid="nutrient-safety"><h4 className="why-label">{d.safety}</h4>{safety.map(message => <p className="prose" key={message}>{message}</p>)}</div>}
              </div>
            </article>;
          })}
        </div>)}
      </section>
      <hr className="rule" />
      <section id="s05">
        <Chapter number={5} label={receipt ? c.ordered : c.products} title={[`${d.productTitle(products.length)} `,
          fullRecommendedBasket && coverageKnown ? d.coverageTitle(coveredRevealNeedCount(coverageRows), ingredients.length) : receipt ? c.ordered : d.unknownProducts]} />
        <p className="measure">{receipt ? d.ordered : d.recommended}</p>
        <div className="shelf">{products.map(p => <article className="bottle" data-testid="deep-dive-product" key={p.id}>
          <SafeImage src={p.imageUrl} alt="" width={190} height={210} className="product-photo" fallback={<div className="nophoto"><b>MattaNutra</b><em>{p.name}</em></div>} />
          <h3 className="product-name">{p.name}</h3><p className="covers">{p.covers?.map(nameFor).join(" · ")}</p>
          {p.description && <p className="product-facts">{p.description}</p>}
          <p className="product-facts">{c.servings}: {p.servingMultiplier ?? c.unknown}</p>
          {p.orderLine && <p className="product-facts">{c.quantity}: {p.orderLine.quantity} · {formatCurrencyAmount(locale, p.orderLine.unitPrice * p.orderLine.quantity, p.orderLine.currency)}</p>}
        </article>)}</div>
        {!products.length && <p>{c.noProducts}</p>}
        {receipt && <div className="receipt measure-wide" data-testid="deep-dive-receipt"><p>{c.reference}: <strong>{receipt.reference}</strong></p>
          <p>{receipt.customerName} · {c.unpaid}</p><p>{pharmacyName}</p><p>{c.total}: <strong>{formatCurrencyAmount(locale, receipt.total, receipt.currency)}</strong></p></div>}
      </section>
      <hr className="rule" />
      <section id="s06">
        <Chapter number={6} label={c.foods} title={d.foodTitle} image="food" />
        {food ? <p className="measure-wide prose">{text(food.body)}</p> : <p className="measure">{result.sectionStatuses?.foodSupport === "ready" ? d.noFood : c.foodPending}
          {result.sectionStatuses?.foodSupport !== "ready" && <> <button className="link-button" onClick={retryFood}>{c.retry}</button></>}</p>}
        <div className="aside measure-wide"><h3>{d.foodHowTo}</h3><p>{d.foodNote}</p></div>
        {food?.items.map((f, index) => <article className="food" key={f.foodId}>
          <div className={`foodrow ${index % 2 ? "flip" : ""} ${f.imagePath ? "" : "no-image"}`}>
            {f.imagePath && <figure className="foodfig"><SafeImage src={f.imagePath} alt={text(f.imageAlt)} width={420} height={525} />
              <figcaption><b>{f.gapNeedIds.map(nameFor).join(" · ")}</b>{text(f.food)}</figcaption></figure>}
            <div className="foodtext"><h3>{text(f.food)}</h3><p className="product-facts">{text(f.serving)} · {text(f.frequency)}</p><p className="prose">{text(f.rationale)}</p></div>
          </div>
        </article>)}
      </section>
      <hr className="rule" />
      <section id="s07">
        <Chapter number={7} label={c.safety} title={d.safetyTitle} />
        <p className="measure-wide">{d.safetyIntro}</p>
        {medical.length || globalCautions.length || recordedIngredientCautions.length ? <ul className="checks measure-wide">
          {medical.map((a, index) => <li key={`${a.code}:${index}`}><span className="mark" aria-hidden="true">—</span><span className="finding">{text(a.message)}</span></li>)}
          {globalCautions.map(message => <li key={message}><span className="mark" aria-hidden="true">—</span><span className="finding">{message}</span></li>)}
          {recordedIngredientCautions.map(i => <li key={i.id}><span className="mark" aria-hidden="true">—</span><a href={`#ingredient-${encodeURIComponent(i.id)}`}>{localizedSupplementName(i.supplement, i.id, locale)} · {d.safety}</a></li>)}
        </ul> : <p className="measure-wide">{d.noSafety}</p>}
      </section>
      <hr className="rule" />
      <div className="close"><SafeImage src="/assets/pharmacy/deep-dive/close.webp" alt="" width={164} height={240} />
        <div className="pali">Mattaññutā</div><div className="measure" style={{ margin: "0 auto" }}><p>{d.meaning}</p><p>{d.closing}</p></div></div>
    </div>
    <section className="keep" data-testid="deep-dive-save"><div className="wrap keep-row"><div className="measure"><h3>{d.keep}</h3><p>{d.keepBody}</p>
      <PharmacyLineConnect planId={planId} slug={slug} locale={locale} orderId={receipt?.id} />
      <div className="keep-actions">
        <button className="link-button" onClick={() => { void navigator.clipboard.writeText(new URL(path, window.location.origin).href).then(() => { setCopied(true); setCopyFailed(false); }).catch(() => setCopyFailed(true)); }}>{copied ? c.copied : c.copyLink}</button>
        <a href={back}>{c.back}</a></div><p role="status">{copyFailed ? d.copyError : copied ? c.copied : ""}</p>
    </div></div></section>
    <div className="wrap"><footer><p>{pharmacyName}{Number.isFinite(date.getTime()) ? ` · ${d.composed} ${new Intl.DateTimeFormat(localeHtmlLang(locale), { dateStyle: "long", timeZone: "Asia/Bangkok" }).format(date)}` : ""}</p><p>{d.wellness}</p></footer></div>
  </article>;
}
