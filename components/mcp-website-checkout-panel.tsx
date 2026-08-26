"use client";

import { useCallback, useMemo, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { CreditCard, Truck } from "lucide-react";
import { OrderSummary } from "@/components/retail-checkout/order-summary";
import { retailCheckoutCopy } from "@/components/retail-checkout/product-basket-checkout-panel";
import type {
  ProductBasketProduct,
  ProductBasketQuotePreview
} from "@/components/retail-checkout/product-basket-types";
import type { Locale } from "@/lib/i18n";
import { agenticMessage } from "@/lib/agentic/i18n";
import { formatCurrencyAmount } from "@/lib/currencies";
import { displayCountryName } from "@/lib/product-countries";

type AddressState = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  customerEmail: string;
  customerName: string;
  phone: string;
  postalCode: string;
  province: string;
};

type McpWebsiteCheckoutPanelProps = Readonly<{
  checkoutAccess: string;
  currency: string;
  destinationCountry: string;
  expired: boolean;
  locale: Locale;
  paid: boolean;
  products: readonly ProductBasketProduct[];
  publishableKey: string;
  sellerName: string | null;
  successUrl: string;
  shippingAmount: number;
  subtotalAmount: number;
  totalAmount: number;
  quantities: Readonly<Record<string, number>>;
  unitPrices: Readonly<Record<string, number>>;
}>;

function inputClass(hasError: boolean) {
  return [
    "rounded-lg border bg-white px-3 py-2 text-sm font-normal outline-none",
    "focus:border-[var(--mn-teal)]",
    hasError ? "border-[var(--mn-error)]" : "border-[var(--mn-line)]"
  ].join(" ");
}

function emptyAddress(country: string): AddressState {
  return {
    addressLine1: "",
    addressLine2: "",
    city: "",
    country: country.trim().toUpperCase() || "TH",
    customerEmail: "",
    customerName: "",
    phone: "",
    postalCode: "",
    province: ""
  };
}

