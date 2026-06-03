import { createHash, randomBytes, randomUUID } from "node:crypto";
import Stripe from "stripe";
import type postgres from "postgres";
import { isUuid } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import { FINANCE_ACCOUNT_IDS, recordFinanceTransaction } from "@/lib/finance-ledger";
import { resolveUsdRateForCurrency } from "@/lib/finance-fx";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  normalizeProductCountryCode,
  defaultProductCountryCode
} from "@/lib/product-countries";
import {
  resolveRegionalBasketAvailability
} from "@/lib/retail-cart-availability";
import { siteBaseUrl } from "@/lib/site-url";
import {
  AMOUNT_MICROS_PER_UNIT,
  STRIPE_MINOR_UNITS_PER_MAJOR,
  stripePaymentConfig
} from "@/lib/stripe-payment-config";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import { createTask } from "@/lib/task-service";
import { writeBpmEvent } from "@/lib/bpm";

type Db = NonNullable<ReturnType<typeof getSql>>;
type RetailCheckoutDb = postgres.Sql | postgres.TransactionSql;

const DREAM_FINANCE_ACCOUNT_ID = "77777777-7777-4777-8777-777777777777";

export type RetailCheckoutAddress = Readonly<{
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  country: string;
  customerEmail: string;
  customerName: string;
  phone: string;
  postalCode: string;
  province: string;
  notes?: string | null;
}>;

export type RetailCheckoutQuoteInput = Readonly<{
  address: RetailCheckoutAddress;
  billingAddress?: RetailCheckoutAddress | null;
  billingSameAsShipping?: boolean | null;
  locale: Locale;
  planId: string;
  removedItemIds?: readonly string[];
  request?: Request;
  selectedItemIds: readonly string[];
}>;

type CheckoutPaymentRow = Readonly<{
  amount: number | string;
  currency: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  fulfilled_at: Date | string | null;
  id: string;
  locale: string;
  metadata: unknown;
  plan_id: string;
  quote_lines: unknown;
  recommendation_run_id: string | null;
  removed_item_ids: string[];
  retail_customer_order_id: string | null;
  routing_snapshot: unknown;
  selected_item_ids: string[];
  selected_retailer_organisation_id: string | null;
  shipping_address: unknown;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_customer_id: string | null;
  stripe_mode: string;
  stripe_payment_intent_id: string | null;
  tracking_token_hash: string | null;
}>;

type QuoteLine = Readonly<{
  currency: string;
  dreamSettlementAmount: number;
  etaDate: string | null;
  imageUrl: string | null;
  productId: string;
  productTitle: string;
  quantity: number;
  retailSellableProductId: string | null;
  unitPriceAmount: number;
}>;

type TrackingOrder = Readonly<{
  address: Record<string, unknown>;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  lines: QuoteLine[];
  orderId: string | null;
  orderNumber: string | null;
  retailerName: string | null;
  status: string;
  totalAmount: number;
  trackingUrl: string | null;
}>;

function toJsonValue(value: unknown): postgres.JSONValue {
  const serialized = JSON.stringify(value ?? {});
  return JSON.parse(serialized === undefined ? "{}" : serialized) as postgres.JSONValue;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function amountMicros(amount: number) {
  return Math.max(1, Math.round(amount * AMOUNT_MICROS_PER_UNIT));
}

function stripeMinorAmountFromMicros(micros: number) {
  return Math.round((micros / AMOUNT_MICROS_PER_UNIT) * STRIPE_MINOR_UNITS_PER_MAJOR);
}

function formatEmailAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en", {
    currency,
    maximumFractionDigits: 0,
    style: "currency"
  }).format(amount);
}

function stripeLocale(locale: Locale) {
  return locale === "th" ? "th" : locale === "zh-CN" ? "zh" : "en";
}

function stripeClient(secretKey: string) {
  return new Stripe(secretKey);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function idempotencyHash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAddress(input: RetailCheckoutAddress): RetailCheckoutAddress {
  const country =
    normalizeProductCountryCode(input.country) ?? defaultProductCountryCode;

  return {
    addressLine1: cleanText(input.addressLine1),
    addressLine2: cleanText(input.addressLine2) || null,
    city: cleanText(input.city),
    country,
    customerEmail: cleanText(input.customerEmail).toLowerCase(),
    customerName: cleanText(input.customerName),
    notes: cleanText(input.notes) || null,
    phone: cleanText(input.phone),
    postalCode: cleanText(input.postalCode),
    province: cleanText(input.province)
  };
}

function assertAddress(address: RetailCheckoutAddress) {
  if (
    !address.customerName ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.customerEmail) ||
    !address.phone ||
    !address.addressLine1 ||
    !address.city ||
    !address.province ||
    !address.postalCode ||
    !normalizeProductCountryCode(address.country)
  ) {
    throw new Error("Complete shipping address is required");
  }
}

