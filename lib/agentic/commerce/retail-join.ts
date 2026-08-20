import { isUuid, parsePublicId } from "@/lib/agentic/contract/ids";
import { isLocale, type Locale } from "@/lib/i18n";
import { TH_MOCK_SHIPPING_MINOR } from "@/lib/agentic/money";
import { parseCheckoutAddress, type CheckoutAddress } from "@/lib/agentic/checkout-address";
import type { OrderRecord } from "@/lib/agentic/store/types";
import type { AgenticStore } from "@/lib/agentic/store/types";

const DELIGHT_ORGANISATION_NAME = "Delight Pharmacy";

export type AgenticRetailJoinResult = Readonly<{
  orderId: string;
  orderNumber: string;
  paymentId: string;
  trackingUrl: string;
}>;

const FALLBACK_ADDRESS: CheckoutAddress = {
  addressLine1: "1 Test Road",
  city: "Bangkok",
  country: "TH",
  customerEmail: "mcp-orders@mattanutra.com",
  customerName: "MattaNutra MCP",
  phone: "+66812345678",
  postalCode: "10110",
  province: "Bangkok"
};

function asLocale(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}

function majorFromMinor(minor: number) {
  return Math.max(0, minor) / 100;
}

function normalizedTitle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, " ").trim();
}

function productUuid(productId: string) {
  return parsePublicId(productId, "prd_") ?? (isUuid(productId) ? productId : null);
}

async function loadSql() {
  try {
    const { getSql } = await import("@/lib/db");
    return getSql();
  } catch {
    return null;
  }
}

async function resolveRetailerOrganisationId() {
  const sql = await loadSql();

  if (!sql) {
    return null;
  }

  const named = await sql<Array<{ id: string }>>`
    select id::text
    from public.organisations
    where organisation_type = 'tenant'
      and status = 'active'
      and lower(name) = lower(${DELIGHT_ORGANISATION_NAME})
    order by created_at asc
    limit 1
  `;
  const fallback = named[0]
    ? named
    : await sql<Array<{ id: string }>>`
        select id::text
        from public.organisations
        where organisation_type = 'tenant'
          and status = 'active'
          and name ilike 'Delight%'
        order by created_at asc
        limit 1
      `;

  return fallback[0]?.id ?? null;
}

async function ensureCatalogueProduct(input: Readonly<{
  organisationId: string;
  productId: string;
  productName: string;
  retailerSku: string;
  unitPriceAmount: number;
}>) {
  const sql = await loadSql();

  if (!sql) {
    return null;
  }

  const wanted = productUuid(input.productId);
  const title = input.productName.trim() || input.retailerSku || "MCP product";
  const normalized = normalizedTitle(title);

  const matched = await sql<Array<{ id: string }>>`
    select products.id::text
    from public.products
    left join public.retail_sellable_products
      on retail_sellable_products.product_id = products.id
      and retail_sellable_products.organisation_id = ${input.organisationId}::uuid
      and retail_sellable_products.status = 'active'
    where products.status <> 'deleted'
      and (
        ${wanted}::uuid is not null and products.id = ${wanted}::uuid
        or products.normalized_title = ${normalized}
        or lower(products.title) = lower(${title})
        or ${input.retailerSku} <> '' and products.external_product_id = ${input.retailerSku}
      )
    order by
      case when ${wanted}::uuid is not null and products.id = ${wanted}::uuid then 0 else 1 end,
      case when retail_sellable_products.id is not null then 0 else 1 end,
      products.created_at asc
    limit 1
  `;
  let productId = matched[0]?.id ?? wanted;

  if (!productId) {
    return null;
  }

  if (!matched[0]) {
    const url = `https://mattanutra.local/mcp/product/${productId}`;
    await sql`
      insert into public.products (
        id,
        platform,
        region,
        external_product_id,
        title,
        normalized_title,
        product_url,
        normalized_url,
        product_kind,
        product_audience,
        status,
        label_status,
        availability_status,
        price_amount,
        currency,
        source,
        created_at,
        updated_at
      )
      values (
        ${productId}::uuid,
        'manual',
        'TH',
        ${input.retailerSku || null},
        ${title},
        ${normalized},
        ${url},
        ${url.toLowerCase()},
        'supplement',
        'both',
        'approved',
        'parsed',
        'in_stock',
        ${input.unitPriceAmount},
        'THB',
        'admin',
        now(),
        now()
      )
      on conflict (id) do nothing
    `;
  }

  await sql`
    insert into public.retail_sellable_products (
      organisation_id,
      product_id,
      status,
      rrp_price_amount,
      wholesale_price_amount,
      currency,
      lead_time_days,
      backorder_policy,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${input.organisationId}::uuid,
      ${productId}::uuid,
      'active',
      ${input.unitPriceAmount},
      ${input.unitPriceAmount},
      'THB',
      0,
      'allow',
      ${JSON.stringify({ channel: "mcp", source: "retail_product_checkout" })}::jsonb,
      now(),
      now()
    )
    on conflict (organisation_id, product_id) do update set
      status = 'active',
      updated_at = now()
  `;

  return productId;
}

function addressFromCheckout(value: string | null): CheckoutAddress {
  if (!value) {
    return FALLBACK_ADDRESS;
  }

  try {
    const parsedJson = JSON.parse(value) as { address?: unknown };
    const parsed = parseCheckoutAddress(parsedJson.address ?? parsedJson, "TH");
    return "address" in parsed ? parsed.address : FALLBACK_ADDRESS;
  } catch {
    return FALLBACK_ADDRESS;
  }
}