export function McpWebsiteCheckoutPanel(props: McpWebsiteCheckoutPanelProps) {
  const labels = retailCheckoutCopy[props.locale] ?? retailCheckoutCopy.en;
  const [address, setAddress] = useState<AddressState>(() =>
    emptyAddress(props.destinationCountry)
  );
  const [addressLine2Visible, setAddressLine2Visible] = useState(false);
  const [agentAuthorized, setAgentAuthorized] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const trimmedPublishableKey = props.publishableKey.trim();
  const hasValidStripePublishableKey = /^pk_test_/.test(trimmedPublishableKey);
  const stripePromise = useMemo(
    () =>
      hasValidStripePublishableKey
        ? loadStripe(trimmedPublishableKey)
        : Promise.resolve(null),
    [hasValidStripePublishableKey, trimmedPublishableKey]
  );
  const productsById = useMemo(
    () => new Map(props.products.map((product) => [product.id, product])),
    [props.products]
  );
  const quotePreview = useMemo<ProductBasketQuotePreview>(
    () => ({
      canCheckout: true,
      currency: props.currency,
      etaDate: null,
      lines: props.products.map((product) => ({
        availabilityStatus: "in_stock",
        currency: props.currency,
        etaDate: null,
        payable: true,
        productId: product.id,
        quantityRequested: props.quantities[product.id] ?? 1,
        reason: "",
        selectedRetailerName: props.sellerName,
        unitPriceAmount: props.unitPrices[product.id] ?? 0
      })),
      selectedRetailer: props.sellerName
        ? { organisationId: "mcp", organisationName: props.sellerName }
        : null,
      shippingAmount: props.shippingAmount,
      subtotalAmount: props.subtotalAmount,
      totalAmount: props.totalAmount,
      unavailableLines: []
    }),
    [props]
  );
  const errors = useMemo(() => {
    const next: Partial<Record<keyof AddressState, string>> = {};
    const required: Array<keyof AddressState> = [
      "customerEmail",
      "phone",
      "customerName",
      "addressLine1",
      "city",
      "province",
      "postalCode"
    ];

    for (const field of required) {
      if (!address[field].trim()) {
        next[field] = labels.requiredError;
      }
    }

    if (
      address.customerEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.customerEmail.trim())
    ) {
      next.customerEmail = labels.invalidEmail;
    }

    return next;
  }, [address, labels.invalidEmail, labels.requiredError]);
  const formIsValid = Object.keys(errors).length === 0 && agentAuthorized;

  const update = (field: keyof AddressState, value: string) => {
    setAddress((current) => ({ ...current, [field]: value }));
    setClientSecret(null);
  };

  const field = (
    key: keyof AddressState,
    label: string,
    options: Readonly<{
      autoComplete: string;
      className?: string;
      inputMode?: "email" | "numeric" | "tel" | "text";
      type?: "email" | "tel" | "text";
    }>
  ) => {
    const errorMessage = touched[key] ? errors[key] : "";

    return (
      <label
        className={`grid gap-1 text-sm font-semibold text-[var(--mn-ink)] ${options.className ?? ""}`}
        htmlFor={key}
      >
        <span className="flex items-center justify-between gap-3">
          {label}
          <span className="text-xs font-medium text-[var(--mn-ink-soft)]">
            {labels.required}
          </span>
        </span>
        <input
          autoComplete={options.autoComplete}
          className={inputClass(Boolean(errorMessage))}
          id={key}
          inputMode={options.inputMode}
          onBlur={() => setTouched((current) => ({ ...current, [key]: true }))}
          onChange={(event) => update(key, event.target.value)}
          required
          type={options.type ?? "text"}
          value={address[key]}
        />
        {errorMessage ? (
          <span className="text-xs font-semibold text-[var(--mn-error)]">
            {errorMessage}
          </span>
        ) : null}
        {key === "phone" ? (
          <span className="text-xs font-medium text-[var(--mn-ink-soft)]">
            {labels.phoneHelp}
          </span>
        ) : null}
      </label>
    );
  };

  const createSession = useCallback(async () => {
    setError("");

    if (!formIsValid) {
      setTouched({
        addressLine1: true,
        city: true,
        customerEmail: true,
        customerName: true,
        phone: true,
        postalCode: true,
        province: true
      });
      setError(
        agentAuthorized
          ? "Please complete the required checkout details."
          : "Please confirm you authorized your AI assistant to start this checkout."
      );
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/mcp/checkout/${encodeURIComponent(props.checkoutAccess)}/session`,
        {
          body: JSON.stringify({
            address,
            agentAuthorized: true,
            locale: props.locale
          }),
          cache: "no-store",
          headers: { "content-type": "application/json" },
          method: "POST"
        }
      );
      const body = (await response.json().catch(() => ({}))) as {
        clientSecret?: string;
        message?: string;
      };

      if (!response.ok || !body.clientSecret) {
        throw new Error(body.message || labels.error);
      }

      setClientSecret(body.clientSecret);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.error);
    } finally {
      setIsLoading(false);
    }
  }, [address, agentAuthorized, formIsValid, labels.error, props.checkoutAccess, props.locale]);

  if (props.paid) {
    return (
      <p className="rounded-2xl bg-[var(--mn-mint)] px-5 py-4 text-[var(--mn-ink)]">
        {agenticMessage(props.locale, "checkout.paid")}
      </p>
    );
  }

  if (props.expired) {
    return (
      <p className="rounded-2xl bg-[var(--mn-cream)] px-5 py-4 text-[var(--mn-ink)]">
        {agenticMessage(props.locale, "checkout.expired")}
      </p>
    );
  }

  return (
    <div className="pb-32 lg:pb-0">
      <input name="success_url" readOnly type="hidden" value={props.successUrl} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-5">
          <section className="mn-commerce-card">
            <h2 className="font-serif text-3xl font-medium text-[var(--mn-ink)]">
              {labels.title}
            </h2>
          </section>

          <section className="mn-commerce-card" aria-labelledby="checkout-contact">
            <h3
              className="font-serif text-2xl font-medium text-[var(--mn-ink)]"
              id="checkout-contact"
            >
              {labels.contact}
            </h3>
            <div className="mt-5 grid gap-4">
              {field("customerEmail", labels.email, {
                autoComplete: "email",
                inputMode: "email",
                type: "email"
              })}
              {field("phone", labels.phone, {
                autoComplete: "tel",
                inputMode: "tel",
                type: "tel"
              })}
            </div>
          </section>

          <section className="mn-commerce-card" aria-labelledby="checkout-delivery">
            <h3
              className="font-serif text-2xl font-medium text-[var(--mn-ink)]"
              id="checkout-delivery"
            >
              {labels.delivery}
            </h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-[var(--mn-ink)] sm:col-span-2">
                <span className="flex items-center justify-between gap-3">
                  {labels.country}
                  <span className="text-xs font-medium text-[var(--mn-ink-soft)]">
                    {labels.required}
                  </span>
                </span>
                <select
                  autoComplete="country"
                  className={inputClass(false)}
                  id="country"
                  name="country"
                  onChange={(event) => update("country", event.target.value)}
                  required
                  value={address.country || "TH"}
                >
                  <option value={address.country || "TH"}>
                    {displayCountryName(address.country || "TH", props.locale)}
                  </option>
                </select>
              </label>
              {field("customerName", labels.name, {
                autoComplete: "name",
                className: "sm:col-span-2"
              })}
              {field("addressLine1", labels.addressLine1, {
                autoComplete: "shipping address-line1",
                className: "sm:col-span-2"
              })}
              {addressLine2Visible ? (
                <label className="grid gap-1 text-sm font-semibold text-[var(--mn-ink)] sm:col-span-2">
                  <span className="flex items-center justify-between gap-3">
                    {labels.addressLine2}
                    <span className="text-xs font-medium text-[var(--mn-ink-soft)]">
                      {labels.optional}
                    </span>
                  </span>
                  <input
                    autoComplete="shipping address-line2"
                    className={inputClass(false)}
                    onChange={(event) => update("addressLine2", event.target.value)}
                    type="text"
                    value={address.addressLine2}
                  />
                </label>
              ) : (
                <button
                  className="w-fit text-left text-sm font-bold text-[var(--mn-teal-deep)]"
                  onClick={() => setAddressLine2Visible(true)}
                  type="button"
                >
                  {labels.addAddressLine2}
                </button>
              )}
              {field("city", labels.city, { autoComplete: "shipping address-level2" })}
              {field("province", labels.province, { autoComplete: "shipping address-level1" })}
              {field("postalCode", labels.postalCode, {
                autoComplete: "shipping postal-code",
                inputMode: "numeric"
              })}
            </div>
          </section>

          <section className="mn-commerce-card" aria-labelledby="checkout-shipping">
            <h3
              className="font-serif text-2xl font-medium text-[var(--mn-ink)]"
              id="checkout-shipping"
            >
              {labels.shippingMethod}
            </h3>
            <div className="mt-4 rounded-xl bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <Truck aria-hidden className="mt-0.5 size-5 text-[var(--mn-teal-deep)]" />
                  <div>
                    <p className="font-bold text-[var(--mn-ink)]">
                      {labels.shippingMethodName}
                    </p>
                    <p className="mt-1 text-sm text-[var(--mn-ink-soft)]">
                      {labels.deliveryPromise}
                    </p>
                  </div>
                </div>
                <span className="font-bold text-[var(--mn-ink)]">
                  {props.shippingAmount > 0
                    ? formatCurrencyAmount(props.locale, props.shippingAmount, props.currency)
                    : labels.free}
                </span>
              </div>
            </div>
          </section>

          <section className="mn-commerce-card" aria-labelledby="checkout-payment">
            <h3
              className="font-serif text-2xl font-medium text-[var(--mn-ink)]"
              id="checkout-payment"
            >
              {labels.payment}
            </h3>
            <label className="mt-4 flex items-start gap-3 text-sm text-[var(--mn-ink)]">
              <input
                checked={agentAuthorized}
                className="mt-1 size-4"
                onChange={(event) => {
                  setAgentAuthorized(event.target.checked);
                  setClientSecret(null);
                }}
                type="checkbox"
              />
              <span>{agenticMessage(props.locale, "checkout.agentAuth")}</span>
            </label>
            {error ? (
              <p className="mt-4 rounded-lg bg-[var(--mn-error-soft)] p-3 text-sm font-semibold text-[var(--mn-error)]">
                {error}
              </p>
            ) : null}
            {clientSecret ? (
              <div className="mt-5">
                <EmbeddedCheckoutProvider
                  key={clientSecret}
                  options={{ clientSecret }}
                  stripe={stripePromise}
                >
                  <EmbeddedCheckout className="min-h-[32rem]" />
                </EmbeddedCheckoutProvider>
              </div>
            ) : (
              <button
                className="mn-primary-button mt-5 w-full justify-center"
                disabled={isLoading}
                onClick={() => {
                  void createSession();
                }}
                type="button"
              >
                <CreditCard aria-hidden className="size-4" />
                {isLoading ? labels.creating : labels.continue}
              </button>
            )}
          </section>
        </div>
        <OrderSummary
          currency={props.currency}
          labels={{
            free: labels.free,
            included: labels.included,
            orderSummary: labels.orderSummary,
            quantity: labels.quantity,
            shipping: labels.shipping,
            subtotal: labels.subtotal,
            tax: labels.tax,
            total: labels.total
          }}
          locale={props.locale}
          productsById={productsById}
          quotePreview={quotePreview}
          removedItemCount={0}
          selectedProducts={props.products}
          selectedRetailerName={props.sellerName}
          shippingAmount={props.shippingAmount}
          subtotal={props.subtotalAmount}
          total={props.totalAmount}
        />
      </div>
    </div>
  );
}