export async function ensureRetailCheckoutSchema(sql: RetailCheckoutDb) {
  const rows = await sql<Array<{ payments_ready: boolean; versions_ready: boolean }>>`
    select
      to_regclass('public.retail_checkout_payments') is not null as payments_ready,
      to_regclass('public.retail_checkout_payment_versions') is not null as versions_ready
  `;

  if (!rows[0]?.payments_ready || !rows[0]?.versions_ready) {
    throw new Error(
      "Retail checkout schema is not installed. Run npm run retail-checkout:schema:apply."
    );
  }
}

async function recordVersion(
  sql: RetailCheckoutDb,
  paymentId: string,
  action: string,
  actor: string,
  reason: string,
  metadata: Record<string, unknown> = {}
) {
  const rows = await sql<CheckoutPaymentRow[]>`
    select *
    from public.retail_checkout_payments
    where id = ${paymentId}::uuid
  `;
  const payment = rows[0];

  if (!payment) {
    return;
  }

  await sql`
    insert into public.retail_checkout_payment_versions (
      payment_id,
      version,
      action,
      actor,
      reason,
      snapshot,
      metadata,
      created_at
    )
    values (
      ${paymentId}::uuid,
      coalesce(
        (
          select max(version) + 1
          from public.retail_checkout_payment_versions
          where payment_id = ${paymentId}::uuid
        ),
        1
      ),
      ${action},
      ${actor},
      ${reason},
      ${sql.json(toJsonValue(payment))}::jsonb,
      ${sql.json(toJsonValue(metadata))}::jsonb,
      now()
    )
    on conflict do nothing
  `;
}

async function latestRecommendations(
  sql: RetailCheckoutDb,
  planId: string,
  selectedProductIds: readonly string[]
) {
  const rows = await sql<Array<{
    currency: string | null;
    image_url: string | null;
    price_amount: number | string | null;
    product_id: string;
    rank: number | string | null;
    run_id: string;
    title: string;
  }>>`
    select
      product_recommendation_items.run_id::text,
      product_recommendation_items.product_id::text,
      product_recommendation_items.rank,
      product_recommendation_items.price_amount,
      product_recommendation_items.currency,
      coalesce(products.title_en, products.title) as title,
      coalesce(products.image_url, product_recommendation_items.image_url) as image_url
    from public.product_recommendation_items
    join public.product_recommendation_runs
      on product_recommendation_runs.id = product_recommendation_items.run_id
    join public.products
      on products.id = product_recommendation_items.product_id
    where product_recommendation_runs.plan_id = ${planId}::uuid
      and product_recommendation_items.run_id = (
        select candidate_runs.id
        from public.product_recommendation_runs candidate_runs
        where candidate_runs.plan_id = ${planId}::uuid
          and candidate_runs.status in ('completed', 'partial')
          and coalesce(candidate_runs.diagnostics ->> 'stackPreference', 'balanced') in ('balanced', 'compact')
          and not exists (
            select 1
            from unnest(${[...selectedProductIds]}::uuid[]) as selected(product_id)
            where not exists (
              select 1
              from public.product_recommendation_items selected_items
              where selected_items.run_id = candidate_runs.id
                and selected_items.product_id = selected.product_id
            )
          )
        order by
          case coalesce(candidate_runs.diagnostics ->> 'stackPreference', 'balanced')
            when 'balanced' then 1
            when 'compact' then 2
            else 3
          end,
          candidate_runs.generated_at desc
        limit 1
      )
      and product_recommendation_items.product_id = any(${[...selectedProductIds]}::uuid[])
    order by product_recommendation_items.rank asc
  `;

  if (rows.length !== selectedProductIds.length) {
    throw new Error("Selected basket contains products outside the current recommendation stack");
  }

  return rows;
}

async function dreamSettlementAmounts(
  sql: RetailCheckoutDb,
  organisationId: string,
  productIds: readonly string[]
) {
  const rows = await sql<Array<{
    product_id: string;
    rrp_price_amount: number | string | null;
  }>>`
    select product_id::text, rrp_price_amount
    from public.retail_sellable_products
    where organisation_id = ${organisationId}::uuid
      and product_id = any(${[...productIds]}::uuid[])
      and status <> 'deleted'
    order by updated_at desc
  `;
  const amounts = new Map<string, number>();

  for (const row of rows) {
    if (!amounts.has(row.product_id)) {
      amounts.set(row.product_id, money(row.rrp_price_amount) ?? 0);
    }
  }

  return amounts;
}

