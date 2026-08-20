"use client";

import { useMemo, useState } from "react";
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
  country: string;
  currency: string;
  expired: boolean;
  items: readonly AgenticCheckoutItem[];
  locale: Locale;
  orderReference: string;
  paid: boolean;
  shippingMinor: number;
  taxMinor: number;
  totalPriceMinor: number;
}>;

type AddressState = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  customerEmail: string;
  customerName: string;
  phone: string;
  postalCode: string;
  province: string;
};

function formatMinor(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    currency,
    style: "currency"
  }).format(amount / 100);
}

const emptyAddress: AddressState = {
  addressLine1: "",
  addressLine2: "",
  city: "",
  customerEmail: "",
  customerName: "",
  phone: "",
  postalCode: "",
  province: ""
};

export function AgenticCheckoutPanel(props: AgenticCheckoutPanelProps) {
  const [status, setStatus] = useState<"idle" | "paying" | "paid" | "error">(
    props.paid ? "paid" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [agentAuthorized, setAgentAuthorized] = useState(false);
  const [address, setAddress] = useState<AddressState>(emptyAddress);
  const grandTotal = props.totalPriceMinor + props.shippingMinor + props.taxMinor;

  const formComplete = useMemo(() => {
    return Boolean(
      address.customerName &&
        address.phone &&
        address.customerEmail &&
        address.addressLine1 &&
        address.city &&
        address.province &&
        address.postalCode &&
        agentAuthorized
    );
  }, [address, agentAuthorized]);

  function field(
    key: keyof AddressState,
    labelKey: string,
    options: { autoComplete?: string; type?: string } = {}
  ) {
    return (
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-ink">
          {agenticMessage(props.locale, labelKey)}
        </span>
        <input
          autoComplete={options.autoComplete}
          className="w-full rounded-lg border border-[var(--color-forest-glow)] bg-white px-3 py-2 text-ink"
          disabled={status === "paid" || props.expired}
          onChange={(event) =>
            setAddress((current) => ({ ...current, [key]: event.target.value }))
          }
          type={options.type ?? "text"}
          value={address[key]}
        />
      </label>
    );
  }

  async function pay() {
    setStatus("paying");
    setError(null);

    try {
      const response = await fetch(
        `/api/mcp/checkout/${encodeURIComponent(props.checkoutAccess)}/pay`,
        {
          body: JSON.stringify({
            address: {
              ...address,
              country: props.country
            },
            agentAuthorized: true
          }),
          headers: { "content-type": "application/json" },
          method: "POST"
        }
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
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt>{agenticMessage(props.locale, "checkout.shipping")}</dt>
          <dd>{formatMinor(props.shippingMinor, props.currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{agenticMessage(props.locale, "checkout.tax")}</dt>
          <dd>{formatMinor(props.taxMinor, props.currency)}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt>{agenticMessage(props.locale, "checkout.total")}</dt>
          <dd>{formatMinor(grandTotal, props.currency)}</dd>
        </div>
      </dl>
      <fieldset className="space-y-3 rounded-2xl border border-[var(--color-forest-glow)] bg-white p-5">
        <legend className="px-1 font-semibold text-ink">
          {agenticMessage(props.locale, "checkout.contact")}
        </legend>
        {field("customerName", "checkout.name", { autoComplete: "name" })}
        {field("phone", "checkout.phone", { autoComplete: "tel", type: "tel" })}
        {field("customerEmail", "checkout.email", { autoComplete: "email", type: "email" })}
      </fieldset>
      <fieldset className="space-y-3 rounded-2xl border border-[var(--color-forest-glow)] bg-white p-5">
        <legend className="px-1 font-semibold text-ink">
          {agenticMessage(props.locale, "checkout.delivery")}
        </legend>
        {field("addressLine1", "checkout.addressLine1", { autoComplete: "address-line1" })}
        {field("addressLine2", "checkout.addressLine2", { autoComplete: "address-line2" })}
        {field("city", "checkout.city", { autoComplete: "address-level2" })}
        {field("province", "checkout.province", { autoComplete: "address-level1" })}
        {field("postalCode", "checkout.postalCode", { autoComplete: "postal-code" })}
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-ink">
            {agenticMessage(props.locale, "checkout.country")}
          </span>
          <input
            className="w-full rounded-lg border border-[var(--color-forest-glow)] bg-[var(--brand-soft-green)] px-3 py-2 text-ink"
            disabled
            readOnly
            value={props.country}
          />
        </label>
      </fieldset>
      <label className="flex items-start gap-3 text-sm text-ink">
        <input
          checked={agentAuthorized}
          className="mt-1 size-4"
          disabled={status === "paid" || props.expired}
          onChange={(event) => setAgentAuthorized(event.target.checked)}
          type="checkbox"
        />
        <span>{agenticMessage(props.locale, "checkout.agentAuth")}</span>
      </label>
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
          disabled={status === "paying" || !formComplete}
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
