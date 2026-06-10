"use client";

/* eslint-disable @next/next/no-img-element -- Admin catalogue thumbnails use remote retailer images that are not all in the Next image allowlist. */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  FileDown,
  PackageCheck,
  ReceiptText,
  Truck
} from "lucide-react";
import type {
  AdminRetailCustomerOrder,
  AdminRetailCustomerOrderAddress,
  AdminRetailCustomerOrderLine,
  AdminRetailStockData,
  AdminRetailStockMovement,
  AdminRetailStockProductOption,
  AdminRetailStockRow,
  RetailCustomerOrderStatus,
  RetailStockMovementType,
  RetailStockStatus
} from "@/lib/admin-retail-stock";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type { AdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import type { Locale } from "@/lib/i18n";
import type {
  BackorderPolicy,
  RegionalBasketAvailability,
  RetailAvailabilityStatus,
  RetailRoutingPreference
} from "@/lib/retail-cart-availability";
import {
  productCountryLabel,
  productCountryOptions
} from "@/lib/product-countries";
import { supportedOrganisationCurrencies } from "@/lib/currencies";
import type {
  AdminContent,
  AdminDashboardView
} from "@/components/admin/dashboard-content";
import {
  formatAmount,
  formatPrice,
  formatWholeAmount
} from "@/components/admin/retail-stock-formatters";
import {
  RetailShoppingListModal,
  type ShoppingListLineDraft
} from "@/components/admin/retail-shopping-list-modal";
import {
  BusinessStatsGrid,
  adminHref,
  adminLocaleTextClass,
  businessMetricColors,
  classNames,
  formatNumber,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { AdminButton, AdminModal } from "@/components/admin/ui";

type StockResponse = Readonly<{
  data?: AdminRetailStockData;
  error?: string;
  result?: unknown;
  timingsMs?: Readonly<{
    mutation?: number;
    readModel?: number;
  }>;
  updated?: boolean;
}>;

type StockDraft = Readonly<{
  backorderPolicy: BackorderPolicy;
  leadTimeDays: string;
  notes: string;
  retailPriceAmount: string;
  status: RetailStockStatus;
  stockQuantity: string;
  wholesalePriceAmount: string;
}>;

const emptyStockDraft: StockDraft = {
  backorderPolicy: "allow",
  leadTimeDays: "0",
  notes: "",
  retailPriceAmount: "",
  status: "active",
  stockQuantity: "0",
  wholesalePriceAmount: ""
};

const kexCarrierName = "KEX Express (Thailand)";
const grabCarrierName = "Grab";
const shipmentCarrierOptions = [kexCarrierName, grabCarrierName] as const;

type RetailStockPanel =
  | "audit"
  | "customer-orders"
  | "fulfillment"
  | "insights"
  | "list"
  | "movements"
  | "stock-advice";

type RetailStockFilter =
  | "all"
  | "in_stock"
  | "low_stock"
  | "out_of_stock";

type CustomerOrderMetricKey =
  | "allocated"
  | "awaiting_stock"
  | "packed"
  | "pickup_booked"
  | "placed"
  | "shipped";

type CustomerOrderFilter = "all" | CustomerOrderMetricKey;

const customerOrderStatusFilters: CustomerOrderMetricKey[] = [
  "placed",
  "awaiting_stock",
  "allocated",
  "packed",
  "pickup_booked",
  "shipped"
];

const customerOrderAllExcludedStatuses = new Set<RetailCustomerOrderStatus>([
  "shipped",
  "delivered",
  "cancelled",
  "returned"
]);

const customerOrderVisibleStatusSet = new Set<CustomerOrderMetricKey>(
  customerOrderStatusFilters
);

type RetailStockAvailabilityStatus =
  | "in_stock"
  | "low_stock"
  | "out_of_stock";

type MovementDraft = Readonly<{
  expiresAt: string;
  movementType: Exclude<RetailStockMovementType, "void">;
  notes: string;
  quantity: string;
  reason: string;
  unitCostAmount: string;
}>;

type StockEditor =
  | Readonly<{
      draft: StockDraft;
      mode: "add";
      organisationId: string;
      product: AdminRetailStockProductOption | null;
    }>
  | Readonly<{
      draft: StockDraft;
      mode: "edit";
      organisationId: string;
      row: AdminRetailStockRow;
    }>;

type MovementEditor =
  | Readonly<{
      draft: MovementDraft;
      mode: "record";
      row: AdminRetailStockRow;
    }>
  | Readonly<{
      draft: Pick<MovementDraft, "notes" | "reason">;
      mode: "void";
      movement: AdminRetailStockMovement;
    }>;

type ReorderPurchaseItem = Readonly<{
  assignedActiveUnits: number;
  amountToBuyUnits: number;
  brandName: string | null;
  currentStockQuantity: number;
  organisationId: string;
  productId: string;
  productTitle: string;
  recommendationPressureCount: number;
  riskLevel: AdminRetailStockData["reorderAdvice"][number]["riskLevel"] | null;
  source: "backorder" | "recommendation";
  unassignedDemandUnits: number;
  unorderedNeedUnits: number;
  wholesalePriceAmount: number | null;
}>;

type CustomerOrderMode = "direct" | "regional";

type CustomerOrderLineDraft = Readonly<{
  id: string;
  notes: string;
  productId: string;
  quantityOrdered: string;
}>;

type CustomerOrderDraft = Readonly<{
  customerEmail: string;
  customerName: string;
  dueAt: string;
  lines: CustomerOrderLineDraft[];
  mode: CustomerOrderMode;
  notes: string;
  organisationId: string;
  routingPreference: RetailRoutingPreference;
  shippingCountry: string;
}>;

type ShipmentDraft = Readonly<{
  carrierName: string;
  confirmedPacked: boolean;
  shipmentNotes: string;
  trackingNumber: string;
  trackingUrl: string;
}>;

type ShipmentEditor = Readonly<{
  draft: ShipmentDraft;
  order: AdminRetailCustomerOrder;
}>;

type KexSettingsDraft = Readonly<{
  accountNumber: string;
  apiKey: string;
  baseUrl: string;
  createShipmentEndpoint: string;
  labelEndpoint: string;
  mode: "live" | "mock" | "sandbox";
  pickupEndpoint: string;
  testEndpoint: string;
  trackingEndpoint: string;
}>;

const emptyKexSettingsDraft: KexSettingsDraft = {
  accountNumber: "",
  apiKey: "",
  baseUrl: "",
  createShipmentEndpoint: "",
  labelEndpoint: "",
  mode: "mock",
  pickupEndpoint: "",
  testEndpoint: "",
  trackingEndpoint: ""
};

const emptyMovementDraft: MovementDraft = {
  expiresAt: "",
  movementType: "receive",
  notes: "",
  quantity: "1",
  reason: "",
  unitCostAmount: ""
};

function draftFromRow(row: AdminRetailStockRow): StockDraft {
  return {
    backorderPolicy: row.backorderPolicy,
    leadTimeDays: String(row.leadTimeDays),
    notes: row.notes ?? "",
    retailPriceAmount:
      row.retailOverridePriceAmount === null
        ? ""
        : String(row.retailOverridePriceAmount),
    status: row.status,
    stockQuantity: String(row.stockQuantity),
    wholesalePriceAmount:
      row.wholesalePriceAmount === null ? "" : String(row.wholesalePriceAmount)
  };
}

function numberOrNull(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function statusLabel(labels: AdminContent, status: RetailStockStatus) {
  if (status === "deleted") {
    return labels.access.deleted;
  }

  if (status === "disabled") {
    return labels.stock.disabled;
  }

  return labels.access.active;
}

function backorderPolicyLabel(labels: AdminContent, policy: BackorderPolicy) {
  return policy === "deny"
    ? labels.stock.backorderDisabled
    : labels.stock.backorderAllowed;
}

function backorderPolicyClass(policy: BackorderPolicy) {
  return policy === "deny"
    ? "bg-red-50 text-red-700 ring-red-100"
    : "bg-emerald-50 text-emerald-700 ring-emerald-100";
}

function movementLabel(labels: AdminContent, type: RetailStockMovementType) {
  const labelsByType: Record<RetailStockMovementType, string> = {
    adjustment: labels.stock.movementAdjustment,
    expiry_write_off: labels.stock.movementExpiryWriteOff,
    receive: labels.stock.movementReceive,
    return: labels.stock.movementReturn,
    sale: labels.stock.movementSale,
    transfer_in: labels.stock.movementTransferIn,
    transfer_out: labels.stock.movementTransferOut,
    void: labels.stock.movementVoid
  };

  return labelsByType[type];
}

function stockAvailabilityStatus(
  row: AdminRetailStockRow,
  advice: AdminRetailStockData["reorderAdvice"][number] | undefined
): RetailStockAvailabilityStatus | null {
  if (row.status !== "active") {
    return null;
  }

  if (row.stockQuantity === 0) {
    return "out_of_stock";
  }

  const daysCover = advice?.daysCover ?? null;
  const leadTimeDays = advice?.leadTimeDays ?? row.leadTimeDays;

  if (
    (daysCover !== null && daysCover <= leadTimeDays + 1) ||
    (daysCover === null && row.stockQuantity < 3)
  ) {
    return "low_stock";
  }

  return "in_stock";
}

function stockAvailabilityLabel(
  labels: AdminContent,
  status: RetailStockAvailabilityStatus
) {
  const labelsByStatus: Record<RetailStockAvailabilityStatus, string> = {
    in_stock: labels.stock.inStock,
    low_stock: labels.stock.lowStock,
    out_of_stock: labels.stock.outOfStock
  };

  return labelsByStatus[status];
}

function retailAvailabilityLabel(status: RetailAvailabilityStatus) {
  const labelsByStatus: Record<RetailAvailabilityStatus, string> = {
    available_now: "Available now",
    backorder: "Backorder",
    unavailable: "Unavailable"
  };

  return labelsByStatus[status];
}

function reorderRiskRank(
  riskLevel: AdminRetailStockData["reorderAdvice"][number]["riskLevel"] | null
) {
  if (riskLevel === "out_of_stock") {
    return 0;
  }

  if (riskLevel === "reorder") {
    return 1;
  }

  if (riskLevel === "watch") {
    return 2;
  }

  return 3;
}

function orgProductKey(organisationId: string, productId: string | null | undefined) {
  return `${organisationId}:${productId ?? "unknown"}`;
}

function activeShoppingListCoverageUnits(
  line: AdminRetailStockData["shoppingListLines"][number]
) {
  const assignedDemand = Math.max(
    line.assignedQuantity,
    line.requiredQuantity,
    line.unorderedNeedQuantity
  );

  if (assignedDemand < 1) {
    return Math.max(0, line.actualQuantity - line.stockedQuantity);
  }

  if (line.actualQuantity < assignedDemand) {
    return Math.max(0, line.actualQuantity - line.stockedQuantity);
  }

  return assignedDemand;
}

function activeShoppingListReturnedDemandUnits(
  line: AdminRetailStockData["shoppingListLines"][number]
) {
  const assignedDemand = Math.max(
    line.assignedQuantity,
    line.requiredQuantity,
    line.unorderedNeedQuantity
  );

  return Math.max(0, assignedDemand - line.actualQuantity);
}

function customerOrderRetailValue(order: AdminRetailCustomerOrder) {
  return order.pricingSnapshot?.totalAmount ?? order.totalRetailAmount;
}

function customerOrderHasPickupBooked(order: AdminRetailCustomerOrder) {
  return Boolean(order.shipment?.pickupBookedAt) &&
    order.status !== "shipped" &&
    order.status !== "delivered" &&
    order.status !== "cancelled" &&
    order.status !== "returned";
}

function customerOrderStatusFilterLabel(status: CustomerOrderMetricKey) {
  if (status === "allocated") {
    return "Ready to pack";
  }

  if (status === "packed") {
    return "Ready to ship";
  }

  if (status === "pickup_booked") {
    return "Pickup booked";
  }

  return readableToken(status);
}

function customerOrderStatusMetricKey(
  orderOrStatus: AdminRetailCustomerOrder | RetailCustomerOrderStatus
): CustomerOrderMetricKey | null {
  const status =
    typeof orderOrStatus === "string" ? orderOrStatus : orderOrStatus.status;

  if (
    typeof orderOrStatus !== "string" &&
    customerOrderHasPickupBooked(orderOrStatus)
  ) {
    return "pickup_booked";
  }

  if (
    typeof orderOrStatus !== "string" &&
    orderOrStatus.workflowStage === "awaiting_stock"
  ) {
    return "awaiting_stock";
  }

  if (status === "picking") {
    return "packed";
  }

  return customerOrderVisibleStatusSet.has(status as CustomerOrderMetricKey)
    ? status as CustomerOrderMetricKey
    : null;
}

function customerOrderIncludedInAllMetric(order: AdminRetailCustomerOrder) {
  return !customerOrderAllExcludedStatuses.has(order.status);
}

function customerOrderMatchesFilter(
  order: AdminRetailCustomerOrder,
  filter: CustomerOrderFilter
) {
  if (filter === "all") {
    return customerOrderIncludedInAllMetric(order);
  }

  return customerOrderStatusMetricKey(order) === filter;
}

function customerOrderStatusDisplay(order: AdminRetailCustomerOrder) {
  if (customerOrderHasPickupBooked(order)) {
    return "Pickup booked";
  }

  if (order.status === "awaiting_stock" || order.workflowStage === "awaiting_stock") {
    return "Awaiting stock";
  }

  if (order.status === "allocated") {
    return "Ready to pack";
  }

  if (order.status === "picking" || order.status === "packed") {
    return "Ready to ship";
  }

  return readableToken(order.status);
}

function customerOrderStatusPillClass(order: AdminRetailCustomerOrder) {
  if (
    order.status === "awaiting_stock" ||
    order.workflowStage === "awaiting_stock" ||
    customerOrderHasPickupBooked(order)
  ) {
    return "bg-amber-50 text-amber-800 ring-amber-100";
  }

  return "bg-gray-100 text-gray-700 ring-gray-200";
}

function customerOrderMetricColor(status: CustomerOrderMetricKey) {
  if (status === "awaiting_stock" || status === "pickup_booked") {
    return businessMetricColors.medium;
  }

  if (status === "allocated") {
    return businessMetricColors.active;
  }

  if (status === "packed") {
    return businessMetricColors.processing;
  }

  if (status === "shipped") {
    return businessMetricColors.succeeded;
  }

  return businessMetricColors.queued;
}

function shipmentCarrierSelectValue(carrierName: string) {
  if (!carrierName) {
    return kexCarrierName;
  }

  return shipmentCarrierOptions.some((option) => option === carrierName)
    ? carrierName
    : kexCarrierName;
}

function shipmentLabelStatusText(
  shipment: AdminRetailCustomerOrder["shipment"]
) {
  const status = shipment?.labelStatus;

  if (status === "generated") {
    return shipment?.labelUrl ? "Official KEX label ready" : "Carrier label generated";
  }

  if (status === "requested") {
    return "Official KEX label requested";
  }

  if (status === "failed") {
    return "Official KEX label failed; use fallback only if needed";
  }

  if (status === "manual_required") {
    return "Manual carrier label required";
  }

  return "Official carrier label not requested";
}

function printShipmentLabel(input: Readonly<{
  labels: AdminContent;
  lines: readonly AdminRetailCustomerOrderLine[];
  locale: Locale;
  order: AdminRetailCustomerOrder;
}>) {
  if (typeof window === "undefined") {
    return;
  }

  if (input.order.shipment?.labelUrl) {
    window.open(input.order.shipment.labelUrl, "_blank", "noopener,noreferrer");
    return;
  }

  if (input.order.shipment?.labelContentBase64) {
    const contentType =
      input.order.shipment.labelContentType || "application/pdf";
    window.open(
      `data:${contentType};base64,${input.order.shipment.labelContentBase64}`,
      "_blank",
      "noopener,noreferrer"
    );
    return;
  }

  printRetailOrderDocument({
    kind: "shipping-label",
    labels: input.labels,
    lines: input.lines,
    locale: input.locale,
    order: input.order
  });
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatDateTime(value: string | null, locale: Locale) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function buildCustomerOrderWorkflowSteps(
  labels: AdminContent,
  order: AdminRetailCustomerOrder
) {
  const current =
    order.status === "shipped" || order.status === "delivered"
      ? "sent"
      : customerOrderHasPickupBooked(order)
        ? "pickup_booked"
        : order.status === "awaiting_stock" ||
            order.workflowStage === "awaiting_stock"
      ? "awaiting_stock"
      : order.status === "allocated"
        ? "ready_to_pack"
        : order.status === "picking" || order.status === "packed"
          ? "ready_to_ship"
          : "ordered";

  return [
    {
      active: current === "ordered",
      at: order.workflowTimeline.orderedAt,
      complete: Boolean(order.workflowTimeline.orderedAt),
      key: "ordered",
      label: labels.stock.ordered
    },
    {
      active: current === "awaiting_stock",
      at: order.workflowTimeline.awaitingStockAt,
      complete:
        Boolean(order.workflowTimeline.awaitingStockAt) ||
        current === "awaiting_stock" ||
        current === "ready_to_pack" ||
        current === "ready_to_ship" ||
        current === "pickup_booked" ||
        current === "sent",
      key: "awaiting_stock",
      label: labels.stock.awaitingStock
    },
    {
      active: current === "ready_to_pack",
      at: order.workflowTimeline.allocatedAt,
      complete:
        Boolean(order.workflowTimeline.allocatedAt) ||
        current === "ready_to_pack" ||
        current === "ready_to_ship" ||
        current === "pickup_booked" ||
        current === "sent",
      key: "ready_to_pack",
      label: labels.stock.readyToPack
    },
    {
      active: current === "ready_to_ship",
      at: order.workflowTimeline.boxedAt ?? order.workflowTimeline.allocatedAt,
      complete:
        Boolean(order.workflowTimeline.boxedAt) ||
        current === "ready_to_ship" ||
        current === "pickup_booked" ||
        current === "sent",
      key: "ready_to_ship",
      label: labels.stock.readyToShip
    },
    {
      active: current === "pickup_booked",
      at: order.workflowTimeline.pickupBookedAt,
      complete:
        Boolean(order.workflowTimeline.pickupBookedAt) ||
        current === "pickup_booked" ||
        current === "sent",
      key: "pickup_booked",
      label: labels.stock.pickupBooked
    },
    {
      active: current === "sent",
      at: order.workflowTimeline.sentAt,
      complete: Boolean(order.workflowTimeline.sentAt) || current === "sent",
      key: "sent",
      label: labels.stock.sent
    }
  ] as const;
}

type RetailOrderDocumentKind =
  | "invoice"
  | "order"
  | "order-pack"
  | "packing-sheet"
  | "shipping-label";

function presentText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function addressHasValue(address: AdminRetailCustomerOrderAddress | null) {
  return Boolean(address && Object.values(address).some((value) => Boolean(value)));
}

function fallbackDeliveryAddressForOrder(
  order: AdminRetailCustomerOrder
): AdminRetailCustomerOrderAddress | null {
  const address: AdminRetailCustomerOrderAddress = {
    addressLine1: null,
    addressLine2: null,
    city: null,
    country: order.routingSnapshot?.shippingCountry ?? null,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    notes: order.notes,
    phone: null,
    postalCode: null,
    province: null
  };

  return addressHasValue(address) ? address : null;
}

function deliveryAddressForOrder(order: AdminRetailCustomerOrder) {
  return (
    order.deliveryDetails?.shippingAddress ??
    fallbackDeliveryAddressForOrder(order)
  );
}

function billingAddressForOrder(order: AdminRetailCustomerOrder) {
  if (order.deliveryDetails?.billingSameAsShipping) {
    return null;
  }

  return order.deliveryDetails?.billingAddress ?? null;
}

function addressDisplayLines(address: AdminRetailCustomerOrderAddress | null) {
  if (!address) {
    return [];
  }

  const cityLine = [
    address.city,
    address.province,
    address.postalCode
  ].filter(presentText).join(", ");
  const countryLine = address.country
    ? productCountryLabel(address.country)
    : null;

  return [
    address.customerName,
    address.addressLine1,
    address.addressLine2,
    cityLine,
    countryLine
  ].filter(presentText);
}

function addressContactLines(
  labels: AdminContent,
  address: AdminRetailCustomerOrderAddress | null
) {
  if (!address) {
    return [];
  }

  return [
    address.phone ? `${labels.stock.phone}: ${address.phone}` : null,
    address.customerEmail ? `${labels.stock.email}: ${address.customerEmail}` : null,
    address.notes ? `${labels.stock.deliveryNotes}: ${address.notes}` : null
  ].filter(presentText);
}

function addressNoteLines(
  labels: AdminContent,
  address: AdminRetailCustomerOrderAddress | null
) {
  return address?.notes ? [`${labels.stock.deliveryNotes}: ${address.notes}`] : [];
}

function addressBlockHtml(
  title: string,
  lines: readonly string[],
  contactLines: readonly string[],
  fallback: string
) {
  const body = [...lines, ...contactLines]
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

  return `
    <section class="panel">
      <h2>${escapeHtml(title)}</h2>
      <div class="address">${body || `<div class="muted">${escapeHtml(fallback)}</div>`}</div>
    </section>
  `;
}

function retailOrderDocumentTitle(
  labels: AdminContent,
  kind: RetailOrderDocumentKind
) {
  const titles: Record<RetailOrderDocumentKind, string> = {
    invoice: labels.stock.invoice,
    order: labels.stock.printOrder,
    "order-pack": labels.stock.downloadPdf,
    "packing-sheet": labels.stock.packingSheet,
    "shipping-label": labels.stock.shippingLabel
  };

  return titles[kind];
}

function orderLineIdentifierParts(line: AdminRetailCustomerOrderLine) {
  return [
    `SKU: ${line.productId}`,
    line.manufacturerSku ? `Manufacturer SKU: ${line.manufacturerSku}` : null,
    line.ean13 ? `EAN-13: ${line.ean13}` : null
  ].filter((value): value is string => Boolean(value));
}

function orderLineAwaitingStockUnits(line: AdminRetailCustomerOrderLine) {
  return Math.max(0, line.pipeline?.unorderedNeedUnits ?? 0);
}

const emptyRetailField = "";

function printRetailOrderDocument({
  kind,
  labels,
  lines,
  locale,
  order
}: Readonly<{
  kind: RetailOrderDocumentKind;
  labels: AdminContent;
  lines: readonly AdminRetailCustomerOrderLine[];
  locale: Locale;
  order: AdminRetailCustomerOrder;
}>) {
  if (typeof window === "undefined") {
    return;
  }

  const documentTitle = retailOrderDocumentTitle(labels, kind);
  const includePrices = kind === "invoice" || kind === "order";
  const shippingAddress = deliveryAddressForOrder(order);
  const billingAddress = billingAddressForOrder(order);
  const shippingLines = addressDisplayLines(shippingAddress);
  const shippingContactLines = addressContactLines(labels, shippingAddress);
  const billingLines = addressDisplayLines(billingAddress);
  const billingContactLines = addressContactLines(labels, billingAddress);
  const expectedDate =
    formatDate(
      order.fulfillmentPromise?.etaDate ??
        order.routingSnapshot?.etaDate ??
        order.dueAt,
      locale
    ) ?? emptyRetailField;
  const placedAt = formatDateTime(order.placedAt, locale) ?? emptyRetailField;
  const generatedAt =
    formatDateTime(new Date().toISOString(), locale) ?? new Date().toISOString();
  const orderTotal =
    formatPrice(locale, order.currency, customerOrderRetailValue(order)) ??
    emptyRetailField;
  const deliverySection = addressBlockHtml(
    labels.stock.deliveryAddress,
    shippingLines,
    shippingContactLines,
    emptyRetailField
  );
  const billingSection = addressBlockHtml(
    labels.stock.billingAddress,
    billingLines,
    billingContactLines,
    order.deliveryDetails?.billingSameAsShipping
      ? labels.stock.billingSameAsDelivery
      : emptyRetailField
  );
  const summarySection = `
    <section class="panel">
      <h2>${escapeHtml(labels.stock.customerOrderDetails)}</h2>
      <dl>
        <dt>${escapeHtml(labels.stock.customerOrders)}</dt>
        <dd>${escapeHtml(order.orderNumber)}</dd>
        <dt>${escapeHtml(labels.stock.organisation)}</dt>
        <dd>${escapeHtml(order.organisationName)}</dd>
        <dt>${escapeHtml(labels.stock.status)}</dt>
        <dd>${escapeHtml(readableToken(order.status))}</dd>
        <dt>${escapeHtml(labels.stock.expectedAt)}</dt>
        <dd>${escapeHtml(expectedDate)}</dd>
        <dt>${escapeHtml(labels.stock.placedAt)}</dt>
        <dd>${escapeHtml(placedAt)}</dd>
        <dt>${escapeHtml(labels.stock.retailValue)}</dt>
        <dd>${escapeHtml(orderTotal)}</dd>
      </dl>
    </section>
  `;

  const itemTableHtml = (showPrices: boolean) => {
    const priceHeadings = showPrices
      ? `<th>${escapeHtml(labels.stock.retailPrice)}</th><th>${escapeHtml(labels.stock.lineTotal)}</th>`
      : "";
    const itemRows = lines
      .map((line) => {
        const identifiers = orderLineIdentifierParts(line);
        const unitPrice =
          line.retailPriceAmount === null
            ? emptyRetailField
            : (formatPrice(locale, order.currency, line.retailPriceAmount) ??
              emptyRetailField);
        const lineTotal =
          line.retailPriceAmount === null
            ? emptyRetailField
            : (formatPrice(
                locale,
                order.currency,
                line.retailPriceAmount * line.quantityOrdered
              ) ?? emptyRetailField);

        return `
          <tr>
            <td>
              <div class="product-title">${escapeHtml(line.productTitle)}</div>
              ${
                identifiers.length
                  ? `<div class="identifiers">${identifiers.map(escapeHtml).join(" · ")}</div>`
                  : ""
              }
            </td>
            <td>${escapeHtml(line.quantityOrdered)}</td>
            ${showPrices ? `<td>${escapeHtml(unitPrice)}</td><td>${escapeHtml(lineTotal)}</td>` : ""}
          </tr>
        `;
      })
      .join("");

    return `
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(labels.stock.product)}</th>
            <th>${escapeHtml(labels.stock.quantity)}</th>
            ${priceHeadings}
          </tr>
        </thead>
        <tbody>
          ${itemRows || `<tr><td colspan="${showPrices ? 4 : 2}">${escapeHtml(labels.stock.noItemsSelected)}</td></tr>`}
        </tbody>
      </table>
    `;
  };

  const shippingLabelSheetHtml = () => {
    const carrierName = order.shipment?.carrierName ?? "";
    const isKexCarrier = /(?:\bkex\b|kerry)/i.test(carrierName);

    return `
    <main class="label ${isKexCarrier ? "label-kex" : ""}">
      <div class="muted">${escapeHtml(labels.stock.shippingLabel)}</div>
      <h1>${escapeHtml(labels.stock.deliveryAddress)}</h1>
      <div class="label-address">
        ${[...shippingLines, ...shippingContactLines]
          .map((line) => `<div>${escapeHtml(line)}</div>`)
          .join("") || `<div>${escapeHtml(emptyRetailField)}</div>`}
      </div>
      <div class="label-footer">
        <div><strong>${escapeHtml(labels.stock.customerOrders)}:</strong> ${escapeHtml(order.orderNumber)}</div>
        <div><strong>${escapeHtml(labels.stock.organisation)}:</strong> ${escapeHtml(order.organisationName)}</div>
        ${
          carrierName
            ? `<div><strong>Carrier:</strong> ${escapeHtml(carrierName)}</div>`
            : ""
        }
        ${
          order.shipment?.trackingNumber
            ? `<div><strong>Tracking:</strong> ${escapeHtml(order.shipment.trackingNumber)}</div>`
            : ""
        }
        <div><strong>${escapeHtml(labels.stock.expectedAt)}:</strong> ${escapeHtml(expectedDate)}</div>
      </div>
      ${
        isKexCarrier
          ? `<section class="kex-note">
              <strong>KEX QR/AWB:</strong> print the official KEX label or scan the KEX QR from the carrier system before handover. This sheet is not a carrier-issued AWB.
            </section>`
          : ""
      }
    </main>
    `;
  };

  const standardSheetHtml = (
    sheetTitle: string,
    showPrices: boolean,
    showBilling: boolean
  ) => `
    <main class="sheet">
      <header>
        <div>
          <div class="eyebrow">${escapeHtml(sheetTitle)}</div>
          <h1>${escapeHtml(order.orderNumber)}</h1>
        </div>
        <div class="generated">${escapeHtml(generatedAt)}</div>
      </header>
      <div class="grid">
        ${summarySection}
        ${deliverySection}
        ${showBilling ? billingSection : ""}
      </div>
      <section class="panel">
        <h2>${escapeHtml(labels.stock.orderItems)}</h2>
        ${itemTableHtml(showPrices)}
      </section>
      ${
        showPrices
          ? `<section class="totals"><span>${escapeHtml(labels.stock.total)}</span><strong>${escapeHtml(orderTotal)}</strong></section>`
          : ""
      }
    </main>
  `;
  const standardBody =
    kind === "order-pack"
      ? [
          standardSheetHtml(labels.stock.printOrder, true, true),
          standardSheetHtml(labels.stock.packingSheet, false, false),
          shippingLabelSheetHtml(),
          standardSheetHtml(labels.stock.invoice, true, true)
        ].join("")
      : kind === "shipping-label"
        ? shippingLabelSheetHtml()
        : standardSheetHtml(
            documentTitle,
            includePrices,
            kind === "invoice" || kind === "order"
          );
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(documentTitle)} ${escapeHtml(order.orderNumber)}</title>
        <style>
          @page { margin: 18mm; }
          * { box-sizing: border-box; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; }
          main { padding: 24px; }
          header { align-items: flex-start; border-bottom: 1px solid #d1d5db; display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; }
          h1 { font-size: 28px; margin: 4px 0 0; }
          h2 { font-size: 14px; margin: 0 0 10px; text-transform: uppercase; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 9px 8px; text-align: left; vertical-align: top; }
          th { color: #4b5563; font-size: 11px; text-transform: uppercase; }
          dl { display: grid; grid-template-columns: 150px 1fr; margin: 0; row-gap: 6px; }
          dt { color: #6b7280; font-weight: 700; }
          dd { margin: 0; }
          .address { line-height: 1.45; }
          .identifiers { color: #6b7280; font-size: 11px; margin-top: 4px; }
          .product-title { font-weight: 700; }
          .eyebrow, .generated, .muted { color: #6b7280; font-size: 12px; }
          .grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 12px; }
          .panel { border: 1px solid #d1d5db; border-radius: 8px; margin-bottom: 12px; padding: 14px; }
          .sheet + .sheet, .sheet + .label, .label + .sheet { border-top: 1px dashed #d1d5db; }
          .totals { align-items: center; display: flex; font-size: 18px; gap: 16px; justify-content: flex-end; margin-top: 16px; }
          .label { min-height: 70vh; padding: 32px; position: relative; }
          .label h1 { border-bottom: 2px solid #111827; font-size: 22px; padding-bottom: 10px; }
          .label-address { font-size: 28px; font-weight: 700; line-height: 1.35; margin-top: 28px; }
          .label-footer { border-top: 1px solid #d1d5db; bottom: 32px; display: grid; gap: 8px; left: 32px; position: absolute; right: 32px; padding-top: 16px; }
          .kex-note { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 10px; color: #92400e; font-size: 14px; line-height: 1.45; margin-top: 28px; padding: 12px; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            main { padding: 0; }
            .panel { break-inside: avoid; }
            .sheet, .label { break-after: page; page-break-after: always; }
            .sheet:last-child, .label:last-child { break-after: auto; page-break-after: auto; }
            .sheet + .sheet, .sheet + .label, .label + .sheet { border-top: 0; }
          }
        </style>
      </head>
      <body>${standardBody}</body>
    </html>
  `;
  const popup = window.open(
    "",
    "_blank",
    "width=900,height=1200"
  );

  if (!popup) {
    window.print();
    return;
  }

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => {
    popup.print();
  }, 150);
}

function panelFromView(view: AdminDashboardView): RetailStockPanel {
  if (view === "retail-audit") {
    return "audit";
  }

  if (view === "retail-movements") {
    return "movements";
  }

  if (view === "retail-customer-orders") {
    return "customer-orders";
  }

  if (view === "retail-fulfillment") {
    return "fulfillment";
  }

  if (view === "retail-stock-advice" || view === "retail-reorder") {
    return "stock-advice";
  }

  return "list";
}

function searchMatches(query: string, fields: Array<string | null | undefined>) {
  const needle = query.trim().toLocaleLowerCase();

  if (!needle) {
    return true;
  }

  return fields
    .filter(Boolean)
    .some((field) => String(field).toLocaleLowerCase().includes(needle));
}

async function saveStock(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/retail-stock", {
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
  const json = (await response.json().catch(() => ({}))) as StockResponse;

  if (!response.ok) {
    throw new Error(json.error);
  }

  return json;
}

async function saveStockAction(body: Record<string, unknown>) {
  return saveStock(body);
}

function actionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function shoppingListIdFromResult(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return "";
  }

  const shoppingListId = (result as Record<string, unknown>).shoppingListId;

  return typeof shoppingListId === "string" ? shoppingListId : "";
}

function ProductThumbnail({
  imageUrl,
  title
}: Readonly<{
  imageUrl: string | null;
  title: string;
}>) {
  const fallback = title.trim().slice(0, 2) || "MN";

  return (
    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 ring-1 ring-gray-200">
      {imageUrl ? (
        <img
          alt=""
          className="size-full object-cover"
          loading="lazy"
          src={imageUrl}
        />
      ) : (
        <span className="px-1 text-center text-xs font-semibold text-gray-500">
          {fallback}
        </span>
      )}
    </div>
  );
}

function StockNumberInput({
  disabled,
  label,
  max,
  min = 0,
  onChange,
  step = "1",
  value
}: Readonly<{
  disabled: boolean;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: string) => void;
  step?: string;
  value: string;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-gray-500">
      {label}
      <input
        className="w-full rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

export function AdminRetailStockView({
  accessToken,
  data: initialData,
  filters,
  labels,
  locale,
  range,
  selectedRetailCustomerOrderId,
  view
}: Readonly<{
  accessToken: string;
  data: AdminRetailStockData;
  filters: AdminDashboardFilters;
  labels: AdminContent;
  locale: Locale;
  range: AdminDashboardRange;
  selectedRetailCustomerOrderId?: string | null;
  view: AdminDashboardView;
}>) {
  const [data, setData] = useState(initialData);
  const selectedOrganisationId = "all";
  const [stockSearch, setStockSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedStockFilter, setSelectedStockFilter] =
    useState<RetailStockFilter>("all");
  const [selectedCustomerOrderFilter, setSelectedCustomerOrderFilter] =
    useState<CustomerOrderFilter>("all");
  const [
    selectedOutstandingPurchaseKeys,
    setSelectedOutstandingPurchaseKeys
  ] = useState<string[] | null>(null);
  const [editor, setEditor] = useState<StockEditor | null>(null);
  const [movementEditor, setMovementEditor] = useState<MovementEditor | null>(null);
  const [movementPickerOpen, setMovementPickerOpen] = useState(false);
  const [shoppingListDraftLines, setShoppingListDraftLines] = useState<
    ShoppingListLineDraft[]
  >([]);
  const [selectedShoppingListId, setSelectedShoppingListId] = useState("");
  const [customerOrderDraft, setCustomerOrderDraft] =
    useState<CustomerOrderDraft | null>(null);
  const [shipmentEditor, setShipmentEditor] = useState<ShipmentEditor | null>(null);
  const [kexSettingsDraft, setKexSettingsDraft] =
    useState<KexSettingsDraft>(emptyKexSettingsDraft);
  const [customerOrderAvailability, setCustomerOrderAvailability] =
    useState<RegionalBasketAvailability | null>(null);
  const [customerOrderAvailabilityLoading, setCustomerOrderAvailabilityLoading] =
    useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const panel = panelFromView(view);
  const showOrganisationContext = data.canFilterOrganisation;
  const carrierSettingsOrganisation =
    data.organisations.length === 1 ? data.organisations[0] : null;
  const kexCarrierAccount =
    carrierSettingsOrganisation
      ? data.carrierAccounts.find(
          (account) =>
            account.organisationId === carrierSettingsOrganisation.id &&
            account.carrierId === "kex_th"
        ) ?? null
      : null;

  const organisationStockRows = useMemo(
    () =>
      data.rows.filter((row) =>
        selectedOrganisationId === "all"
          ? true
          : row.organisationId === selectedOrganisationId
      ),
    [data.rows, selectedOrganisationId]
  );
  const stockRowByOrgProduct = useMemo(
    () =>
      new Map(
        data.rows.map((row) => [
          orgProductKey(row.organisationId, row.productId),
          row
        ])
      ),
    [data.rows]
  );
  const adviceRows = useMemo(
    () =>
      data.reorderAdvice.filter((advice) =>
        selectedOrganisationId === "all"
          ? true
          : advice.organisationId === selectedOrganisationId
      ),
    [data.reorderAdvice, selectedOrganisationId]
  );
  const adviceByStockId = useMemo(
    () => new Map(adviceRows.map((advice) => [advice.stockId, advice])),
    [adviceRows]
  );
  const rows = useMemo(
    () =>
      organisationStockRows
        .filter((row) => {
          if (selectedStockFilter !== "all") {
            return (
              stockAvailabilityStatus(row, adviceByStockId.get(row.id)) ===
              selectedStockFilter
            );
          }

          return true;
        })
        .filter((row) =>
          searchMatches(stockSearch, [
            row.productTitle,
            row.brandName,
            row.productKind,
            row.organisationName,
            row.currency,
            statusLabel(labels, row.status)
          ])
        ),
    [adviceByStockId, labels, organisationStockRows, selectedStockFilter, stockSearch]
  );

  const defaultOrganisationId =
    selectedOrganisationId === "all"
      ? data.organisations[0]?.id ?? ""
      : selectedOrganisationId;
  const hygeiaOrganisationId =
    selectedOrganisationId !== "all"
      ? selectedOrganisationId
      : data.organisations.length === 1
        ? data.organisations[0]?.id ?? ""
        : "";
  const hygeiaExportHref = hygeiaOrganisationId
    ? `/api/admin/products/hygeia/export?scope=retail&organisationId=${encodeURIComponent(
        hygeiaOrganisationId
      )}&access_token=${encodeURIComponent(accessToken)}`
    : "";
  const stockPriceCurrency =
    selectedOrganisationId === "all"
      ? Array.from(new Set(rows.map((row) => row.currency))).length === 1
        ? rows[0]?.currency ?? null
        : null
      : data.organisations.find(
          (organisation) => organisation.id === selectedOrganisationId
        )?.currency ?? null;
  const wholesaleHeader = stockPriceCurrency
    ? `${labels.stock.wholesalePrice} (${stockPriceCurrency})`
    : labels.stock.wholesalePrice;
  const retailHeader = stockPriceCurrency
    ? `${labels.stock.retailPrice} (${stockPriceCurrency})`
    : labels.stock.retailPrice;
  const movementRows = useMemo(
    () =>
      data.movements.filter((movement) =>
        selectedOrganisationId === "all"
          ? true
          : movement.organisationId === selectedOrganisationId
      ),
    [data.movements, selectedOrganisationId]
  );

  const customerOrderLinesByOrderId = useMemo(() => {
    const linesByOrderId = new Map<
      string,
      AdminRetailStockData["customerOrderLines"]
    >();

    for (const line of data.customerOrderLines) {
      const lines = linesByOrderId.get(line.customerOrderId) ?? [];

      lines.push(line);
      linesByOrderId.set(line.customerOrderId, lines);
    }

    return linesByOrderId;
  }, [data.customerOrderLines]);

  const organisationCustomerOrders = useMemo(
    () =>
      data.customerOrders.filter((order) =>
        selectedOrganisationId === "all"
          ? true
          : order.organisationId === selectedOrganisationId
      ),
    [data.customerOrders, selectedOrganisationId]
  );

  const customerOrderRows = useMemo(
    () =>
      organisationCustomerOrders
        .filter((order) =>
          customerOrderMatchesFilter(order, selectedCustomerOrderFilter)
        )
        .filter((order) => {
          const orderLines = customerOrderLinesByOrderId.get(order.id) ?? [];

          return searchMatches(stockSearch, [
            order.orderNumber,
            order.customerName,
            order.customerEmail,
            order.organisationName,
            order.status,
            ...orderLines.flatMap((line) => [line.productTitle, line.notes])
          ]);
        }),
    [
      customerOrderLinesByOrderId,
      organisationCustomerOrders,
      selectedCustomerOrderFilter,
      stockSearch
    ]
  );
  const customerOrderValueCurrency =
    Array.from(new Set(customerOrderRows.map((order) => order.currency)))
      .length === 1
      ? customerOrderRows[0]?.currency ?? null
      : null;
  const customerOrderRetailValueHeader = customerOrderValueCurrency
    ? `${labels.stock.retailValue} (${customerOrderValueCurrency})`
    : labels.stock.retailValue;
  const stockInsights = useMemo(() => {
    const retailValue = rows.reduce(
      (total, row) =>
        total + row.stockQuantity * (row.retailPriceAmount ?? 0),
      0
    );
    const recommendationPressure = adviceRows.reduce(
      (total, advice) => total + advice.recommendationPressureCount,
      0
    );

    return {
      activeProducts: rows.filter((row) => row.status === "active").length,
      outOfStock: rows.filter((row) => row.stockQuantity === 0).length,
      recommendationPressure,
      retailValue
    };
  }, [adviceRows, rows]);

  const stockSummary = useMemo(() => {
    const summary: Record<RetailStockAvailabilityStatus, number> = {
      in_stock: 0,
      low_stock: 0,
      out_of_stock: 0
    };

    for (const row of organisationStockRows) {
      const availabilityStatus = stockAvailabilityStatus(
        row,
        adviceByStockId.get(row.id)
      );

      if (availabilityStatus) {
        summary[availabilityStatus] += 1;
      }
    }

    return summary;
  }, [adviceByStockId, organisationStockRows]);
  const stockMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "all",
      label: labels.stock.all,
      series: [],
      value: formatNumber(organisationStockRows.length, locale)
    },
    {
      color: businessMetricColors.succeeded,
      id: "in_stock",
      label: labels.stock.inStock,
      series: [],
      value: formatNumber(stockSummary.in_stock, locale)
    },
    {
      color: businessMetricColors.medium,
      id: "low_stock",
      label: labels.stock.lowStock,
      series: [],
      value: formatNumber(stockSummary.low_stock, locale)
    },
    {
      color: businessMetricColors.failed,
      id: "out_of_stock",
      label: labels.stock.outOfStock,
      series: [],
      value: formatNumber(stockSummary.out_of_stock, locale)
    }
  ];

  const customerOrderSummary = useMemo(() => {
    const summary = Object.fromEntries(
      customerOrderStatusFilters.map((status) => [status, 0])
    ) as Record<CustomerOrderMetricKey, number>;

    for (const order of organisationCustomerOrders) {
      const metricKey = customerOrderStatusMetricKey(order);

      if (metricKey) {
        summary[metricKey] += 1;
      }
    }

    return summary;
  }, [organisationCustomerOrders]);
  const customerOrderMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "all",
      label: labels.stock.all,
      series: [],
      value: formatNumber(
        organisationCustomerOrders.filter(customerOrderIncludedInAllMetric).length,
        locale
      )
    },
    ...customerOrderStatusFilters.map((status) => ({
      color: customerOrderMetricColor(status),
      id: status,
      label: customerOrderStatusFilterLabel(status),
      series: [],
      value: formatNumber(customerOrderSummary[status], locale)
    }))
  ];


  const currentEditorOrganisation = editor
    ? data.organisations.find(
        (organisation) => organisation.id === editor.organisationId
      )
    : null;
  const editorCurrency =
    editor?.mode === "edit"
      ? editor.row.currency
      : currentEditorOrganisation?.currency ?? "THB";

  const availableProducts = useMemo(() => {
    if (!editor || editor.mode !== "add" || !editor.organisationId) {
      return [];
    }

    const existingProductIds = new Set(
      data.rows
        .filter((row) => row.organisationId === editor.organisationId)
        .map((row) => row.productId)
    );

    return data.productOptions
      .filter((product) => !existingProductIds.has(product.id))
      .filter((product) =>
        searchMatches(productSearch, [
          product.title,
          product.brandName,
          product.productKind
        ])
      )
      .slice(0, 60);
  }, [data.productOptions, data.rows, editor, productSearch]);

  const searchedProductOptions = useMemo(
    () =>
      data.productOptions
        .filter((product) =>
          searchMatches(productSearch, [
            product.title,
            product.brandName,
            product.productKind
          ])
        )
        .slice(0, 80),
    [data.productOptions, productSearch]
  );
  const productOptionById = useMemo(
    () => new Map(data.productOptions.map((product) => [product.id, product])),
    [data.productOptions]
  );
  const outstandingPurchaseItems = useMemo<ReorderPurchaseItem[]>(() => {
    const groups = new Map<string, ReorderPurchaseItem>();
    const activeListIds = new Set(
      data.shoppingLists
        .filter(
          (list) =>
            list.status === "active" &&
            (selectedOrganisationId === "all" ||
              list.organisationId === selectedOrganisationId)
        )
        .map((list) => list.id)
    );
    const assignedByOrgProduct = new Map<string, number>();
    const returnedDemandByOrgProduct = new Map<string, number>();

    for (const line of data.shoppingListLines) {
      if (!activeListIds.has(line.shoppingListId)) {
        continue;
      }

      const key = orgProductKey(line.organisationId, line.productId);
      const coveredByActiveListUnits = activeShoppingListCoverageUnits(line);
      const returnedDemandUnits = activeShoppingListReturnedDemandUnits(line);

      assignedByOrgProduct.set(
        key,
        (assignedByOrgProduct.get(key) ?? 0) + coveredByActiveListUnits
      );
      returnedDemandByOrgProduct.set(
        key,
        (returnedDemandByOrgProduct.get(key) ?? 0) + returnedDemandUnits
      );
    }

    for (const pipeline of data.pipeline) {
      if (
        !pipeline.productId ||
        pipeline.unorderedNeedUnits <= 0 ||
        (selectedOrganisationId !== "all" &&
          pipeline.organisationId !== selectedOrganisationId)
      ) {
        continue;
      }

      const key = orgProductKey(pipeline.organisationId, pipeline.productId);
      const row = stockRowByOrgProduct.get(key);
      const product = productOptionById.get(pipeline.productId);
      const current =
        groups.get(key) ??
        {
          assignedActiveUnits: assignedByOrgProduct.get(key) ?? 0,
          amountToBuyUnits: 0,
          brandName: product?.brandName ?? null,
          currentStockQuantity: row?.stockQuantity ?? 0,
          organisationId: pipeline.organisationId,
          productId: pipeline.productId,
          productTitle: pipeline.productTitle ?? product?.title ?? pipeline.productId,
          recommendationPressureCount: 0,
          riskLevel: null,
          source: "backorder" as const,
          unassignedDemandUnits: 0,
          unorderedNeedUnits: 0,
          wholesalePriceAmount: row?.wholesalePriceAmount ?? null
        };
      const unorderedNeedUnits = Math.max(
        current.unorderedNeedUnits + pipeline.unorderedNeedUnits,
        returnedDemandByOrgProduct.get(key) ?? 0
      );
      const unassignedDemandUnits = Math.max(
        0,
        unorderedNeedUnits - current.assignedActiveUnits
      );

      groups.set(key, {
        ...current,
        amountToBuyUnits: unassignedDemandUnits,
        unassignedDemandUnits,
        unorderedNeedUnits
      });
    }

    return [...groups.values()]
      .filter((item) => item.unassignedDemandUnits > 0)
      .sort(
        (left, right) =>
          right.unassignedDemandUnits - left.unassignedDemandUnits ||
          right.unorderedNeedUnits - left.unorderedNeedUnits
      );
  }, [
    data.pipeline,
    data.shoppingListLines,
    data.shoppingLists,
    productOptionById,
    selectedOrganisationId,
    stockRowByOrgProduct
  ]);
  const reorderPurchaseItems = useMemo(
    () =>
      outstandingPurchaseItems.filter((item) => item.unassignedDemandUnits > 0),
    [outstandingPurchaseItems]
  );
  const reorderPurchaseItemKeys = useMemo(
    () =>
      new Set(
        reorderPurchaseItems.map((item) =>
          orgProductKey(item.organisationId, item.productId)
        )
      ),
    [reorderPurchaseItems]
  );
  const reorderRecommendationItems = useMemo<ReorderPurchaseItem[]>(
    () =>
      adviceRows
        .filter(
          (advice) =>
            advice.suggestedOrderQuantity > 0 &&
            advice.riskLevel !== "ok" &&
            !reorderPurchaseItemKeys.has(
              orgProductKey(advice.organisationId, advice.productId)
            )
        )
        .map((advice) => {
          const key = orgProductKey(advice.organisationId, advice.productId);
          const row = stockRowByOrgProduct.get(key);
          const product = productOptionById.get(advice.productId);

          return {
            assignedActiveUnits: 0,
            amountToBuyUnits: advice.suggestedOrderQuantity,
            brandName: product?.brandName ?? null,
            currentStockQuantity: row?.stockQuantity ?? advice.currentStockQuantity,
            organisationId: advice.organisationId,
            productId: advice.productId,
            productTitle: advice.productTitle,
            recommendationPressureCount: advice.recommendationPressureCount,
            riskLevel: advice.riskLevel,
            source: "recommendation" as const,
            unassignedDemandUnits: advice.suggestedOrderQuantity,
            unorderedNeedUnits: 0,
            wholesalePriceAmount: row?.wholesalePriceAmount ?? null
          };
        })
        .sort(
          (left, right) =>
            reorderRiskRank(left.riskLevel) - reorderRiskRank(right.riskLevel) ||
            right.amountToBuyUnits - left.amountToBuyUnits ||
            left.productTitle.localeCompare(right.productTitle)
        ),
    [adviceRows, productOptionById, reorderPurchaseItemKeys, stockRowByOrgProduct]
  );
  const shoppingListCandidateItems = useMemo(
    () => [...reorderPurchaseItems, ...reorderRecommendationItems],
    [reorderPurchaseItems, reorderRecommendationItems]
  );
  const defaultOutstandingPurchaseKeys = useMemo(() => {
    const targetOrganisationId =
      selectedOrganisationId === "all"
        ? shoppingListCandidateItems[0]?.organisationId
        : selectedOrganisationId;

    if (!targetOrganisationId) {
      return [];
    }

    return shoppingListCandidateItems
      .filter((item) => item.organisationId === targetOrganisationId)
      .map((item) => orgProductKey(item.organisationId, item.productId));
  }, [selectedOrganisationId, shoppingListCandidateItems]);
  const defaultOutstandingPurchaseKeySignature =
    defaultOutstandingPurchaseKeys.join("|");

  useEffect(() => {
    setSelectedOutstandingPurchaseKeys((current) => {
      if (current === null) {
        return current;
      }

      const defaultKeySet = new Set(defaultOutstandingPurchaseKeys);
      const retained = current.filter((key) => defaultKeySet.has(key));

      if (retained.length === 0 && defaultOutstandingPurchaseKeys.length > 0) {
        return null;
      }

      return retained.length === current.length ? current : retained;
    });
  }, [defaultOutstandingPurchaseKeySignature]);

  const outstandingPurchaseSelectionKeys =
    selectedOutstandingPurchaseKeys ?? defaultOutstandingPurchaseKeys;
  const selectedOutstandingPurchaseItems = useMemo(
    () =>
      shoppingListCandidateItems.filter(
        (item) =>
          outstandingPurchaseSelectionKeys.includes(
            orgProductKey(item.organisationId, item.productId)
          )
      ),
    [shoppingListCandidateItems, outstandingPurchaseSelectionKeys]
  );
  const visibleShoppingLists = useMemo(
    () =>
      data.shoppingLists.filter((list) =>
        selectedOrganisationId === "all"
          ? true
          : list.organisationId === selectedOrganisationId
      ),
    [data.shoppingLists, selectedOrganisationId]
  );
  const activeShoppingList = useMemo(
    () =>
      visibleShoppingLists.find((list) => list.id === selectedShoppingListId) ?? null,
    [selectedShoppingListId, visibleShoppingLists]
  );
  const activeShoppingListLines = useMemo(
    () =>
      activeShoppingList
        ? data.shoppingListLines.filter(
            (line) => line.shoppingListId === activeShoppingList.id
          )
        : [],
    [activeShoppingList, data.shoppingListLines]
  );
  const customerOrderProductOptions = useMemo(() => {
    const selectedProductIds = new Set(
      customerOrderDraft?.lines.map((line) => line.productId) ?? []
    );

    if (customerOrderDraft?.mode === "regional") {
      return searchedProductOptions.filter(
        (product) => !selectedProductIds.has(product.id)
      );
    }

    const organisationId = customerOrderDraft?.organisationId ?? "";
    const activeSellableProductIds = new Set(
      data.rows
        .filter(
          (row) =>
            row.organisationId === organisationId && row.status === "active"
        )
        .map((row) => row.productId)
    );

    return searchedProductOptions.filter(
      (product) =>
        !selectedProductIds.has(product.id) &&
        activeSellableProductIds.has(product.id)
    );
  }, [
    customerOrderDraft?.lines,
    customerOrderDraft?.mode,
    customerOrderDraft?.organisationId,
    data.rows,
    searchedProductOptions
  ]);
  const customerOrderDetail =
    data.customerOrders.find(
      (order) => order.id === selectedRetailCustomerOrderId
    ) ??
    null;
  const customerOrderDetailLines = customerOrderDetail
    ? customerOrderLinesByOrderId.get(customerOrderDetail.id) ?? []
    : [];
  const customerOrderCanAllocate = Boolean(
    customerOrderDetail?.actionStates.allocateAvailable.enabled
  );

  useEffect(() => {
    const nextLines = activeShoppingListLines.map((line) => ({
        actualQuantity: String(line.actualQuantity),
        assignedQuantity: String(line.assignedQuantity),
        brandName: line.brandName,
        currentStockQuantity: String(line.currentStockQuantity),
        ean13: line.ean13,
        id: line.id,
        manufacturerSku: line.manufacturerSku,
        productId: line.productId,
        productTitle: line.productTitle,
        requiredQuantity: String(line.requiredQuantity),
        retailPriceAmount:
          line.retailPriceAmount === null ? "" : String(line.retailPriceAmount),
        stockedQuantity: String(line.stockedQuantity),
        unorderedNeedQuantity: String(line.unorderedNeedQuantity),
        wholesalePriceAmount:
          line.wholesalePriceAmount === null
            ? ""
            : String(line.wholesalePriceAmount)
      }));

    queueMicrotask(() => setShoppingListDraftLines(nextLines));
  }, [activeShoppingList?.id, activeShoppingListLines]);

  useEffect(() => {
    const draft = customerOrderDraft;

    if (
      !draft ||
      draft.mode !== "regional" ||
      !draft.shippingCountry ||
      draft.lines.length === 0
    ) {
      queueMicrotask(() => {
        setCustomerOrderAvailability(null);
        setCustomerOrderAvailabilityLoading(false);
      });
      return;
    }

    const lines = draft.lines
      .map((line) => ({
        productId: line.productId,
        quantity: numberOrNull(line.quantityOrdered) ?? 0
      }))
      .filter((line) => line.productId && line.quantity > 0);

    if (lines.length === 0) {
      queueMicrotask(() => {
        setCustomerOrderAvailability(null);
        setCustomerOrderAvailabilityLoading(false);
      });
      return;
    }

    const controller = new AbortController();

    queueMicrotask(() => setCustomerOrderAvailabilityLoading(true));
    fetch("/api/retail/basket/availability", {
      body: JSON.stringify({
        lines,
        routingPreference: draft.routingPreference,
        shippingCountry: draft.shippingCountry
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST",
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          availability?: RegionalBasketAvailability;
        };

        if (!response.ok || !payload.availability) {
          throw new Error("Availability preview failed");
        }

        setCustomerOrderAvailability(payload.availability);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          setCustomerOrderAvailability(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCustomerOrderAvailabilityLoading(false);
        }
      });

    return () => controller.abort();
  }, [customerOrderDraft]);

  function openRowEditor(row: AdminRetailStockRow) {
    setError("");
    setEditor({
      draft: draftFromRow(row),
      mode: "edit",
      organisationId: row.organisationId,
      row
    });
  }

  function openAddStockEditor() {
    if (!defaultOrganisationId) {
      return;
    }

    setError("");
    setProductSearch("");
    setEditor({
      draft: emptyStockDraft,
      mode: "add",
      organisationId: defaultOrganisationId,
      product: null
    });
  }

  async function refreshRetailStockData() {
    const params = new URLSearchParams({ locale });
    const response = await fetch(`/api/admin/retail-stock?${params.toString()}`, {
      credentials: "same-origin",
      headers: {
        "cache-control": "no-store"
      }
    });
    const result = (await response.json().catch(() => ({}))) as StockResponse;

    if (!response.ok) {
      throw new Error(result.error);
    }

    if (result.data) {
      setData(result.data);
    }
  }

  async function importRetailHygeiaFile(file: File | null) {
    if (!file || !hygeiaOrganisationId) {
      return;
    }

    setBusyId("hygeia-import");
    setError("");

    try {
      const csvText = await file.text();
      const response = await fetch("/api/admin/products/hygeia/import", {
        body: JSON.stringify({
          accessToken,
          apply: true,
          csvText,
          importType: "stock",
          organisationId: hygeiaOrganisationId
        }),
        credentials: "same-origin",
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.message);
      }

      await refreshRetailStockData();
    } catch (error) {
      setError(actionErrorMessage(error, labels.stock.hygeiaImportError));
    } finally {
      setBusyId("");
    }
  }


  function toggleOutstandingPurchaseItem(item: {
    amountToBuyUnits: number;
    organisationId: string;
    productId: string;
  }) {
    if (item.amountToBuyUnits < 1) {
      return;
    }

    const key = orgProductKey(item.organisationId, item.productId);

    setSelectedOutstandingPurchaseKeys((current) =>
      (current ?? defaultOutstandingPurchaseKeys).includes(key)
        ? (current ?? defaultOutstandingPurchaseKeys).filter(
            (selectedKey) => selectedKey !== key
          )
        : [
            ...(current ?? defaultOutstandingPurchaseKeys).filter((selectedKey) =>
              selectedKey.startsWith(`${item.organisationId}:`)
            ),
            key
          ]
    );
  }


  async function createShoppingListFromSelection() {
    const organisationId = selectedOutstandingPurchaseItems[0]?.organisationId;

    if (!organisationId) {
      return;
    }

    const created = await runRetailAction(
      {
        action: "create_shopping_list",
        lines: selectedOutstandingPurchaseItems.map((item) => {
          const row = stockRowByOrgProduct.get(
            orgProductKey(item.organisationId, item.productId)
          );
          const assignedQuantity = Math.max(1, Math.ceil(item.amountToBuyUnits));
          const requiredQuantity =
            item.source === "backorder"
              ? item.unorderedNeedUnits
              : item.amountToBuyUnits;
          const unorderedNeedQuantity =
            item.source === "backorder" ? item.unorderedNeedUnits : 0;

          return {
            currentStockQuantity: row?.stockQuantity ?? 0,
            actualQuantity: assignedQuantity,
            assignedQuantity,
            productId: item.productId,
            requiredQuantity,
            retailPriceAmount: null,
            unorderedNeedQuantity,
            wholesalePriceAmount: item.wholesalePriceAmount
          };
        }),
        organisationId
      },
      `shopping-list:${organisationId}`
    );

    if (created) {
      const createdShoppingListId = shoppingListIdFromResult(created.result);

      setSelectedOutstandingPurchaseKeys(null);

      if (createdShoppingListId) {
        setSelectedShoppingListId(createdShoppingListId);
      }
    }
  }

  async function saveShoppingListDraft() {
    if (!activeShoppingList) {
      return;
    }

    const saved = await runRetailAction(
      {
        action: "update_shopping_list",
        lines: shoppingListDraftLines.map((line) => ({
          actualQuantity: numberOrNull(line.actualQuantity),
          assignedQuantity: numberOrNull(line.assignedQuantity),
          currentStockQuantity: numberOrNull(line.currentStockQuantity),
          id: line.id,
          productId: line.productId,
          requiredQuantity: numberOrNull(line.requiredQuantity),
          retailPriceAmount: numberOrNull(line.retailPriceAmount),
          unorderedNeedQuantity: numberOrNull(line.unorderedNeedQuantity),
          wholesalePriceAmount: numberOrNull(line.wholesalePriceAmount)
        })),
        responseMode: "minimal",
        shoppingListId: activeShoppingList.id,
        status: "closed"
      },
      `shopping-list:${activeShoppingList.id}`
    );

    if (saved) {
      setSelectedShoppingListId("");
      void refreshRetailStockData().catch((error) => {
        setError(actionErrorMessage(error, labels.stock.saveError));
      });
    }
  }

  async function reopenShoppingList() {
    if (!activeShoppingList) {
      return;
    }

    const reopened = await runRetailAction(
      {
        action: "reopen_shopping_list",
        shoppingListId: activeShoppingList.id
      },
      `shopping-list:${activeShoppingList.id}:reopen`,
      { closeWorkflows: false }
    );

    if (reopened) {
      setSelectedShoppingListId(activeShoppingList.id);
    }
  }

  function updateEditorDraft(patch: Partial<StockDraft>) {
    setEditor((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              ...patch
            }
          }
        : current
    );
  }

  function updateEditorOrganisation(organisationId: string) {
    setEditor((current) =>
      current?.mode === "add"
        ? {
            ...current,
            organisationId,
            product: null
          }
        : current
    );
  }

  function updateEditorProduct(product: AdminRetailStockProductOption) {
    setEditor((current) =>
      current?.mode === "add"
        ? {
            ...current,
            product
          }
        : current
    );
  }

  function openMovementEditor(row: AdminRetailStockRow) {
    setError("");
    setMovementEditor({
      draft: {
        ...emptyMovementDraft,
        unitCostAmount:
          row.wholesalePriceAmount === null
            ? ""
            : String(row.wholesalePriceAmount)
      },
      mode: "record",
      row
    });
  }

  function openVoidMovementEditor(movement: AdminRetailStockMovement) {
    setError("");
    setMovementEditor({
      draft: {
        notes: "",
        reason: ""
      },
      mode: "void",
      movement
    });
  }

  function updateMovementDraft(patch: Partial<MovementDraft>) {
    setMovementEditor((current) =>
      current?.mode === "record"
        ? {
            ...current,
            draft: {
              ...current.draft,
              ...patch
            }
          }
        : current
    );
  }

  function updateVoidDraft(
    patch: Partial<Pick<MovementDraft, "notes" | "reason">>
  ) {
    setMovementEditor((current) =>
      current?.mode === "void"
        ? {
            ...current,
            draft: {
              ...current.draft,
              ...patch
            }
          }
        : current
    );
  }

  async function saveEditor() {
    if (!editor) {
      return;
    }

    const productId =
      editor.mode === "edit" ? editor.row.productId : editor.product?.id ?? "";

    if (!productId) {
      return;
    }

    const draft = editor.draft;
    const nextBusyId = editor.mode === "edit" ? editor.row.id : "new";

    setBusyId(nextBusyId);
    setError("");

    try {
      const result = await saveStock({
        action: "upsert_stock_item",
        backorderPolicy: draft.backorderPolicy,
        leadTimeDays: numberOrNull(draft.leadTimeDays),
        locale,
        notes: draft.notes,
        organisationId: editor.organisationId,
        productId,
        retailPriceAmount: numberOrNull(draft.retailPriceAmount),
        status: draft.status,
        stockQuantity: numberOrNull(draft.stockQuantity),
        wholesalePriceAmount: numberOrNull(draft.wholesalePriceAmount)
      });

      if (result.data) {
        setData(result.data);
      }

      setEditor(null);
      setProductSearch("");
    } catch (error) {
      setError(actionErrorMessage(error, labels.stock.saveError));
    } finally {
      setBusyId("");
    }
  }

  async function saveMovementEditor() {
    if (!movementEditor) {
      return;
    }

    const nextBusyId =
      movementEditor.mode === "record"
        ? `movement:${movementEditor.row.id}`
        : `void:${movementEditor.movement.id}`;

    setBusyId(nextBusyId);
    setError("");

    try {
      const result = movementEditor.mode === "record"
        ? await saveStockAction({
            action: "record_stock_movement",
            expiresAt: movementEditor.draft.expiresAt || null,
            locale,
            movementType: movementEditor.draft.movementType,
            notes: movementEditor.draft.notes,
            quantity: numberOrNull(movementEditor.draft.quantity),
            reason: movementEditor.draft.reason,
            stockId: movementEditor.row.id,
            unitCostAmount: numberOrNull(movementEditor.draft.unitCostAmount)
          })
        : await saveStockAction({
            action: "void_stock_movement",
            locale,
            movementId: movementEditor.movement.id,
            notes: movementEditor.draft.notes,
            reason: movementEditor.draft.reason
          });

      if (result.data) {
        setData(result.data);
      }

      setMovementEditor(null);
    } catch (error) {
      setError(actionErrorMessage(error, labels.stock.saveError));
    } finally {
      setBusyId("");
    }
  }

  async function runRetailAction(
    body: Record<string, unknown>,
    busyKey: string,
    options: Readonly<{
      closeWorkflows?: boolean;
      errorFallback?: string;
    }> = {}
  ) {
    setBusyId(busyKey);
    setError("");

    try {
      const result = await saveStockAction({
        ...body,
        locale
      });

      if (result.data) {
        setData(result.data);
      }

      if (options.closeWorkflows ?? true) {
        setCustomerOrderDraft(null);
      }

      return result;
    } catch (error) {
      setError(
        actionErrorMessage(error, options.errorFallback ?? labels.stock.saveError)
      );
      return null;
    } finally {
      setBusyId("");
    }
  }

  function updateCustomerOrderDraft(patch: Partial<CustomerOrderDraft>) {
    setCustomerOrderDraft((current) =>
      current
        ? {
            ...current,
            ...patch
          }
        : current
    );
  }

  function updateCustomerOrderOrganisation(organisationId: string) {
    const organisation = data.organisations.find(
      (item) => item.id === organisationId
    );

    setCustomerOrderDraft((current) =>
      current
        ? {
            ...current,
            organisationId,
            lines: [],
            shippingCountry:
              current.mode === "direct"
                ? organisation?.countryCode ?? current.shippingCountry
                : current.shippingCountry
          }
        : current
    );
  }

  function updateCustomerOrderMode(mode: CustomerOrderMode) {
    setCustomerOrderDraft((current) =>
      current
        ? {
            ...current,
            lines: [],
            mode
          }
        : current
    );
    setCustomerOrderAvailability(null);
  }

  function addCustomerOrderLine(product: AdminRetailStockProductOption) {
    setCustomerOrderDraft((current) => {
      if (!current || current.lines.some((line) => line.productId === product.id)) {
        return current;
      }

      return {
        ...current,
        lines: [
          ...current.lines,
          {
            id: `${product.id}:${Date.now()}`,
            notes: "",
            productId: product.id,
            quantityOrdered: "1"
          }
        ]
      };
    });
  }

  function updateCustomerOrderLine(
    id: string,
    patch: Partial<CustomerOrderLineDraft>
  ) {
    setCustomerOrderDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line) =>
              line.id === id
                ? {
                    ...line,
                    ...patch
                  }
                : line
            )
          }
        : current
    );
  }

  function removeCustomerOrderLine(id: string) {
    setCustomerOrderDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.filter((line) => line.id !== id)
          }
        : current
    );
  }




  async function saveCustomerOrder() {
    if (!customerOrderDraft) {
      return;
    }

    const selectedRetailerOrganisationId =
      customerOrderDraft.mode === "regional"
        ? customerOrderAvailability?.selectedRetailer?.organisationId ?? null
        : customerOrderDraft.organisationId || defaultOrganisationId;

    await runRetailAction(
      {
        action: "create_customer_order",
        customerEmail: customerOrderDraft.customerEmail,
        customerName: customerOrderDraft.customerName,
        dueAt: customerOrderDraft.dueAt || null,
        lines: customerOrderDraft.lines.map((line) => ({
          notes: line.notes || null,
          productId: line.productId,
          quantityOrdered: numberOrNull(line.quantityOrdered)
        })),
        notes: customerOrderDraft.notes,
        organisationId: selectedRetailerOrganisationId,
        routingPreference: customerOrderDraft.routingPreference,
        selectedRetailerOrganisationId,
        shippingCountry:
          customerOrderDraft.mode === "regional"
            ? customerOrderDraft.shippingCountry
            : null,
        source: customerOrderDraft.mode === "regional" ? "checkout" : "manual"
      },
      "customer-order:new",
      { errorFallback: labels.stock.customerOrderSaveError }
    );
  }

  async function runCustomerOrderAction(
    order: AdminRetailCustomerOrder,
    action:
      | "allocate"
      | "cancel"
      | "mark_delivered"
      | "mark_packed"
      | "mark_picking"
      | "mark_shipped"
      | "recheck"
      | "return"
  ) {
    if (action === "allocate") {
      await runRetailAction(
        {
          action: "allocate_customer_order",
          customerOrderId: order.id
        },
        `order:${order.id}:allocate`,
        { closeWorkflows: false }
      );
      return;
    }

    if (action === "recheck") {
      await runRetailAction(
        {
          action: "reconcile_customer_order_lifecycle",
          customerOrderId: order.id
        },
        `order:${order.id}:recheck`,
        { closeWorkflows: false }
      );
      return;
    }

    await runRetailAction(
      {
        action: "advance_customer_order",
        customerOrderId: order.id,
        orderAction: action
      },
      `order:${order.id}:${action}`,
      { closeWorkflows: false }
    );
  }

  function openShipmentEditor(order: AdminRetailCustomerOrder) {
    const existingCarrierName = order.shipment?.carrierName ?? "";

    setShipmentEditor({
      draft: {
        carrierName: shipmentCarrierOptions.some(
          (carrier) => carrier === existingCarrierName
        )
          ? existingCarrierName
          : kexCarrierName,
        confirmedPacked: false,
        shipmentNotes: order.shipment?.shipmentNotes ?? "",
        trackingNumber: order.shipment?.trackingNumber ?? "",
        trackingUrl: order.shipment?.trackingUrl ?? ""
      },
      order
    });
  }

  function updateShipmentDraft(patch: Partial<ShipmentDraft>) {
    setShipmentEditor((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              ...patch
            }
          }
        : current
    );
  }

  async function shipCustomerOrder() {
    if (!shipmentEditor) {
      return;
    }

    if (!shipmentEditor.draft.confirmedPacked) {
      setError("Confirm the products are packed before shipping.");
      return;
    }

    const saved = await runRetailAction(
      {
        action: "advance_customer_order",
        carrierName: shipmentEditor.draft.carrierName || null,
        customerOrderId: shipmentEditor.order.id,
        orderAction: "mark_shipped",
        shipmentNotes: shipmentEditor.draft.shipmentNotes || null,
        trackingNumber: shipmentEditor.draft.trackingNumber || null,
        trackingUrl: shipmentEditor.draft.trackingUrl || null
      },
      `order:${shipmentEditor.order.id}:mark_shipped`,
      { closeWorkflows: false }
    );

    if (saved) {
      setShipmentEditor(null);
    }
  }

  async function bookPickupForCustomerOrder() {
    if (!shipmentEditor) {
      return;
    }

    if (!shipmentEditor.draft.confirmedPacked) {
      setError("Confirm the products are packed before booking pickup.");
      return;
    }

    const saved = await runRetailAction(
      {
        action: "book_order_pickup",
        carrierName: shipmentEditor.draft.carrierName || null,
        customerOrderId: shipmentEditor.order.id,
        shipmentNotes: shipmentEditor.draft.shipmentNotes || null,
        trackingNumber: shipmentEditor.draft.trackingNumber || null,
        trackingUrl: shipmentEditor.draft.trackingUrl || null
      },
      `order:${shipmentEditor.order.id}:book_pickup`,
      { closeWorkflows: false }
    );

    if (saved) {
      setShipmentEditor(null);
    }
  }

  async function printOrRequestShipmentLabel() {
    if (!shipmentEditor) {
      return;
    }

    const selectedCarrier = shipmentCarrierSelectValue(
      shipmentEditor.draft.carrierName
    );

    if (shipmentEditor.order.shipment?.labelUrl || selectedCarrier !== kexCarrierName) {
      printShipmentLabel({
        labels,
        lines: shipmentEditorLines,
        locale,
        order: shipmentEditor.order
      });
      return;
    }

    await runRetailAction(
      {
        action: "generate_order_shipping_label",
        carrierName: shipmentEditor.draft.carrierName || kexCarrierName,
        customerOrderId: shipmentEditor.order.id
      },
      `order:${shipmentEditor.order.id}:generate_shipping_label`,
      { closeWorkflows: false }
    );
  }

  function updateKexSettingsDraft(patch: Partial<KexSettingsDraft>) {
    setKexSettingsDraft((current) => ({
      ...current,
      ...patch
    }));
  }

  async function saveKexSettings() {
    if (!carrierSettingsOrganisation) {
      setError("Open one retailer before configuring KEX.");
      return;
    }

    await runRetailAction(
      {
        action: "configure_carrier_account",
        capabilities: [
          "create_shipment",
          "print_label",
          "receive_events",
          "request_pickup",
          "track"
        ],
        carrierId: "kex_th",
        credentialMetadata: {
          mode: kexSettingsDraft.mode
        },
        encryptedCredentials: {
          accountNumber: kexSettingsDraft.accountNumber || null,
          apiKey: kexSettingsDraft.apiKey || null,
          baseUrl: kexSettingsDraft.baseUrl || null,
          createShipmentEndpoint: kexSettingsDraft.createShipmentEndpoint || null,
          labelEndpoint: kexSettingsDraft.labelEndpoint || null,
          mode: kexSettingsDraft.mode,
          pickupEndpoint: kexSettingsDraft.pickupEndpoint || null,
          testEndpoint: kexSettingsDraft.testEndpoint || null,
          trackingEndpoint: kexSettingsDraft.trackingEndpoint || null
        },
        organisationId: carrierSettingsOrganisation.id,
        status: "active"
      },
      `carrier:kex:${carrierSettingsOrganisation.id}:configure`,
      { closeWorkflows: false }
    );
  }

  async function testKexSettings() {
    if (!carrierSettingsOrganisation) {
      setError("Open one retailer before testing KEX.");
      return;
    }

    await runRetailAction(
      {
        action: "test_carrier_account",
        carrierId: "kex_th",
        organisationId: carrierSettingsOrganisation.id
      },
      `carrier:kex:${carrierSettingsOrganisation.id}:test`,
      { closeWorkflows: false }
    );
  }


  const editorProduct =
    editor?.mode === "edit"
      ? {
          brandName: editor.row.brandName,
          id: editor.row.productId,
          imageUrl: editor.row.imageUrl,
          productKind: editor.row.productKind,
          title: editor.row.productTitle
        }
      : editor?.product ?? null;
  const editorDisabled = !data.canWrite || Boolean(busyId);
  const canSaveEditor =
    Boolean(editor) &&
    data.canWrite &&
    !busyId &&
    (editor?.mode === "edit" || Boolean(editor?.product)) &&
    Boolean(editor?.organisationId);
  const canSaveMovement =
    Boolean(movementEditor) &&
    data.canWrite &&
    !busyId &&
    (movementEditor?.mode === "void" ||
      Boolean(numberOrNull(movementEditor?.draft.quantity ?? "")));
	  const canSaveCustomerOrder =
	    Boolean(customerOrderDraft) &&
	    Boolean(customerOrderDraft?.lines.length) &&
	    Boolean(
	      customerOrderDraft?.lines.every(
	        (line) => line.productId && numberOrNull(line.quantityOrdered) !== null
	      )
	    ) &&
	    (customerOrderDraft?.mode === "regional"
	      ? Boolean(
	          customerOrderAvailability?.canCheckout &&
	            customerOrderAvailability.selectedRetailer
	        )
	      : Boolean(customerOrderDraft?.organisationId)) &&
	    data.canWrite &&
	    !busyId;
  const customerOrderListHref = adminHref(
    locale,
    accessToken,
    range,
    "retail-customer-orders",
    filters
  );
  const customerOrderHref = (orderId: string) =>
    adminHref(locale, accessToken, range, "retail-customer-orders", filters, {
      orderId
    });
  const customerOrderDeliveryAddress = customerOrderDetail
    ? deliveryAddressForOrder(customerOrderDetail)
    : null;
  const customerOrderBillingAddress = customerOrderDetail
    ? billingAddressForOrder(customerOrderDetail)
    : null;
  const customerOrderDeliveryAddressLines = addressDisplayLines(
    customerOrderDeliveryAddress
  );
  const customerOrderBillingAddressLines = addressDisplayLines(
    customerOrderBillingAddress
  );
  const customerOrderDeliveryNoteLines = addressNoteLines(
    labels,
    customerOrderDeliveryAddress
  );
  const customerOrderBillingNoteLines = addressNoteLines(
    labels,
    customerOrderBillingAddress
  );
  const customerOrderWorkflowSteps = customerOrderDetail
    ? buildCustomerOrderWorkflowSteps(labels, customerOrderDetail)
    : [];
  const shipmentEditorLines = shipmentEditor
    ? data.customerOrderLines.filter(
        (line) => line.customerOrderId === shipmentEditor.order.id
      )
    : [];
  const shipmentEditorAddressLines = shipmentEditor
    ? addressDisplayLines(deliveryAddressForOrder(shipmentEditor.order))
    : [];
  const shipmentEditorTotal =
    shipmentEditor ? customerOrderRetailValue(shipmentEditor.order) : null;
  const canConfirmShipment = Boolean(
    shipmentEditor?.draft.confirmedPacked && data.canWrite && !busyId
  );
  return (
    <div className="mt-8 space-y-6">
      {panel === "list" ? (
        <BusinessStatsGrid
          metrics={stockMetrics}
          onMetricSelect={(metricId) =>
            setSelectedStockFilter((current) =>
              current === metricId ? "all" : (metricId as RetailStockFilter)
            )
          }
          selectedMetricId={selectedStockFilter}
	        />
	      ) : null}

	        {panel === "list" ? (
	        <>
	        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	          <label className="w-full max-w-md">
	            <span className="sr-only">{labels.stock.search}</span>
	            <input
	              aria-label={labels.stock.search}
	              className="w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]"
	              onChange={(event) => setStockSearch(event.target.value)}
	              placeholder={labels.stock.search}
	              type="search"
	              value={stockSearch}
	            />
	          </label>
	          <div className="flex flex-wrap justify-end gap-2">
	            {hygeiaExportHref ? (
	              <a
	                className="inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#126B4F] ring-1 ring-emerald-200 hover:bg-emerald-50"
	                href={hygeiaExportHref}
	              >
	                {labels.stock.hygeiaExport}
	              </a>
	            ) : (
	              <AdminButton disabled variant="secondary">
	                {labels.stock.hygeiaExport}
	              </AdminButton>
	            )}
	            {data.canWrite ? (
	              <label
	                className={classNames(
	                  Boolean(busyId) || !hygeiaOrganisationId
	                    ? "cursor-not-allowed opacity-60"
	                    : "cursor-pointer hover:bg-emerald-50",
	                  "inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#126B4F] ring-1 ring-emerald-200"
	                )}
	                title={
	                  hygeiaOrganisationId
	                    ? undefined
	                    : labels.stock.hygeiaRetailerRequired
	                }
	              >
	                {labels.stock.hygeiaImport}
	                <input
	                  accept=".csv,text/csv"
	                  className="sr-only"
	                  disabled={Boolean(busyId) || !hygeiaOrganisationId}
	                  onChange={(event) => {
	                    void importRetailHygeiaFile(event.target.files?.[0] ?? null);
	                    event.target.value = "";
	                  }}
	                  type="file"
	                />
	              </label>
	            ) : null}
	            {data.canWrite ? (
	              <AdminButton
	                disabled={Boolean(busyId) || !defaultOrganisationId}
	                onClick={openAddStockEditor}
	              >
	                {labels.stock.addProduct}
	              </AdminButton>
	            ) : null}
	          </div>
	        </div>
	        <section className="mt-4 rounded-md bg-white p-4 shadow-sm ring-1 ring-gray-200">
	          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
	            <div>
	              <h3 className="text-sm font-semibold text-gray-900">
	                KEX connection
	              </h3>
	              <p className="mt-1 text-sm text-gray-600">
	                Configure KEX shipment creation, official labels, pickup booking, tracking sync, and webhooks for this retailer.
	              </p>
	            </div>
	            <div className="text-sm font-semibold text-gray-700">
	              {kexCarrierAccount
	                ? `${readableToken(kexCarrierAccount.status)} · test ${
	                    kexCarrierAccount.lastTestStatus ?? "not run"
	                  }`
	                : carrierSettingsOrganisation
	                  ? "Not connected"
	                  : "Select one retailer"}
	            </div>
	          </div>
	          {carrierSettingsOrganisation ? (
	            <div className="mt-4 grid gap-3 md:grid-cols-3">
	              <label className="grid gap-1 text-xs font-semibold text-gray-500">
	                Mode
	                <select
	                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
	                  disabled={!data.canWrite || Boolean(busyId)}
	                  onChange={(event) =>
	                    updateKexSettingsDraft({
	                      mode: event.target.value as KexSettingsDraft["mode"]
	                    })
	                  }
	                  value={kexSettingsDraft.mode}
	                >
	                  <option value="mock">Mock</option>
	                  <option value="sandbox">Sandbox</option>
	                  <option value="live">Live</option>
	                </select>
	              </label>
	              <label className="grid gap-1 text-xs font-semibold text-gray-500">
	                Account number
	                <input
	                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
	                  disabled={!data.canWrite || Boolean(busyId)}
	                  onChange={(event) =>
	                    updateKexSettingsDraft({ accountNumber: event.target.value })
	                  }
	                  value={kexSettingsDraft.accountNumber}
	                />
	              </label>
	              <label className="grid gap-1 text-xs font-semibold text-gray-500">
	                API key
	                <input
	                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
	                  disabled={!data.canWrite || Boolean(busyId)}
	                  onChange={(event) =>
	                    updateKexSettingsDraft({ apiKey: event.target.value })
	                  }
	                  type="password"
	                  value={kexSettingsDraft.apiKey}
	                />
	              </label>
	              <label className="grid gap-1 text-xs font-semibold text-gray-500 md:col-span-3">
	                Base URL
	                <input
	                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
	                  disabled={!data.canWrite || Boolean(busyId)}
	                  onChange={(event) =>
	                    updateKexSettingsDraft({ baseUrl: event.target.value })
	                  }
	                  value={kexSettingsDraft.baseUrl}
	                />
	              </label>
	              {([
	                ["testEndpoint", "Test endpoint"],
	                ["createShipmentEndpoint", "Create shipment endpoint"],
	                ["labelEndpoint", "Label endpoint"],
	                ["pickupEndpoint", "Pickup endpoint"],
	                ["trackingEndpoint", "Tracking endpoint"]
	              ] as const).map(([field, label]) => (
	                <label
	                  className="grid gap-1 text-xs font-semibold text-gray-500"
	                  key={field}
	                >
	                  {label}
	                  <input
	                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
	                    disabled={!data.canWrite || Boolean(busyId)}
	                    onChange={(event) =>
	                      updateKexSettingsDraft({ [field]: event.target.value })
	                    }
	                    value={kexSettingsDraft[field]}
	                  />
	                </label>
	              ))}
	              <div className="flex flex-wrap items-end gap-2 md:col-span-3">
	                <AdminButton
	                  disabled={!data.canWrite || Boolean(busyId)}
	                  onClick={() => void saveKexSettings()}
	                >
	                  Save KEX
	                </AdminButton>
	                <AdminButton
	                  disabled={!data.canWrite || Boolean(busyId) || !kexCarrierAccount}
	                  onClick={() => void testKexSettings()}
	                  variant="secondary"
	                >
	                  Test KEX
	                </AdminButton>
	              </div>
	            </div>
	          ) : (
	            <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-100">
	              Assume or select a single retailer before configuring KEX.
	            </div>
	          )}
	        </section>
	        <div className="mt-4 overflow-x-auto">
	          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
                <tr className="text-left text-xs font-semibold text-gray-500">
                  <th className="py-2 pr-4">{labels.stock.product}</th>
                  {showOrganisationContext ? (
                    <th className="py-2 pr-4">{labels.stock.organisation}</th>
                  ) : null}
                  <th className="py-2 pr-4">{labels.stock.stockQuantity}</th>
                  <th className="py-2 pr-4">{wholesaleHeader}</th>
                  <th className="py-2 pr-4">{retailHeader}</th>
                  <th className="py-2 pr-4">{labels.stock.leadTimeDays}</th>
                  <th className="py-2 pr-4">{labels.stock.backorderPolicy}</th>
                  <th className="py-2 pr-4">{labels.stock.status}</th>
                  <th className="py-2 pr-4">{labels.stock.updated}</th>
                  <th className="py-2 pr-4">{labels.stock.actions}</th>
	                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
	              {rows.map((row) => {
	                const wholesalePrice = formatAmount(
	                  locale,
	                  row.wholesalePriceAmount
	                );
	                const retailPrice = formatAmount(
	                  locale,
	                  row.retailPriceAmount
	                );
		                const updated = formatDate(row.updatedAt, locale);
		                const availabilityStatus = stockAvailabilityStatus(
		                  row,
		                  adviceByStockId.get(row.id)
		                );

                return (
                  <tr
                    aria-label={`${labels.stock.editStock}: ${row.productTitle}`}
                    className="cursor-pointer align-middle transition hover:bg-[#F8FAFC] focus:bg-[#F8FAFC] focus:outline-none"
                    key={row.id}
                    onClick={() => openRowEditor(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openRowEditor(row);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="w-52 max-w-52 py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <ProductThumbnail
                          imageUrl={row.imageUrl}
                          title={row.productTitle}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-900">
                            {row.productTitle}
                          </div>
                          <div className="mt-1 truncate text-xs text-gray-500">
                            {[row.brandName, row.productKind]
                              .filter(Boolean)
                              .join(" - ")}
                          </div>
                        </div>
                      </div>
                    </td>
                    {showOrganisationContext ? (
                      <td className="py-3 pr-4 text-gray-600">
                        {row.organisationName}
                      </td>
                    ) : null}
	                    <td className="whitespace-nowrap py-3 pr-4">
	                      <div className="font-medium text-gray-900">
	                        {row.stockQuantity}
	                      </div>
	                      {availabilityStatus === "out_of_stock" ? (
	                        <div className="mt-1 text-xs font-medium text-amber-700">
	                          {labels.stock.outOfStock}
	                        </div>
	                      ) : availabilityStatus === "low_stock" ? (
	                        <div className="mt-1 text-xs font-medium text-amber-700">
	                          {labels.stock.lowStock}
	                        </div>
	                      ) : null}
		                    </td>
	                    <td className="whitespace-nowrap py-3 pr-4 text-gray-700">
	                      <div>{wholesalePrice ?? emptyRetailField}</div>
	                    </td>
	                    <td className="whitespace-nowrap py-3 pr-4 text-gray-700">
	                      <div>{retailPrice ?? emptyRetailField}</div>
	                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-gray-600">
                      {row.leadTimeDays}
                    </td>
	                    <td className="whitespace-nowrap py-3 pr-4">
	                      <span
	                        className={classNames(
	                          backorderPolicyClass(row.backorderPolicy),
	                          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
	                        )}
	                      >
	                        {backorderPolicyLabel(labels, row.backorderPolicy)}
	                      </span>
	                    </td>
                    <td className="whitespace-nowrap py-3 pr-4">
                      <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                        {statusLabel(labels, row.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-gray-500">
                      {updated ?? emptyRetailField}
                    </td>
                    <td className="py-3 pr-4">
                      {data.canWrite ? (
                        <AdminButton
                          disabled={Boolean(busyId)}
                          onClick={(event) => {
                            event.stopPropagation();
                            openMovementEditor(row);
                          }}
                          variant="secondary"
                        >
                          {labels.stock.recordMovement}
                        </AdminButton>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td
                    className="py-8 text-center text-sm text-gray-500"
                    colSpan={showOrganisationContext ? 10 : 9}
                  >
                    {labels.stock.empty}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        </>
        ) : null}

        {(panel === "customer-orders" || panel === "fulfillment") &&
        customerOrderDetail ? (
          <div className="space-y-5">
            <Link
              className="inline-flex text-sm font-semibold text-[#126B4F] transition hover:text-[#0F513C] hover:underline"
              href={customerOrderListHref}
            >
              {labels.stock.backToCustomerOrders}
            </Link>
            <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-gray-500">
                  {labels.stock.customerOrders}
                </div>
                <div className="mt-2 text-xl font-semibold text-gray-900">
                  {customerOrderDetail.orderNumber}
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  {customerOrderDetail.customerName ||
                    customerOrderDetail.customerEmail ||
                    emptyRetailField}
                </div>
                <div className="mt-2 text-xs font-semibold text-gray-600">
                  {labels.stock.allocatedTo}:{" "}
                  <span className="text-gray-900">
                    {customerOrderDetail.organisationName}
                  </span>
                </div>
                <div className="mt-1 text-xs font-semibold text-gray-600">
                  {labels.stock.retailValue}:{" "}
                  <span className="text-gray-900">
                    {formatPrice(
                      locale,
                      customerOrderDetail.currency,
                      customerOrderRetailValue(customerOrderDetail)
                    ) ?? emptyRetailField}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-3 lg:items-end">
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <span
                    className={classNames(
                      customerOrderStatusPillClass(customerOrderDetail),
                      "inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1"
                    )}
                  >
                    {customerOrderStatusDisplay(customerOrderDetail)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <AdminButton
                    className="gap-2"
                    onClick={() =>
                      printRetailOrderDocument({
                        kind: "order-pack",
                        labels,
                        lines: customerOrderDetailLines,
                        locale,
                        order: customerOrderDetail
                      })
                    }
                    variant="secondary"
                  >
                    <FileDown aria-hidden="true" className="size-4" />
                    {labels.stock.downloadPdf}
                  </AdminButton>
                  <AdminButton
                    className="gap-2"
                    onClick={() =>
                      printRetailOrderDocument({
                        kind: "packing-sheet",
                        labels,
                        lines: customerOrderDetailLines,
                        locale,
                        order: customerOrderDetail
                      })
                    }
                    variant="secondary"
                  >
                    <PackageCheck aria-hidden="true" className="size-4" />
                    {labels.stock.packingSheet}
                  </AdminButton>
                  <AdminButton
                    className="gap-2"
                    onClick={() =>
                      printRetailOrderDocument({
                        kind: "invoice",
                        labels,
                        lines: customerOrderDetailLines,
                        locale,
                        order: customerOrderDetail
                      })
                    }
                    variant="secondary"
                  >
                    <ReceiptText aria-hidden="true" className="size-4" />
                    {labels.stock.invoice}
                  </AdminButton>
                </div>
              </div>
            </div>

            {customerOrderDetail.routingSnapshot?.unavailableLines.length ? (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-100">
                <div className="font-semibold">{labels.stock.unavailable}</div>
                <div className="mt-2 space-y-1">
                  {customerOrderDetail.routingSnapshot.unavailableLines.map(
                    (line) => (
                      <div key={`${line.productId}:${line.reason}`}>
                        {productOptionById.get(line.productId)?.title ??
                          line.productId}
                        : {line.reason}
                      </div>
                    )
                  )}
                </div>
              </div>
            ) : null}

            {customerOrderDetail.workflowHealth.reason ? (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-100">
                {customerOrderDetail.workflowHealth.reason}
              </div>
            ) : null}

            <div className="space-y-4">
              <section className="space-y-4">
                <div className="rounded-md bg-white p-4 ring-1 ring-gray-200">
                  <div className="grid gap-3 md:grid-cols-6">
                    {customerOrderWorkflowSteps.map((step, index) => {
                      const isCurrent = step.active;
                      const isCompleted = step.complete && !isCurrent;
                      const previousStep = customerOrderWorkflowSteps[index - 1];
                      const connectorComplete = Boolean(
                        previousStep?.complete && !previousStep.active
                      );

                      return (
                        <div
                          className={classNames(
                            "relative rounded-md px-3 py-3 ring-1",
                            isCurrent
                              ? "bg-amber-50 text-amber-900 ring-amber-200"
                              : isCompleted
                                ? "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]"
                                : "bg-gray-50 text-gray-500 ring-gray-200"
                          )}
                          key={step.key}
                        >
                          {index > 0 ? (
                            <span
                              aria-hidden="true"
                              className={classNames(
                                "absolute -left-3 top-1/2 hidden h-px w-3 md:block",
                                connectorComplete ? "bg-[#1FA77A]" : "bg-gray-200"
                              )}
                            />
                          ) : null}
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase">
                            <span
                              aria-hidden="true"
                              className={classNames(
                                "grid size-5 shrink-0 place-items-center rounded-full text-[11px] ring-1",
                                isCompleted
                                  ? "bg-[#1FA77A] text-white ring-[#1FA77A]"
                                  : isCurrent
                                    ? "bg-amber-100 text-amber-900 ring-amber-300"
                                    : "bg-white text-gray-400 ring-gray-200"
                              )}
                            >
                              {isCompleted ? (
                                <Check className="size-3.5" strokeWidth={3} />
                              ) : (
                                index + 1
                              )}
                            </span>
                            <span>{step.label}</span>
                          </div>
                          <div className="mt-2 text-sm font-semibold">
                            {formatDate(step.at, locale) ?? emptyRetailField}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-md bg-white p-4 ring-1 ring-gray-200">
                  <div className="grid gap-x-3 gap-y-4 text-sm text-gray-600 sm:grid-cols-4">
                    <div>
                      <div className="text-xs font-semibold text-gray-500">
                        {labels.stock.currency}
                      </div>
                      <div className="mt-1">{customerOrderDetail.currency}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500">
                        {labels.stock.expectedAt}
                      </div>
                      <div className="mt-1">
                        {formatDate(
                          customerOrderDetail.fulfillmentPromise?.etaDate ??
                            customerOrderDetail.routingSnapshot?.etaDate ??
                            customerOrderDetail.dueAt,
                          locale
                        ) ?? emptyRetailField}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500">
                        {labels.stock.placedAt}
                      </div>
                      <div className="mt-1">
                        {formatDateTime(customerOrderDetail.placedAt, locale) ??
                          emptyRetailField}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500">
                        {labels.stock.updated}
                      </div>
                      <div className="mt-1">
                        {formatDateTime(
                          customerOrderDetail.lastWorkflowEventAt,
                          locale
                        ) ?? emptyRetailField}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500">
                        {labels.stock.routingPreference}
                      </div>
                      <div className="mt-1">
                        {customerOrderDetail.routingSnapshot?.preference
                          ? readableToken(
                              customerOrderDetail.routingSnapshot.preference
                            )
                          : customerOrderDetail.source === "checkout"
                            ? labels.stock.regionalCheckout
                            : labels.stock.directRetailer}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500">
                        {labels.stock.shippingCountry}
                      </div>
                      <div className="mt-1">
                        {customerOrderDetail.routingSnapshot?.shippingCountry
                          ? productCountryLabel(
                              customerOrderDetail.routingSnapshot.shippingCountry
                            )
                          : emptyRetailField}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500">
                        {labels.stock.nextAction}
                      </div>
                      <div className="mt-1">
                        {customerOrderDetail.workflowHealth.nextAction
                          ? readableToken(
                              customerOrderDetail.workflowHealth.nextAction
                            )
                          : emptyRetailField}
                      </div>
                    </div>
                  </div>
                </div>

                <section className="rounded-md bg-white p-4 ring-1 ring-gray-200">
                  <h3
                    className={classNames(
                      "text-sm font-semibold text-gray-900",
                      adminLocaleTextClass(locale, "heading")
                    )}
                  >
                    {labels.stock.deliveryDetails}
                  </h3>
                  <div className="mt-3 grid gap-4 text-sm text-gray-600 md:grid-cols-2">
                    <div className="rounded-md bg-gray-50 p-3 ring-1 ring-gray-100">
                      <div className="text-xs font-semibold uppercase text-gray-500">
                        {labels.stock.deliveryAddress}
                      </div>
                      <div className="mt-2 space-y-1 text-gray-800">
                        {customerOrderDeliveryAddressLines.length > 0 ? (
                          customerOrderDeliveryAddressLines.map((line) => (
                            <div key={line}>{line}</div>
                          ))
                        ) : (
                          <div className="text-gray-500">{emptyRetailField}</div>
                        )}
                      </div>
                      {customerOrderDeliveryNoteLines.length > 0 ? (
                        <div className="mt-3 space-y-1 border-t border-gray-200 pt-3 text-xs text-gray-500">
                          {customerOrderDeliveryNoteLines.map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-md bg-gray-50 p-3 ring-1 ring-gray-100">
                      <div className="text-xs font-semibold uppercase text-gray-500">
                        {labels.stock.billingAddress}
                      </div>
                      {customerOrderDetail.deliveryDetails
                        ?.billingSameAsShipping ? (
                        <div className="mt-2 text-sm font-medium text-gray-800">
                          {labels.stock.billingSameAsDelivery}
                        </div>
                      ) : null}
                      <div className="mt-2 space-y-1 text-gray-800">
                        {customerOrderBillingAddressLines.length > 0 ? (
                          customerOrderBillingAddressLines.map((line) => (
                            <div key={line}>{line}</div>
                          ))
                        ) : customerOrderDetail.deliveryDetails
                            ?.billingSameAsShipping ? (
                          null
                        ) : (
                          <div className="text-gray-500">{emptyRetailField}</div>
                        )}
                      </div>
                      {customerOrderBillingNoteLines.length > 0 ? (
                        <div className="mt-3 space-y-1 border-t border-gray-200 pt-3 text-xs text-gray-500">
                          {customerOrderBillingNoteLines.map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                {customerOrderDetail.shipment ? (
                  <section className="rounded-md bg-white p-4 ring-1 ring-gray-200">
                    <h3
                      className={classNames(
                        "text-sm font-semibold text-gray-900",
                        adminLocaleTextClass(locale, "heading")
                      )}
                    >
                      Shipment
                    </h3>
                    <div className="mt-3 grid gap-3 text-sm text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <div className="text-xs font-semibold text-gray-500">
                          Carrier
                        </div>
                        <div className="mt-1 text-gray-900">
                          {customerOrderDetail.shipment.carrierName ??
                            emptyRetailField}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500">
                          Tracking number
                        </div>
                        <div className="mt-1 text-gray-900">
                          {customerOrderDetail.shipment.trackingNumber ??
                            emptyRetailField}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500">
                          Tracking link
                        </div>
                        <div className="mt-1">
                          {customerOrderDetail.shipment.trackingUrl ? (
                            <a
                              className="font-semibold text-[#126B4F] hover:underline"
                              href={customerOrderDetail.shipment.trackingUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Track shipment
                            </a>
                          ) : (
                            <span className="text-gray-900">{emptyRetailField}</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500">
                          Carrier label
                        </div>
                        <div className="mt-1 text-gray-900">
                          {shipmentLabelStatusText(customerOrderDetail.shipment)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500">
                          {labels.stock.pickupBooked}
                        </div>
                        <div className="mt-1 text-gray-900">
                          {formatDateTime(
                            customerOrderDetail.shipment.pickupBookedAt,
                            locale
                          ) ?? emptyRetailField}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500">
                          Carrier status
                        </div>
                        <div className="mt-1 text-gray-900">
                          {customerOrderDetail.shipment.pickupProviderStatus ??
                            customerOrderDetail.shipment.status ??
                            emptyRetailField}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500">
                          Shipped
                        </div>
                        <div className="mt-1 text-gray-900">
                          {formatDateTime(
                            customerOrderDetail.shipment.shippedAt,
                            locale
                          ) ?? emptyRetailField}
                        </div>
                      </div>
                    </div>
                    {customerOrderDetail.shipment.exceptionMessage ||
                    customerOrderDetail.shipment.exceptionCode ? (
                      <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-100">
                        {[
                          customerOrderDetail.shipment.exceptionCode,
                          customerOrderDetail.shipment.exceptionMessage
                        ].filter(Boolean).join(": ")}
                      </div>
                    ) : null}
                    {customerOrderDetail.shipment.shipmentNotes ? (
                      <div className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600">
                        {customerOrderDetail.shipment.shipmentNotes}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <section className="space-y-3">
                  <h3
                    className={classNames(
                      "text-sm font-semibold text-gray-900",
                      adminLocaleTextClass(locale, "heading")
                    )}
                  >
                    {labels.stock.orderItems}
                  </h3>
                  <div className="space-y-2">
                    {customerOrderDetailLines.map((line) => {
                      const product = productOptionById.get(line.productId);
                      const identifiers = orderLineIdentifierParts(line);
                      const awaitingStockUnits = orderLineAwaitingStockUnits(line);

                      return (
                        <div
                          className="rounded-md bg-white p-3 ring-1 ring-gray-200"
                          key={line.id}
                        >
                          <div className="flex items-start gap-3">
                            <ProductThumbnail
                              imageUrl={product?.imageUrl ?? null}
                              title={line.productTitle}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-gray-900">
                                {line.productTitle}
                              </div>
                              {identifiers.length > 0 ? (
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-gray-500">
                                  {identifiers.map((identifier) => (
                                    <span key={identifier}>{identifier}</span>
                                  ))}
                                </div>
                              ) : null}
                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                {line.etaDate ? (
                                  <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 font-semibold text-gray-700 ring-1 ring-gray-200">
                                    {formatDate(line.etaDate, locale)}
                                  </span>
                                ) : null}
                                {awaitingStockUnits > 0 ? (
                                  <span className="inline-flex rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-800 ring-1 ring-amber-100">
                                    Awaiting stock
                                  </span>
                                ) : null}
                                {line.availabilityStatus ? (
                                  <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 font-semibold text-gray-700 ring-1 ring-gray-200">
                                    {retailAvailabilityLabel(
                                      line.availabilityStatus
                                    )}
                                  </span>
                                ) : null}
                                {line.reason ? (
                                  <span className="text-gray-500">
                                    {line.reason}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="grid shrink-0 grid-cols-3 gap-5 text-right sm:gap-8">
                              <div className="min-w-16">
                                <div className="text-[11px] font-semibold uppercase text-gray-500">
                                  {labels.stock.quantity}
                                </div>
                                <div className="mt-1 text-3xl font-semibold leading-none text-gray-900">
                                  {line.quantityOrdered}
                                </div>
                              </div>
                              <div className="min-w-20">
                                <div className="text-[11px] font-semibold uppercase text-gray-500">
                                  {labels.stock.retailPrice}
                                </div>
                                <div className="mt-1 text-lg font-semibold leading-tight text-gray-900">
                                  {formatPrice(
                                    locale,
                                    customerOrderDetail.currency,
                                    line.retailPriceAmount
                                  ) ?? emptyRetailField}
                                </div>
                              </div>
                              <div className="min-w-20">
                                <div className="text-[11px] font-semibold uppercase text-gray-500">
                                  {labels.stock.lineTotal}
                                </div>
                                <div className="mt-1 text-lg font-semibold leading-tight text-gray-900">
                                  {line.retailPriceAmount === null
                                    ? emptyRetailField
                                    : (formatPrice(
                                        locale,
                                        customerOrderDetail.currency,
                                        line.retailPriceAmount * line.quantityOrdered
                                      ) ?? emptyRetailField)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </section>
            </div>

            {error ? (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
              {data.canWrite &&
              (customerOrderDetail.status === "placed" ||
                customerOrderDetail.status === "awaiting_stock") ? (
                <AdminButton
                  disabled={Boolean(busyId) || !customerOrderCanAllocate}
                  onClick={() =>
                    runCustomerOrderAction(customerOrderDetail, "allocate")
                  }
                  title={
                    customerOrderDetail.actionStates.allocateAvailable.reason ??
                    undefined
                  }
                  variant="secondary"
                >
                  {labels.stock.allocateAvailable}
                </AdminButton>
              ) : null}
              {data.canWrite && customerOrderDetail.actionStates.ship.enabled ? (
                <AdminButton
                  disabled={Boolean(busyId)}
                  onClick={() => openShipmentEditor(customerOrderDetail)}
                >
                  Mark Shipped
                </AdminButton>
              ) : null}
              {data.canWrite &&
              customerOrderDetail.actionStates.deliver.enabled ? (
                <AdminButton
                  disabled={Boolean(busyId)}
                  onClick={() =>
                    runCustomerOrderAction(customerOrderDetail, "mark_delivered")
                  }
                  variant="secondary"
                >
                  {labels.stock.deliver}
                </AdminButton>
              ) : null}
              {data.canWrite ? (
                <AdminButton
                  disabled={Boolean(busyId)}
                  onClick={() =>
                    runCustomerOrderAction(customerOrderDetail, "recheck")
                  }
                  variant="secondary"
                >
                  {labels.stock.recheckWorkflow}
                </AdminButton>
              ) : null}
            </div>
          </div>
        ) : null}

        {(panel === "customer-orders" || panel === "fulfillment") &&
        !customerOrderDetail ? (
          <div className="mt-5 space-y-5">
            <BusinessStatsGrid
              metrics={customerOrderMetrics}
              onMetricSelect={(metricId) =>
                setSelectedCustomerOrderFilter((current) =>
                  current === metricId ? "all" : (metricId as CustomerOrderFilter)
                )
              }
              selectedMetricId={selectedCustomerOrderFilter}
            />
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500">
                  <th className="py-2 pr-4">{labels.stock.customerOrders}</th>
                  <th className="py-2 pr-4">{labels.stock.customer}</th>
                  {showOrganisationContext ? (
                    <th className="py-2 pr-4">{labels.stock.organisation}</th>
                  ) : null}
                  <th className="py-2 pr-4">{labels.stock.quantity}</th>
                  <th className="py-2 pr-4">
                    {customerOrderRetailValueHeader}
                  </th>
                  <th className="py-2 pr-4">{labels.stock.expectedAt}</th>
                  <th className="py-2 pr-4">{labels.stock.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customerOrderRows.map((order) => (
                  <tr
                    className="cursor-pointer align-middle hover:bg-[#F8FAFC]"
                    key={order.id}
                    onClick={() => {
                      window.location.href = customerOrderHref(order.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        window.location.href = customerOrderHref(order.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      <Link
                        className="hover:text-[#1FA77A]"
                        href={customerOrderHref(order.id)}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {order.orderNumber}
                      </Link>
                      {order.source === "checkout" ? (
                        <div className="mt-1 text-xs font-normal text-gray-500">
                          {labels.stock.mockPaidOrder}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-gray-700">
                      {order.customerName || order.customerEmail || emptyRetailField}
                    </td>
                    {showOrganisationContext ? (
                      <td className="py-3 pr-4 text-gray-600">
                        {order.organisationName}
                      </td>
                    ) : null}
                    <td className="py-3 pr-4 text-gray-600">
                      {order.shippedUnits}/{order.orderedUnits}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 font-medium text-gray-900">
                      {formatWholeAmount(
                        locale,
                        customerOrderRetailValue(order)
                      ) ?? emptyRetailField}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {formatDate(order.dueAt, locale) ?? emptyRetailField}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={classNames(
                          customerOrderStatusPillClass(order),
                          "inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1"
                        )}
                      >
                        {customerOrderStatusDisplay(order)}
                      </span>
                      {order.nextExpectedAction ? (
                        <div className="mt-1 text-xs text-gray-500">
                          {labels.stock.nextAction}:{" "}
                          {readableToken(order.nextExpectedAction)}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {customerOrderRows.length === 0 ? (
                  <tr>
                    <td
                      className="py-8 text-center text-sm text-gray-500"
                      colSpan={showOrganisationContext ? 7 : 6}
                    >
                      {labels.stock.noOrders}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </div>
        ) : null}

        {panel === "movements" ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
	                <tr className="text-left text-xs font-semibold text-gray-500">
	                  <th className="py-2 pr-4">{labels.stock.updated}</th>
	                  <th className="py-2 pr-4">{labels.stock.product}</th>
	                  {showOrganisationContext ? (
	                    <th className="py-2 pr-4">{labels.stock.organisation}</th>
	                  ) : null}
	                  <th className="py-2 pr-4">{labels.stock.movementType}</th>
	                  <th className="py-2 pr-4">{labels.stock.quantity}</th>
	                  <th className="py-2 pr-4">{labels.stock.reason}</th>
                  <th className="py-2 pr-4">{labels.stock.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movementRows.map((movement) => (
                  <tr className="align-middle" key={movement.id}>
                    <td className="py-3 pr-4 text-gray-500">
                      {formatDate(movement.occurredAt, locale) ?? emptyRetailField}
                    </td>
	                    <td className="py-3 pr-4 font-medium text-gray-900">
	                      {movement.productTitle}
	                    </td>
	                    {showOrganisationContext ? (
	                      <td className="py-3 pr-4 text-gray-600">
	                        {movement.organisationName}
	                      </td>
	                    ) : null}
	                    <td className="py-3 pr-4">
	                      <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
	                        {movementLabel(labels, movement.movementType)}
                      </span>
                      {movement.isVoided ? (
                        <span className="ml-2 inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          {labels.stock.movementVoid}
                        </span>
                      ) : null}
                    </td>
                    <td className={classNames(
                      "py-3 pr-4 font-semibold",
                      movement.quantityDelta < 0 ? "text-red-700" : "text-emerald-700"
                    )}>
                      {movement.quantityDelta > 0 ? "+" : ""}
                      {movement.quantityDelta}
                    </td>
                    <td className="max-w-sm py-3 pr-4 text-gray-600">
                      {movement.reason || movement.notes || emptyRetailField}
                    </td>
                    <td className="py-3 pr-4">
                      {data.canWrite &&
                      movement.movementType !== "void" &&
                      !movement.isVoided ? (
                        <AdminButton
                          disabled={Boolean(busyId)}
                          onClick={() => openVoidMovementEditor(movement)}
                          variant="secondary"
                        >
                          {labels.stock.voidMovement}
                        </AdminButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
	                {movementRows.length === 0 ? (
	                  <tr>
	                    <td
	                      className="py-8 text-center text-sm text-gray-500"
	                      colSpan={showOrganisationContext ? 7 : 6}
	                    >
	                      {labels.stock.empty}
	                    </td>
	                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {panel === "stock-advice" ? (
          <div className="mt-5 space-y-6">
            <section className="rounded-md bg-white p-4 ring-1 ring-gray-200">
              <div className="overflow-x-auto rounded-md ring-1 ring-gray-200">
                <table className="min-w-[640px] w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-16" />
                    <col />
                    <col className="w-48" />
                    <col className="w-28" />
                  </colgroup>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    <tr>
                      <td className="px-3 pb-3 pt-5" colSpan={4}>
                        <h3
                          className={classNames(
                            "text-lg font-semibold text-gray-900",
                            adminLocaleTextClass(locale, "heading")
                          )}
                        >
                          {labels.stock.reorderBackorders}
                        </h3>
                      </td>
                    </tr>
                    {reorderPurchaseItems.map((item) => {
                      const itemKey = orgProductKey(
                        item.organisationId,
                        item.productId
                      );
                      const selected =
                        outstandingPurchaseSelectionKeys.includes(itemKey);
                      const canSelectItem =
                        data.canWrite &&
                        !busyId &&
                        item.unassignedDemandUnits > 0;

                      return (
                        <tr
                          className={classNames(
                            canSelectItem
                              ? "cursor-pointer hover:bg-[#F8FAFC]"
                              : "bg-gray-50 text-gray-500"
                          )}
                          key={itemKey}
                          onClick={() =>
                            canSelectItem ? toggleOutstandingPurchaseItem(item) : undefined
                          }
                        >
                          <td className="py-2 pl-3 pr-3">
                            <input
                              aria-label={`${labels.stock.selectProduct}: ${item.productTitle}`}
                              checked={selected}
                              className="size-4 rounded border-gray-300 text-[#1FA77A] focus:ring-[#1FA77A]"
                              disabled={!canSelectItem}
                              onClick={(event) => event.stopPropagation()}
                              onChange={() => toggleOutstandingPurchaseItem(item)}
                              type="checkbox"
                            />
                          </td>
                          <td className="py-2 pr-3 font-semibold text-gray-900">
                            {item.productTitle}
                            {showOrganisationContext ? (
                              <div className="mt-0.5 text-xs font-normal text-gray-500">
                                {
                                  data.organisations.find(
                                    (organisation) =>
                                      organisation.id === item.organisationId
                                  )?.name
                                }
                              </div>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-gray-600">
                            {item.brandName ?? emptyRetailField}
                          </td>
                          <td className="py-2 pr-3 font-semibold text-gray-900">
                            {item.amountToBuyUnits}
                          </td>
                        </tr>
                      );
                    })}
                    {reorderPurchaseItems.length === 0 ? (
                      <tr>
                        <td
                          className="px-3 py-8 text-center text-sm text-gray-500"
                          colSpan={4}
                        >
                          {labels.stock.empty}
                        </td>
                      </tr>
                    ) : null}
                    {reorderRecommendationItems.length > 0 ? (
                      <>
                        <tr className="border-t border-gray-200">
                          <td className="px-3 pb-3 pt-5" colSpan={4}>
                            <h3
                              className={classNames(
                                "text-lg font-semibold text-gray-900",
                                adminLocaleTextClass(locale, "heading")
                              )}
                            >
                              {labels.stock.reorderRecommendations}
                            </h3>
                          </td>
                        </tr>
                        {reorderRecommendationItems.map((item) => {
                          const itemKey = orgProductKey(
                            item.organisationId,
                            item.productId
                          );
                          const selected =
                            outstandingPurchaseSelectionKeys.includes(itemKey);
                          const canSelectItem =
                            data.canWrite && !busyId && item.amountToBuyUnits > 0;

                          return (
                            <tr
                              className={classNames(
                                canSelectItem
                                  ? "cursor-pointer hover:bg-[#F8FAFC]"
                                  : "bg-gray-50 text-gray-500"
                              )}
                              key={itemKey}
                              onClick={() =>
                                canSelectItem
                                  ? toggleOutstandingPurchaseItem(item)
                                  : undefined
                              }
                            >
                              <td className="py-2 pl-3 pr-3">
                                <input
                                  aria-label={`${labels.stock.selectProduct}: ${item.productTitle}`}
                                  checked={selected}
                                  className="size-4 rounded border-gray-300 text-[#1FA77A] focus:ring-[#1FA77A]"
                                  disabled={!canSelectItem}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={() => toggleOutstandingPurchaseItem(item)}
                                  type="checkbox"
                                />
                              </td>
                              <td className="py-2 pr-3 font-semibold text-gray-900">
                                {item.productTitle}
                                {showOrganisationContext ? (
                                  <div className="mt-0.5 text-xs font-normal text-gray-500">
                                    {
                                      data.organisations.find(
                                        (organisation) =>
                                          organisation.id === item.organisationId
                                      )?.name
                                    }
                                  </div>
                                ) : null}
                              </td>
                              <td className="py-2 pr-3 text-gray-600">
                                {item.brandName ?? emptyRetailField}
                              </td>
                              <td className="py-2 pr-3 font-semibold text-gray-900">
                                {item.amountToBuyUnits}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {data.canWrite ? (
                <AdminButton
                  disabled={
                    Boolean(busyId) ||
                    selectedOutstandingPurchaseItems.length === 0
                  }
                  onClick={createShoppingListFromSelection}
                >
                  {labels.stock.createShoppingList}
                </AdminButton>
              ) : null}
            </div>
            <section className="rounded-md bg-white p-4 ring-1 ring-gray-200">
              <div className="mb-3">
                <h3
                  className={classNames(
                    "text-lg font-semibold text-gray-900",
                    adminLocaleTextClass(locale, "heading")
                  )}
                >
                  {labels.stock.shoppingLists}
                </h3>
              </div>
              <div className="overflow-x-auto rounded-md ring-1 ring-gray-200">
	                <table className="min-w-[560px] w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
	                      <th className="py-2 pl-3 pr-3">List number</th>
	                      <th className="py-2 pr-3">{labels.stock.status}</th>
	                      <th className="py-2 pr-3">{labels.stock.quantity}</th>
	                      <th className="py-2 pr-3">Created</th>
	                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {visibleShoppingLists.map((list) => {
                      const listLines = data.shoppingListLines.filter(
                        (line) => line.shoppingListId === list.id
                      );
	                      return (
                        <tr
                          className="cursor-pointer hover:bg-[#F8FAFC]"
                          key={list.id}
                          onClick={() => setSelectedShoppingListId(list.id)}
                        >
                          <td className="py-2 pl-3 pr-3 font-semibold text-gray-900">
                            {list.listNumber}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={classNames(
                                "inline-flex rounded-md px-2 py-1 text-xs font-semibold",
                                list.status === "active"
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                                  : "bg-gray-100 text-gray-700"
                              )}
                            >
                              {readableToken(list.status)}
                            </span>
                          </td>
	                          <td className="py-2 pr-3">{listLines.length}</td>
	                          <td className="py-2 pr-3 text-gray-600">
	                            {formatDateTime(list.createdAt, locale)}
	                          </td>
	                        </tr>
                      );
                    })}
                    {visibleShoppingLists.length === 0 ? (
                      <tr>
                        <td
                          className="px-3 py-8 text-center text-sm text-gray-500"
	                          colSpan={4}
                        >
                          {labels.stock.empty}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}

        {panel === "insights" ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: labels.stock.insightActiveProducts,
                value: stockInsights.activeProducts
              },
              {
                label: labels.stock.insightOutOfStock,
                value: stockInsights.outOfStock
              },
              {
                label: labels.stock.insightRecommendationPressure,
                value: stockInsights.recommendationPressure
              },
              {
                label: labels.stock.insightRetailValue,
                value: formatPrice(
                  locale,
                  rows[0]?.currency ?? "THB",
                  stockInsights.retailValue
                ) ?? "0"
              }
            ].map((item) => (
              <div
                className="rounded-md bg-[#F8FAFC] p-4 ring-1 ring-gray-200"
                key={item.label}
              >
                <div className="text-xs font-semibold text-gray-500">
                  {item.label}
                </div>
                <div className="mt-2 text-2xl font-semibold text-gray-900">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      {activeShoppingList ? (
        <RetailShoppingListModal
          busy={Boolean(busyId)}
          labels={labels}
          lines={shoppingListDraftLines}
          list={activeShoppingList}
          onClose={() => setSelectedShoppingListId("")}
          onLinesChange={setShoppingListDraftLines}
          onReopen={() => void reopenShoppingList()}
          onSave={() => void saveShoppingListDraft()}
        />
      ) : null}
      {shipmentEditor ? (
        <AdminModal
          closeDisabled={Boolean(busyId)}
          closeLabel={labels.stock.cancel}
          description={
            <span>
              Confirm the order is packed, then add courier details, book pickup
              or ship when ready.
            </span>
          }
          onClose={() => setShipmentEditor(null)}
          size="xl"
          title="Mark Shipped"
        >
          <div className="space-y-5 px-6 py-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)]">
              <section className="rounded-md bg-gray-50 p-4 ring-1 ring-gray-100">
                <div className="text-xs font-semibold uppercase text-gray-500">
                  {labels.stock.customerOrders}
                </div>
                <div className="mt-2 text-lg font-semibold text-gray-900">
                  {shipmentEditor.order.orderNumber}
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  {shipmentEditor.order.customerName ||
                    shipmentEditor.order.customerEmail ||
                    emptyRetailField}
                </div>
                <div className="mt-4 text-xs font-semibold uppercase text-gray-500">
                  {labels.stock.deliveryAddress}
                </div>
                <div className="mt-2 space-y-1 text-sm text-gray-800">
                  {shipmentEditorAddressLines.length > 0 ? (
                    shipmentEditorAddressLines.map((line) => (
                      <div key={line}>{line}</div>
                    ))
                  ) : (
                    <div className="text-gray-500">{emptyRetailField}</div>
                  )}
                </div>
              </section>

              <section className="rounded-md bg-gray-50 p-4 ring-1 ring-gray-100">
                <div className="text-xs font-semibold uppercase text-gray-500">
                  {labels.stock.retailValue}
                </div>
                <div className="mt-2 text-3xl font-semibold text-gray-900">
                  {shipmentEditorTotal === null
                    ? emptyRetailField
                    : (formatPrice(
                        locale,
                        shipmentEditor.order.currency,
                        shipmentEditorTotal
                      ) ?? emptyRetailField)}
                </div>
                <div className="mt-4 text-xs font-semibold uppercase text-gray-500">
                  {labels.stock.organisation}
                </div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {shipmentEditor.order.organisationName}
                </div>
              </section>
            </div>

            <section>
              <h3 className="text-sm font-semibold text-gray-900">
                {labels.stock.orderItems}
              </h3>
              <div className="mt-3 overflow-x-auto rounded-md ring-1 ring-gray-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2">{labels.stock.product}</th>
                      <th className="px-3 py-2 text-right">
                        {labels.stock.quantity}
                      </th>
                      <th className="px-3 py-2 text-right">
                        {labels.stock.retailPrice}
                      </th>
                      <th className="px-3 py-2 text-right">
                        {labels.stock.lineTotal}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {shipmentEditorLines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2 font-medium text-gray-900">
                          {line.productTitle}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {line.quantityOrdered}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                          {line.retailPriceAmount === null
                            ? emptyRetailField
                            : (formatPrice(
                                locale,
                                shipmentEditor.order.currency,
                                line.retailPriceAmount
                              ) ?? emptyRetailField)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                          {line.retailPriceAmount === null
                            ? emptyRetailField
                            : (formatPrice(
                                locale,
                                shipmentEditor.order.currency,
                                line.retailPriceAmount * line.quantityOrdered
                              ) ?? emptyRetailField)}
                        </td>
                      </tr>
                    ))}
                    {shipmentEditorLines.length === 0 ? (
                      <tr>
                        <td
                          className="px-3 py-8 text-center text-sm text-gray-500"
                          colSpan={4}
                        >
                          {labels.stock.noItemsSelected}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <label className="flex items-start gap-3 rounded-md bg-[#F0FDF7] p-4 text-sm font-semibold text-gray-900 ring-1 ring-[#B7F2D8]">
              <input
                checked={shipmentEditor.draft.confirmedPacked}
                className="mt-0.5 size-4 rounded border-gray-300 text-[#1FA77A] focus:ring-[#1FA77A]"
                onChange={(event) =>
                  updateShipmentDraft({
                    confirmedPacked: event.target.checked
                  })
                }
                type="checkbox"
              />
              <span>
                Products are packed and ready to hand to the courier/customer.
              </span>
            </label>

            <section className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                Carrier
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  onChange={(event) => {
                    updateShipmentDraft({
                      carrierName: event.target.value || kexCarrierName
                    });
                  }}
                  value={shipmentCarrierSelectValue(
                    shipmentEditor.draft.carrierName
                  )}
                >
                  {shipmentCarrierOptions.map((carrier) => (
                    <option key={carrier} value={carrier}>
                      {carrier}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-100 sm:col-span-2">
                {shipmentLabelStatusText(shipmentEditor.order.shipment)}
              </div>
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                Tracking number
                <input
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  onChange={(event) =>
                    updateShipmentDraft({ trackingNumber: event.target.value })
                  }
                  placeholder="Optional"
                  value={shipmentEditor.draft.trackingNumber}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                Tracking URL
                <input
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  onChange={(event) =>
                    updateShipmentDraft({ trackingUrl: event.target.value })
                  }
                  placeholder="https://..."
                  type="url"
                  value={shipmentEditor.draft.trackingUrl}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500 sm:col-span-2">
                Shipment notes
                <textarea
                  className="min-h-24 rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  onChange={(event) =>
                    updateShipmentDraft({ shipmentNotes: event.target.value })
                  }
                  placeholder="Optional"
                  value={shipmentEditor.draft.shipmentNotes}
                />
              </label>
            </section>

            {error ? (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {error}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <AdminButton
              disabled={Boolean(busyId)}
              onClick={() => setShipmentEditor(null)}
              variant="secondary"
            >
              {labels.stock.cancel}
            </AdminButton>
            <AdminButton
              className="gap-2"
              disabled={Boolean(busyId)}
              onClick={() => void printOrRequestShipmentLabel()}
              variant="secondary"
            >
              <Truck aria-hidden="true" className="size-4" />
              {labels.stock.shippingLabel}
            </AdminButton>
            <AdminButton
              disabled={!canConfirmShipment}
              onClick={() => void bookPickupForCustomerOrder()}
              variant="secondary"
            >
              {labels.stock.bookPickup}
            </AdminButton>
            <AdminButton
              disabled={!canConfirmShipment}
              onClick={() => void shipCustomerOrder()}
            >
              Mark Shipped
            </AdminButton>
          </div>
        </AdminModal>
      ) : null}
      {movementPickerOpen ? (
        <AdminModal
          closeDisabled={Boolean(busyId)}
          closeLabel={labels.stock.cancel}
          onClose={() => setMovementPickerOpen(false)}
          size="xl"
          title={labels.stock.recordMovement}
        >
          <div className="space-y-4 px-6 py-5">
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              <input
                aria-label={labels.stock.search}
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                onChange={(event) => setStockSearch(event.target.value)}
                placeholder={labels.stock.search}
                type="search"
                value={stockSearch}
              />
            </label>
            <div className="max-h-[420px] overflow-y-auto rounded-md border border-gray-200">
              {rows.map((row) => (
                <button
                  className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-3 text-left last:border-b-0 hover:bg-[#F8FAFC]"
                  key={row.id}
                  onClick={() => {
                    setMovementPickerOpen(false);
                    openMovementEditor(row);
                  }}
                  type="button"
                >
                  <ProductThumbnail imageUrl={row.imageUrl} title={row.productTitle} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900">
                      {row.productTitle}
                    </span>
	                    <span className="mt-1 block truncate text-xs text-gray-500">
	                      {showOrganisationContext ? (
	                        <>{row.organisationName} · </>
	                      ) : null}
	                      {labels.stock.stockQuantity}:{" "}
	                      {row.stockQuantity}
	                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </AdminModal>
	      ) : null}

	      {customerOrderDraft ? (
        <AdminModal
          closeDisabled={Boolean(busyId)}
          closeLabel={labels.stock.cancel}
          onClose={() => setCustomerOrderDraft(null)}
          size="2xl"
          title={labels.stock.addCustomerOrder}
        >
          <div className="grid gap-5 px-6 py-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="space-y-4">
              <div className="inline-flex rounded-md bg-gray-100 p-1 text-sm font-semibold text-gray-600">
                {(["regional", "direct"] as const).map((mode) => (
                  <button
                    className={classNames(
                      customerOrderDraft.mode === mode
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900",
                      "rounded px-3 py-1.5"
                    )}
                    disabled={
                      Boolean(busyId) ||
                      (mode === "regional" && !data.canRouteRegionalCheckout)
                    }
                    key={mode}
                    onClick={() => updateCustomerOrderMode(mode)}
                    type="button"
                  >
                    {mode === "regional"
                      ? labels.stock.regionalCheckout
                      : labels.stock.directRetailer}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.stock.customer}
                  <input
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                    onChange={(event) =>
                      updateCustomerOrderDraft({
                        customerName: event.target.value
                      })
                    }
                    value={customerOrderDraft.customerName}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.access.email}
                  <input
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                    onChange={(event) =>
                      updateCustomerOrderDraft({
                        customerEmail: event.target.value
                      })
                    }
                    type="email"
                    value={customerOrderDraft.customerEmail}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.stock.dueAt}
                  <input
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                    onChange={(event) =>
                      updateCustomerOrderDraft({ dueAt: event.target.value })
                    }
                    type="date"
                    value={customerOrderDraft.dueAt}
                  />
                </label>
                {customerOrderDraft.mode === "regional" ? (
                  <label className="grid gap-1 text-xs font-semibold text-gray-500">
                    {labels.stock.shippingCountry}
                    <select
                      className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                      disabled={Boolean(busyId)}
                      onChange={(event) =>
                        updateCustomerOrderDraft({
                          shippingCountry: event.target.value
                        })
                      }
                      value={customerOrderDraft.shippingCountry}
                    >
                      {productCountryOptions.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : showOrganisationContext ? (
                  <label className="grid gap-1 text-xs font-semibold text-gray-500">
                    {labels.stock.organisation}
                    <select
                      className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                      disabled={Boolean(busyId)}
                      onChange={(event) =>
                        updateCustomerOrderOrganisation(event.target.value)
                      }
                      value={customerOrderDraft.organisationId}
                    >
                      {data.organisations.map((organisation) => (
                        <option key={organisation.id} value={organisation.id}>
                          {organisation.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              {customerOrderDraft.mode === "regional" ? (
                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-500">
                    {labels.stock.routingPreference}
                  </div>
                  <div className="inline-flex rounded-md bg-gray-100 p-1 text-sm font-semibold text-gray-600">
                    {(["fastest_delivery", "cheapest_price"] as const).map(
                      (preference) => (
                        <button
                          className={classNames(
                            customerOrderDraft.routingPreference === preference
                              ? "bg-white text-gray-900 shadow-sm"
                              : "text-gray-600 hover:text-gray-900",
                            "rounded px-3 py-1.5"
                          )}
                          disabled={Boolean(busyId)}
                          key={preference}
                          onClick={() =>
                            updateCustomerOrderDraft({
                              routingPreference: preference
                            })
                          }
                          type="button"
                        >
                          {preference === "fastest_delivery"
                            ? labels.stock.fastestDelivery
                            : labels.stock.cheapestPrice}
                        </button>
                      )
                    )}
                  </div>
                </div>
              ) : null}

              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                <input
                  aria-label={labels.stock.search}
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder={labels.stock.search}
                  type="search"
                  value={productSearch}
                />
              </label>

              <div className="max-h-[360px] overflow-y-auto rounded-md bg-[#F8FAFC] p-2 ring-1 ring-gray-200">
                <div className="grid gap-2">
                  {customerOrderProductOptions.map((product) => (
                    <button
                      className="flex w-full items-center gap-3 rounded-md bg-white p-2 text-left ring-1 ring-gray-200 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
                      disabled={Boolean(busyId)}
                      key={product.id}
                      onClick={() => addCustomerOrderLine(product)}
                      type="button"
                    >
                      <ProductThumbnail
                        imageUrl={product.imageUrl}
                        title={product.title}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-gray-900">
                          {product.title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-gray-500">
                          {[product.brandName, product.productKind]
                            .filter(Boolean)
                            .join(" - ")}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                        {labels.stock.addItem}
                      </span>
                    </button>
                  ))}
                  {customerOrderProductOptions.length === 0 ? (
                    <div className="rounded-md bg-white px-3 py-8 text-center text-sm text-gray-500 ring-1 ring-gray-200">
                      {labels.stock.noProductMatches}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-3">
                <h3
                  className={classNames(
                    "text-sm font-semibold text-gray-900",
                    adminLocaleTextClass(locale, "heading")
                  )}
                >
                  {labels.stock.basketLines}
                </h3>
                <div className="max-h-[420px] space-y-2 overflow-y-auto">
                  {customerOrderDraft.lines.map((line) => {
                    const product = productOptionById.get(line.productId);
                    const availabilityLine =
                      customerOrderAvailability?.lines.find(
                        (item) => item.productId === line.productId
                      ) ?? null;

                    return (
                      <div
                        className="rounded-md bg-white p-3 ring-1 ring-gray-200"
                        key={line.id}
                      >
                        <div className="flex items-start gap-3">
                          <ProductThumbnail
                            imageUrl={product?.imageUrl ?? null}
                            title={product?.title ?? labels.stock.product}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-gray-900">
                              {product?.title ?? labels.stock.product}
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <StockNumberInput
                                disabled={Boolean(busyId)}
                                label={labels.stock.quantity}
                                onChange={(value) =>
                                  updateCustomerOrderLine(line.id, {
                                    quantityOrdered: value
                                  })
                                }
                                value={line.quantityOrdered}
                              />
                            </div>
                            {availabilityLine ? (
                              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                <span
                                  className={classNames(
                                    availabilityLine.payable
                                      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                                      : "bg-red-50 text-red-700 ring-red-100",
                                    "inline-flex rounded-md px-2 py-1 font-semibold ring-1"
                                  )}
                                >
                                  {availabilityLine.payable
                                    ? labels.stock.payable
                                    : labels.stock.unavailable}
                                </span>
                                <span className="text-gray-500">
                                  {availabilityLine.reason}
                                </span>
                              </div>
                            ) : null}
                          </div>
                          <AdminButton
                            disabled={Boolean(busyId)}
                            onClick={() => removeCustomerOrderLine(line.id)}
                            variant="secondary"
                          >
                            {labels.stock.removeItem}
                          </AdminButton>
                        </div>
                      </div>
                    );
                  })}
                  {customerOrderDraft.lines.length === 0 ? (
                    <div className="rounded-md bg-[#F8FAFC] px-3 py-10 text-center text-sm text-gray-500 ring-1 ring-gray-200">
                      {labels.stock.noItemsSelected}
                    </div>
                  ) : null}
                </div>
              </div>

              {customerOrderDraft.mode === "regional" ? (
                <div className="rounded-md bg-[#F8FAFC] p-4 ring-1 ring-gray-200">
                  <div className="text-xs font-semibold text-gray-500">
                    {labels.stock.selectedRetailer}
                  </div>
                  {customerOrderAvailabilityLoading ? (
                    <div className="mt-2 text-sm text-gray-600">
                      {labels.stock.availability}
                    </div>
                  ) : customerOrderAvailability?.selectedRetailer ? (
                    <div className="mt-2">
                      <div className="text-sm font-semibold text-gray-900">
                        {customerOrderAvailability.selectedRetailer.organisationName}
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        {formatPrice(
                          locale,
                          customerOrderAvailability.currency ?? "THB",
                          customerOrderAvailability.subtotalAmount
                        ) ?? emptyRetailField}
                        {" · "}
                        {customerOrderAvailability.etaDate
                          ? formatDate(customerOrderAvailability.etaDate, locale)
                          : emptyRetailField}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-gray-600">
                      {labels.stock.unavailable}
                    </div>
                  )}
                </div>
              ) : null}

              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.stock.notes}
                <textarea
                  className="min-h-20 rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  onChange={(event) =>
                    updateCustomerOrderDraft({ notes: event.target.value })
                  }
                  value={customerOrderDraft.notes}
                />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <AdminButton
              disabled={Boolean(busyId)}
              onClick={() => setCustomerOrderDraft(null)}
              variant="secondary"
            >
              {labels.stock.cancel}
            </AdminButton>
            <AdminButton disabled={!canSaveCustomerOrder} onClick={saveCustomerOrder}>
              {labels.stock.save}
            </AdminButton>
          </div>
        </AdminModal>
      ) : null}

      {editor ? (
        <AdminModal
          closeDisabled={Boolean(busyId)}
          closeLabel={labels.stock.cancel}
          onClose={() => setEditor(null)}
          size="2xl"
          title={
            editor.mode === "add" ? labels.stock.addProduct : labels.stock.editStock
          }
        >
          <div className="grid gap-6 px-6 py-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <div className="space-y-4">
              {editor.mode === "add" ? (
                <>
                  {data.canFilterOrganisation ? (
                    <label className="grid gap-1 text-xs font-semibold text-gray-500">
                      {labels.stock.organisation}
                      <select
                        className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                        disabled={editorDisabled}
                        onChange={(event) =>
                          updateEditorOrganisation(event.target.value)
                        }
                        value={editor.organisationId}
                      >
                        {data.organisations.map((organisation) => (
                          <option key={organisation.id} value={organisation.id}>
                            {organisation.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <label className="grid gap-1 text-xs font-semibold text-gray-500">
                    <input
                      aria-label={labels.stock.search}
                      className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                      disabled={editorDisabled}
                      onChange={(event) => setProductSearch(event.target.value)}
                      placeholder={labels.stock.search}
                      type="search"
                      value={productSearch}
                    />
                  </label>

                  <div className="max-h-[480px] overflow-y-auto rounded-md border border-gray-200">
                    {availableProducts.map((product) => {
                      const selected = editor.product?.id === product.id;

                      return (
                        <button
                          className={classNames(
                            "flex w-full items-center gap-3 border-b border-gray-100 px-3 py-3 text-left transition last:border-b-0 hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1FA77A]",
                            selected && "bg-[#ECFDF5]"
                          )}
                          disabled={editorDisabled}
                          key={product.id}
                          onClick={() => updateEditorProduct(product)}
                          type="button"
                        >
                          <ProductThumbnail
                            imageUrl={product.imageUrl}
                            title={product.title}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-gray-900">
                              {product.title}
                            </span>
                            <span className="mt-1 block truncate text-xs text-gray-500">
                              {[product.brandName, product.productKind]
                                .filter(Boolean)
                                .join(" - ")}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {availableProducts.length === 0 ? (
                      <div className="px-3 py-8 text-center text-sm text-gray-500">
                        {labels.stock.noProductMatches}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : editorProduct ? (
                <div className="flex items-center gap-4 rounded-md bg-[#F8FAFC] p-4 ring-1 ring-gray-200">
                  <ProductThumbnail
                    imageUrl={editorProduct.imageUrl}
                    title={editorProduct.title}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {editorProduct.title}
                    </div>
                    <div className="mt-1 truncate text-xs text-gray-500">
                      {[editorProduct.brandName, editorProduct.productKind]
                        .filter(Boolean)
                        .join(" - ")}
                    </div>
	                    {showOrganisationContext ? (
	                      <div className="mt-2 text-xs font-semibold text-gray-500">
	                        {editor.row.organisationName}
	                      </div>
	                    ) : null}
	                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <h3
                  className={classNames(
                    "text-sm font-semibold text-gray-900",
                    adminLocaleTextClass(locale, "heading")
                  )}
                >
                  {labels.stock.stockDetails}
                </h3>
                <label className="mt-2 grid max-w-40 gap-1 text-xs font-semibold text-gray-500">
                  {labels.stock.currency}
                  <select
                    className="rounded-md bg-gray-50 px-3 py-2 text-sm font-normal text-gray-700 ring-1 ring-inset ring-gray-200"
                    disabled={true}
                    value={editorCurrency}
                  >
                    {supportedOrganisationCurrencies.some(
                      (currency) => currency === editorCurrency
                    ) ? null : (
                      <option value={editorCurrency}>{editorCurrency}</option>
                    )}
                    {supportedOrganisationCurrencies.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {editorProduct ? (
                <div className="flex items-center gap-3 rounded-md bg-white p-3 ring-1 ring-gray-200 lg:hidden">
                  <ProductThumbnail
                    imageUrl={editorProduct.imageUrl}
                    title={editorProduct.title}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {editorProduct.title}
                    </div>
                    <div className="mt-1 truncate text-xs text-gray-500">
                      {[editorProduct.brandName, editorProduct.productKind]
                        .filter(Boolean)
                        .join(" - ")}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <StockNumberInput
                  disabled={editorDisabled}
                  label={labels.stock.stockQuantity}
                  onChange={(value) => updateEditorDraft({ stockQuantity: value })}
                  value={editor.draft.stockQuantity}
                />
                <StockNumberInput
                  disabled={editorDisabled}
                  label={labels.stock.leadTimeDays}
                  onChange={(value) => updateEditorDraft({ leadTimeDays: value })}
                  value={editor.draft.leadTimeDays}
                />
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.stock.backorderPolicy}
                  <select
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                    disabled={editorDisabled}
                    onChange={(event) =>
                      updateEditorDraft({
                        backorderPolicy: event.target.value as BackorderPolicy
                      })
                    }
                    value={editor.draft.backorderPolicy}
                  >
                    <option value="allow">{labels.stock.backorderAllowed}</option>
                    <option value="deny">{labels.stock.backorderDisabled}</option>
                  </select>
                </label>
                <StockNumberInput
                  disabled={editorDisabled}
                  label={`${labels.stock.wholesalePrice} (${editorCurrency})`}
                  onChange={(value) =>
                    updateEditorDraft({ wholesalePriceAmount: value })
                  }
                  step="0.01"
                  value={editor.draft.wholesalePriceAmount}
                />
                <StockNumberInput
                  disabled={editorDisabled}
                  label={`${labels.stock.priceOverride} (${editorCurrency})`}
                  onChange={(value) =>
                    updateEditorDraft({ retailPriceAmount: value })
                  }
                  step="0.01"
                  value={editor.draft.retailPriceAmount}
                />
              </div>

              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.stock.status}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                  disabled={editorDisabled}
                  onChange={(event) =>
                    updateEditorDraft({
                      status: event.target.value as RetailStockStatus
                    })
                  }
                  value={editor.draft.status}
                >
                  {(["active", "disabled", "deleted"] as const).map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(labels, status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.stock.notes}
                <textarea
                  className="min-h-24 rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                  disabled={editorDisabled}
                  onChange={(event) => updateEditorDraft({ notes: event.target.value })}
                  value={editor.draft.notes}
                />
              </label>

              {error ? (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <AdminButton
              disabled={Boolean(busyId)}
              onClick={() => setEditor(null)}
              variant="secondary"
            >
              {labels.stock.cancel}
            </AdminButton>
            {data.canWrite ? (
              <AdminButton disabled={!canSaveEditor} onClick={saveEditor}>
                {labels.stock.save}
              </AdminButton>
            ) : null}
          </div>
        </AdminModal>
      ) : null}

      {movementEditor ? (
        <AdminModal
          closeDisabled={Boolean(busyId)}
          closeLabel={labels.stock.cancel}
          onClose={() => setMovementEditor(null)}
          size="xl"
          title={
            movementEditor.mode === "record"
              ? labels.stock.recordMovement
              : labels.stock.voidMovement
          }
        >
          <div className="space-y-5 px-6 py-5">
            {movementEditor.mode === "record" ? (
              <>
                <div className="rounded-md bg-[#F8FAFC] p-4 ring-1 ring-gray-200">
	                  <div className="text-sm font-semibold text-gray-900">
	                    {movementEditor.row.productTitle}
	                  </div>
	                  <div className="mt-1 text-xs text-gray-500">
	                    {showOrganisationContext ? (
	                      <>{movementEditor.row.organisationName} - </>
	                    ) : null}
	                    {labels.stock.stockQuantity}:{" "}
	                    {movementEditor.row.stockQuantity}
	                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-gray-500">
                    {labels.stock.movementType}
                    <select
                      className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                      disabled={Boolean(busyId)}
                      onChange={(event) =>
                        updateMovementDraft({
                          movementType: event.target.value as Exclude<
                            RetailStockMovementType,
                            "void"
                          >
                        })
                      }
                      value={movementEditor.draft.movementType}
                    >
                      {(
                        [
                          "receive",
                          "adjustment",
                          "return",
                          "sale",
                          "transfer_in",
                          "transfer_out",
                          "expiry_write_off"
                        ] as const
                      ).map((type) => (
                        <option key={type} value={type}>
                          {movementLabel(labels, type)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <StockNumberInput
                    disabled={Boolean(busyId)}
                    label={labels.stock.quantity}
                    min={
                      movementEditor.draft.movementType === "adjustment"
                        ? -999999
                        : 1
                    }
                    onChange={(value) => updateMovementDraft({ quantity: value })}
                    value={movementEditor.draft.quantity}
                  />
                  <StockNumberInput
                    disabled={Boolean(busyId)}
                    label={`${labels.stock.unitCost} (${movementEditor.row.currency})`}
                    onChange={(value) =>
                      updateMovementDraft({ unitCostAmount: value })
                    }
                    step="0.01"
                    value={movementEditor.draft.unitCostAmount}
                  />
                </div>

                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.stock.expiresAt}
                  <input
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                    disabled={Boolean(busyId)}
                    onChange={(event) =>
                      updateMovementDraft({ expiresAt: event.target.value })
                    }
                    type="date"
                    value={movementEditor.draft.expiresAt}
                  />
                </label>

                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.stock.reason}
                  <input
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                    disabled={Boolean(busyId)}
                    onChange={(event) =>
                      updateMovementDraft({ reason: event.target.value })
                    }
                    value={movementEditor.draft.reason}
                  />
                </label>

                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.stock.notes}
                  <textarea
                    className="min-h-20 rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                    disabled={Boolean(busyId)}
                    onChange={(event) =>
                      updateMovementDraft({ notes: event.target.value })
                    }
                    value={movementEditor.draft.notes}
                  />
                </label>
              </>
            ) : (
              <>
                <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-100">
                  {movementEditor.movement.productTitle} -{" "}
                  {movementLabel(labels, movementEditor.movement.movementType)} -{" "}
                  {movementEditor.movement.quantityDelta > 0 ? "+" : ""}
                  {movementEditor.movement.quantityDelta}
                </div>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.stock.reason}
                  <input
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                    disabled={Boolean(busyId)}
                    onChange={(event) =>
                      updateVoidDraft({ reason: event.target.value })
                    }
                    value={movementEditor.draft.reason}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.stock.notes}
                  <textarea
                    className="min-h-20 rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                    disabled={Boolean(busyId)}
                    onChange={(event) =>
                      updateVoidDraft({ notes: event.target.value })
                    }
                    value={movementEditor.draft.notes}
                  />
                </label>
              </>
            )}

            {error ? (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <AdminButton
              disabled={Boolean(busyId)}
              onClick={() => setMovementEditor(null)}
              variant="secondary"
            >
              {labels.stock.cancel}
            </AdminButton>
            <AdminButton disabled={!canSaveMovement} onClick={saveMovementEditor}>
              {movementEditor.mode === "record"
                ? labels.stock.recordMovement
                : labels.stock.voidMovement}
            </AdminButton>
          </div>
        </AdminModal>
      ) : null}
    </div>
  );
}