export async function createRetailCheckoutSession(input: RetailCheckoutQuoteInput) {
  if (!isUuid(input.planId)) {
    throw new Error("Plan is required");
  }

  const sql = getSql() as Db | null;

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await ensureRetailCheckoutSchema(sql);

  const address = normalizeAddress(input.address);
  assertAddress(address);
  const billingSameAsShipping = input.billingSameAsShipping !== false;
  const billingAddressBase = billingSameAsShipping
    ? address
    : normalizeAddress(input.billingAddress ?? input.address);
  const billingAddress = {
    ...billingAddressBase,
    customerEmail: address.customerEmail,
    phone: address.phone
  };

  if (!billingSameAsShipping) {
    assertAddress(billingAddress);
  }

  const selectedProductIds = [...new Set(input.selectedItemIds.filter(isUuid))];
  const removedItemIds = [...new Set((input.removedItemIds ?? []).filter(Boolean))];

  if (selectedProductIds.length < 1) {
    throw new Error("Select at least one product before checkout");
  }

  const recommendations = await latestRecommendations(sql, input.planId, selectedProductIds);
  const runId = recommendations[0]?.run_id ?? null;
  const availability = await resolveRegionalBasketAvailability({
    lines: selectedProductIds.map((productId) => ({ productId, quantity: 1 })),
    preference: "cheapest_price",
    shippingCountry: address.country,
    sql
  });

  if (!availability.canCheckout || !availability.selectedRetailer) {
    throw new Error("No single retailer can fulfill the selected basket");
  }

  const retailerId = availability.selectedRetailer.organisationId;
  const settlementByProductId = await dreamSettlementAmounts(
    sql,
    retailerId,
    selectedProductIds
  );
  const recommendationByProductId = new Map(
    recommendations.map((item) => [item.product_id, item])
  );
  const quoteLines: QuoteLine[] = availability.payableLines.map((line) => {
    const recommendation = recommendationByProductId.get(line.productId);
    const unitPriceAmount = money(line.unitPriceAmount) ?? 0;

    if (!recommendation || unitPriceAmount <= 0) {
      throw new Error("Selected product is missing checkout pricing");
    }

    return {
      currency: line.currency ?? availability.currency ?? "THB",
      dreamSettlementAmount:
        settlementByProductId.get(line.productId) ?? unitPriceAmount,
      etaDate: line.etaDate,
      imageUrl: recommendation.image_url,
      productId: line.productId,
      productTitle: recommendation.title,
      quantity: 1,
      retailSellableProductId: line.retailSellableProductId,
      unitPriceAmount
    };
  });
  const subtotalAmount = quoteLines.reduce(
    (total, line) => total + line.unitPriceAmount * line.quantity,
    0
  );
  const currency = quoteLines[0]?.currency ?? availability.currency ?? "THB";
  const idempotencyKey = idempotencyHash({
    address,
    billingAddress,
    billingSameAsShipping,
    planId: input.planId,
    runId,
    selectedProductIds
  });
  const config = stripePaymentConfig(input.request);
  const existing = await sql<CheckoutPaymentRow[]>`
    select *
    from public.retail_checkout_payments
    where idempotency_key = ${idempotencyKey}
      and status not in ('paid', 'fulfilled', 'failed', 'cancelled', 'expired', 'fulfillment_failed')
    order by created_at desc
    limit 1
  `;

  let payment = existing[0] ?? null;

  if (!payment) {
    const rows = await sql<CheckoutPaymentRow[]>`
      insert into public.retail_checkout_payments (
        id,
        plan_id,
        recommendation_run_id,
        selected_retailer_organisation_id,
        locale,
        status,
        amount,
        amount_unit,
        currency,
        stripe_mode,
        customer_email,
        customer_name,
        customer_phone,
        shipping_address,
        selected_item_ids,
        removed_item_ids,
        quote_lines,
        routing_snapshot,
        metadata,
        idempotency_key,
        created_at,
        updated_at
      )
      values (
        ${randomUUID()}::uuid,
        ${input.planId}::uuid,
        ${runId}::uuid,
        ${retailerId}::uuid,
        ${input.locale},
        'created',
        ${amountMicros(subtotalAmount)},
        'micros',
        ${currency},
        ${config.mode},
        ${address.customerEmail},
        ${address.customerName},
        ${address.phone},
        ${sql.json(toJsonValue(address))}::jsonb,
        ${selectedProductIds}::text[],
        ${removedItemIds}::text[],
        ${sql.json(toJsonValue(quoteLines))}::jsonb,
        ${sql.json(toJsonValue(availability))}::jsonb,
        ${sql.json(toJsonValue({
          billingAddress,
          billingSameAsShipping,
          freeShipping: true,
          shippingAmount: 0,
          taxAmount: 0,
          taxDisplay: "included"
        }))}::jsonb,
        ${idempotencyKey},
        now(),
        now()
      )
      returning *
    `;
    payment = rows[0] ?? null;

    if (payment) {
      await recordVersion(sql, payment.id, "retail_checkout_created", "visitor", "basket_checkout_requested");
    }
  }

  if (!payment) {
    throw new Error("Unable to create product checkout");
  }

  void writeBpmEvent({
    actorType: "visitor",
    emittedBy: "retail_product_checkout",
    eventName: "retail_product_checkout_requested",
    eventStatus: "requested",
    eventType: "payment",
    locale: input.locale,
    planId: input.planId,
    properties: {
      checkoutPaymentId: payment.id,
      lineCount: quoteLines.length,
      removedItemCount: removedItemIds.length,
      selectedRetailerOrganisationId: retailerId,
      totalAmount: subtotalAmount
    },
    valueAmount: subtotalAmount,
    valueCurrency: currency
  });

  if (config.mode === "mock") {
    const mockSessionId = payment.stripe_checkout_session_id ?? `mock_rcs_${payment.id}`;

    await sql`
      update public.retail_checkout_payments
      set status = 'checkout_session_created',
        stripe_checkout_session_id = ${mockSessionId},
        updated_at = now()
      where id = ${payment.id}::uuid
    `;
    await recordVersion(sql, payment.id, "mock_checkout_session_created", "system", "mock_product_checkout");

    void writeBpmEvent({
      actorType: "system",
      emittedBy: "retail_product_checkout",
      eventName: "retail_product_checkout_session_created",
      eventStatus: "checkout_session_created",
      eventType: "payment",
      locale: input.locale,
      planId: input.planId,
      properties: {
        checkoutPaymentId: payment.id,
        stripeMode: config.mode
      },
      valueAmount: subtotalAmount,
      valueCurrency: currency
    });

    return {
      mock: true,
      paymentId: payment.id,
      returnUrl: retailCheckoutReturnUrl(input.locale, payment.id)
    };
  }

  const stripe = stripeClient(config.secretKey);
  const session = await stripe.checkout.sessions.create({
    client_reference_id: payment.id,
    customer_email: address.customerEmail,
    line_items: quoteLines.map((line) => ({
      price_data: {
        currency: currency.toLowerCase(),
        product_data: {
          images: line.imageUrl ? [line.imageUrl] : undefined,
          name: line.productTitle
        },
        unit_amount: stripeMinorAmountFromMicros(amountMicros(line.unitPriceAmount))
      },
      quantity: line.quantity
    })),
    locale: stripeLocale(input.locale),
    metadata: {
      kind: "retail_product_checkout",
      locale: input.locale,
      paymentId: payment.id,
      planId: input.planId
    },
    mode: "payment",
    payment_intent_data: {
      metadata: {
        kind: "retail_product_checkout",
        paymentId: payment.id,
        planId: input.planId
      }
    },
    return_url: `${siteBaseUrl()}/${input.locale}/basket/return?session_id={CHECKOUT_SESSION_ID}`,
    ui_mode: "embedded_page"
  });

  if (!session.client_secret) {
    throw new Error("Stripe did not return an embedded Checkout client secret");
  }

  await sql`
    update public.retail_checkout_payments
    set status = 'checkout_session_created',
      stripe_checkout_session_id = ${session.id},
      updated_at = now()
    where id = ${payment.id}::uuid
  `;
  await recordVersion(sql, payment.id, "checkout_session_created", "system", "stripe_product_checkout");

  void writeBpmEvent({
    actorType: "system",
    emittedBy: "retail_product_checkout",
    eventName: "retail_product_checkout_session_created",
    eventStatus: "checkout_session_created",
    eventType: "payment",
    locale: input.locale,
    planId: input.planId,
    properties: {
      checkoutPaymentId: payment.id,
      stripeMode: config.mode,
      stripeSessionId: session.id
    },
    valueAmount: subtotalAmount,
    valueCurrency: currency
  });

  return {
    clientSecret: session.client_secret,
    mock: false,
    paymentId: payment.id
  };
}

