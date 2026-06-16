import type postgres from "postgres";
import { getSql } from "@/lib/db";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import {
  customerPriceFromRpp,
  getCustomerPriceMarginPercent
} from "@/lib/customer-pricing";
import {
  DEFAULT_FLAT_RATE_SHIPPING_AMOUNT,
  flatRateShippingAmountFromMetadata,
  getPlatformFlatRateShippingAmount,
  type FlatRateShippingSource
} from "@/lib/shipping-fees";

type RetailCartDb = postgres.Sql | postgres.TransactionSql;

export type BackorderPolicy = "allow" | "deny";
export type RetailAvailabilityStatus =
  | "available_now"
  | "backorder"
  | "unavailable";
export type RetailRoutingPreference = "cheapest_price" | "fastest_delivery";

export type RetailSellableProduct = Readonly<{
  backorderPolicy: BackorderPolicy;
  currency: string;
  id: string;
  leadTimeDays: number;
  organisationId: string;
  productId: string;
  rrpPriceAmount: number;
  status: "active" | "disabled";
  wholesalePriceAmount: number | null;
}>;

export type RetailCartLineAvailability = Readonly<{
  availabilityStatus: RetailAvailabilityStatus;
  backorderPolicy: BackorderPolicy;
  backorderQuantity: number;
  canCheckout: boolean;
  currency: string | null;
  etaDate: string | null;
  leadTimeDays: number;
  productId: string;
  quantityAvailableNow: number;
  quantityRequested: number;
  reason: string;
  retailSellableProductId: string | null;
  unitPriceAmount: number | null;
  wholesalePriceAmount: number | null;
}>;

export type RegionalBasketLineInput = Readonly<{
  productId: string;
  quantity: number;
}>;

export type RetailerRoutingCandidate = Readonly<{
  backorderLineCount: number;
  canCheckout: boolean;
  countryCode: string;
  currency: string;
  etaDate: string | null;
  fulfillableUnits: number;
  fullBasket: boolean;
  lineCount: number;
  lines: RetailCartLineAvailability[];
  organisationId: string;
  organisationName: string;
  payableLineCount: number;
  shippingAmount: number;
  shippingSource: FlatRateShippingSource;
  subtotalAmount: number;
  totalAmount: number;
}>;

export type RegionalBasketLineAvailability = Readonly<
  RetailCartLineAvailability & {
    candidateCount: number;
    payable: boolean;
    selectedRetailerName: string | null;
    selectedRetailerOrganisationId: string | null;
  }
>;

export type RegionalBasketAvailability = Readonly<{
  canCheckout: boolean;
  currency: string | null;
  etaDate: string | null;
  lines: RegionalBasketLineAvailability[];
  payableLines: RegionalBasketLineAvailability[];
  preference: RetailRoutingPreference;
  selectedRetailer: RetailerRoutingCandidate | null;
  shippingCountry: string;
  shippingAmount: number;
  shippingSource: FlatRateShippingSource | null;
  subtotalAmount: number;
  totalAmount: number;
  unavailableLines: RegionalBasketLineAvailability[];
}>;

type RetailCartAvailabilityRow = Readonly<{
  allocated_quantity: number | string | null;
  backorder_policy: string | null;
  currency: string | null;
  id: string | null;
  lead_time_days: number | string | null;
  product_id: string | null;
  product_status: string | null;
  retail_override_price_amount?: number | string | null;
  rrp_price_amount: number | string | null;
  status: string | null;
  stock_quantity: number | string | null;
  wholesale_price_amount: number | string | null;
}>;

type RegionalRetailCartAvailabilityRow = RetailCartAvailabilityRow & Readonly<{
  organisation_country_code: string | null;
  organisation_currency: string | null;
  organisation_id: string;
  organisation_metadata?: unknown;
  organisation_name: string;
}>;

function integerOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function moneyOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function backorderPolicy(value: unknown): BackorderPolicy {
  return value === "deny" ? "deny" : "allow";
}

