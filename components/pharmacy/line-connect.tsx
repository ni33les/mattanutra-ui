"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Locale } from "@/lib/i18n";
import { pharmacyLineCopy } from "@/lib/pharmacy-line-copy";
import styles from "./line-connect.module.css";

type Prepared = { lineUrl: string; qrDataUrl: string; expiresAt: string };

/** Ready to scan before interaction; never pauses analysis or ordering. */
export function PharmacyLineConnect({ planId, slug, locale, orderId }: {
  planId: string; slug: string; locale: Locale; orderId?: string;
}) {
  // A new receipt or display language must never expose the previous QR.
  return <Connection key={`${planId}:${slug}:${locale}:${orderId ?? ""}`} planId={planId} slug={slug} locale={locale} orderId={orderId} />;
}

function Connection({ planId, slug, locale, orderId }: {
  planId: string; slug: string; locale: Locale; orderId?: string;
}) {
  const c = pharmacyLineCopy[locale];
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let refresh: ReturnType<typeof setTimeout>;
    void (async () => {
      try {
        const response = await fetch(`/api/assessment/${encodeURIComponent(planId)}/line-connect`, {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
          body: JSON.stringify({ source: "pharmacy_plan", pharmacy: slug, locale, retailCustomerOrderId: orderId })
        });
        if (!response.ok) throw new Error("LINE code preparation failed");
        const value: Prepared = await response.json();
        const remaining = Date.parse(value.expiresAt) - Date.now();
        if (!value.lineUrl?.startsWith("https://line.me/R/oaMessage/") || !value.qrDataUrl?.startsWith("data:image/png;base64,") || !(remaining > 0)) {
          throw new Error("Invalid LINE preparation response");
        }
        if (controller.signal.aborted) return;
        setPrepared(value);
        refresh = setTimeout(() => { setPrepared(null); setAttempt(n => n + 1); }, remaining);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => { controller.abort(); clearTimeout(refresh); };
  }, [planId, slug, locale, orderId, attempt]);

  return <div className={styles.connect} data-testid="pharmacy-line-connect">
    {prepared ? <>
      <a href={prepared.lineUrl} target="_blank" rel="noopener noreferrer" aria-label={c.alt} className={styles.qr}>
        <Image src={prepared.qrDataUrl} width={176} height={176} unoptimized alt={c.alt} />
      </a>
      <p className={styles.instruction}>{c.instruction}</p>
      <a className={styles.open} href={prepared.lineUrl} target="_blank" rel="noopener noreferrer">{c.open}</a>
    </> : error ? <>
      <p role="alert">{c.error}</p>
      <button type="button" className={styles.open} onClick={() => { setError(false); setAttempt(n => n + 1); }}>{c.retry}</button>
    </> : <p role="status">{c.loading}</p>}
  </div>;
}