function retailCheckoutReturnUrl(locale: Locale, paymentId: string) {
  return `/${locale}/basket/return?payment=${encodeURIComponent(paymentId)}`;
}

function orderNumber(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  return `${prefix}-${stamp}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

async function createRetailCustomerOrderFromPayment(
  sql: RetailCheckoutDb,
  payment: CheckoutPaymentRow
) {
  if (payment.retail_customer_order_id) {
    return payment.retail_customer_order_id;
  }

  const quoteLines = arrayValue<QuoteLine>(payment.quote_lines);
  const routing = objectValue(payment.routing_snapshot);
  const retailerId = payment.selected_retailer_organisation_id;

  if (!retailerId || quoteLines.length < 1) {
    throw new Error("Retail checkout quote is incomplete");
  }

  const rows = await sql<Array<{ id: string; order_number: string }>>`
    insert into public.retail_customer_orders (
      organisation_id,
      order_number,
      source,
      customer_name,
      customer_email,
      status,
      currency,
      due_at,
      placed_at,
      notes,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${retailerId}::uuid,
      ${orderNumber("SO")},
      'checkout',
      ${payment.customer_name},
      ${payment.customer_email},
      ${quoteLines.some((line) => line.etaDate) ? "awaiting_stock" : "placed"},
      ${payment.currency},
      ${null}::timestamptz,
      now(),
      ${cleanText(objectValue(payment.shipping_address).notes) || null},
      ${sql.json(toJsonValue({
        checkoutPaymentId: payment.id,
        freeShipping: true,
        removedItemIds: payment.removed_item_ids,
        shippingAddress: payment.shipping_address,
        pricingSnapshot: {
          currency: payment.currency,
          subtotalAmount: Number(payment.amount) / AMOUNT_MICROS_PER_UNIT,
          shippingAmount: 0,
          totalAmount: Number(payment.amount) / AMOUNT_MICROS_PER_UNIT
        },
        regionalRouting: routing
      }))}::jsonb,
      now(),
      now()
    )
    returning id::text, order_number
  `;
  const order = rows[0];

  if (!order) {
    throw new Error("Customer order could not be created");
  }

  for (const line of quoteLines) {
    await sql`
      insert into public.retail_customer_order_lines (
        customer_order_id,
        organisation_id,
        product_id,
        quantity_ordered,
        retail_price_amount,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${order.id}::uuid,
        ${retailerId}::uuid,
        ${line.productId}::uuid,
        ${line.quantity},
        ${line.unitPriceAmount},
        ${sql.json(toJsonValue({
          checkoutPaymentId: payment.id,
          currency: line.currency,
          dreamSettlementAmount: line.dreamSettlementAmount,
          etaDate: line.etaDate,
          lineSubtotalAmount: line.unitPriceAmount * line.quantity,
          retailSellableProductId: line.retailSellableProductId,
          source: "retail_product_checkout"
        }))}::jsonb,
        now(),
        now()
      )
    `;
  }

  await createTask({
    actorType: "ai",
    businessValue: 520,
    context: { source: "retail_product_checkout" },
    groupLabel: "Retail customer order",
    idempotencyKey: `${order.id}:allocate`,
    idempotencyScope: "active",
    idempotencyScopeKey: `retail-order:${order.id}:allocate`,
    organisationId: retailerId,
    priorityReason: "Paid customer checkout needs stock allocation.",
    priorityScore: 620,
    sourceEntityId: order.id,
    sourceEntityType: "retail_customer_order",
    title: "Allocate customer order",
    taskType: "retail_customer_order_allocate"
  });

  return order.id;
}

async function recordRetailCheckoutFinance(
  sql: RetailCheckoutDb,
  payment: CheckoutPaymentRow,
  orderId: string
) {
  const quoteLines = arrayValue<QuoteLine>(payment.quote_lines);
  const amount = Number(payment.amount);
  const fx = await resolveUsdRateForCurrency(payment.currency, { sql });

  await recordFinanceTransaction({
    amount,
    category: "revenue",
    currency: payment.currency,
    description: "Retail product checkout customer payment",
    entryType: payment.stripe_mode === "mock" ? "nominal" : "actual",
    from: `customer:${payment.customer_email ?? payment.id}`,
    metadata: {
      checkoutPaymentId: payment.id,
      orderId,
      planId: payment.plan_id,
      source: "retail_product_checkout"
    },
    provider: payment.stripe_mode === "mock" ? "mock" : "stripe",
    source: "retail_product_checkout",
    sourceRef: `retail-checkout:${payment.id}:customer-inflow`,
    sql,
    to: "mattanutra:retail-revenue",
    toAccountId: FINANCE_ACCOUNT_IDS.mattanutraRevenue,
    fxRateId: fx.fxRateId,
    usdRate: fx.usdRate
  });

  for (const line of quoteLines) {
    if (line.dreamSettlementAmount <= 0) {
      continue;
    }

    await recordFinanceTransaction({
      amount: amountMicros(line.dreamSettlementAmount * line.quantity),
      category: "payout",
      currency: line.currency,
      description: `Nominal Dream Pharmacy settlement for ${line.productTitle}`,
      entryType: "nominal",
      from: "mattanutra:retail-payable",
      fromAccountId: FINANCE_ACCOUNT_IDS.mattanutraRevenue,
      metadata: {
        checkoutPaymentId: payment.id,
        orderId,
        productId: line.productId,
        quantity: line.quantity,
        retailSellableProductId: line.retailSellableProductId
      },
      provider: "dream-pharmacy",
      source: "retail_product_checkout",
      sourceRef: `retail-checkout:${payment.id}:dream:${line.productId}`,
      sql,
      to: "dream-pharmacy:retail",
      toAccountId: DREAM_FINANCE_ACCOUNT_ID,
      fxRateId: fx.fxRateId,
      usdRate: fx.usdRate
    });
  }
}

function retailCheckoutTrackingUrl(locale: string, token: string) {
  return `${siteBaseUrl()}/${locale}/order/track/${encodeURIComponent(token)}`;
}

function retailOrderConfirmationHtml(input: Readonly<{
  orderId: string;
  payment: CheckoutPaymentRow;
  trackingUrl: string;
}>) {
  const quoteLines = arrayValue<QuoteLine>(input.payment.quote_lines);
  const address = objectValue(input.payment.shipping_address);
  const total = Number(input.payment.amount) / AMOUNT_MICROS_PER_UNIT;
  const lineItems = quoteLines
    .map((line) => {
      const amount = formatEmailAmount(
        line.unitPriceAmount * line.quantity,
        line.currency
      );

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
            <strong>${escapeHtml(line.productTitle)}</strong><br>
            <span style="color:#64748b;">Qty ${escapeHtml(line.quantity)}${
              line.etaDate ? ` · ETA ${escapeHtml(line.etaDate)}` : ""
            }</span>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;">
            ${escapeHtml(amount)}
          </td>
        </tr>
      `;
    })
    .join("");
  const addressLines = [
    input.payment.customer_name,
    address.addressLine1,
    address.addressLine2,
    [address.city, address.province, address.postalCode]
      .map(cleanText)
      .filter(Boolean)
      .join(", "),
    address.country
  ].filter(Boolean);

  return `
    <div style="margin:0 auto;max-width:640px;padding:32px 20px;font-family:Arial,sans-serif;color:#173532;">
      <p style="margin:0 0 8px;color:#0f766e;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">
        Order confirmed
      </p>
      <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:34px;font-weight:500;">
        Your Dream Pharmacy order is confirmed
      </h1>
      <p style="margin:0 0 24px;color:#475569;line-height:1.6;">
        Thank you for trusting MattaNutra. Your selected products have been sent to one pharmacy, and we will keep this tracking page updated as the order moves forward.
      </p>
      <p style="margin:0 0 28px;">
        <a href="${escapeHtml(input.trackingUrl)}" style="display:inline-block;border-radius:999px;background:#0f766e;color:#fff;padding:13px 20px;text-decoration:none;font-weight:700;">
          Track your order
        </a>
      </p>
      <div style="border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin-bottom:20px;">
        <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;">Order</p>
        <p style="margin:0;font-family:monospace;">${escapeHtml(input.orderId)}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tbody>
          ${lineItems}
          <tr>
            <td style="padding:16px 0;font-weight:700;">Paid total</td>
            <td style="padding:16px 0;text-align:right;font-weight:700;">${escapeHtml(
              formatEmailAmount(total, input.payment.currency)
            )}</td>
          </tr>
        </tbody>
      </table>
      <div style="border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin-bottom:20px;">
        <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;">Delivery address</p>
        ${addressLines
          .map((line) => `<p style="margin:2px 0;">${escapeHtml(line)}</p>`)
          .join("")}
      </div>
      <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">
        Bookmark the tracking page so you can return to it quickly. If you have questions, reply to this email.
      </p>
    </div>
  `;
}