function etaDate(now: Date, leadTimeDays: number) {
  return new Date(now.getTime() + leadTimeDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function normalizeRetailRoutingPreference(
  value: unknown
): RetailRoutingPreference {
  return value === "cheapest_price" ? "cheapest_price" : "fastest_delivery";
}

function latestEtaDate(lines: readonly RetailCartLineAvailability[]) {
  return lines
    .map((line) => line.etaDate)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function compareNullableEta(left: string | null, right: string | null) {
  if (left === right) {
    return 0;
  }

  if (!left) {
    return -1;
  }

  if (!right) {
    return 1;
  }

  return left.localeCompare(right);
}

export function resolveRetailCartLineAvailabilityFromRow(input: Readonly<{
  now?: Date;
  productId: string;
  quantity: number;
  row: RetailCartAvailabilityRow | null;
  marginPercent?: number;
}>): RetailCartLineAvailability {
  const requested = Math.max(1, integerOrDefault(input.quantity, 1));
  const row = input.row;

  if (!row?.id) {
    return {
      availabilityStatus: "unavailable",
      backorderPolicy: "deny",
      backorderQuantity: requested,
      canCheckout: false,
      currency: null,
      etaDate: null,
      leadTimeDays: 0,
      productId: input.productId,
      quantityAvailableNow: 0,
      quantityRequested: requested,
      reason: "Retailer does not sell this product.",
      retailSellableProductId: null,
      unitPriceAmount: null,
      wholesalePriceAmount: null
    };
  }

  const retailOverridePriceAmount = moneyOrNull(row.retail_override_price_amount);
  const unitPriceAmount =
    retailOverridePriceAmount ??
    customerPriceFromRpp(
      moneyOrNull(row.rrp_price_amount),
      input.marginPercent ?? 10
    );
  const policy = backorderPolicy(row.backorder_policy);
  const leadTimeDays = integerOrDefault(row.lead_time_days, 0);
  const stockQuantity = integerOrDefault(row.stock_quantity, 0);
  const allocatedQuantity = integerOrDefault(row.allocated_quantity, 0);
  const availableNow = Math.max(0, stockQuantity - allocatedQuantity);
  const backorderQuantity = Math.max(0, requested - availableNow);

  if (row.product_status !== "approved") {
    return {
      availabilityStatus: "unavailable",
      backorderPolicy: policy,
      backorderQuantity: requested,
      canCheckout: false,
      currency: row.currency,
      etaDate: null,
      leadTimeDays,
      productId: row.product_id ?? input.productId,
      quantityAvailableNow: availableNow,
      quantityRequested: requested,
      reason: "Master product is not approved for sale.",
      retailSellableProductId: row.id,
      unitPriceAmount,
      wholesalePriceAmount: moneyOrNull(row.wholesale_price_amount)
    };
  }

  if (row.status !== "active" || unitPriceAmount === null) {
    return {
      availabilityStatus: "unavailable",
      backorderPolicy: policy,
      backorderQuantity: requested,
      canCheckout: false,
      currency: row.currency,
      etaDate: null,
      leadTimeDays,
      productId: row.product_id ?? input.productId,
      quantityAvailableNow: availableNow,
      quantityRequested: requested,
      reason: "Retailer product is not currently sellable.",
      retailSellableProductId: row.id,
      unitPriceAmount,
      wholesalePriceAmount: moneyOrNull(row.wholesale_price_amount)
    };
  }

  if (availableNow >= requested) {
    return {
      availabilityStatus: "available_now",
      backorderPolicy: policy,
      backorderQuantity: 0,
      canCheckout: true,
      currency: row.currency,
      etaDate: null,
      leadTimeDays,
      productId: row.product_id ?? input.productId,
      quantityAvailableNow: requested,
      quantityRequested: requested,
      reason: "Stock is available now.",
      retailSellableProductId: row.id,
      unitPriceAmount,
      wholesalePriceAmount: moneyOrNull(row.wholesale_price_amount)
    };
  }

  if (policy === "allow") {
    return {
      availabilityStatus: "backorder",
      backorderPolicy: policy,
      backorderQuantity,
      canCheckout: true,
      currency: row.currency,
      etaDate: etaDate(input.now ?? new Date(), leadTimeDays),
      leadTimeDays,
      productId: row.product_id ?? input.productId,
      quantityAvailableNow: availableNow,
      quantityRequested: requested,
      reason: "Stock is insufficient, but backorder is enabled.",
      retailSellableProductId: row.id,
      unitPriceAmount,
      wholesalePriceAmount: moneyOrNull(row.wholesale_price_amount)
    };
  }

  return {
    availabilityStatus: "unavailable",
    backorderPolicy: policy,
    backorderQuantity,
    canCheckout: false,
    currency: row.currency,
    etaDate: null,
    leadTimeDays,
    productId: row.product_id ?? input.productId,
    quantityAvailableNow: availableNow,
    quantityRequested: requested,
    reason: "Stock is insufficient and backorder is disabled.",
    retailSellableProductId: row.id,
    unitPriceAmount,
    wholesalePriceAmount: moneyOrNull(row.wholesale_price_amount)
  };
}

export async function getRetailCartLineAvailability(input: Readonly<{
  now?: Date;
  organisationId: string;
  productId: string;
  quantity: number;
  sql?: RetailCartDb;
}>): Promise<RetailCartLineAvailability> {
  const sql = input.sql ?? getSql();

  if (!sql) {
    throw new Error("Database is required to resolve retail cart availability");
  }

  const rows = await sql<RetailCartAvailabilityRow[]>`
    select
      sellable.id::text,
      sellable.product_id::text,
      sellable.status,
      sellable.rrp_price_amount as retail_override_price_amount,
      sellable.rrp_price_amount as rrp_price_amount,
      sellable.wholesale_price_amount,
      sellable.currency as currency,
      sellable.lead_time_days,
      sellable.backorder_policy,
      products.status as product_status,
      coalesce(stock.stock_quantity, 0)::int as stock_quantity,
      coalesce(active_allocations.quantity_allocated, 0)::int as allocated_quantity
    from public.retail_sellable_products sellable
    join public.products
      on products.id = sellable.product_id
    left join public.organisations
      on organisations.id = sellable.organisation_id
    left join public.retail_product_stock stock
      on stock.organisation_id = sellable.organisation_id
      and stock.product_id = sellable.product_id
      and stock.status <> 'deleted'
    left join lateral (
      select sum(retail_order_allocations.quantity_allocated)::int as quantity_allocated
      from public.retail_order_allocations
      where retail_order_allocations.organisation_id = sellable.organisation_id
        and retail_order_allocations.product_id = sellable.product_id
        and retail_order_allocations.status in ('active', 'picked')
    ) active_allocations on true
    where sellable.organisation_id = ${input.organisationId}::uuid
      and sellable.product_id = ${input.productId}::uuid
      and sellable.status <> 'deleted'
    order by sellable.updated_at desc
    limit 1
  `;

  return resolveRetailCartLineAvailabilityFromRow({
    marginPercent: await getCustomerPriceMarginPercent({ sql }),
    now: input.now,
    productId: input.productId,
    quantity: input.quantity,
    row: rows[0] ?? null
  });
}

export function resolveRegionalBasketAvailabilityFromRows(input: Readonly<{
  lines: readonly RegionalBasketLineInput[];
  marginPercent?: number;
  now?: Date;
  platformShippingAmount?: number;
  preference?: RetailRoutingPreference;
  preferredRetailerOrganisationId?: string | null;
  rows: readonly RegionalRetailCartAvailabilityRow[];
  shippingCountry: string;
}>): RegionalBasketAvailability {
  const shippingCountry =
    normalizeProductCountryCode(input.shippingCountry) ?? defaultProductCountryCode;
  const preference = normalizeRetailRoutingPreference(input.preference);
  const lines = input.lines
    .filter((line) => line.productId.trim())
    .map((line) => ({
      productId: line.productId.trim(),
      quantity: Math.max(1, integerOrDefault(line.quantity, 1))
    }));
  const rowsByOrganisation = new Map<
    string,
    {
      countryCode: string;
      currency: string;
      metadata: unknown;
      name: string;
      rowsByProductId: Map<string, RegionalRetailCartAvailabilityRow>;
    }
  >();

  for (const row of input.rows) {
    const countryCode =
      normalizeProductCountryCode(row.organisation_country_code) ??
      shippingCountry;

    if (countryCode !== shippingCountry) {
      continue;
    }

    const organisation = rowsByOrganisation.get(row.organisation_id) ?? {
      countryCode,
      currency: row.organisation_currency?.trim().toUpperCase() || "THB",
      metadata: row.organisation_metadata,
      name: row.organisation_name,
      rowsByProductId: new Map<string, RegionalRetailCartAvailabilityRow>()
    };

    if (row.product_id) {
      organisation.rowsByProductId.set(row.product_id, row);
    }

    rowsByOrganisation.set(row.organisation_id, organisation);
  }

  const candidates = [...rowsByOrganisation].map(
    ([organisationId, organisation]) => {
      const candidateLines = lines.map((line) =>
        resolveRetailCartLineAvailabilityFromRow({
          marginPercent: input.marginPercent,
          now: input.now,
          productId: line.productId,
          quantity: line.quantity,
          row: organisation.rowsByProductId.get(line.productId) ?? null
        })
      );
      const payableLines = candidateLines.filter((line) => line.canCheckout);
      const fullBasket =
        lines.length > 0 && payableLines.length === candidateLines.length;
      const subtotalAmount = payableLines.reduce(
        (total, line) =>
          total + (line.unitPriceAmount ?? 0) * line.quantityRequested,
        0
      );
      const fulfillableUnits = payableLines.reduce(
        (total, line) => total + line.quantityRequested,
        0
      );
      const customerCurrency =
        payableLines.find((line) => line.currency)?.currency ??
        candidateLines.find((line) => line.currency)?.currency ??
        organisation.currency;
      const retailShippingAmount =
        flatRateShippingAmountFromMetadata(organisation.metadata);
      const shippingAmount =
        retailShippingAmount ??
        input.platformShippingAmount ??
        DEFAULT_FLAT_RATE_SHIPPING_AMOUNT;
      const shippingSource: FlatRateShippingSource =
        retailShippingAmount !== null
          ? "retail_override"
          : input.platformShippingAmount !== undefined
            ? "platform_default"
            : "system_default";

      return {
        backorderLineCount: payableLines.filter(
          (line) => line.availabilityStatus === "backorder"
        ).length,
        canCheckout: payableLines.length > 0,
        countryCode: organisation.countryCode,
        currency: customerCurrency,
        etaDate: latestEtaDate(payableLines),
        fulfillableUnits,
        fullBasket,
        lineCount: candidateLines.length,
        lines: candidateLines,
        organisationId,
        organisationName: organisation.name,
        payableLineCount: payableLines.length,
        shippingAmount,
        shippingSource,
        subtotalAmount,
        totalAmount: subtotalAmount + (fullBasket ? shippingAmount : 0)
      } satisfies RetailerRoutingCandidate;
    }
  );
  const fullBasketCandidates = candidates.filter((candidate) => candidate.fullBasket);
  const preferredRetailerOrganisationId =
    input.preferredRetailerOrganisationId?.trim() || null;
  const preferredRetailer = preferredRetailerOrganisationId
    ? candidates.find(
        (candidate) =>
          candidate.organisationId === preferredRetailerOrganisationId
      ) ?? null
    : null;
  const selectedRetailer = preferredRetailerOrganisationId
    ? preferredRetailer
    : (fullBasketCandidates.length > 0
        ? fullBasketCandidates
        : candidates.filter((candidate) => candidate.canCheckout))
        .sort((left, right) => {
          if (fullBasketCandidates.length === 0) {
            return (
              right.payableLineCount - left.payableLineCount ||
              right.fulfillableUnits - left.fulfillableUnits ||
              left.totalAmount - right.totalAmount ||
              compareNullableEta(left.etaDate, right.etaDate)
            );
          }

          return (
            left.totalAmount - right.totalAmount ||
            compareNullableEta(left.etaDate, right.etaDate)
          );
        })[0] ?? null;
  // Preserve preference on the response, but always route one basket to one retailer.
  const selectedLines =
    selectedRetailer?.lines ??
    (preferredRetailerOrganisationId
      ? null
      : candidates[0]?.lines) ??
    lines.map((line) =>
      resolveRetailCartLineAvailabilityFromRow({
        marginPercent: input.marginPercent,
        now: input.now,
        productId: line.productId,
        quantity: line.quantity,
        row: null
      })
    );
  const lineCandidateCounts = new Map<string, number>();

  for (const candidate of candidates) {
    for (const line of candidate.lines) {
      if (line.retailSellableProductId) {
        lineCandidateCounts.set(
          line.productId,
          (lineCandidateCounts.get(line.productId) ?? 0) + 1
        );
      }
    }
  }

  const regionalLines = selectedLines.map((line) => {
    const candidateCount = lineCandidateCounts.get(line.productId) ?? 0;
    const payable = Boolean(selectedRetailer?.fullBasket && line.canCheckout);

    return {
      ...line,
      candidateCount,
      payable,
      reason:
        !payable && candidateCount === 0
          ? "Unavailable in your country."
          : line.reason,
      selectedRetailerName: selectedRetailer ? selectedRetailer.organisationName : null,
      selectedRetailerOrganisationId: payable
        ? selectedRetailer?.organisationId ?? null
        : null
    } satisfies RegionalBasketLineAvailability;
  });
  const payableLines = regionalLines.filter((line) => line.payable);
  const unavailableLines = regionalLines.filter((line) => !line.payable);

  return {
    canCheckout: Boolean(selectedRetailer?.fullBasket),
    currency: selectedRetailer?.currency ?? null,
    etaDate: selectedRetailer?.etaDate ?? null,
    lines: regionalLines,
    payableLines,
    preference,
    selectedRetailer,
    shippingCountry,
    shippingAmount: selectedRetailer?.fullBasket
      ? selectedRetailer.shippingAmount
      : 0,
    shippingSource: selectedRetailer?.fullBasket
      ? selectedRetailer.shippingSource
      : null,
    subtotalAmount: selectedRetailer?.subtotalAmount ?? 0,
    totalAmount: selectedRetailer?.fullBasket ? selectedRetailer.totalAmount : 0,
    unavailableLines
  };
}

export async function resolveRegionalBasketAvailability(input: Readonly<{
  lines: readonly RegionalBasketLineInput[];
  now?: Date;
  preference?: RetailRoutingPreference;
  preferredRetailerOrganisationId?: string | null;
  shippingCountry: string;
  sql?: RetailCartDb;
}>): Promise<RegionalBasketAvailability> {
  const sql = input.sql ?? getSql();

  if (!sql) {
    throw new Error("Database is required to resolve regional basket availability");
  }

  const shippingCountry =
    normalizeProductCountryCode(input.shippingCountry) ?? defaultProductCountryCode;
  const productIds = [
    ...new Set(input.lines.map((line) => line.productId.trim()).filter(Boolean))
  ];

  if (productIds.length === 0) {
    return resolveRegionalBasketAvailabilityFromRows({
      lines: [],
      now: input.now,
      preference: input.preference,
      preferredRetailerOrganisationId: input.preferredRetailerOrganisationId,
      rows: [],
      shippingCountry
    });
  }

  const rows = await sql<RegionalRetailCartAvailabilityRow[]>`
    select
      organisations.id::text as organisation_id,
      organisations.name as organisation_name,
      organisations.metadata as organisation_metadata,
      organisations.country_code as organisation_country_code,
      organisations.currency as organisation_currency,
      sellable.id::text,
      sellable.product_id::text,
      sellable.status,
      sellable.rrp_price_amount as retail_override_price_amount,
      sellable.rrp_price_amount as rrp_price_amount,
      sellable.wholesale_price_amount,
      sellable.currency as currency,
      sellable.lead_time_days,
      sellable.backorder_policy,
      products.status as product_status,
      coalesce(stock.stock_quantity, 0)::int as stock_quantity,
      coalesce(active_allocations.quantity_allocated, 0)::int as allocated_quantity
    from public.organisations
    join public.retail_sellable_products sellable
      on sellable.organisation_id = organisations.id
      and sellable.status <> 'deleted'
    join public.products
      on products.id = sellable.product_id
    left join public.retail_product_stock stock
      on stock.organisation_id = sellable.organisation_id
      and stock.product_id = sellable.product_id
      and stock.status <> 'deleted'
    left join lateral (
      select sum(retail_order_allocations.quantity_allocated)::int as quantity_allocated
      from public.retail_order_allocations
      where retail_order_allocations.organisation_id = sellable.organisation_id
        and retail_order_allocations.product_id = sellable.product_id
        and retail_order_allocations.status in ('active', 'picked')
    ) active_allocations on true
    where organisations.organisation_type = 'tenant'
      and organisations.status = 'active'
      and organisations.country_code = ${shippingCountry}
      and sellable.product_id = any(${productIds}::uuid[])
      and products.status = 'approved'
    order by lower(organisations.name), sellable.updated_at desc
  `;

  return resolveRegionalBasketAvailabilityFromRows({
    lines: input.lines,
    marginPercent: await getCustomerPriceMarginPercent({ sql }),
    now: input.now,
    platformShippingAmount: await getPlatformFlatRateShippingAmount({ sql }),
    preference: input.preference,
    preferredRetailerOrganisationId: input.preferredRetailerOrganisationId,
    rows,
    shippingCountry
  });
}
