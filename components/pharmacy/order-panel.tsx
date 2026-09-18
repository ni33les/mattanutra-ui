"use client";
import { usePharmacyOrder } from "@/components/pharmacy/use-pharmacy-order";
import { OrderSummary } from "@/components/retail-checkout/order-summary";
import type { ProductBasketProduct, ProductBasketQuotePreview } from "@/components/retail-checkout/product-basket-types";
import { SafeImage } from "@/components/safe-image";
import { pharmacyCopy } from "@/lib/pharmacy-copy";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { formatCurrencyAmount } from "@/lib/currencies";
import type { PharmacyOrderReceipt } from "@/lib/pharmacy-orders";
import type { Locale } from "@/lib/i18n";

export function PharmacyOrderPanel({ planId, slug, locale, revision, pharmacyName, initialReceipt = null, onRefresh }: {
  planId: string; slug: string; locale: Locale; revision: number; pharmacyName: string;
  initialReceipt?: PharmacyOrderReceipt | null; onRefresh: () => void;
}) {
  const c = pharmacyCopy[locale];
  const { lines, selected, setSelected, name, setName, receipt, key, setKey, busy, loaded, error, setError, copied, setCopied, active, currency, total, submit, retryQuote } = usePharmacyOrder({ planId, slug, locale, revision, initialReceipt });
  const basket: ProductBasketProduct[] = lines.map(p => ({ id: p.productId, name: p.name, imageUrl: p.imageUrl, unitPriceAmount: p.unitPrice, currency: p.currency }));
  const quote: ProductBasketQuotePreview = { canCheckout: active.length > 0, currency, etaDate: null,
    selectedRetailer: { organisationId: slug, organisationName: pharmacyName }, shippingAmount: 0, subtotalAmount: total, totalAmount: total, unavailableLines: [],
    lines: active.map(p => ({ availabilityStatus: "available", currency: p.currency, etaDate: null, payable: true, productId: p.productId,
      quantityRequested: p.quantity, reason: "", selectedRetailerName: pharmacyName, unitPriceAmount: p.unitPrice })) };
  const deepLink = pharmacyPath(locale, slug, "plan", { plan: planId, order: receipt?.id });
  return <section id="order" data-testid="pharmacy-order" className="mt-12 grid gap-x-8 gap-y-5 lg:grid-cols-[1.5fr_1fr]">
    <header>
      <h2 className="font-serif text-3xl">{receipt ? c.confirmed : c.products}</h2>
      {receipt ? <div role="status" className="mt-5 rounded-2xl bg-[var(--mn-mint)] p-6"><p>{c.reference}: <strong>{receipt.reference}</strong></p><p className="mt-2">{receipt.customerName} · {c.unpaid}</p></div>
        : <p className="mt-3 text-[var(--mn-ink-soft)]">{c.removeHint}</p>}
    </header>
    <div className="lg:col-start-1">
      <div className="space-y-3">{(receipt ? receipt.lines : lines).map(p => <label key={p.productId} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[var(--mn-line)]">
        {!receipt && <input type="checkbox" aria-label={p.name} checked={selected.includes(p.productId)} disabled={busy}
          onChange={e => { setSelected(ids => e.target.checked ? [...ids, p.productId] : ids.filter(id => id !== p.productId)); setKey(crypto.randomUUID()); }} />}
        <SafeImage src={p.imageUrl} alt="" width={64} height={64} className="size-16 object-contain" fallback={<span className="size-16">MN</span>} />
        <span className="flex-1"><strong>{p.name}</strong><span className="mt-1 block text-sm text-[var(--mn-ink-soft)]">{c.quantity}: {p.quantity}</span></span>
        <strong>{formatCurrencyAmount(locale, p.unitPrice * p.quantity, p.currency)}</strong>
      </label>)}</div>
      {!receipt && loaded && !lines.length && !error && <p className="mt-5">{c.noProducts}</p>}
      {!receipt && lines.length > 0 && <form className="mt-7 space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label className="block font-semibold" htmlFor="pharmacy-customer-name">{c.name}</label>
        <input id="pharmacy-customer-name" autoComplete="off" required maxLength={120} value={name} disabled={busy}
          onChange={e => { setName(e.target.value); setKey(crypto.randomUUID()); }} className="w-full rounded-xl border border-[var(--mn-line)] bg-white px-4 py-3" />
        <p className="text-sm text-[var(--mn-ink-soft)]">{c.nameHint}</p>
        <div className="rounded-xl bg-[var(--mn-cream)] p-4"><strong>{c.pay}</strong><p className="mt-2 text-sm">{c.paymentHint}</p></div>
        <button disabled={busy || !selected.length || !name.trim() || !key} className="w-full rounded-xl bg-[var(--mn-teal-deep)] px-6 py-4 font-semibold text-white disabled:opacity-50">{busy ? c.sending : c.confirm}</button>
      </form>}
      {error && <div role="alert" className="mt-4"><p>{error}</p><button className="mt-2 underline" onClick={() => { retryQuote(); if (error === c.refresh) onRefresh(); }}>{c.retry}</button></div>}
      <div className="mt-7 flex flex-wrap gap-5 text-sm font-semibold">
        <button className="underline" onClick={() => { void navigator.clipboard.writeText(new URL(deepLink, window.location.origin).href).then(() => setCopied(true)).catch(() => setError(c.error)); }}>{copied ? c.copied : c.copyLink}</button>
        <button className="underline" onClick={() => { window.open(`https://line.me/R/share?text=${encodeURIComponent(new URL(deepLink, window.location.origin).href)}`, "_blank", "noopener,noreferrer"); }}>{c.line}</button></div>
      <p className="mt-3 text-sm text-[var(--mn-ink-soft)]">{c.lineHint}</p>
    </div>
    <div className="mt-3 lg:col-start-2 lg:row-start-2 lg:mt-0">
      <div className="sticky top-6 [&>section]:static" data-testid="pharmacy-order-summary">
        <OrderSummary locale={locale} labels={{ ...c, free: c.free }} productsById={new Map(basket.map(p => [p.id, p]))}
          selectedProducts={basket.filter(p => active.some(line => line.productId === p.id))} quotePreview={loaded ? quote : null}
          selectedRetailerName={pharmacyName} currency={currency} subtotal={total} total={total} shippingAmount={0} removedItemCount={0} hideShipping />
        <a data-testid="pharmacy-deep-dive-link" href={deepLink}
          className="mt-4 flex w-full items-center justify-center rounded-full bg-[var(--mn-teal-deep)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--mn-teal-deep)]">
          {c.details} →
        </a>
      </div>
    </div>
  </section>;
}