async function sendRetailOrderConfirmationEmail(input: Readonly<{
  orderId: string;
  payment: CheckoutPaymentRow;
  sql: RetailCheckoutDb;
  trackingToken: string;
}>) {
  const email = cleanText(input.payment.customer_email);

  if (!email) {
    return;
  }

  const metadata = objectValue(input.payment.metadata);
  const existing = objectValue(metadata.orderConfirmationEmail);

  if (existing.sent === true) {
    return;
  }

  const trackingUrl = retailCheckoutTrackingUrl(input.payment.locale, input.trackingToken);
  const delivery = await sendTransactionalEmail({
    html: retailOrderConfirmationHtml({
      orderId: input.orderId,
      payment: input.payment,
      trackingUrl
    }),
    subject: "Your Dream Pharmacy order is confirmed",
    to: email
  });

  await input.sql`
    update public.retail_checkout_payments
    set metadata = metadata || ${input.sql.json(toJsonValue({
      orderConfirmationEmail: {
        messageId: delivery.messageId ?? null,
        reason: delivery.reason ?? null,
        sent: delivery.sent,
        sentAt: delivery.sent ? new Date().toISOString() : null,
        trackingUrl
      }
    }))}::jsonb,
      updated_at = now()
    where id = ${input.payment.id}::uuid
  `;

  void writeBpmEvent({
    actorType: "system",
    emittedBy: "retail_product_checkout",
    eventName: delivery.sent
      ? "retail_order_confirmation_email_sent"
      : "retail_order_confirmation_email_skipped",
    eventStatus: delivery.sent ? "sent" : "skipped",
    eventType: "email",
    locale: input.payment.locale,
    properties: {
      checkoutPaymentId: input.payment.id,
      orderId: input.orderId,
      reason: delivery.reason ?? null
    }
  });
}

