"use client";
import { useEffect, useState, startTransition } from "react";
import { pharmacyCopy } from "@/lib/pharmacy-copy";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { fetchFunnelJson, PollHttpError } from "@/lib/funnel-polling";
import type { PharmacyOrderProduct } from "@/lib/pharmacy-order-input";
import type { PharmacyOrderReceipt } from "@/lib/pharmacy-orders";
import type { Locale } from "@/lib/i18n";

export function usePharmacyOrder({
  planId,
  slug,
  locale,
  revision,
  initialReceipt = null,
  enabled = true,
}: {
  planId: string;
  slug: string;
  locale: Locale;
  revision: number;
  initialReceipt?: PharmacyOrderReceipt | null;
  enabled?: boolean;
}) {
  const c = pharmacyCopy[locale];
  const draftKey = `mn:pharmacy-order:v1:${slug}:${planId}:${revision}`;
  const [lines, setLines] = useState<readonly PharmacyOrderProduct[]>(
    initialReceipt?.lines ?? [],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState(initialReceipt?.customerName ?? "");
  const [receipt, setReceipt] = useState(initialReceipt);
  const [key, setKey] = useState("");
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(Boolean(initialReceipt));
  const [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (initialReceipt || !enabled) return;
    const controller = new AbortController();
    void fetchFunnelJson<{
      receipt: PharmacyOrderReceipt | null;
      lines?: PharmacyOrderProduct[];
    }>(
      `/api/retail/orders?${new URLSearchParams({ plan: planId, pharmacy: slug, locale })}`,
      { signal: controller.signal },
    )
      .then(({ data }) => {
        let draft: { name?: string; selected?: string[]; key?: string } | null =
          null;
        try {
          draft = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
        } catch {
          /* a damaged draft cannot replace server data */
        }
        const available = data.receipt?.lines ?? data.lines ?? [];
        const ids = available.map((p) => p.productId);
        startTransition(() => {
          setReceipt(data.receipt);
          setLines(available);
          setName(data.receipt?.customerName ?? draft?.name ?? "");
          setSelected(draft?.selected?.filter((id) => ids.includes(id)) ?? ids);
          setKey(draft?.key || crypto.randomUUID());
          setLoaded(true);
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error?.status === 409 ? c.refresh : c.error);
          setLoaded(true);
        }
      });
    return () => controller.abort();
  }, [
    c.error,
    c.refresh,
    draftKey,
    enabled,
    initialReceipt,
    locale,
    planId,
    quoteAttempt,
    slug,
  ]);
  useEffect(() => {
    if (!loaded || !key || receipt) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ name, selected, key }));
    } catch {
      /* ordering remains possible without local storage */
    }
  }, [draftKey, key, loaded, name, receipt, selected]);
  const active =
    receipt?.lines ?? lines.filter((p) => selected.includes(p.productId));
  const currency = receipt?.currency ?? lines[0]?.currency ?? "THB";
  const total =
    receipt?.total ??
    active.reduce(
      (sum, p) => sum + Math.round(p.unitPrice * 100) * p.quantity,
      0,
    ) / 100;
  async function submit() {
    if (busy || receipt) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await fetchFunnelJson<PharmacyOrderReceipt>(
        "/api/retail/orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({
            planId,
            pharmacy: slug,
            locale,
            expectedRevision: revision,
            productIds: selected,
            customerName: name,
          }),
        },
      );
      setReceipt(data);
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* receipt is durable */
      }
      window.history.replaceState(
        null,
        "",
        pharmacyPath(locale, slug, "reveal", { plan: planId, order: data.id }),
      );
    } catch (error) {
      setError(
        error instanceof PollHttpError && error.status === 409
          ? c.refresh
          : c.error,
      );
    } finally {
      setBusy(false);
    }
  }

  return {
    lines,
    selected,
    setSelected,
    name,
    setName,
    receipt,
    key,
    setKey,
    busy,
    loaded,
    error,
    setError,
    copied,
    setCopied,
    active,
    currency,
    total,
    submit,
    retryQuote: () => {
      setError("");
      setQuoteAttempt((n) => n + 1);
    },
  };
}
