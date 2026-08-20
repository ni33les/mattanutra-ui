import type { Locale } from "@/lib/i18n";
import { agenticMessage } from "@/lib/agentic/i18n";
import { asMinor, formatMinor } from "@/lib/agentic/money";

export type AgenticCheckoutItem = Readonly<{
  dailyPills: number;
  form: string;
  lineTotalMinor: number;
  productName: string;
  quantity: number;
}>;

export const CHECKOUT_TEST_SCENARIOS = [
  "decline_insufficient_funds",
  "success",
  "processing_then_success",
  "provider_unavailable",
  "amount_mismatch",
  "three_ds_required",
  "three_ds_succeeded",
  "three_ds_failed",
  "three_ds_cancelled",
  "expire",
  "refund",
  "partial_refund"
] as const;

type AgenticCheckoutPanelProps = Readonly<{
  checkoutAccess: string;
  country: string;
  currency: string;
  expired: boolean;
  items: readonly AgenticCheckoutItem[];
  lastResult?: string | null;
  locale: Locale;
  orderReference: string;
  paid: boolean;
  shippingMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  totalPriceMinor: number;
}>;

function Field(input: Readonly<{
  autoComplete?: string;
  disabled?: boolean;
  id: string;
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}>) {
  return (
    <label className="block space-y-1 text-sm" htmlFor={input.id}>
      <span className="font-medium text-ink">{input.label}</span>
      <input
        autoComplete={input.autoComplete}
        className="w-full rounded-lg border border-[var(--color-forest-glow)] bg-white px-3 py-2 text-ink"
        disabled={input.disabled}
        id={input.id}
        name={input.name}
        required={input.required}
        type={input.type ?? "text"}
      />
    </label>
  );
}