async function fulfillRetailCheckoutPayment(
  sql: RetailCheckoutDb,
  payment: CheckoutPaymentRow
) {
  if (payment.status === "fulfilled" && payment.retail_customer_order_id) {
    return payment;
  }

  const orderId = await createRetailCustomerOrderFromPayment(sql, payment);
  const trackingToken = randomBytes(32).toString("base64url");
  const trackingHash = hashToken(trackingToken);

  await recordRetailCheckoutFinance(sql, payment, orderId);

  const rows = await sql<CheckoutPaymentRow[]>`
    update public.retail_checkout_payments
    set status = 'fulfilled',
      retail_customer_order_id = ${orderId}::uuid,
      tracking_token_hash = coalesce(tracking_token_hash, ${trackingHash}),
      fulfilled_at = coalesce(fulfilled_at, now()),
      updated_at = now()
    where id = ${payment.id}::uuid
    returning *
  `;
  const updated = rows[0] ?? payment;

  await recordVersion(sql, payment.id, "retail_checkout_fulfilled", "system", "paid_product_order_created", {
    orderId
  });

  void writeBpmEvent({
    actorType: "system",
    emittedBy: "retail_product_checkout",
    eventName: "retail_customer_order_created",
    eventStatus: updated.status,
    eventType: "funnel",
    locale: updated.locale,
    planId: updated.plan_id,
    properties: {
      checkoutPaymentId: updated.id,
      orderId,
      selectedRetailerOrganisationId: updated.selected_retailer_organisation_id
    },
    valueAmount: Number(updated.amount) / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: updated.currency
  });

  await sendRetailOrderConfirmationEmail({
    orderId,
    payment: updated,
    sql,
    trackingToken
  });

  return {
    ...updated,
    metadata: {
      ...objectValue(updated.metadata),
      trackingToken
    }
  } as CheckoutPaymentRow;
}

