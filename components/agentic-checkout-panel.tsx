"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { agenticMessage } from "@/lib/agentic/i18n";

export type AgenticCheckoutItem = Readonly<{
  dailyPills: number;
  form: string;
  lineTotalMinor: number;
  productName: string;
  quantity: number;
}>;

type AgenticCheckoutPanelProps = Readonly<{
  checkoutAccess: string;
  currency: string;
  expired: boolean;
  items: readonly AgenticCheckoutItem[];
  locale: Locale;
  orderReference: string;
  paid: boolean;
  totalPriceMinor: number;
}>;

function formatMinor(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    currency,
    style: "currency"
  }).format(amount / 100);
}

export function AgenticCheckoutPanel(props: AgenticCheckoutPanelProps) {
  const [status, setStatus] = useState<"idle" | "paying" | "paid" | "error">(
    props.paid ? "paid" : "idle"
  );
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setStatus("paying");
    setError(null);

    try {
      const response = await fetch(
        `/api/mcp/checkout/${encodeURIComponent(props.checkoutAccess)}/pay`,
        { method: "POST" }
      );
      const body = (await response.json()) as { message?: string; paymentStatus?: string };

      if (!response.ok || body.paymentStatus !== "paid") {
        setStatus("error");
        setError(body.message ?? "Payment could not be simulated.");
        return;
      }

      setStatus("paid");
    } catch {
      setStatus("error");
      setError("Payment could not be simulated.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <p className="rounded-lg bg-[var(--color-gold-tint)] px-4 py-3 text-sm text-ink">
        {agenticMessage(props.locale, "checkout.test_mode")}
      </p>
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{props.orderReference}</p>
        <h1 className="font-serif text-3xl text-ink">
          {agenticMessage(props.locale, "checkout.title")}
        </h1>
      </header>
      <ul className="divide-y rounded-2xl border border-[var(--color-forest-glow)] bg-white">
        {props.items.map((item) => (
          <li className="flex items-start justify-between gap-4 px-5 py-4" key={item.productName}>
            <div>
              <p className="font-semibold text-ink">{item.productName}</p>
              <p className="text-sm text-muted-foreground">
                {item.quantity} × {item.form} · {item.dailyPills} pills/day
              </p>
            </div>
            <p className="text-sm font-medium">
              {formatMinor(item.lineTotalMinor, props.currency)}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-right text-lg font-semibold">
        {formatMinor(props.totalPriceMinor, props.currency)}
      </p>
      {props.expired || status === "paid" ? (
        <p className="rounded-lg bg-[var(--brand-soft-green)] px-4 py-3">
          {agenticMessage(
            props.locale,
            status === "paid" ? "checkout.paid" : "checkout.expired"
          )}
        </p>
      ) : (
        <button
          className="w-full rounded-full bg-[var(--brand-green)] px-6 py-3 font-semibold text-white disabled:opacity-60"
          disabled={status === "paying"}
          onClick={() => void pay()}
          type="button"
        >
          {status === "paying"
            ? "…"
            : agenticMessage(props.locale, "checkout.pay_mock")}
        </button>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