export function AgenticCheckoutPanel(props: AgenticCheckoutPanelProps) {
  const subtotalMinor = asMinor(props.subtotalMinor);
  const shippingMinor = asMinor(props.shippingMinor);
  const taxMinor = asMinor(props.taxMinor);
  const totalPriceMinor = asMinor(props.totalPriceMinor);
  const locked = props.paid || props.expired;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <p className="rounded-lg bg-[var(--color-gold-tint)] px-4 py-3 text-sm text-ink">
        {agenticMessage(props.locale, "checkout.test_mode")}
      </p>
      <ol className="list-decimal space-y-1 px-4 text-sm text-ink">
        <li>This page is a native HTML form, not a React SPA. Do not wait for hydration.</li>
        <li>
          POST application/x-www-form-urlencoded to /api/mcp/checkout/{props.checkoutAccess}/pay
          with customerName, phone, customerEmail, addressLine1, city, province, postalCode,
          country=TH, agentAuthorized=true, scenario=decline_insufficient_funds.
        </li>
        <li>Poll order until unpaid / declined / insufficient_funds / stateVersion=1.</li>
        <li>POST the same fields again with scenario=success, then poll paid / stateVersion=2.</li>
        <li>
          D9 timeout uses a different unpaid checkout: POST the same fields with scenario=expire
          and poll until orderStatus=expired.
        </li>
        <li>
          D9 cancelled uses another unpaid checkout: POST scenario=three_ds_cancelled and poll
          until orderStatus=cancelled.
        </li>
      </ol>
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
              {formatMinor(item.lineTotalMinor, props.currency, props.locale)}
            </p>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt>{agenticMessage(props.locale, "checkout.subtotal")}</dt>
          <dd>{formatMinor(subtotalMinor, props.currency, props.locale)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{agenticMessage(props.locale, "checkout.shipping")}</dt>
          <dd>{formatMinor(shippingMinor, props.currency, props.locale)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{agenticMessage(props.locale, "checkout.tax")}</dt>
          <dd>{formatMinor(taxMinor, props.currency, props.locale)}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt>{agenticMessage(props.locale, "checkout.total")}</dt>
          <dd>{formatMinor(totalPriceMinor, props.currency, props.locale)}</dd>
        </div>
      </dl>
      {locked ? (
        <p className="rounded-lg bg-[var(--brand-soft-green)] px-4 py-3">
          {agenticMessage(
            props.locale,
            props.paid ? "checkout.paid" : "checkout.expired"
          )}
        </p>
      ) : (
        <form
          action={`/api/mcp/checkout/${encodeURIComponent(props.checkoutAccess)}/pay`}
          className="space-y-6"
          method="post"
        >
          <input name="country" type="hidden" value={props.country} />
          <input name="returnTo" type="hidden" value={`/${props.locale}/mcp/checkout/${props.checkoutAccess}`} />
          <fieldset className="space-y-3 rounded-2xl border border-[var(--color-forest-glow)] bg-white p-5">
            <legend className="px-1 font-semibold text-ink">
              {agenticMessage(props.locale, "checkout.contact")}
            </legend>
            <Field
              autoComplete="name"
              id="customerName"
              label={agenticMessage(props.locale, "checkout.name")}
              name="customerName"
              required
            />
            <Field
              autoComplete="tel"
              id="phone"
              label={agenticMessage(props.locale, "checkout.phone")}
              name="phone"
              required
              type="tel"
            />
            <Field
              autoComplete="email"
              id="customerEmail"
              label={agenticMessage(props.locale, "checkout.email")}
              name="customerEmail"
              required
              type="email"
            />
          </fieldset>
          <fieldset className="space-y-3 rounded-2xl border border-[var(--color-forest-glow)] bg-white p-5">
            <legend className="px-1 font-semibold text-ink">
              {agenticMessage(props.locale, "checkout.delivery")}
            </legend>
            <Field
              autoComplete="address-line1"
              id="addressLine1"
              label={agenticMessage(props.locale, "checkout.addressLine1")}
              name="addressLine1"
              required
            />
            <Field
              autoComplete="address-line2"
              id="addressLine2"
              label={agenticMessage(props.locale, "checkout.addressLine2")}
              name="addressLine2"
            />
            <Field
              autoComplete="address-level2"
              id="city"
              label={agenticMessage(props.locale, "checkout.city")}
              name="city"
              required
            />
            <Field
              autoComplete="address-level1"
              id="province"
              label={agenticMessage(props.locale, "checkout.province")}
              name="province"
              required
            />
            <Field
              autoComplete="postal-code"
              id="postalCode"
              label={agenticMessage(props.locale, "checkout.postalCode")}
              name="postalCode"
              required
            />
            <label className="block space-y-1 text-sm" htmlFor="countryDisplay">
              <span className="font-medium text-ink">
                {agenticMessage(props.locale, "checkout.country")}
              </span>
              <input
                className="w-full rounded-lg border border-[var(--color-forest-glow)] bg-[var(--brand-soft-green)] px-3 py-2 text-ink"
                disabled
                id="countryDisplay"
                readOnly
                value={props.country}
              />
            </label>
          </fieldset>
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              className="mt-1 size-4"
              name="agentAuthorized"
              required
              type="checkbox"
              value="true"
            />
            <span>{agenticMessage(props.locale, "checkout.agentAuth")}</span>
          </label>
          <label className="block space-y-1 text-sm" htmlFor="scenario">
            <span className="font-medium text-ink">Test scenario</span>
            <select
              className="w-full rounded-lg border border-[var(--color-forest-glow)] bg-white px-3 py-2 text-ink"
              defaultValue="decline_insufficient_funds"
              id="scenario"
              name="scenario"
              required
            >
              {CHECKOUT_TEST_SCENARIOS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button
            className="w-full rounded-full bg-[var(--brand-green)] px-6 py-3 font-semibold text-white"
            type="submit"
          >
            {agenticMessage(props.locale, "checkout.pay_mock")}
          </button>
        </form>
      )}
      {props.lastResult ? (
        <p className="text-sm text-muted-foreground">{props.lastResult}</p>
      ) : null}
    </div>
  );
}