export async function completeMockRetailCheckout(input: Readonly<{
  paymentId: string;
  request?: Request;
}>) {
  if (!isUuid(input.paymentId)) {
    return null;
  }

  const sql = getSql() as Db | null;

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await ensureRetailCheckoutSchema(sql);

  const config = stripePaymentConfig(input.request);

  if (config.mode !== "mock") {
    throw new Error("Mock payment completion is only available in dev mock mode");
  }

  const rows = await sql<CheckoutPaymentRow[]>`
    update public.retail_checkout_payments
    set status = 'paid',
      stripe_customer_id = 'mock_customer',
      stripe_payment_intent_id = ${`mock_pi_${input.paymentId}`},
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
    where id = ${input.paymentId}::uuid
      and stripe_mode = 'mock'
      and status in ('created', 'checkout_session_created', 'checkout_opened', 'processing', 'paid', 'fulfilled')
    returning *
  `;
  const payment = rows[0] ?? null;

  if (!payment) {
    return null;
  }

  await recordVersion(sql, payment.id, "mock_payment_paid", "system", "mock_product_payment");

  void writeBpmEvent({
    actorType: "system",
    emittedBy: "retail_product_checkout",
    eventName: "retail_product_payment_succeeded",
    eventStatus: "paid",
    eventType: "payment",
    locale: payment.locale,
    planId: payment.plan_id,
    properties: {
      checkoutPaymentId: payment.id,
      stripeMode: payment.stripe_mode
    },
    valueAmount: Number(payment.amount) / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: payment.currency
  });

  const fulfilled = await fulfillRetailCheckoutPayment(sql, payment);
  const token = cleanText(objectValue(fulfilled.metadata).trackingToken);

  return {
    destination: token
      ? `/${payment.locale}/order/track/${encodeURIComponent(token)}`
      : `/${payment.locale}/basket/return?payment=${payment.id}`,
    paymentId: payment.id
  };
}

export async function fulfillRetailCheckoutSession(input: Readonly<{
  paymentId?: string | null;
  request?: Request;
  sessionId?: string | null;
}>) {
  const sql = getSql() as Db | null;

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await ensureRetailCheckoutSchema(sql);

  let payment: CheckoutPaymentRow | null = null;

  if (input.sessionId) {
    const config = stripePaymentConfig(input.request);
    const stripe = stripeClient(config.secretKey);
    const session = await stripe.checkout.sessions.retrieve(input.sessionId);
    const rows = await sql<CheckoutPaymentRow[]>`
      update public.retail_checkout_payments
      set status = case when ${session.payment_status} = 'paid' then 'paid' else 'processing' end,
        stripe_customer_id = ${typeof session.customer === "string" ? session.customer : null},
        stripe_payment_intent_id = ${typeof session.payment_intent === "string" ? session.payment_intent : null},
        paid_at = case when ${session.payment_status} = 'paid' then coalesce(paid_at, now()) else paid_at end,
        updated_at = now()
      where stripe_checkout_session_id = ${input.sessionId}
      returning *
    `;
    payment = rows[0] ?? null;
  } else if (input.paymentId && isUuid(input.paymentId)) {
    const rows = await sql<CheckoutPaymentRow[]>`
      select *
      from public.retail_checkout_payments
      where id = ${input.paymentId}::uuid
      limit 1
    `;
    payment = rows[0] ?? null;
  }

  if (!payment) {
    return null;
  }

  if (payment.status === "paid" || payment.status === "fulfilled") {
    void writeBpmEvent({
      actorType: "system",
      emittedBy: "retail_product_checkout",
      eventName: "retail_product_payment_succeeded",
      eventStatus: "paid",
      eventType: "payment",
      locale: payment.locale,
      planId: payment.plan_id,
      properties: {
        checkoutPaymentId: payment.id,
        stripeMode: payment.stripe_mode,
        stripeSessionId: payment.stripe_checkout_session_id
      },
      valueAmount: Number(payment.amount) / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: payment.currency
    });

    const fulfilled = await fulfillRetailCheckoutPayment(sql, payment);
    const token = cleanText(objectValue(fulfilled.metadata).trackingToken);

    return {
      destination: token
        ? `/${payment.locale}/order/track/${encodeURIComponent(token)}`
        : `/${payment.locale}`,
      paymentId: payment.id,
      status: "fulfilled" as const
    };
  }

  return {
    destination: `/${payment.locale}/basket/return?payment=${payment.id}`,
    paymentId: payment.id,
    status: "processing" as const
  };
}