export async function lookupRetailOrderForAgentic(agenticOrderId: string) {
  const sql = await loadSql();

  if (!sql || !agenticOrderId) {
    return null;
  }

  try {
    const rows = await sql<Array<{
      order_id: string;
      order_number: string;
      order_status: string;
      payment_id: string;
    }>>`
      select
        retail_customer_orders.id::text as order_id,
        retail_customer_orders.order_number,
        retail_customer_orders.status as order_status,
        retail_checkout_payments.id::text as payment_id
      from public.retail_checkout_payments
      join public.retail_customer_orders
        on retail_customer_orders.id = retail_checkout_payments.retail_customer_order_id
      where retail_checkout_payments.metadata->>'agenticOrderId' = ${agenticOrderId}
      order by retail_checkout_payments.created_at desc
      limit 1
    `;
    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      orderId: row.order_id,
      orderNumber: row.order_number,
      orderStatus: row.order_status,
      paymentId: row.payment_id,
      trackingUrl: `/en/order/track/${encodeURIComponent(row.order_number)}`
    };
  } catch {
    return null;
  }
}

export async function joinMcpPaidOrderToRetail(input: Readonly<{
  now: string;
  order: OrderRecord;
  request?: Request;
  store: AgenticStore;
}>): Promise<AgenticRetailJoinResult | null> {
  if (input.order.paymentStatus !== "paid") {
    return null;
  }

  if (!(await loadSql())) {
    return null;
  }

  try {
    const existing = await lookupRetailOrderForAgentic(input.order.id);

    if (existing) {
      const linked = await input.store.getRetailLink(input.order.id);

      if (!linked) {
        await input.store.insertRetailLink({
          adapter: "retail_product_checkout",
          createdAt: input.now,
          orderId: input.order.id,
          retailerReference: existing.orderNumber
        });
      }

      return existing;
    }

    const organisationId = await resolveRetailerOrganisationId();

    if (!organisationId) {
      throw new Error("Retail organisation was not found for MCP pay");
    }

    const [items, checkout] = await Promise.all([
      input.store.getOrderItems(input.order.id),
      input.store.getCheckoutByOrderId(input.order.id)
    ]);
    const mapped = [];

    for (const item of items) {
      const productId = await ensureCatalogueProduct({
        organisationId,
        productId: item.productId,
        productName: item.productName,
        retailerSku: item.retailerSku,
        unitPriceAmount: majorFromMinor(item.unitPriceMinor)
      });

      if (!productId) {
        continue;
      }

      mapped.push({
        productId,
        productName: item.productName,
        quantity: item.quantity,
        retailerSku: item.retailerSku,
        unitPriceAmount: majorFromMinor(item.unitPriceMinor)
      });
    }

    if (mapped.length < 1) {
      throw new Error("MCP pay could not map catalogue products for retail fulfillment");
    }

    const frozen = input.order.frozenPlan && typeof input.order.frozenPlan === "object"
      ? (input.order.frozenPlan as Record<string, unknown>)
      : {};
    const shippingAmount = majorFromMinor(
      typeof frozen.shippingMinor === "number" ? frozen.shippingMinor : TH_MOCK_SHIPPING_MINOR
    );
    const totalAmount = majorFromMinor(input.order.totalPriceMinor);
    const { fulfillAgenticRetailCheckout } = await import("@/lib/retail-product-checkout");
    const result = await fulfillAgenticRetailCheckout({
      address: addressFromCheckout(checkout?.encryptedAddress ?? null),
      agenticOrderId: input.order.id,
      agenticOrderReference: input.order.reference,
      currency: input.order.currency,
      items: mapped,
      locale: asLocale("en"),
      organisationId,
      planId: input.order.planId,
      request: input.request,
      shippingAmount,
      totalAmount
    });

    if (!result) {
      return null;
    }

    const linked = await input.store.getRetailLink(input.order.id);

    if (!linked) {
      await input.store.insertRetailLink({
        adapter: "retail_product_checkout",
        createdAt: input.now,
        orderId: input.order.id,
        retailerReference: result.orderNumber
      });
    }

    return result;
  } catch (error) {
    console.warn("Unable to join MCP pay to retail checkout", {
      error,
      orderId: input.order.id
    });
    return null;
  }
}

export async function persistMcpPlanFeedback(input: Readonly<{
  optionId: string | null;
  planId: string;
  rating: number | null;
  revision: number;
  summary: string | null;
}>) {
  const sql = await loadSql();

  if (!sql || !isUuid(input.planId) || !input.summary?.trim()) {
    return;
  }

  try {
    const { savePlanFeedback } = await import("@/lib/plan-feedback");

    await sql`
      insert into public.assessments (
        plan_id,
        locale,
        status,
        answers,
        answer_summary,
        health_score,
        updated_at
      )
      values (
        ${input.planId}::uuid,
        'en',
        'captured',
        '{}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        now()
      )
      on conflict (plan_id) do nothing
    `;

    const retail = await sql<Array<{ order_id: string }>>`
      select retail_customer_orders.id::text as order_id
      from public.retail_checkout_payments
      join public.retail_customer_orders
        on retail_customer_orders.id = retail_checkout_payments.retail_customer_order_id
      where retail_checkout_payments.plan_id = ${input.planId}::uuid
      order by retail_checkout_payments.created_at desc
      limit 1
    `;

    await savePlanFeedback(sql, {
      feedback: [
        {
          body: input.summary.trim(),
          feedbackType: "other",
          itemId: input.optionId,
          itemName: "MCP plan",
          itemType: "plan",
          urgency: "normal"
        }
      ],
      metadata: {
        channel: "mcp",
        consentConfirmed: true,
        rating: input.rating,
        retailOrderId: retail[0]?.order_id ?? null,
        revision: input.revision,
        source: "mcp_feedback"
      },
      planId: input.planId
    });
  } catch (error) {
    console.warn("Unable to persist MCP feedback to plan_feedback", {
      error,
      planId: input.planId
    });
  }
}
