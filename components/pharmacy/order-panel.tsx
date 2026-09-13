"use client";
import { useEffect, useState, startTransition } from "react";
import { OrderSummary } from "@/components/retail-checkout/order-summary";
import type { ProductBasketProduct, ProductBasketQuotePreview } from "@/components/retail-checkout/product-basket-types";
import { SafeImage } from "@/components/safe-image";
import { pharmacyCopy } from "@/lib/pharmacy-copy";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { formatCurrencyAmount } from "@/lib/currencies";
import { fetchFunnelJson } from "@/lib/funnel-polling";
import type { PharmacyOrderProduct } from "@/lib/pharmacy-order-input";
import type { PharmacyOrderReceipt } from "@/lib/pharmacy-orders";
import type { Locale } from "@/lib/i18n";

export function PharmacyOrderPanel({ planId, slug, locale, revision, pharmacyName, initialReceipt = null, onRefresh }: {
  planId: string; slug: string; locale: Locale; revision: number; pharmacyName: string;
  initialReceipt?: PharmacyOrderReceipt | null; onRefresh: () => void;
}) {
  const c = pharmacyCopy[locale];
  const draftKey = `mn:pharmacy-order:v1:${slug}:${planId}:${revision}`;
  const [lines, setLines] = useState<readonly PharmacyOrderProduct[]>(initialReceipt?.lines ?? []);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState(initialReceipt?.customerName ?? "");
  const [receipt, setReceipt] = useState(initialReceipt);
  const [key, setKey] = useState("");
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(Boolean(initialReceipt));
  const [error, setError] = useState(""), [copied, setCopied] = useState(false);
  useEffect(() => {
    if (initialReceipt) return;
    const controller = new AbortController();
    void fetchFunnelJson<{ receipt: PharmacyOrderReceipt | null; lines?: PharmacyOrderProduct[] }>(
      `/api/retail/orders?${new URLSearchParams({ plan: planId, pharmacy: slug, locale })}`, { signal: controller.signal }).then(({ data }) => {
        let draft: { name?: string; selected?: string[]; key?: string } | null = null;
        try { draft = JSON.parse(sessionStorage.getItem(draftKey) ?? "null"); } catch { /* a damaged draft cannot replace server data */ }
        const available = data.receipt?.lines ?? data.lines ?? [];
        const ids = available.map(p => p.productId);
        startTransition(() => { setReceipt(data.receipt); setLines(available); setName(data.receipt?.customerName ?? draft?.name ?? "");
          setSelected(draft?.selected?.filter(id => ids.includes(id)) ?? ids); setKey(draft?.key || crypto.randomUUID()); setLoaded(true); });
      }).catch(error => { if (!controller.signal.aborted) { setError(error?.status === 409 ? c.refresh : c.error); setLoaded(true); } });
    return () => controller.abort();
  }, [c.error, c.refresh, draftKey, initialReceipt, locale, planId, quoteAttempt, slug]);
  useEffect(() => {
    if (!loaded || !key || receipt) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify({ name, selected, key })); } catch { /* ordering remains possible without local storage */ }
  }, [draftKey, key, loaded, name, receipt, selected]);
  const active = receipt?.lines ?? lines.filter(p => selected.includes(p.productId));
  const currency = receipt?.currency ?? lines[0]?.currency ?? "THB";
  const total = receipt?.total ?? active.reduce((sum, p) => sum + Math.round(p.unitPrice * 100) * p.quantity, 0) / 100;
  const basket: ProductBasketProduct[] = lines.map(p => ({ id: p.productId, name: p.name, imageUrl: p.imageUrl, unitPriceAmount: p.unitPrice, currency: p.currency }));
  const quote: ProductBasketQuotePreview = { canCheckout: active.length > 0, currency, etaDate: null,
    selectedRetailer: { organisationId: slug, organisationName: pharmacyName }, shippingAmount: 0, subtotalAmount: total, totalAmount: total, unavailableLines: [],
    lines: active.map(p => ({ availabilityStatus: "available", currency: p.currency, etaDate: null, payable: true, productId: p.productId,
      quantityRequested: p.quantity, reason: "", selectedRetailerName: pharmacyName, unitPriceAmount: p.unitPrice })) };
  const deepLink = pharmacyPath(locale, slug, "plan", { plan: planId, order: receipt?.id });
  async function submit() {
    if (busy || receipt) return;
    setBusy(true); setError("");
    try {
      const { data } = await fetchFunnelJson<PharmacyOrderReceipt>("/api/retail/orders", { method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ planId, pharmacy: slug, locale, expectedRevision: revision, productIds: selected, customerName: name }) });
      setReceipt(data); try { sessionStorage.removeItem(draftKey); } catch { /* receipt is durable */ }
      window.history.replaceState(null, "", pharmacyPath(locale, slug, "reveal", { plan: planId, order: data.id }));
    } catch { setError(c.error); } finally { setBusy(false); }
  }
  return <section id="order" data-testid="pharmacy-order" className="mt-12 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
    <div>
      <h2 className="font-serif text-3xl">{receipt ? c.confirmed : c.products}</h2>
      {receipt ? <div role="status" className="mt-5 rounded-2xl bg-[var(--mn-mint)] p-6"><p>{c.reference}: <strong>{receipt.reference}</strong></p><p className="mt-2">{receipt.customerName} · {c.unpaid}</p></div>
        : <p className="mt-3 text-[var(--mn-ink-soft)]">{c.removeHint}</p>}
      <div className="mt-5 space-y-3">{(receipt ? receipt.lines : lines).map(p => <label key={p.productId} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[var(--mn-line)]">
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
      {error && <div role="alert" className="mt-4"><p>{error}</p><button className="mt-2 underline" onClick={() => { setError(""); setQuoteAttempt(n => n + 1); if (error === c.refresh) onRefresh(); }}>{c.retry}</button></div>}
      <div className="mt-7 flex flex-wrap gap-5 text-sm font-semibold"><a className="underline" href={deepLink}>{c.details} →</a>
        <button className="underline" onClick={() => { void navigator.clipboard.writeText(new URL(deepLink, window.location.origin).href).then(() => setCopied(true)).catch(() => setError(c.error)); }}>{copied ? c.copied : c.copyLink}</button>
        <button className="underline" onClick={() => { window.open(`https://line.me/R/share?text=${encodeURIComponent(new URL(deepLink, window.location.origin).href)}`, "_blank", "noopener,noreferrer"); }}>{c.line}</button></div>
      <p className="mt-3 text-sm text-[var(--mn-ink-soft)]">{c.lineHint}</p>
    </div>
    <div><OrderSummary locale={locale} labels={{ ...c, free: c.free }} productsById={new Map(basket.map(p => [p.id, p]))}
      selectedProducts={basket.filter(p => active.some(line => line.productId === p.id))} quotePreview={loaded ? quote : null}
      selectedRetailerName={pharmacyName} currency={currency} subtotal={total} total={total} shippingAmount={0} removedItemCount={0} hideShipping /></div>
  </section>;
}