export async function markRetailCheckoutOpened(paymentId: string) {
  if (!isUuid(paymentId)) {
    return null;
  }

  const sql = getSql() as Db | null;

  if (!sql) {
    return null;
  }

  await ensureRetailCheckoutSchema(sql);

  const rows = await sql<CheckoutPaymentRow[]>`
    update public.retail_checkout_payments
    set status = 'checkout_opened', updated_at = now()
    where id = ${paymentId}::uuid
      and status = 'checkout_session_created'
    returning *
  `;

  const payment = rows[0] ?? null;

  if (payment) {
    void writeBpmEvent({
      actorType: "visitor",
      emittedBy: "retail_product_checkout",
      eventName: "retail_product_checkout_opened",
      eventStatus: "checkout_opened",
      eventType: "payment",
      locale: payment.locale,
      planId: payment.plan_id,
      properties: {
        checkoutPaymentId: payment.id,
        stripeMode: payment.stripe_mode
      },
      valueAmount: Number(payment.amount) / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: payment.currency
    });
  }

  return payment;
}

export async function getTrackingOrderByToken(
  token: string,
  locale: Locale
): Promise<TrackingOrder | null> {
  if (!token || token.length < 32) {
    return null;
  }

  const sql = getSql() as Db | null;

  if (!sql) {
    return null;
  }

  await ensureRetailCheckoutSchema(sql);

  const rows = await sql<Array<CheckoutPaymentRow & {
    order_number: string | null;
    order_status: string | null;
    retailer_name: string | null;
  }>>`
    select
      retail_checkout_payments.*,
      retail_customer_orders.order_number,
      retail_customer_orders.status as order_status,
      organisations.name as retailer_name
    from public.retail_checkout_payments
    left join public.retail_customer_orders
      on retail_customer_orders.id = retail_checkout_payments.retail_customer_order_id
    left join public.organisations
      on organisations.id = retail_checkout_payments.selected_retailer_organisation_id
    where retail_checkout_payments.tracking_token_hash = ${hashToken(token)}
    limit 1
  `;
  const row = rows[0] ?? null;

  if (!row) {
    return null;
  }

  void writeBpmEvent({
    actorType: "visitor",
    emittedBy: "retail_order_tracking",
    eventName: "order_tracking_viewed",
    eventStatus: row.order_status ?? row.status,
    eventType: "funnel",
    locale,
    properties: {
      checkoutPaymentId: row.id,
      orderId: row.retail_customer_order_id,
      tokenPrefix: token.slice(0, 8)
    }
  });

  return {
    address: objectValue(row.shipping_address),
    currency: row.currency,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    lines: arrayValue<QuoteLine>(row.quote_lines),
    orderId: row.retail_customer_order_id,
    orderNumber: row.order_number,
    retailerName: row.retailer_name,
    status: row.order_status ?? row.status,
    totalAmount: Number(row.amount) / AMOUNT_MICROS_PER_UNIT,
    trackingUrl: `/${locale}/order/track/${encodeURIComponent(token)}`
  };
}

export function retailCheckoutAddressFromUnknown(value: unknown): RetailCheckoutAddress {
  const record = objectValue(value);

  return normalizeAddress({
    addressLine1: cleanText(record.addressLine1),
    addressLine2: cleanText(record.addressLine2),
    city: cleanText(record.city),
    country: cleanText(record.country),
    customerEmail: cleanText(record.customerEmail),
    customerName: cleanText(record.customerName),
    notes: cleanText(record.notes),
    phone: cleanText(record.phone),
    postalCode: cleanText(record.postalCode),
    province: cleanText(record.province)
  });
}

export function isRetailCheckoutLocale(value: unknown): value is Locale {
  return isLocale(value);
}
