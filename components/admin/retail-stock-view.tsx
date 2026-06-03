"use client";

/* eslint-disable @next/next/no-img-element -- Admin catalogue thumbnails use remote retailer images that are not all in the Next image allowlist. */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import type {
  AdminRetailCustomerOrder,
  AdminRetailOperationsTask,
  AdminRetailStockData,
  AdminRetailStockMovement,
  AdminRetailStockProductOption,
  AdminRetailStockRow,
  RetailPurchaseOrderShortfallResolution,
  RetailPurchaseOrderStatus,
  RetailStockMovementType,
  RetailStockStatus
} from "@/lib/admin-retail-stock";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type { AdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import type { Locale } from "@/lib/i18n";
import type {
  BackorderPolicy,
  RegionalBasketAvailability,
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
  BusinessStatsGrid,
  adminHref,
  adminLocaleTextClass,
  businessMetricColors,
  classNames,
  formatGeneratedAt,
  formatNumber,
  readableToken,
  taskStatusClass,
  taskValueClass,
  taskValueLabel,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { AdminButton, AdminIconButton, AdminModal } from "@/components/admin/ui";

type StockResponse = Readonly<{
  data?: AdminRetailStockData;
  error?: string;
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

type RetailStockPanel =
  | "audit"
  | "customer-orders"
  | "fulfillment"
  | "insights"
  | "list"
  | "movements"
  | "purchase-orders"
  | "receiving"
  | "reorder"
  | "tasks";

type RetailTaskFilter =
  | "claimed"
  | "all"
  | "completed"
  | "processing"
  | "unclaimed";

type RetailPurchaseOrderFilter = RetailPurchaseOrderStatus | "all";

type RetailStockFilter =
  | "all"
  | "in_stock"
  | "low_stock"
  | "out_of_stock";

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

type PurchaseOrderLineDraft = Readonly<{
  expectedExpiresAt: string;
  notes: string;
  productId: string;
  quantityOrdered: string;
  wholesalePriceAmount: string;
}>;

type PurchaseOrderDraft = Readonly<{
  expectedAt: string;
  lines: PurchaseOrderLineDraft[];
  mode: "existing" | "new";
  notes: string;
  organisationId: string;
  sourceTaskId: string;
  supplierContact: string;
  supplierName: string;
  targetPurchaseOrderId: string;
}>;

type ReorderPurchaseItem = Readonly<{
  adviceId: string | null;
  draftPoUnits: number;
  incomingUnits: number;
  organisationId: string;
  productId: string;
  productTitle: string;
  reorderKind: "advisory" | "required";
  suggestedOrderQuantity: number;
  unorderedNeedUnits: number;
  wholesalePriceAmount: number | null;
}>;

type ShoppingListLineDraft = Readonly<{
  availabilityStatus: "available" | "not_available" | "partial" | "unknown";
  currentStockQuantity: string;
  id: string;
  notes: string;
  productId: string;
  productTitle: string;
  purchasedQuantity: string;
  requiredQuantity: string;
  retailPriceAmount: string;
  suggestedQuantity: string;
  unorderedNeedQuantity: string;
  wholesalePriceAmount: string;
  wholesalerTried: string;
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

type ReceiveLineDraft = Readonly<{
  lineId: string;
  productId: string;
  productTitle: string;
  quantityClosedShort: number;
  quantityOrdered: number;
  quantityReceived: number;
  receiveQuantity: string;
  remaining: number;
  shortfallExpectedAt: string;
  shortfallReference: string;
  shortfallResolution: RetailPurchaseOrderShortfallResolution;
}>;

type ReceiveEditor = Readonly<{
  lines: ReceiveLineDraft[];
  notes: string;
  order: AdminRetailStockData["purchaseOrders"][number];
  purchaseOrderId: string;
}>;

const emptyDraft: StockDraft = {
  backorderPolicy: "allow",
  leadTimeDays: "0",
  notes: "",
  retailPriceAmount: "",
  status: "active",
  stockQuantity: "0",
  wholesalePriceAmount: ""
};

const emptyMovementDraft: MovementDraft = {
  expiresAt: "",
  movementType: "receive",
  notes: "",
  quantity: "1",
  reason: "",
  unitCostAmount: ""
};

const emptyPurchaseOrderDraft: PurchaseOrderDraft = {
  expectedAt: "",
  lines: [],
  mode: "new",
  notes: "",
  organisationId: "",
  sourceTaskId: "",
  supplierContact: "",
  supplierName: "",
  targetPurchaseOrderId: ""
};

const emptyCustomerOrderDraft: CustomerOrderDraft = {
  customerEmail: "",
  customerName: "",
  dueAt: "",
  lines: [],
  mode: "direct",
  notes: "",
  organisationId: "",
  routingPreference: "fastest_delivery",
  shippingCountry: "TH"
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

function validReceiveQuantity(line: ReceiveLineDraft, quantity: number | null) {
  return (
    quantity !== null &&
    Number.isInteger(quantity) &&
    quantity >= 0 &&
    quantity <= line.remaining
  );
}

function receiveLineHasAction(line: ReceiveLineDraft) {
  const quantity = numberOrNull(line.receiveQuantity);
  const receiveQuantity = quantity ?? 0;
  const shortfallAfterReceive = Math.max(0, line.remaining - receiveQuantity);
  const hasShortfallDecision =
    shortfallAfterReceive > 0 &&
    (receiveQuantity > 0 ||
      line.shortfallResolution !== "supplier_backorder" ||
      line.shortfallReference.trim() !== "" ||
      line.shortfallExpectedAt.trim() !== "");

  return (quantity !== null && quantity > 0) || hasShortfallDecision;
}

function receiveLineRemaining(line: AdminRetailStockData["purchaseOrderLines"][number]) {
  return Math.max(
    0,
    line.openUnits ?? line.quantityOrdered - line.quantityReceived - line.quantityClosedShort
  );
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

function purchaseOrderStatusLabel(
  labels: AdminContent,
  status: RetailPurchaseOrderStatus
) {
  const labelsByStatus: Record<RetailPurchaseOrderStatus, string> = {
    cancelled: labels.stock.purchaseOrderStatusVoid,
    closed: labels.stock.purchaseOrderStatusClosed,
    draft: labels.stock.purchaseOrderStatusDraft,
    ordered: labels.stock.purchaseOrderStatusOrdered,
    partially_received: labels.stock.purchaseOrderStatusPartial,
    received: labels.stock.purchaseOrderStatusReceived
  };

  return labelsByStatus[status];
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

function riskLabel(
  labels: AdminContent,
  risk: AdminRetailStockData["reorderAdvice"][number]["riskLevel"]
) {
  if (risk === "out_of_stock") {
    return labels.stock.riskOutOfStock;
  }

  if (risk === "reorder") {
    return labels.stock.riskReorder;
  }

  if (risk === "watch") {
    return labels.stock.riskWatch;
  }

  return labels.stock.riskOk;
}

function retailTaskStatusLabel(status: string, labels: AdminContent) {
  if (status === "reserved" || status === "running") {
    return labels.visibility.active;
  }

  if (status === "queued") {
    return labels.visibility.queued;
  }

  if (status === "completed") {
    return labels.visibility.completed;
  }

  if (status === "failed") {
    return labels.visibility.failed;
  }

  return readableToken(status);
}

function purchaseOrderStatusColor(status: RetailPurchaseOrderStatus) {
  const colors: Record<RetailPurchaseOrderStatus, string> = {
    cancelled: businessMetricColors.failed,
    closed: businessMetricColors.medium,
    draft: businessMetricColors.contentDraft,
    ordered: businessMetricColors.queued,
    partially_received: businessMetricColors.medium,
    received: businessMetricColors.succeeded
  };

  return colors[status];
}

function shortfallResolutionLabel(
  labels: AdminContent,
  resolution: RetailPurchaseOrderShortfallResolution
) {
  const labelsByResolution: Record<RetailPurchaseOrderShortfallResolution, string> = {
    close_short: labels.stock.closeShort,
    damaged_rejected: labels.stock.damagedRejected,
    replacement_shipment: labels.stock.replacementShipment,
    supplier_backorder: labels.stock.supplierBackorder,
    supplier_credit: labels.stock.supplierCredit,
    supplier_refund: labels.stock.supplierRefund
  };

  return labelsByResolution[resolution];
}

function taskCanBuildDraftPo(task: AdminRetailOperationsTask) {
  return (
    (task.taskType === "retail_stock_reorder_review" ||
      task.taskType === "retail_stock_low_stock_review") &&
    (task.pipeline?.unorderedNeedUnits ?? 0) > 0
  );
}

function orgProductKey(organisationId: string, productId: string | null | undefined) {
  return `${organisationId}:${productId ?? "unknown"}`;
}

function customerOrderRetailValue(order: AdminRetailCustomerOrder) {
  return order.pricingSnapshot?.totalAmount ?? order.totalRetailAmount;
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

function auditDetailText(details: Record<string, unknown>) {
  const entries = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4);

  if (entries.length === 0) {
    return "";
  }

  return entries
    .map(([key, value]) => {
      const normalizedValue =
        typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);

      return `${readableToken(key)}: ${normalizedValue}`;
    })
    .join(" · ");
}

function panelFromView(view: AdminDashboardView): RetailStockPanel {
  if (view === "retail-task-queue") {
    return "tasks";
  }

  if (view === "retail-audit") {
    return "audit";
  }

  if (view === "retail-purchase-orders") {
    return "purchase-orders";
  }

  if (view === "retail-receiving") {
    return "receiving";
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

  if (view === "retail-reorder") {
    return "reorder";
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

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  const normalized = text.replace(/\r?\n/g, " ");

  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }

  return normalized;
}

function downloadStockCsv(
  rows: AdminRetailStockRow[],
  labels: AdminContent,
  includeOrganisation: boolean
) {
  const columns = [
    {
      label: labels.stock.product,
      value: (row: AdminRetailStockRow) => row.productTitle
    },
    ...(includeOrganisation
      ? [
          {
            label: labels.stock.organisation,
            value: (row: AdminRetailStockRow) => row.organisationName
          }
        ]
      : []),
    {
      label: labels.stock.stockQuantity,
      value: (row: AdminRetailStockRow) => row.stockQuantity
    },
    {
      label: labels.stock.retailPrice,
      value: (row: AdminRetailStockRow) => row.retailPriceAmount
    },
    {
      label: labels.stock.wholesalePrice,
      value: (row: AdminRetailStockRow) => row.wholesalePriceAmount
    },
    {
      label: labels.stock.currency,
      value: (row: AdminRetailStockRow) => row.currency
    },
    {
      label: labels.stock.leadTimeDays,
      value: (row: AdminRetailStockRow) => row.leadTimeDays
    },
    {
      label: labels.stock.backorderPolicy,
      value: (row: AdminRetailStockRow) =>
        backorderPolicyLabel(labels, row.backorderPolicy)
    },
    {
      label: labels.stock.status,
      value: (row: AdminRetailStockRow) => statusLabel(labels, row.status)
    },
    {
      label: labels.stock.updated,
      value: (row: AdminRetailStockRow) => row.updatedAt
    },
    {
      label: labels.stock.notes,
      value: (row: AdminRetailStockRow) => row.notes
    }
  ];
  const csv = [
    columns.map((column) => csvCell(column.label)).join(","),
    ...rows.map((row) =>
      columns.map((column) => csvCell(column.value(row))).join(",")
    )
  ].join("\n");
  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `retail-stock-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  cells.push(current);

  return cells;
}

function downloadShoppingListCsv(
  listNumber: string,
  lines: readonly ShoppingListLineDraft[]
) {
  const columns = [
    "productId",
    "productTitle",
    "requiredQuantity",
    "currentStock",
    "unorderedNeed",
    "suggestedQuantity",
    "wholesalerTried",
    "availabilityStatus",
    "purchasedQuantity",
    "wholesalePrice",
    "retailPriceOverride",
    "notes"
  ];
  const csv = [
    columns.join(","),
    ...lines.map((line) =>
      [
        line.productId,
        line.productTitle,
        line.requiredQuantity,
        line.currentStockQuantity,
        line.unorderedNeedQuantity,
        line.suggestedQuantity,
        line.wholesalerTried,
        line.availabilityStatus,
        line.purchasedQuantity,
        line.wholesalePriceAmount,
        line.retailPriceAmount,
        line.notes
      ].map(csvCell).join(",")
    )
  ].join("\n");
  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${listNumber || "shopping-list"}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  const [selectedOrganisationId, setSelectedOrganisationId] = useState("all");
  const [stockSearch, setStockSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedStockFilter, setSelectedStockFilter] =
    useState<RetailStockFilter>("all");
  const [selectedTaskFilter, setSelectedTaskFilter] =
    useState<RetailTaskFilter>("all");
  const [selectedPurchaseOrderFilter, setSelectedPurchaseOrderFilter] =
    useState<RetailPurchaseOrderFilter>("all");
  const [
    selectedOutstandingPurchaseKeys,
    setSelectedOutstandingPurchaseKeys
  ] = useState<string[] | null>(null);
  const [editor, setEditor] = useState<StockEditor | null>(null);
  const [movementEditor, setMovementEditor] = useState<MovementEditor | null>(null);
  const [movementPickerOpen, setMovementPickerOpen] = useState(false);
  const [purchaseOrderDraft, setPurchaseOrderDraft] =
    useState<PurchaseOrderDraft | null>(null);
  const [purchaseOrderDetailId, setPurchaseOrderDetailId] = useState("");
  const [shoppingListDraftLines, setShoppingListDraftLines] = useState<
    ShoppingListLineDraft[]
  >([]);
  const [restockingAdviceDetailId, setRestockingAdviceDetailId] = useState("");
  const [taskDetailId, setTaskDetailId] = useState("");
  const [customerOrderDraft, setCustomerOrderDraft] =
    useState<CustomerOrderDraft | null>(null);
  const [customerOrderAvailability, setCustomerOrderAvailability] =
    useState<RegionalBasketAvailability | null>(null);
  const [customerOrderAvailabilityLoading, setCustomerOrderAvailabilityLoading] =
    useState(false);
  const [receiveEditor, setReceiveEditor] = useState<ReceiveEditor | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const panel = panelFromView(view);
  const showOrganisationContext = data.canFilterOrganisation;

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

  const organisationTaskRows = useMemo(
    () =>
      data.tasks.filter((task) =>
        selectedOrganisationId === "all"
          ? true
          : task.organisationId === selectedOrganisationId
      ),
    [data.tasks, selectedOrganisationId]
  );
  const taskRows = useMemo(
    () => {
      const filteredTasks = organisationTaskRows.filter((task) => {
        if (selectedTaskFilter === "claimed") {
          return !task.isAgentTask && taskIsClaimed(task);
        }

        if (selectedTaskFilter === "processing") {
          return (
            !task.isAgentTask &&
            (task.status === "reserved" || task.status === "running")
          );
        }

        if (selectedTaskFilter === "completed") {
          return !task.isAgentTask && task.status === "completed";
        }

        if (selectedTaskFilter === "unclaimed") {
          return (
            !task.isAgentTask &&
            !taskIsClaimed(task) &&
            task.status !== "completed"
          );
        }

        return task.status !== "completed";
      });

      return selectedTaskFilter === "all"
        ? filteredTasks.sort(
            (left, right) => Number(left.isAgentTask) - Number(right.isAgentTask)
          )
        : filteredTasks;
    },
    [organisationTaskRows, selectedTaskFilter]
  );

  const purchaseOrderLinesByOrderId = useMemo(() => {
    const linesByOrderId = new Map<
      string,
      AdminRetailStockData["purchaseOrderLines"]
    >();

    for (const line of data.purchaseOrderLines) {
      const lines = linesByOrderId.get(line.purchaseOrderId) ?? [];

      lines.push(line);
      linesByOrderId.set(line.purchaseOrderId, lines);
    }

    return linesByOrderId;
  }, [data.purchaseOrderLines]);

  const organisationPurchaseOrderRows = useMemo(
    () =>
      data.purchaseOrders.filter((order) =>
        selectedOrganisationId === "all"
          ? true
          : order.organisationId === selectedOrganisationId
      ),
    [data.purchaseOrders, selectedOrganisationId]
  );
  const searchedPurchaseOrderRows = useMemo(
    () =>
      organisationPurchaseOrderRows.filter((order) => {
        const orderLines = purchaseOrderLinesByOrderId.get(order.id) ?? [];

        return searchMatches(stockSearch, [
          order.poNumber,
          order.supplierName,
          order.supplierContact,
          order.organisationName,
          order.notes,
          purchaseOrderStatusLabel(labels, order.status),
          ...orderLines.flatMap((line) => [line.productTitle, line.notes])
        ]);
      }),
    [labels, organisationPurchaseOrderRows, purchaseOrderLinesByOrderId, stockSearch]
  );
  const purchaseOrderRows = useMemo(
    () =>
      searchedPurchaseOrderRows.filter(
        (order) =>
          selectedPurchaseOrderFilter === "all"
            ? order.status !== "cancelled" && order.status !== "closed"
            : order.status === selectedPurchaseOrderFilter
      ),
    [searchedPurchaseOrderRows, selectedPurchaseOrderFilter]
  );

  const receivingRows = useMemo(() => {
    const openPurchaseOrderIds = new Set(
      organisationPurchaseOrderRows
        .filter((order) =>
          order.status === "ordered" || order.status === "partially_received"
        )
        .map((order) => order.id)
    );

    return data.purchaseOrderLines.filter(
      (line) =>
        openPurchaseOrderIds.has(line.purchaseOrderId) &&
        receiveLineRemaining(line) > 0
    );
  }, [data.purchaseOrderLines, organisationPurchaseOrderRows]);
  const receivingGroups = useMemo(() => {
    const linesByPurchaseOrderId = new Map<
      string,
      AdminRetailStockData["purchaseOrderLines"]
    >();

    for (const line of receivingRows) {
      const lines = linesByPurchaseOrderId.get(line.purchaseOrderId) ?? [];

      lines.push(line);
      linesByPurchaseOrderId.set(line.purchaseOrderId, lines);
    }

    return organisationPurchaseOrderRows.flatMap((order) => {
      const lines = linesByPurchaseOrderId.get(order.id) ?? [];

      if (lines.length === 0) {
        return [];
      }

      const orderMatchesSearch = searchMatches(stockSearch, [
        order.poNumber,
        order.supplierName,
        order.organisationName,
        order.status
      ]);
      const filteredLines = orderMatchesSearch
        ? lines
        : lines.filter((line) =>
            searchMatches(stockSearch, [
              line.productTitle,
              line.notes,
              String(line.quantityOrdered),
              String(line.quantityReceived)
            ])
          );

      if (filteredLines.length === 0) {
        return [];
      }

      return [
        {
          lines: filteredLines,
          order
        }
      ];
    });
  }, [organisationPurchaseOrderRows, receivingRows, stockSearch]);

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

  const customerOrderRows = useMemo(
    () =>
      data.customerOrders
        .filter((order) =>
          selectedOrganisationId === "all"
            ? true
            : order.organisationId === selectedOrganisationId
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
    [customerOrderLinesByOrderId, data.customerOrders, selectedOrganisationId, stockSearch]
  );
  const customerOrderValueCurrency =
    Array.from(new Set(customerOrderRows.map((order) => order.currency)))
      .length === 1
      ? customerOrderRows[0]?.currency ?? null
      : null;
  const customerOrderRetailValueHeader = customerOrderValueCurrency
    ? `${labels.stock.retailValue} (${customerOrderValueCurrency})`
    : labels.stock.retailValue;
  const auditRows = useMemo(
    () =>
      data.auditEvents.filter((event) => {
        if (
          selectedOrganisationId !== "all" &&
          event.organisationId !== selectedOrganisationId
        ) {
          return false;
        }

        return searchMatches(stockSearch, [
          event.action,
          event.actorName,
          event.actorEmail,
          event.agentName,
          event.organisationName,
          event.resourceType,
          event.resourceId,
          event.status,
          event.severity,
          event.source,
          auditDetailText(event.details)
        ]);
      }),
    [data.auditEvents, selectedOrganisationId, stockSearch]
  );

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

  const taskSummary = useMemo(() => {
    const humanTaskRows = organisationTaskRows.filter((task) => !task.isAgentTask);

    return {
      all: organisationTaskRows.filter((task) => task.status !== "completed").length,
      claimed: humanTaskRows.filter((task) => taskIsClaimed(task)).length,
      completed: humanTaskRows.filter((task) => task.status === "completed").length,
      processing: humanTaskRows.filter(
        (task) => task.status === "reserved" || task.status === "running"
      ).length,
      unclaimed: humanTaskRows.filter(
        (task) => !taskIsClaimed(task) && task.status !== "completed"
      ).length
    };
  }, [organisationTaskRows]);
  const retailTaskMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "all",
      label: labels.visibility.total,
      series: [],
      value: formatNumber(taskSummary.all, locale)
    },
    {
      color: businessMetricColors.human,
      id: "unclaimed",
      label: labels.stock.unclaimed,
      series: [],
      value: formatNumber(taskSummary.unclaimed, locale)
    },
    {
      color: businessMetricColors.active,
      id: "claimed",
      label: labels.stock.claimedBy,
      series: [],
      value: formatNumber(taskSummary.claimed, locale)
    },
    {
      color: businessMetricColors.queued,
      id: "processing",
      label: labels.visibility.active,
      series: [],
      value: formatNumber(taskSummary.processing, locale)
    },
    {
      color: businessMetricColors.completed,
      id: "completed",
      label: labels.stock.completeTask,
      series: [],
      value: formatNumber(taskSummary.completed, locale)
    }
  ];

  const purchaseOrderStatusSummary = useMemo(() => {
    const summary: Record<RetailPurchaseOrderFilter, number> = {
      all: 0,
      cancelled: 0,
      closed: 0,
      draft: 0,
      ordered: 0,
      partially_received: 0,
      received: 0
    };

    for (const order of searchedPurchaseOrderRows) {
      if (order.status !== "cancelled" && order.status !== "closed") {
        summary.all += 1;
      }
      summary[order.status] += 1;
    }

    return summary;
  }, [searchedPurchaseOrderRows]);
  const purchaseOrderMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "all",
      label: labels.stock.purchaseOrderStatusAll,
      series: [],
      value: formatNumber(purchaseOrderStatusSummary.all, locale)
    },
    ...([
      "draft",
      "ordered",
      "partially_received",
      "received",
      "closed",
      "cancelled"
    ] as const).map((status) => ({
      color: purchaseOrderStatusColor(status),
      id: status,
      label: purchaseOrderStatusLabel(labels, status),
      series: [],
      value: formatNumber(purchaseOrderStatusSummary[status], locale)
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
      const current =
        groups.get(key) ??
        {
          adviceId: null,
          draftPoUnits: pipeline.draftPoUnits,
          incomingUnits: pipeline.incomingUnits,
          organisationId: pipeline.organisationId,
          productId: pipeline.productId,
	          productTitle:
	            pipeline.productTitle ??
	            productOptionById.get(pipeline.productId)?.title ??
	            pipeline.productId,
          reorderKind: "required",
	          suggestedOrderQuantity: 0,
	          unorderedNeedUnits: 0,
	          wholesalePriceAmount: row?.wholesalePriceAmount ?? null
        };

      groups.set(key, {
        ...current,
        draftPoUnits: Math.max(current.draftPoUnits, pipeline.draftPoUnits),
        incomingUnits: Math.max(current.incomingUnits, pipeline.incomingUnits),
        unorderedNeedUnits: current.unorderedNeedUnits + pipeline.unorderedNeedUnits
      });
    }

    return [...groups.values()].sort(
      (left, right) => right.unorderedNeedUnits - left.unorderedNeedUnits
    );
  }, [
    data.pipeline,
    productOptionById,
    selectedOrganisationId,
    stockRowByOrgProduct
  ]);
  const outstandingDemandKeys = useMemo(
    () =>
      new Set(
        outstandingPurchaseItems.map((item) =>
          orgProductKey(item.organisationId, item.productId)
        )
      ),
    [outstandingPurchaseItems]
  );
  const restockingAdviceItems = useMemo<ReorderPurchaseItem[]>(() => {
    const groups = new Map<string, ReorderPurchaseItem>();

    for (const advice of adviceRows) {
      const key = orgProductKey(advice.organisationId, advice.productId);

      if (
        advice.suggestedOrderQuantity <= 0 ||
        outstandingDemandKeys.has(key)
      ) {
        continue;
      }

      const row = stockRowByOrgProduct.get(key);
      const current =
        groups.get(key) ??
        {
          adviceId: advice.id,
          draftPoUnits: 0,
          incomingUnits: 0,
          organisationId: advice.organisationId,
          productId: advice.productId,
	          productTitle:
	            advice.productTitle ??
	            productOptionById.get(advice.productId)?.title ??
	            advice.productId,
          reorderKind: "advisory",
	          suggestedOrderQuantity: 0,
	          unorderedNeedUnits: 0,
	          wholesalePriceAmount: row?.wholesalePriceAmount ?? null
        };

      groups.set(key, {
        ...current,
        adviceId: current.adviceId ?? advice.id,
        productTitle: current.productTitle || advice.productTitle,
        suggestedOrderQuantity: Math.max(
          current.suggestedOrderQuantity,
          advice.suggestedOrderQuantity
        ),
        wholesalePriceAmount:
          current.wholesalePriceAmount ?? row?.wholesalePriceAmount ?? null
      });
    }

    return [...groups.values()].sort(
      (left, right) =>
        right.suggestedOrderQuantity - left.suggestedOrderQuantity
    );
  }, [
	    adviceRows,
	    outstandingDemandKeys,
	    productOptionById,
	    stockRowByOrgProduct
	  ]);
  const reorderPurchaseItems = useMemo(
    () =>
      [...outstandingPurchaseItems, ...restockingAdviceItems].sort((left, right) => {
        if (left.reorderKind !== right.reorderKind) {
          return left.reorderKind === "required" ? -1 : 1;
        }

        return (
          Math.max(right.unorderedNeedUnits, right.suggestedOrderQuantity) -
          Math.max(left.unorderedNeedUnits, left.suggestedOrderQuantity)
        );
      }),
    [outstandingPurchaseItems, restockingAdviceItems]
  );
	  const defaultOutstandingPurchaseKeys = useMemo(() => {
	    const targetOrganisationId =
	      selectedOrganisationId === "all"
	        ? reorderPurchaseItems[0]?.organisationId
	        : selectedOrganisationId;

    if (!targetOrganisationId) {
      return [];
    }

	    return reorderPurchaseItems
	      .filter((item) => item.organisationId === targetOrganisationId)
	      .map((item) => orgProductKey(item.organisationId, item.productId));
	  }, [reorderPurchaseItems, selectedOrganisationId]);
	  const outstandingPurchaseSelectionKeys =
	    selectedOutstandingPurchaseKeys ?? defaultOutstandingPurchaseKeys;
	  const selectedOutstandingPurchaseItems = useMemo(
	    () =>
	      reorderPurchaseItems.filter((item) =>
	        outstandingPurchaseSelectionKeys.includes(
	          orgProductKey(item.organisationId, item.productId)
	        )
	      ),
	    [reorderPurchaseItems, outstandingPurchaseSelectionKeys]
	  );
  const activeShoppingList = useMemo(
    () =>
      data.shoppingLists.find(
        (list) =>
          list.status === "draft" &&
          (selectedOrganisationId === "all" ||
            list.organisationId === selectedOrganisationId)
      ) ??
      data.shoppingLists.find((list) =>
        selectedOrganisationId === "all"
          ? true
          : list.organisationId === selectedOrganisationId
      ) ??
      null,
    [data.shoppingLists, selectedOrganisationId]
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
  const purchaseOrderProductOptions = useMemo(() => {
    const selectedProductIds = new Set(
      purchaseOrderDraft?.lines.map((line) => line.productId) ?? []
    );

    return searchedProductOptions.filter(
      (product) => !selectedProductIds.has(product.id)
    );
  }, [purchaseOrderDraft?.lines, searchedProductOptions]);
  const draftPurchaseOrderOptions = useMemo(() => {
    const organisationId = purchaseOrderDraft?.organisationId ?? "";

    return data.purchaseOrders.filter(
      (order) =>
        order.status === "draft" &&
        (!organisationId || order.organisationId === organisationId)
    );
  }, [data.purchaseOrders, purchaseOrderDraft?.organisationId]);
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
  const purchaseOrderDetail =
    data.purchaseOrders.find((order) => order.id === purchaseOrderDetailId) ?? null;
  const purchaseOrderDetailLines = purchaseOrderDetail
    ? data.purchaseOrderLines.filter(
        (line) => line.purchaseOrderId === purchaseOrderDetail.id
      )
    : [];
  const purchaseOrderDetailTotal = purchaseOrderDetailLines.reduce(
    (total, line) =>
      total + line.quantityOrdered * (line.wholesalePriceAmount ?? 0),
    0
  );
  const restockingAdviceDetail =
    data.reorderAdvice.find((advice) => advice.id === restockingAdviceDetailId) ??
    null;
  const taskDetail = data.tasks.find((task) => task.id === taskDetailId) ?? null;
  const customerOrderDetail =
    data.customerOrders.find(
      (order) => order.id === selectedRetailCustomerOrderId
    ) ??
    null;
  const customerOrderDetailLines = customerOrderDetail
    ? customerOrderLinesByOrderId.get(customerOrderDetail.id) ?? []
    : [];
  const customerOrderDetailTasks = customerOrderDetail
    ? data.tasks.filter((task) =>
        customerOrderDetail.workflowTaskIds.includes(task.id)
      )
    : [];
  const customerOrderDetailEvents = customerOrderDetail
    ? data.auditEvents
        .filter(
          (event) =>
            event.resourceId === customerOrderDetail.id ||
            event.details.customerOrderId === customerOrderDetail.id ||
            event.details.fulfillmentOrderId === customerOrderDetail.id ||
            event.details.sourceEntityId === customerOrderDetail.id
        )
        .slice(0, 8)
    : [];
  const customerOrderCanAllocate = Boolean(
    customerOrderDetail?.actionStates.allocateAvailable.enabled
  );

  useEffect(() => {
    setShoppingListDraftLines(
      activeShoppingListLines.map((line) => ({
        availabilityStatus: line.availabilityStatus,
        currentStockQuantity: String(line.currentStockQuantity),
        id: line.id,
        notes: line.notes ?? "",
        productId: line.productId,
        productTitle: line.productTitle,
        purchasedQuantity: String(line.purchasedQuantity),
        requiredQuantity: String(line.requiredQuantity),
        retailPriceAmount:
          line.retailPriceAmount === null ? "" : String(line.retailPriceAmount),
        suggestedQuantity: String(line.suggestedQuantity),
        unorderedNeedQuantity: String(line.unorderedNeedQuantity),
        wholesalePriceAmount:
          line.wholesalePriceAmount === null
            ? ""
            : String(line.wholesalePriceAmount),
        wholesalerTried: line.wholesalerTried ?? ""
      }))
    );
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

  function openAddEditor() {
    setError("");
    setProductSearch("");
    setEditor({
      draft: emptyDraft,
      mode: "add",
      organisationId: defaultOrganisationId,
      product: null
    });
  }

  function openRowEditor(row: AdminRetailStockRow) {
    setError("");
    setEditor({
      draft: draftFromRow(row),
      mode: "edit",
      organisationId: row.organisationId,
      row
    });
  }

	  function openPurchaseOrderDraft(
	    organisationId?: string,
	    productIds?: readonly string[],
	    sourceItems: readonly ReorderPurchaseItem[] = reorderPurchaseItems
	  ) {
    const targetOrganisationId =
      organisationId ??
      (selectedOrganisationId === "all"
        ? sourceItems[0]?.organisationId ?? defaultOrganisationId
        : selectedOrganisationId);
    const outstandingLines = sourceItems
      .filter(
        (item) =>
          item.organisationId === targetOrganisationId &&
          (!productIds || productIds.includes(item.productId))
      )
      .map((item) => ({
        expectedExpiresAt: "",
        notes:
          item.unorderedNeedUnits > 0
            ? labels.stock.unorderedNeed
            : labels.stock.suggestedOrder,
        productId: item.productId,
        quantityOrdered: String(
          Math.max(
            1,
            Math.ceil(
              Math.max(item.unorderedNeedUnits, item.suggestedOrderQuantity)
            )
          )
        ),
        wholesalePriceAmount:
          item.wholesalePriceAmount === null
            ? ""
            : String(item.wholesalePriceAmount)
      }));

    setError("");
    setProductSearch("");
    setPurchaseOrderDraft({
      ...emptyPurchaseOrderDraft,
      lines: outstandingLines,
      organisationId: targetOrganisationId
    });
  }

  function openBlankPurchaseOrderDraft() {
    const targetOrganisationId =
      selectedOrganisationId === "all" ? defaultOrganisationId : selectedOrganisationId;

    setError("");
    setProductSearch("");
    setPurchaseOrderDraft({
      ...emptyPurchaseOrderDraft,
      organisationId: targetOrganisationId
    });
  }

  function toggleOutstandingPurchaseItem(item: {
    organisationId: string;
    productId: string;
  }) {
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

  function openSelectedOutstandingPurchaseOrderDraft() {
    const organisationId = selectedOutstandingPurchaseItems[0]?.organisationId;

    if (!organisationId) {
      return;
    }

    openPurchaseOrderDraft(
      organisationId,
      selectedOutstandingPurchaseItems.map((item) => item.productId)
    );
  }

  async function createShoppingListFromSelection() {
    const organisationId = selectedOutstandingPurchaseItems[0]?.organisationId;

    if (!organisationId) {
      return;
    }

    await runRetailAction(
      {
        action: "create_shopping_list",
        lines: selectedOutstandingPurchaseItems.map((item) => {
          const row = stockRowByOrgProduct.get(
            orgProductKey(item.organisationId, item.productId)
          );
          const requiredQuantity = Math.max(
            1,
            Math.ceil(Math.max(item.unorderedNeedUnits, item.suggestedOrderQuantity))
          );

          return {
            availabilityStatus: "unknown",
            currentStockQuantity: row?.stockQuantity ?? 0,
            notes:
              item.reorderKind === "required"
                ? labels.stock.unorderedNeed
                : labels.stock.suggestedOrder,
            productId: item.productId,
            purchasedQuantity: 0,
            requiredQuantity,
            retailPriceAmount: null,
            suggestedQuantity: item.suggestedOrderQuantity,
            unorderedNeedQuantity: item.unorderedNeedUnits,
            wholesalePriceAmount: item.wholesalePriceAmount,
            wholesalerTried: ""
          };
        }),
        organisationId
      },
      `shopping-list:${organisationId}`
    );
  }

  function updateShoppingListDraftLine(
    lineId: string,
    patch: Partial<ShoppingListLineDraft>
  ) {
    setShoppingListDraftLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    );
  }

  async function saveShoppingListDraft(status: "cancelled" | "closed" | "draft" = "draft") {
    if (!activeShoppingList) {
      return;
    }

    await runRetailAction(
      {
        action: "update_shopping_list",
        lines: shoppingListDraftLines.map((line) => ({
          availabilityStatus: line.availabilityStatus,
          currentStockQuantity: numberOrNull(line.currentStockQuantity),
          id: line.id,
          notes: line.notes,
          productId: line.productId,
          purchasedQuantity: numberOrNull(line.purchasedQuantity),
          requiredQuantity: numberOrNull(line.requiredQuantity),
          retailPriceAmount: numberOrNull(line.retailPriceAmount),
          suggestedQuantity: numberOrNull(line.suggestedQuantity),
          unorderedNeedQuantity: numberOrNull(line.unorderedNeedQuantity),
          wholesalePriceAmount: numberOrNull(line.wholesalePriceAmount),
          wholesalerTried: line.wholesalerTried
        })),
        shoppingListId: activeShoppingList.id,
        status
      },
      `shopping-list:${activeShoppingList.id}`
    );
  }

  async function applyShoppingListDraft() {
    if (!activeShoppingList) {
      return;
    }

    await saveShoppingListDraft("draft");
    await runRetailAction(
      {
        action: "apply_shopping_list",
        shoppingListId: activeShoppingList.id
      },
      `shopping-list:${activeShoppingList.id}:apply`
    );
  }

  async function importShoppingListCsv(file: File | null) {
    if (!file) {
      return;
    }

    const text = await file.text();
    const rows = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((line) => line.trim());
    const header = parseCsvLine(rows[0] ?? "");
    const indexByName = new Map(header.map((name, index) => [name, index]));
    const imported = rows.slice(1).map(parseCsvLine);

    setShoppingListDraftLines((current) =>
      current.map((line) => {
        const row = imported.find(
          (cells) => cells[indexByName.get("productId") ?? -1] === line.productId
        );

        if (!row) {
          return line;
        }

        const cell = (name: string) => row[indexByName.get(name) ?? -1] ?? "";
        const availabilityStatus = cell("availabilityStatus");

        return {
          ...line,
          availabilityStatus:
            availabilityStatus === "available" ||
            availabilityStatus === "partial" ||
            availabilityStatus === "not_available"
              ? availabilityStatus
              : "unknown",
          notes: cell("notes"),
          purchasedQuantity: cell("purchasedQuantity"),
          retailPriceAmount: cell("retailPriceOverride"),
          wholesalePriceAmount: cell("wholesalePrice"),
          wholesalerTried: cell("wholesalerTried")
        };
      })
    );
  }

  function openRestockingAdvicePurchaseOrderDraft(adviceId: string) {
    const item = reorderPurchaseItems.find((entry) => entry.adviceId === adviceId);

    if (!item) {
      return;
    }

    setRestockingAdviceDetailId("");
    openPurchaseOrderDraft(item.organisationId, [item.productId], reorderPurchaseItems);
  }

  function openPurchaseOrderDetail(purchaseOrderId: string) {
    setError("");
    setRestockingAdviceDetailId("");
    setTaskDetailId("");
    setPurchaseOrderDetailId(purchaseOrderId);
  }

  function openTaskDetail(task: AdminRetailOperationsTask) {
    setError("");
    setRestockingAdviceDetailId("");
    setPurchaseOrderDetailId("");
    setTaskDetailId(task.id);
  }

  function openBackorderPurchaseOrderDraft(task: AdminRetailOperationsTask) {
    const pipeline = task.pipeline;

    if (!pipeline?.productId) {
      return;
    }

    const quantity = Math.max(
      1,
      Math.ceil(pipeline.unorderedNeedUnits || pipeline.customerDemandUnits)
    );

    setError("");
    setProductSearch("");
    setTaskDetailId("");
    setPurchaseOrderDraft({
      ...emptyPurchaseOrderDraft,
      lines: [
        {
          expectedExpiresAt: "",
          notes: task.title,
          productId: pipeline.productId,
          quantityOrdered: String(quantity),
          wholesalePriceAmount: ""
        }
      ],
      notes: task.priorityReason ?? task.title,
      organisationId: task.organisationId,
      sourceTaskId: task.id
    });
  }

  function taskIsClaimed(task: AdminRetailOperationsTask) {
    return Boolean(task.claimedByPersonId) || task.status === "running";
  }

  function taskActionLabel(
    taskAction: "claim" | "complete" | "snooze"
  ) {
    return taskAction === "claim"
      ? labels.stock.claimTask
      : taskAction === "complete"
        ? labels.stock.completeTask
        : labels.stock.snoozeTask;
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
        setPurchaseOrderDraft(null);
        setPurchaseOrderDetailId("");
        setCustomerOrderDraft(null);
        setReceiveEditor(null);
      }

      return true;
    } catch (error) {
      setError(
        actionErrorMessage(error, options.errorFallback ?? labels.stock.saveError)
      );
      return false;
    } finally {
      setBusyId("");
    }
  }

  async function runTaskAction(
    task: AdminRetailOperationsTask,
    taskAction: "claim" | "complete" | "snooze"
  ) {
    const saved = await runRetailAction(
      {
        action: "update_retail_task",
        taskAction,
        taskId: task.id
      },
      `task:${task.id}:${taskAction}`,
      { closeWorkflows: false }
    );

    if (saved && taskAction === "claim") {
      setTaskDetailId("");
      setPurchaseOrderDetailId("");
    }
  }

  function updatePurchaseOrderDraft(patch: Partial<PurchaseOrderDraft>) {
    setPurchaseOrderDraft((current) =>
      current
        ? {
            ...current,
            ...patch
          }
        : current
    );
  }

  function addPurchaseOrderLine(product: AdminRetailStockProductOption) {
    setPurchaseOrderDraft((current) =>
      current && current.lines.some((line) => line.productId === product.id)
        ? current
        : current
          ? {
              ...current,
              lines: [
                ...current.lines,
                {
                  expectedExpiresAt: "",
                  notes: "",
                  productId: product.id,
                  quantityOrdered: "1",
                  wholesalePriceAmount: ""
                }
              ]
            }
          : current
    );
  }

  function updatePurchaseOrderLine(
    productId: string,
    patch: Partial<PurchaseOrderLineDraft>
  ) {
    setPurchaseOrderDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line) =>
              line.productId === productId
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

  function removePurchaseOrderLine(productId: string) {
    setPurchaseOrderDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.filter((line) => line.productId !== productId)
          }
        : current
    );
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

  function openCustomerOrderDraft() {
    const organisation = data.organisations.find(
      (item) => item.id === defaultOrganisationId
    );
    const mode: CustomerOrderMode = data.canRouteRegionalCheckout
      ? "regional"
      : "direct";

    setProductSearch("");
    setCustomerOrderAvailability(null);
    setCustomerOrderDraft({
      ...emptyCustomerOrderDraft,
      mode,
      organisationId: defaultOrganisationId,
      shippingCountry: organisation?.countryCode ?? "TH"
    });
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

  function openReceiveEditor(
    order: AdminRetailStockData["purchaseOrders"][number],
    lines: AdminRetailStockData["purchaseOrderLines"]
  ) {
    setError("");
    setReceiveEditor({
      lines: lines.map((line) => {
        const remaining = receiveLineRemaining(line);

        return {
          lineId: line.id,
          productId: line.productId,
          productTitle: line.productTitle,
          quantityClosedShort: line.quantityClosedShort,
          quantityOrdered: line.quantityOrdered,
          quantityReceived: line.quantityReceived,
          receiveQuantity: String(remaining),
          remaining,
          shortfallExpectedAt: "",
          shortfallReference: "",
          shortfallResolution: "supplier_backorder"
        };
      }),
      notes: "",
      order,
      purchaseOrderId: order.id
    });
  }

  async function savePurchaseOrder() {
    if (!purchaseOrderDraft) {
      return;
    }

    const actionBody =
      purchaseOrderDraft.sourceTaskId
        ? {
            action: "build_purchase_order_from_backorder_task",
            expectedAt: purchaseOrderDraft.expectedAt || null,
            lines: purchaseOrderDraft.lines.map((line) => ({
              expectedExpiresAt: line.expectedExpiresAt || null,
              notes: line.notes || null,
              productId: line.productId,
              quantityOrdered: numberOrNull(line.quantityOrdered),
              wholesalePriceAmount: numberOrNull(line.wholesalePriceAmount)
            })),
            notes: purchaseOrderDraft.notes,
            purchaseOrderId:
              purchaseOrderDraft.mode === "existing"
                ? purchaseOrderDraft.targetPurchaseOrderId
                : null,
            supplierContact: purchaseOrderDraft.supplierContact,
            supplierName: purchaseOrderDraft.supplierName,
            taskId: purchaseOrderDraft.sourceTaskId
          }
        : {
            action: "create_purchase_order",
            expectedAt: purchaseOrderDraft.expectedAt || null,
            lines: purchaseOrderDraft.lines.map((line) => ({
              expectedExpiresAt: line.expectedExpiresAt || null,
              notes: line.notes || null,
              productId: line.productId,
              quantityOrdered: numberOrNull(line.quantityOrdered),
              wholesalePriceAmount: numberOrNull(line.wholesalePriceAmount)
            })),
            notes: purchaseOrderDraft.notes,
            organisationId: purchaseOrderDraft.organisationId || defaultOrganisationId,
            supplierContact: purchaseOrderDraft.supplierContact,
            supplierName: purchaseOrderDraft.supplierName
          };

    await runRetailAction(
      actionBody,
      "purchase-order:new"
    );
  }

  async function markPurchaseOrderOrdered(purchaseOrderId: string) {
    await runRetailAction(
      {
        action: "mark_purchase_order_ordered",
        purchaseOrderId
      },
      `po:${purchaseOrderId}:ordered`
    );
  }

  async function voidPurchaseOrder(purchaseOrderId: string) {
    await runRetailAction(
      {
        action: "void_purchase_order",
        purchaseOrderId
      },
      `po:${purchaseOrderId}:void`
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

  function updateReceiveLineDraft(
    lineId: string,
    patch: Partial<ReceiveLineDraft>
  ) {
    setReceiveEditor((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line) =>
              line.lineId === lineId
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

  async function saveReceiving() {
    const editor = receiveEditor;

    if (!editor) {
      return;
    }

    const invalidLine = editor.lines.find(
      (line) => !validReceiveQuantity(line, numberOrNull(line.receiveQuantity))
    );
    const actionLines = editor.lines.filter(receiveLineHasAction);

    if (invalidLine || actionLines.length === 0) {
      return;
    }

    setReceiveEditor(null);
    await runRetailAction(
      {
        action: "receive_purchase_order_lines",
        lines: actionLines.map((line) => ({
          lineId: line.lineId,
          quantityReceived: numberOrNull(line.receiveQuantity) ?? 0,
          reconcileShortfall:
            (numberOrNull(line.receiveQuantity) ?? 0) < line.remaining,
          shortfallExpectedAt: line.shortfallExpectedAt || null,
          shortfallReference: line.shortfallReference || null,
          shortfallResolution: line.shortfallResolution
        })),
        notes: editor.notes,
        reason: "Purchase order receiving"
      },
      `receive:${editor.purchaseOrderId}`
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
  const canSavePurchaseOrder =
    Boolean(
      purchaseOrderDraft?.mode === "existing"
        ? purchaseOrderDraft.targetPurchaseOrderId
        : purchaseOrderDraft?.supplierName.trim()
    ) &&
    Boolean(purchaseOrderDraft?.lines.length) &&
    Boolean(
      purchaseOrderDraft?.lines.every((line) =>
        Boolean(line.productId) &&
        Boolean(numberOrNull(line.quantityOrdered))
      )
    ) &&
    data.canWrite &&
    !busyId;
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
	  const receiveQuantityIsValid = receiveEditor
	    ? receiveEditor.lines.every((line) =>
	        validReceiveQuantity(line, numberOrNull(line.receiveQuantity))
	      )
	    : false;
	  const receiveHasAction = receiveEditor
	    ? receiveEditor.lines.some(receiveLineHasAction)
	    : false;
	  const canSaveReceive =
	    Boolean(receiveEditor) &&
	    receiveQuantityIsValid &&
	    receiveHasAction &&
	    data.canWrite &&
	    !busyId;
	  const panelTitle: Record<RetailStockPanel, string> = {
	    audit: labels.stock.audit,
	    "customer-orders": labels.stock.customerOrders,
	    fulfillment: labels.stock.fulfill,
	    insights: labels.stock.insightsTab,
	    list: labels.stock.title,
	    movements: labels.stock.movementsTab,
	    "purchase-orders": labels.stock.purchaseOrders,
	    receiving: labels.stock.receiveStock,
	    reorder: labels.stock.reorderBackorders,
	    tasks: labels.stock.taskQueue
	  };
	  const panelSearchLabel = labels.stock.search;
	  const showPanelSearch = panel !== "reorder";
	  const showStockCsvExport = panel === "list";
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
  const showCustomerOrderWorkbench =
    (panel === "customer-orders" || panel === "fulfillment") &&
    Boolean(customerOrderDetail);

  return (
    <div className="mt-8 space-y-6">
      {panel === "tasks" ? (
        <BusinessStatsGrid
          metrics={retailTaskMetrics}
          onMetricSelect={(metricId) =>
            setSelectedTaskFilter(metricId as RetailTaskFilter)
          }
          selectedMetricId={selectedTaskFilter}
        />
      ) : null}

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

      {panel === "purchase-orders" ? (
        <BusinessStatsGrid
          metrics={purchaseOrderMetrics}
          onMetricSelect={(metricId) =>
            setSelectedPurchaseOrderFilter(
              metricId as RetailPurchaseOrderFilter
            )
          }
          selectedMetricId={selectedPurchaseOrderFilter}
        />
      ) : null}

	      <section
        className={classNames(
          showCustomerOrderWorkbench
            ? "space-y-5"
            : "rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200"
        )}
      >
	        {!showCustomerOrderWorkbench ? (
	        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
	          <div>
	            <h2
	              className={classNames(
	                panel === "reorder"
	                  ? "text-sm font-semibold text-gray-900"
	                  : "text-base font-semibold text-gray-900",
	                adminLocaleTextClass(locale, "heading")
	              )}
	            >
	              {panelTitle[panel]}
	            </h2>
	            {panel === "reorder" ? (
	              <p className="mt-1 text-xs text-gray-500">
	                {labels.stock.reorderBackordersDescription}
	              </p>
	            ) : (
	              <p className="mt-1 text-xs text-gray-400">
	                {labels.generated}: {formatGeneratedAt(data.generatedAt, locale)}
	              </p>
	            )}
	          </div>
	          <div
	            className={classNames(
	              "grid gap-3 xl:min-w-[760px]",
	              showPanelSearch
	                ? "sm:grid-cols-[minmax(220px,1fr)_auto_auto_auto]"
	                : "sm:grid-cols-[minmax(220px,1fr)_auto]"
	            )}
	          >
	            {showPanelSearch ? (
	              <label className="grid gap-1 text-xs font-semibold text-gray-500">
	                <input
	                  aria-label={panelSearchLabel}
	                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
	                  onChange={(event) => setStockSearch(event.target.value)}
	                  placeholder={panelSearchLabel}
	                  type="search"
	                  value={stockSearch}
	                />
	              </label>
	            ) : null}
	            {data.canFilterOrganisation ? (
	              <label className="grid gap-1 text-xs font-semibold text-gray-500">
	                {labels.stock.organisation}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
	                    onChange={(event) => {
	                      setSelectedOrganisationId(event.target.value);
	                      setSelectedOutstandingPurchaseKeys(null);
	                    }}
                  value={selectedOrganisationId}
                >
                  <option value="all">{labels.stock.allOrganisations}</option>
                  {data.organisations.map((organisation) => (
                    <option key={organisation.id} value={organisation.id}>
                      {organisation.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {showStockCsvExport ? (
              <div className="flex items-end">
                <AdminIconButton
                  aria-label={labels.stock.exportCsv}
                  className="text-[#1FA77A] ring-1 ring-[#1FA77A]/25 hover:bg-emerald-50 hover:text-[#188865]"
                  disabled={rows.length === 0}
                  onClick={() =>
                    downloadStockCsv(rows, labels, showOrganisationContext)
                  }
                  title={labels.stock.exportCsv}
                >
                  <Download aria-hidden={true} className="size-4" />
                </AdminIconButton>
              </div>
            ) : null}
            {data.canWrite ? (
              <div className="flex items-end">
                {panel === "purchase-orders" ? (
                  <AdminButton
                    disabled={data.organisations.length === 0}
                    onClick={openBlankPurchaseOrderDraft}
                  >
                    {labels.stock.addPurchaseOrder}
                  </AdminButton>
                ) : panel === "customer-orders" || panel === "fulfillment" ? (
                  <AdminButton
                    disabled={data.organisations.length === 0}
                    onClick={openCustomerOrderDraft}
                  >
                    {labels.stock.addCustomerOrder}
                  </AdminButton>
                ) : panel === "movements" ? (
                  <AdminButton
                    disabled={rows.length === 0}
                    onClick={() => setMovementPickerOpen(true)}
                  >
                    {labels.stock.recordMovement}
                  </AdminButton>
                ) : panel === "list" ? (
                  <AdminButton
                    disabled={data.organisations.length === 0}
                    onClick={openAddEditor}
                  >
	                    {labels.stock.addProduct}
	                  </AdminButton>
	                ) : null}
	              </div>
	            ) : null}
          </div>
        </div>
        ) : null}

        {error && !editor && !showCustomerOrderWorkbench ? (
          <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
            {error}
          </div>
        ) : null}

        {panel === "tasks" ? (
          <>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500">
                  <th className="py-2 pr-4">{labels.stock.status}</th>
                  <th className="py-2 pr-4">{labels.stock.taskPriority}</th>
                  <th className="py-2 pr-4">{labels.stock.product}</th>
                  {showOrganisationContext ? (
                    <th className="py-2 pr-4">{labels.stock.organisation}</th>
                  ) : null}
                  <th className="py-2 pr-4">{labels.stock.claimedBy}</th>
                  <th className="py-2 pr-4">{labels.stock.dueAt}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {taskRows.map((task) => {
                  const claimedName =
                    task.isAgentTask
                      ? task.agentName ?? labels.visibility.agent
                      : task.claimedByName ?? task.claimedByEmail ?? null;
                  const claimedAt = formatDateTime(task.claimedAt, locale);

                  return (
                    <tr key={task.id}>
                      <td className="py-3 pr-4">
                        <span
                          className={classNames(
                            taskStatusClass(task.status),
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                          )}
                        >
                          {retailTaskStatusLabel(task.status, labels)}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={classNames(
                            taskValueClass(task.priorityScore),
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                          )}
                        >
                          {taskValueLabel(task.priorityScore, locale)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-medium text-gray-900">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            className="text-left font-medium text-gray-900 underline-offset-2 hover:text-[#1FA77A] hover:underline"
                            disabled={Boolean(busyId)}
                            onClick={() => openTaskDetail(task)}
                            type="button"
                          >
                            {task.title}
                          </button>
                          {task.isAgentTask ? (
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                              {labels.visibility.agent}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 max-w-sm text-xs font-normal text-gray-500">
                          {task.priorityReason ?? labels.stock.notSet}
                        </div>
                      </td>
                      {showOrganisationContext ? (
                        <td className="py-3 pr-4 text-gray-600">
                          {task.organisationName}
                        </td>
                      ) : null}
                      <td className="py-3 pr-4 text-gray-600">
                        {claimedName ? (
                          <>
                            <div className="font-medium text-gray-900">
                              {claimedName}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {claimedAt ?? labels.stock.notSet}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-400">
                            {labels.stock.unclaimed}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {formatDate(task.dueAt ?? task.scheduledFor, locale) ??
                          labels.stock.notSet}
                      </td>
                    </tr>
                  );
                })}
                {taskRows.length === 0 ? (
                  <tr>
                    <td
                      className="py-8 text-center text-sm text-gray-500"
                      colSpan={showOrganisationContext ? 6 : 5}
                    >
                      {labels.stock.noOrders}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          </>
        ) : null}

        {panel === "audit" ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500">
                  <th className="py-2 pr-4">{labels.stock.updated}</th>
                  <th className="py-2 pr-4">{labels.stock.event}</th>
                  {showOrganisationContext ? (
                    <th className="py-2 pr-4">{labels.stock.organisation}</th>
                  ) : null}
                  <th className="py-2 pr-4">{labels.visibility.actor}</th>
                  <th className="py-2 pr-4">{labels.stock.status}</th>
                  <th className="py-2 pr-4">{labels.stock.reason}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditRows.map((event) => {
                  const actor =
                    event.actorName ??
                    event.actorEmail ??
                    event.agentName ??
                    readableToken(event.source);
                  const detailText = auditDetailText(event.details);

                  return (
                    <tr key={`${event.source}:${event.id}`}>
                      <td className="whitespace-nowrap py-3 pr-4 text-gray-600">
                        {formatDateTime(event.occurredAt, locale) ??
                          labels.stock.notSet}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-gray-900">
                          {readableToken(event.action)}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {event.resourceType
                            ? readableToken(event.resourceType)
                            : readableToken(event.source)}
                        </div>
                      </td>
                      {showOrganisationContext ? (
                        <td className="py-3 pr-4 text-gray-600">
                          {event.organisationName}
                        </td>
                      ) : null}
                      <td className="py-3 pr-4 text-gray-600">
                        {actor}
                      </td>
                      <td className="py-3 pr-4">
                        {event.status || event.severity ? (
                          <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                            {readableToken(event.status ?? event.severity ?? "")}
                          </span>
                        ) : (
                          <span className="text-gray-400">
                            {labels.stock.notSet}
                          </span>
                        )}
                      </td>
                      <td className="max-w-md py-3 pr-4 text-gray-600">
                        {detailText || labels.stock.notSet}
                      </td>
                    </tr>
                  );
                })}
                {auditRows.length === 0 ? (
                  <tr>
                    <td
                      className="py-8 text-center text-sm text-gray-500"
                      colSpan={showOrganisationContext ? 6 : 5}
                    >
                      {labels.stock.noOrders}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {panel === "list" ? (
        <>
        <div className="mt-5 overflow-x-auto">
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
	                      <div>{wholesalePrice ?? labels.stock.notSet}</div>
	                    </td>
	                    <td className="whitespace-nowrap py-3 pr-4 text-gray-700">
	                      <div>{retailPrice ?? labels.stock.notSet}</div>
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
                      {updated ?? labels.stock.notSet}
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

        {panel === "purchase-orders" ? (
          <>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
	                <tr className="text-left text-xs font-semibold text-gray-500">
	                  <th className="py-2 pr-4">{labels.stock.purchaseOrderNumber}</th>
	                  <th className="py-2 pr-4">{labels.stock.supplier}</th>
	                  {showOrganisationContext ? (
	                    <th className="py-2 pr-4">{labels.stock.organisation}</th>
	                  ) : null}
	                  <th className="py-2 pr-4">{labels.stock.quantity}</th>
	                  <th className="py-2 pr-4">{labels.stock.dueAt}</th>
	                  <th className="py-2 pr-4">{labels.stock.status}</th>
	                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
	                {purchaseOrderRows.map((order) => (
	                  <tr
		                    aria-label={`${labels.stock.purchaseOrderDetails}: ${order.poNumber}`}
	                    className="cursor-pointer align-middle transition hover:bg-[#F8FAFC] focus:bg-[#F8FAFC] focus:outline-none"
	                    key={order.id}
		                    onClick={() => openPurchaseOrderDetail(order.id)}
	                    onKeyDown={(event) => {
	                      if (event.key === "Enter" || event.key === " ") {
	                        event.preventDefault();
		                        openPurchaseOrderDetail(order.id);
	                      }
	                    }}
	                    role="button"
	                    tabIndex={0}
	                  >
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      {order.poNumber}
                    </td>
	                    <td className="py-3 pr-4 text-gray-700">
	                      {order.supplierName}
	                    </td>
	                    {showOrganisationContext ? (
	                      <td className="py-3 pr-4 text-gray-600">
	                        {order.organisationName}
	                      </td>
	                    ) : null}
	                    <td className="py-3 pr-4 text-gray-600">
	                      {order.receivedUnits}/{order.orderedUnits}
	                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {formatDate(order.expectedAt, locale) ?? labels.stock.notSet}
                    </td>
	                    <td className="py-3 pr-4">
	                      <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
	                        {purchaseOrderStatusLabel(labels, order.status)}
	                      </span>
	                    </td>
	                  </tr>
                ))}
	                {purchaseOrderRows.length === 0 ? (
	                  <tr>
	                    <td
	                      className="py-8 text-center text-sm text-gray-500"
		                      colSpan={showOrganisationContext ? 6 : 5}
	                    >
	                      {labels.stock.noOrders}
	                    </td>
	                  </tr>
                ) : null}
              </tbody>
              </table>
            </div>
          </>
        ) : null}

        {panel === "receiving" ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500">
                  <th className="py-2 pr-4">{labels.stock.purchaseOrderNumber}</th>
                  <th className="py-2 pr-4">{labels.stock.supplier}</th>
                  {showOrganisationContext ? (
                    <th className="py-2 pr-4">{labels.stock.organisation}</th>
                  ) : null}
                  <th className="py-2 pr-4">{labels.stock.orderItems}</th>
                  <th className="py-2 pr-4">{labels.stock.remaining}</th>
                  <th className="py-2 pr-4">{labels.stock.expectedAt}</th>
                  <th className="py-2 pr-4">{labels.stock.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {receivingGroups.map(({ lines, order }) => {
                  const remainingUnits = lines.reduce(
                    (total, line) => total + receiveLineRemaining(line),
                    0
                  );
                  const itemSummary = lines
                    .slice(0, 3)
                    .map((line) => `${line.productTitle} x${receiveLineRemaining(line)}`)
                    .join(", ");
                  const extraItems = Math.max(0, lines.length - 3);

                  return (
                    <tr
                      aria-label={`${labels.stock.receiveStock}: ${order.poNumber}`}
                      className="cursor-pointer align-middle transition hover:bg-[#F8FAFC] focus:bg-[#F8FAFC] focus:outline-none"
                      key={order.id}
                      onClick={() => openReceiveEditor(order, lines)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openReceiveEditor(order, lines);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <td className="py-3 pr-4 font-medium text-gray-900">
                        {order.poNumber}
                      </td>
                      <td className="py-3 pr-4 text-gray-700">
                        {order.supplierName}
                      </td>
                      {showOrganisationContext ? (
                        <td className="py-3 pr-4 text-gray-600">
                          {order.organisationName}
                        </td>
                      ) : null}
                      <td className="max-w-xl py-3 pr-4 text-gray-600">
                        <div className="line-clamp-2">
                          {itemSummary}
                          {extraItems > 0 ? ` +${extraItems}` : ""}
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 font-semibold text-gray-900">
                        {remainingUnits}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-gray-600">
                        {formatDate(order.expectedAt, locale) ?? labels.stock.notSet}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4">
                        <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                          {purchaseOrderStatusLabel(labels, order.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {receivingGroups.length === 0 ? (
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
        ) : null}

        {(panel === "customer-orders" || panel === "fulfillment") &&
        customerOrderDetail ? (
          <div className="space-y-5">
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
                    labels.stock.notSet}
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
                    ) ?? labels.stock.notSet}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <span className="inline-flex rounded-md bg-white px-2 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                  {readableToken(customerOrderDetail.status)}
                </span>
                <span
                  className={classNames(
                    customerOrderDetail.workflowHealth.isStuck
                      ? "bg-amber-50 text-amber-800 ring-amber-100"
                      : "bg-emerald-50 text-emerald-700 ring-emerald-100",
                    "inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1"
                  )}
                >
                  {customerOrderDetail.workflowHealth.isStuck
                    ? labels.stock.stuck
                    : labels.stock.onTrack}
                </span>
                <Link
                  className="inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 hover:text-[#126B4F]"
                  href={customerOrderListHref}
                >
                  {labels.stock.backToCustomerOrders}
                </Link>
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

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
              <section className="space-y-4">
                <div className="rounded-md bg-white p-4 ring-1 ring-gray-200">
                  <div className="grid gap-3 text-sm text-gray-600 sm:grid-cols-4">
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
                        ) ?? labels.stock.notSet}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500">
                        {labels.stock.placedAt}
                      </div>
                      <div className="mt-1">
                        {formatDateTime(customerOrderDetail.placedAt, locale) ??
                          labels.stock.notSet}
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
                        ) ?? labels.stock.notSet}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-gray-600 sm:grid-cols-3">
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
                          : labels.stock.notSet}
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
                          : labels.stock.notSet}
                      </div>
                    </div>
                  </div>
                </div>

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
                              <div className="mt-1 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
                                <span>
                                  {labels.stock.quantity}: {line.quantityOrdered}
                                </span>
                                <span>
                                  {labels.stock.allocate}: {line.quantityAllocated}
                                </span>
                                <span>
                                  {labels.stock.ship}: {line.quantityShipped}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                {line.availabilityStatus ? (
                                  <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 font-semibold text-gray-700 ring-1 ring-gray-200">
                                    {readableToken(line.availabilityStatus)}
                                  </span>
                                ) : null}
                                {line.etaDate ? (
                                  <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 font-semibold text-gray-700 ring-1 ring-gray-200">
                                    {formatDate(line.etaDate, locale)}
                                  </span>
                                ) : null}
                                {line.reason ? (
                                  <span className="text-gray-500">
                                    {line.reason}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="shrink-0 text-right text-sm font-semibold text-gray-900">
                              {formatPrice(
                                locale,
                                customerOrderDetail.currency,
                                line.retailPriceAmount
                              ) ?? labels.stock.notSet}
                              <div className="mt-1 text-xs font-normal text-gray-500">
                                {labels.stock.lineTotal}:{" "}
                                {formatPrice(
                                  locale,
                                  customerOrderDetail.currency,
                                  (line.retailPriceAmount ?? 0) *
                                    line.quantityOrdered
                                ) ?? labels.stock.notSet}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </section>

              <aside className="space-y-4">
                <section className="rounded-md bg-white p-3 ring-1 ring-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {labels.stock.workflow}
                  </h3>
                  <div className="mt-3 space-y-2 text-sm text-gray-600">
                    <div>
                      {labels.stock.taskQueue}: {customerOrderDetail.openTaskCount}/
                      {customerOrderDetail.taskCount}
                    </div>
                    <div>
                      {labels.stock.taskDetails}:{" "}
                      {customerOrderDetail.workflowHealth.expectedTaskType
                        ? readableToken(
                            customerOrderDetail.workflowHealth.expectedTaskType
                          )
                        : labels.stock.notSet}
                    </div>
                  </div>
                </section>

                <section className="rounded-md bg-white p-3 ring-1 ring-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {labels.stock.taskDetails}
                  </h3>
                  <div className="mt-3 space-y-2">
                    {customerOrderDetailTasks.map((task) => (
                      <button
                        className="block w-full rounded-md bg-[#F8FAFC] px-3 py-2 text-left text-sm ring-1 ring-gray-200 hover:bg-gray-50"
                        key={task.id}
                        onClick={() => openTaskDetail(task)}
                        type="button"
                      >
                        <span className="font-semibold text-gray-900">
                          {task.title}
                        </span>
                        <span className="mt-1 block text-xs text-gray-500">
                          {retailTaskStatusLabel(task.status, labels)}
                        </span>
                      </button>
                    ))}
                    {customerOrderDetailTasks.length === 0 ? (
                      <div className="text-sm text-gray-500">
                        {labels.stock.empty}
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-md bg-white p-3 ring-1 ring-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {labels.stock.audit}
                  </h3>
                  <div className="mt-3 space-y-2">
                    {customerOrderDetailEvents.map((event) => (
                      <div
                        className="rounded-md bg-[#F8FAFC] px-3 py-2 text-sm ring-1 ring-gray-200"
                        key={`${event.source}:${event.id}`}
                      >
                        <div className="font-semibold text-gray-900">
                          {readableToken(event.action)}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {formatDateTime(event.occurredAt, locale)}
                        </div>
                      </div>
                    ))}
                    {customerOrderDetailEvents.length === 0 ? (
                      <div className="text-sm text-gray-500">
                        {labels.stock.empty}
                      </div>
                    ) : null}
                  </div>
                </section>
              </aside>
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
              {data.canWrite && customerOrderDetail.actionStates.pick.enabled ? (
                <AdminButton
                  disabled={Boolean(busyId)}
                  onClick={() =>
                    runCustomerOrderAction(customerOrderDetail, "mark_picking")
                  }
                  variant="secondary"
                >
                  {labels.stock.pick}
                </AdminButton>
              ) : null}
              {data.canWrite && customerOrderDetail.actionStates.pack.enabled ? (
                <AdminButton
                  disabled={Boolean(busyId)}
                  onClick={() =>
                    runCustomerOrderAction(customerOrderDetail, "mark_packed")
                  }
                  variant="secondary"
                >
                  {labels.stock.pack}
                </AdminButton>
              ) : null}
              {data.canWrite && customerOrderDetail.actionStates.ship.enabled ? (
                <AdminButton
                  disabled={Boolean(busyId)}
                  onClick={() =>
                    runCustomerOrderAction(customerOrderDetail, "mark_shipped")
                  }
                >
                  {labels.stock.ship}
                </AdminButton>
              ) : null}
              {data.canWrite &&
              customerOrderDetail.actionStates.deliver.enabled ? (
                <AdminButton
                  disabled={Boolean(busyId)}
                  onClick={() =>
                    runCustomerOrderAction(customerOrderDetail, "mark_delivered")
                  }
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
                      {order.customerName || order.customerEmail || labels.stock.notSet}
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
                      ) ?? labels.stock.notSet}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {formatDate(order.dueAt, locale) ?? labels.stock.notSet}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={classNames(
                          order.isStuck
                            ? "bg-amber-50 text-amber-800 ring-amber-100"
                            : "bg-gray-100 text-gray-700 ring-gray-200",
                          "inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1"
                        )}
                      >
                        {readableToken(order.status)}
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
                      {formatDate(movement.occurredAt, locale) ?? labels.stock.notSet}
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
                      {movement.reason || movement.notes || labels.stock.notSet}
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

		        {panel === "reorder" ? (
		          <div className="mt-5">
		            <div className="space-y-2">
		              {reorderPurchaseItems.map((item, index) => {
		                const advice = item.adviceId
		                  ? adviceRows.find((entry) => entry.id === item.adviceId)
		                  : null;
		                const product = productOptionById.get(item.productId);
		                const itemKey = orgProductKey(item.organisationId, item.productId);
		                const selected = outstandingPurchaseSelectionKeys.includes(itemKey);
                    const isRequired = item.reorderKind === "required";
                    const startsNewGroup =
                      index > 0 &&
                      reorderPurchaseItems[index - 1]?.reorderKind !==
                        item.reorderKind;
                    const quantityValue = isRequired
                      ? item.unorderedNeedUnits
                      : item.suggestedOrderQuantity;

		                return (
		                  <div className={classNames(startsNewGroup && "mt-5")} key={itemKey}>
                        {startsNewGroup ? (
                          <div className="mb-5">
                            <h3
                              className={classNames(
                                "text-sm font-semibold text-gray-900",
                                adminLocaleTextClass(locale, "heading")
                              )}
                            >
                              {labels.stock.reorderAdvise}
                            </h3>
                            <p className="mt-1 text-xs text-gray-500">
                              {labels.stock.reorderAdviseDescription}
                            </p>
                          </div>
                        ) : null}
		                    <div
	                    className={classNames(
	                      selected
	                        ? isRequired
	                          ? "bg-red-50 ring-red-200"
	                          : "bg-sky-50 ring-sky-200"
	                        : isRequired
	                          ? "bg-red-50/35 ring-red-100 hover:bg-red-50/60"
	                          : "bg-sky-50/35 ring-sky-100 hover:bg-sky-50/60",
	                      "flex cursor-pointer items-center gap-3 rounded-md px-3 py-3 ring-1 transition"
	                    )}
                    onClick={() =>
                      advice ? setRestockingAdviceDetailId(advice.id) : undefined
                    }
                    onKeyDown={(event) => {
                      if ((event.key === "Enter" || event.key === " ") && advice) {
                        event.preventDefault();
                        setRestockingAdviceDetailId(advice.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <input
                      aria-label={`${labels.stock.selectProduct}: ${item.productTitle}`}
		                      checked={selected}
		                      className="size-4 rounded border-gray-300 text-[#1FA77A] focus:ring-[#1FA77A]"
		                      disabled={Boolean(busyId) || !data.canWrite}
		                      onChange={() => toggleOutstandingPurchaseItem(item)}
		                      onClick={(event) => event.stopPropagation()}
		                      type="checkbox"
                    />
                    <ProductThumbnail
                      imageUrl={product?.imageUrl ?? null}
                      title={item.productTitle}
                    />
		                    <div className="min-w-0 flex-1">
		                      <div className="flex min-w-0 flex-wrap items-center gap-2">
		                        <div className="truncate text-sm font-semibold text-gray-900">
		                          {item.productTitle}
		                        </div>
                            <span
                              className={classNames(
                                isRequired
                                  ? "bg-red-50 text-red-700 ring-red-100"
                                  : "bg-gray-50 text-gray-700 ring-gray-200",
                                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1"
                              )}
                            >
                              {isRequired
                                ? labels.stock.reorderRequired
                                : labels.stock.reorderAdvisory}
                            </span>
		                      </div>
                      <div className="mt-1 truncate text-xs text-gray-500">
                        {[product?.brandName, product?.productKind]
                          .filter(Boolean)
                          .join(" - ")}
                      </div>
                      {showOrganisationContext ? (
                        <div className="mt-1 truncate text-xs text-gray-500">
                          {
                            data.organisations.find(
                              (organisation) =>
                                organisation.id === item.organisationId
                            )?.name
                          }
                        </div>
                      ) : null}
                    </div>
		                    <div className="shrink-0 text-right">
		                      <div>
		                        <div className="text-[11px] font-semibold text-gray-500">
		                          {labels.stock.quantity}
		                        </div>
		                        <div className="text-base font-semibold text-gray-900">
		                          {quantityValue}
		                        </div>
		                      </div>
                    </div>
		                  </div>
                    </div>
		                );
		              })}
	              {reorderPurchaseItems.length === 0 ? (
	                <div className="rounded-md bg-[#F8FAFC] p-8 text-center text-sm text-gray-500 ring-1 ring-gray-200">
	                  {labels.stock.empty}
                </div>
              ) : null}
            </div>
            {panel === "reorder" && data.canWrite && reorderPurchaseItems.length > 0 ? (
              <div className="mt-4 flex justify-end gap-2">
                <AdminButton
                  disabled={
                    Boolean(busyId) ||
                    selectedOutstandingPurchaseItems.length === 0
                  }
                  onClick={createShoppingListFromSelection}
                >
                  {labels.stock.createShoppingList}
                </AdminButton>
              </div>
            ) : null}
            {panel === "reorder" && activeShoppingList ? (
              <div className="mt-6 rounded-md bg-[#F8FAFC] p-4 ring-1 ring-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3
                      className={classNames(
                        "text-sm font-semibold text-gray-900",
                        adminLocaleTextClass(locale, "heading")
                      )}
                    >
                      {labels.stock.shoppingList}: {activeShoppingList.listNumber}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {activeShoppingList.purchasedUnits}/{activeShoppingList.requiredUnits}{" "}
                      {labels.stock.units}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <AdminButton
                      disabled={shoppingListDraftLines.length === 0}
                      onClick={() =>
                        downloadShoppingListCsv(
                          activeShoppingList.listNumber,
                          shoppingListDraftLines
                        )
                      }
                      variant="secondary"
                    >
                      {labels.stock.exportCsv}
                    </AdminButton>
                    <label className="inline-flex cursor-pointer items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50">
                      {labels.stock.importCsv}
                      <input
                        accept=".csv,text/csv"
                        className="sr-only"
                        disabled={Boolean(busyId) || activeShoppingList.status !== "draft"}
                        onChange={(event) => {
                          void importShoppingListCsv(event.target.files?.[0] ?? null);
                          event.target.value = "";
                        }}
                        type="file"
                      />
                    </label>
                    <AdminButton
                      disabled={Boolean(busyId) || activeShoppingList.status !== "draft"}
                      onClick={() => void saveShoppingListDraft()}
                      variant="secondary"
                    >
                      {labels.stock.save}
                    </AdminButton>
                    <AdminButton
                      disabled={Boolean(busyId) || activeShoppingList.status !== "draft"}
                      onClick={() => void applyShoppingListDraft()}
                    >
                      {labels.stock.applyShoppingList}
                    </AdminButton>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[980px] w-full text-left text-sm">
                    <thead className="text-xs uppercase text-gray-500">
                      <tr>
                        <th className="py-2 pr-3">{labels.stock.product}</th>
                        <th className="py-2 pr-3">{labels.stock.quantity}</th>
                        <th className="py-2 pr-3">{labels.stock.wholesalerTried}</th>
                        <th className="py-2 pr-3">{labels.stock.status}</th>
                        <th className="py-2 pr-3">{labels.stock.purchased}</th>
                        <th className="py-2 pr-3">{labels.stock.wholesalePrice}</th>
                        <th className="py-2 pr-3">{labels.stock.priceOverride}</th>
                        <th className="py-2 pr-3">{labels.stock.notes}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {shoppingListDraftLines.map((line) => (
                        <tr key={line.id}>
                          <td className="py-2 pr-3">
                            <div className="font-semibold text-gray-900">
                              {line.productTitle}
                            </div>
                            <div className="text-xs text-gray-500">
                              {line.productId}
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-gray-700">
                            {line.requiredQuantity}
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-32 rounded-md bg-white px-2 py-1 text-sm ring-1 ring-gray-200"
                              disabled={Boolean(busyId) || activeShoppingList.status !== "draft"}
                              onChange={(event) =>
                                updateShoppingListDraftLine(line.id, {
                                  wholesalerTried: event.target.value
                                })
                              }
                              value={line.wholesalerTried}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <select
                              className="w-32 rounded-md bg-white px-2 py-1 text-sm ring-1 ring-gray-200"
                              disabled={Boolean(busyId) || activeShoppingList.status !== "draft"}
                              onChange={(event) =>
                                updateShoppingListDraftLine(line.id, {
                                  availabilityStatus:
                                    event.target.value as ShoppingListLineDraft["availabilityStatus"]
                                })
                              }
                              value={line.availabilityStatus}
                            >
                              <option value="unknown">{labels.stock.notSet}</option>
                              <option value="available">{labels.stock.available}</option>
                              <option value="partial">{labels.stock.partial}</option>
                              <option value="not_available">{labels.stock.unavailable}</option>
                            </select>
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-24 rounded-md bg-white px-2 py-1 text-sm ring-1 ring-gray-200"
                              disabled={Boolean(busyId) || activeShoppingList.status !== "draft"}
                              inputMode="numeric"
                              onChange={(event) =>
                                updateShoppingListDraftLine(line.id, {
                                  purchasedQuantity: event.target.value
                                })
                              }
                              value={line.purchasedQuantity}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-28 rounded-md bg-white px-2 py-1 text-sm ring-1 ring-gray-200"
                              disabled={Boolean(busyId) || activeShoppingList.status !== "draft"}
                              inputMode="decimal"
                              onChange={(event) =>
                                updateShoppingListDraftLine(line.id, {
                                  wholesalePriceAmount: event.target.value
                                })
                              }
                              value={line.wholesalePriceAmount}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-28 rounded-md bg-white px-2 py-1 text-sm ring-1 ring-gray-200"
                              disabled={Boolean(busyId) || activeShoppingList.status !== "draft"}
                              inputMode="decimal"
                              onChange={(event) =>
                                updateShoppingListDraftLine(line.id, {
                                  retailPriceAmount: event.target.value
                                })
                              }
                              value={line.retailPriceAmount}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-40 rounded-md bg-white px-2 py-1 text-sm ring-1 ring-gray-200"
                              disabled={Boolean(busyId) || activeShoppingList.status !== "draft"}
                              onChange={(event) =>
                                updateShoppingListDraftLine(line.id, {
                                  notes: event.target.value
                                })
                              }
                              value={line.notes}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
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
      </section>

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

      {restockingAdviceDetail ? (
        <AdminModal
          closeDisabled={Boolean(busyId)}
          closeLabel={labels.stock.cancel}
          onClose={() => setRestockingAdviceDetailId("")}
          size="lg"
          title={labels.stock.reorderAdviceDetails}
        >
          <div className="space-y-5 px-6 py-5">
            <div>
              <div className="text-base font-semibold text-gray-900">
                {restockingAdviceDetail.productTitle}
              </div>
              {showOrganisationContext ? (
                <div className="mt-1 text-sm text-gray-500">
                  {restockingAdviceDetail.organisationName}
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: labels.stock.reorderRisk,
                  value: riskLabel(labels, restockingAdviceDetail.riskLevel)
                },
                {
                  label: labels.stock.stockQuantity,
                  value: restockingAdviceDetail.currentStockQuantity
                },
                {
                  label: labels.stock.recommendedOrder,
                  value: restockingAdviceDetail.suggestedOrderQuantity
                },
                {
                  label: labels.stock.daysCover,
                  value:
                    restockingAdviceDetail.daysCover === null
                      ? labels.stock.notSet
                      : Math.round(restockingAdviceDetail.daysCover)
                },
                {
                  label: labels.stock.reorderBy,
                  value:
                    formatDate(restockingAdviceDetail.reorderBy, locale) ??
                    labels.stock.notSet
                },
                {
                  label: labels.stock.movementSale,
                  value: restockingAdviceDetail.outflowUnits30d
                }
              ].map((item) => (
                <div
                  className="rounded-md bg-[#F8FAFC] p-3 ring-1 ring-gray-200"
                  key={item.label}
                >
                  <div className="text-xs font-semibold text-gray-500">
                    {item.label}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <AdminButton
                disabled={Boolean(busyId)}
                onClick={() => setRestockingAdviceDetailId("")}
                variant="secondary"
              >
                {labels.stock.cancel}
              </AdminButton>
              {data.canWrite ? (
                <AdminButton
                  disabled={Boolean(busyId)}
                  onClick={() =>
                    openRestockingAdvicePurchaseOrderDraft(
                      restockingAdviceDetail.id
                    )
                  }
                >
                  {labels.stock.createPo}
                </AdminButton>
              ) : null}
            </div>
          </div>
        </AdminModal>
      ) : null}

	      {taskDetail ? (
        <AdminModal
          closeDisabled={Boolean(busyId)}
          closeLabel={labels.stock.cancel}
          onClose={() => setTaskDetailId("")}
          size="xl"
          title={labels.stock.taskDetails}
        >
          <div className="space-y-5 px-6 py-5">
            <div className="rounded-md bg-[#F8FAFC] p-4 ring-1 ring-gray-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-gray-900">
                      {taskDetail.title}
                    </div>
                    {taskDetail.isAgentTask ? (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                        {labels.visibility.agent}
                      </span>
                    ) : null}
                  </div>
	                  <div className="mt-1 text-xs text-gray-500">
	                    {taskDetail.taskType}
	                  </div>
	                  {showOrganisationContext ? (
	                    <div className="mt-1 text-xs text-gray-500">
	                      {taskDetail.organisationName}
	                    </div>
	                  ) : null}
	                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex rounded-md bg-white px-2 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                    {taskDetail.status}
                  </span>
                  <span className="inline-flex rounded-md bg-white px-2 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                    {taskDetail.priorityBand} · {taskDetail.priorityScore}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-gray-600 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-gray-500">
                    {labels.stock.claimedBy}
                  </div>
                  <div className="mt-1">
                    {taskDetail.isAgentTask
                      ? taskDetail.agentName ?? labels.visibility.agent
                      : taskDetail.claimedByName ??
                        taskDetail.claimedByEmail ??
                        labels.stock.unclaimed}
                  </div>
                  {taskDetail.claimedAt ? (
                    <div className="mt-1 text-xs text-gray-500">
                      {formatDateTime(taskDetail.claimedAt, locale)}
                    </div>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500">
                    {labels.stock.expectedAt}
                  </div>
                  <div className="mt-1">
                    {formatDate(taskDetail.dueAt ?? taskDetail.scheduledFor, locale) ??
                      labels.stock.notSet}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500">
                    {labels.stock.status}
                  </div>
                  <div className="mt-1">{taskDetail.status}</div>
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-600">
                <div className="text-xs font-semibold text-gray-500">
                  {labels.stock.reason}
                </div>
                <div className="mt-1">
                  {taskDetail.priorityReason ?? labels.stock.notSet}
                </div>
              </div>

            </div>

            {error ? (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {error}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <AdminButton
              disabled={Boolean(busyId)}
              onClick={() => setTaskDetailId("")}
              variant="secondary"
            >
              {labels.stock.cancel}
            </AdminButton>
            {data.canWrite && taskCanBuildDraftPo(taskDetail) ? (
              <AdminButton
                disabled={Boolean(busyId)}
                onClick={() => openBackorderPurchaseOrderDraft(taskDetail)}
              >
                {labels.stock.buildDraftPo}
              </AdminButton>
            ) : null}
            {data.canWrite
              ? (["claim", "complete", "snooze"] as const).map(
                  (taskAction) => (
                    <AdminButton
                      disabled={
                        Boolean(busyId) ||
                        (taskAction === "claim" && taskIsClaimed(taskDetail)) ||
                        (taskAction === "complete" && !taskIsClaimed(taskDetail)) ||
                        (taskAction === "complete" &&
                          taskCanBuildDraftPo(taskDetail))
                      }
                      key={taskAction}
                      onClick={() => runTaskAction(taskDetail, taskAction)}
                      variant={taskAction === "complete" ? "primary" : "secondary"}
                    >
                      {taskActionLabel(taskAction)}
                    </AdminButton>
                  )
                )
              : null}
          </div>
        </AdminModal>
      ) : null}

      {purchaseOrderDetail ? (
        <AdminModal
          closeDisabled={Boolean(busyId)}
          closeLabel={labels.stock.cancel}
          onClose={() => setPurchaseOrderDetailId("")}
          size="xl"
          title={labels.stock.purchaseOrderDetails}
        >
          <div className="space-y-5 px-6 py-5">
            <div className="rounded-md bg-[#F8FAFC] p-4 ring-1 ring-gray-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {purchaseOrderDetail.poNumber}
                  </div>
	                  <div className="mt-1 text-sm text-gray-600">
		                    {purchaseOrderDetail.supplierName}
	                  </div>
	                  {showOrganisationContext ? (
	                    <div className="mt-1 text-xs text-gray-500">
		                      {purchaseOrderDetail.organisationName}
	                    </div>
	                  ) : null}
	                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex rounded-md bg-white px-2 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                    {purchaseOrderStatusLabel(labels, purchaseOrderDetail.status)}
                  </span>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-gray-600 sm:grid-cols-4">
                <div>
                  <div className="text-xs font-semibold text-gray-500">
                    {labels.stock.expectedAt}
                  </div>
                  <div className="mt-1">
                    {formatDate(purchaseOrderDetail.expectedAt, locale) ??
                      labels.stock.notSet}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500">
                    {labels.stock.quantity}
                  </div>
                  <div className="mt-1">
                    {purchaseOrderDetail.orderedUnits} {labels.stock.orderItems}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500">
                    {labels.stock.wholesalePrice}
                  </div>
                  <div className="mt-1">
                    {formatPrice(
                      locale,
                      purchaseOrderDetail.currency,
                      purchaseOrderDetailTotal
                    ) ?? labels.stock.notSet}
                  </div>
                </div>
              </div>
              {purchaseOrderDetail.supplierContact ? (
                <div className="mt-4 text-sm text-gray-600">
                  <span className="font-semibold text-gray-700">
                    {labels.stock.supplierContact}:{" "}
                  </span>
                  {purchaseOrderDetail.supplierContact}
                </div>
              ) : null}
              {purchaseOrderDetail.notes ? (
                <div className="mt-2 text-sm text-gray-600">
                  <span className="font-semibold text-gray-700">
                    {labels.stock.notes}:{" "}
                  </span>
                  {purchaseOrderDetail.notes}
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <h3
                className={classNames(
                  "text-sm font-semibold text-gray-900",
                  adminLocaleTextClass(locale, "heading")
                )}
              >
                {labels.stock.orderItems}
              </h3>
              <div className="max-h-[360px] space-y-2 overflow-y-auto">
                {purchaseOrderDetailLines.map((line) => {
                  const product = productOptionById.get(line.productId);

                  return (
                    <div
                      className="flex items-start gap-3 rounded-md bg-white p-3 ring-1 ring-gray-200"
                      key={line.id}
                    >
                      <ProductThumbnail
                        imageUrl={product?.imageUrl ?? null}
                        title={line.productTitle}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {line.productTitle}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {labels.stock.quantity}: {line.quantityOrdered}
                          {" · "}
                          {labels.stock.remaining}:{" "}
                          {line.quantityOrdered - line.quantityReceived}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {labels.stock.wholesalePrice}:{" "}
                          {formatPrice(
                            locale,
                            purchaseOrderDetail.currency,
                            line.wholesalePriceAmount
                          ) ?? labels.stock.notSet}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {purchaseOrderDetailLines.length === 0 ? (
                  <div className="rounded-md bg-[#F8FAFC] px-3 py-8 text-center text-sm text-gray-500 ring-1 ring-gray-200">
                    {labels.stock.noItemsSelected}
                  </div>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {error}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <AdminButton
              disabled={Boolean(busyId)}
              onClick={() => setPurchaseOrderDetailId("")}
              variant="secondary"
            >
              {labels.stock.cancel}
            </AdminButton>
            {data.canWrite &&
            (purchaseOrderDetail.status === "draft" ||
              purchaseOrderDetail.status === "ordered") ? (
              <AdminButton
                disabled={Boolean(busyId)}
                onClick={() => voidPurchaseOrder(purchaseOrderDetail.id)}
                variant="secondary"
              >
                {labels.stock.voidPurchaseOrder}
              </AdminButton>
            ) : null}
            {data.canWrite && purchaseOrderDetail.status === "draft" ? (
              <AdminButton
                disabled={Boolean(busyId)}
                onClick={() => markPurchaseOrderOrdered(purchaseOrderDetail.id)}
              >
                {labels.stock.placeOrder}
              </AdminButton>
            ) : null}
          </div>
        </AdminModal>
      ) : null}

      {purchaseOrderDraft ? (
        <AdminModal
          closeDisabled={Boolean(busyId)}
          closeLabel={labels.stock.cancel}
          onClose={() => setPurchaseOrderDraft(null)}
          size="2xl"
          title={
            purchaseOrderDraft.sourceTaskId
              ? labels.stock.buildDraftPo
              : labels.stock.addPurchaseOrder
          }
        >
          <div className="grid gap-5 px-6 py-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-4">
              {purchaseOrderDraft.sourceTaskId ? (
                <div className="inline-flex rounded-md bg-gray-100 p-1 text-sm font-semibold text-gray-600">
                  {(["new", "existing"] as const).map((mode) => (
                    <button
                      className={classNames(
                        purchaseOrderDraft.mode === mode
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-600 hover:text-gray-900",
                        "rounded px-3 py-1.5"
                      )}
                      disabled={Boolean(busyId)}
                      key={mode}
                      onClick={() =>
                        updatePurchaseOrderDraft({
                          mode,
                          targetPurchaseOrderId:
                            mode === "existing"
                              ? draftPurchaseOrderOptions[0]?.id ?? ""
                              : ""
                        })
                      }
                      type="button"
                    >
                      {mode === "new"
                        ? labels.stock.addPurchaseOrder
                        : labels.stock.purchaseOrders}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                {purchaseOrderDraft.mode === "existing" ? (
                  <label className="grid gap-1 text-xs font-semibold text-gray-500 sm:col-span-2">
                    {labels.stock.purchaseOrders}
                    <select
                      className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                      disabled={Boolean(busyId)}
                      onChange={(event) =>
                        updatePurchaseOrderDraft({
                          targetPurchaseOrderId: event.target.value
                        })
                      }
                      value={purchaseOrderDraft.targetPurchaseOrderId}
                    >
                      <option value="">{labels.stock.notSet}</option>
                      {draftPurchaseOrderOptions.map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.poNumber} · {order.supplierName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="grid gap-1 text-xs font-semibold text-gray-500">
                    {labels.stock.supplier}
                    <input
                      className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                      onChange={(event) =>
                        updatePurchaseOrderDraft({
                          supplierName: event.target.value
                        })
                      }
                      value={purchaseOrderDraft.supplierName}
                    />
                  </label>
                )}
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.stock.expectedAt}
                  <input
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                    onChange={(event) =>
                      updatePurchaseOrderDraft({ expectedAt: event.target.value })
                    }
                    type="date"
                    value={purchaseOrderDraft.expectedAt}
                  />
                </label>
                {purchaseOrderDraft.mode === "new" ? (
                  <label className="grid gap-1 text-xs font-semibold text-gray-500 sm:col-span-2">
                    {labels.stock.supplierContact}
                    <input
                      className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                      onChange={(event) =>
                        updatePurchaseOrderDraft({
                          supplierContact: event.target.value
                        })
                      }
                      value={purchaseOrderDraft.supplierContact}
                    />
                  </label>
                ) : null}
              </div>

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

              <div className="max-h-[420px] overflow-y-auto rounded-md bg-[#F8FAFC] p-2 ring-1 ring-gray-200">
                <div className="grid gap-2">
                  {purchaseOrderProductOptions.map((product) => (
                    <button
                      className="flex w-full items-center gap-3 rounded-md bg-white p-2 text-left ring-1 ring-gray-200 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
                      disabled={Boolean(busyId)}
                      key={product.id}
                      onClick={() => addPurchaseOrderLine(product)}
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
                  {purchaseOrderProductOptions.length === 0 ? (
                    <div className="rounded-md bg-white px-3 py-8 text-center text-sm text-gray-500 ring-1 ring-gray-200">
                      {labels.stock.noProductMatches}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3
                  className={classNames(
                    "text-sm font-semibold text-gray-900",
                    adminLocaleTextClass(locale, "heading")
                  )}
                >
                  {labels.stock.orderItems}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  {purchaseOrderDraft.lines.length} {labels.stock.orderItems}
                </p>
              </div>

              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {purchaseOrderDraft.lines.map((line) => {
                  const product = productOptionById.get(line.productId);

                  return (
                    <div
                      className="rounded-md bg-white p-3 ring-1 ring-gray-200"
                      key={line.productId}
                    >
                      <div className="flex items-start gap-3">
                        <ProductThumbnail
                          imageUrl={product?.imageUrl ?? null}
                          title={product?.title ?? line.productId}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-gray-900">
                            {product?.title ?? line.productId}
                          </div>
                          <div className="mt-1 truncate text-xs text-gray-500">
                            {[product?.brandName, product?.productKind]
                              .filter(Boolean)
                              .join(" - ") || labels.stock.product}
                          </div>
                        </div>
                        <AdminButton
                          disabled={Boolean(busyId)}
                          onClick={() => removePurchaseOrderLine(line.productId)}
                          variant="secondary"
                        >
                          {labels.stock.removeItem}
                        </AdminButton>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <StockNumberInput
                          disabled={Boolean(busyId)}
                          label={labels.stock.quantity}
                          onChange={(value) =>
                            updatePurchaseOrderLine(line.productId, {
                              quantityOrdered: value
                            })
                          }
                          value={line.quantityOrdered}
                        />
                        <StockNumberInput
                          disabled={Boolean(busyId)}
                          label={labels.stock.wholesalePrice}
                          onChange={(value) =>
                            updatePurchaseOrderLine(line.productId, {
                              wholesalePriceAmount: value
                            })
                          }
                          step="0.01"
                          value={line.wholesalePriceAmount}
                        />
                        <label className="grid gap-1 text-xs font-semibold text-gray-500">
                          {labels.stock.expiresAt}
                          <input
                            className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                            disabled={Boolean(busyId)}
                            onChange={(event) =>
                              updatePurchaseOrderLine(line.productId, {
                                expectedExpiresAt: event.target.value
                              })
                            }
                            type="date"
                            value={line.expectedExpiresAt}
                          />
                        </label>
                      </div>
                      <label className="mt-3 grid gap-1 text-xs font-semibold text-gray-500">
                        {labels.stock.notes}
                        <input
                          className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                          disabled={Boolean(busyId)}
                          onChange={(event) =>
                            updatePurchaseOrderLine(line.productId, {
                              notes: event.target.value
                            })
                          }
                          value={line.notes}
                        />
                      </label>
                    </div>
                  );
                })}
                {purchaseOrderDraft.lines.length === 0 ? (
                  <div className="rounded-md bg-[#F8FAFC] px-3 py-10 text-center text-sm text-gray-500 ring-1 ring-gray-200">
                    {labels.stock.noItemsSelected}
                  </div>
                ) : null}
              </div>

              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.stock.notes}
                <textarea
                  className="min-h-20 rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  onChange={(event) =>
                    updatePurchaseOrderDraft({ notes: event.target.value })
                  }
                  value={purchaseOrderDraft.notes}
                />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <AdminButton
              disabled={Boolean(busyId)}
              onClick={() => setPurchaseOrderDraft(null)}
              variant="secondary"
            >
              {labels.stock.cancel}
            </AdminButton>
            <AdminButton disabled={!canSavePurchaseOrder} onClick={savePurchaseOrder}>
              {labels.stock.save}
            </AdminButton>
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
                        ) ?? labels.stock.notSet}
                        {" · "}
                        {customerOrderAvailability.etaDate
                          ? formatDate(customerOrderAvailability.etaDate, locale)
                          : labels.stock.notSet}
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

      {receiveEditor ? (
        <AdminModal
          closeDisabled={Boolean(busyId)}
          closeLabel={labels.stock.cancel}
          onClose={() => setReceiveEditor(null)}
          size="2xl"
          title={labels.stock.receiveStock}
        >
          <div className="space-y-5 px-6 py-5">
            <div className="rounded-md bg-[#F8FAFC] p-4 ring-1 ring-gray-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {receiveEditor.order.poNumber}
                  </div>
                  <div className="mt-1 text-xs font-medium text-gray-600">
                    {labels.stock.supplier}: {receiveEditor.order.supplierName}
                  </div>
                  {showOrganisationContext ? (
                    <div className="mt-1 text-xs text-gray-500">
                      {receiveEditor.order.organisationName}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-md bg-white px-2 py-1 text-gray-700 ring-1 ring-gray-200">
                    {labels.stock.expectedAt}:{" "}
                    {formatDate(receiveEditor.order.expectedAt, locale) ??
                      labels.stock.notSet}
                  </span>
                  <span className="rounded-md bg-white px-2 py-1 text-gray-700 ring-1 ring-gray-200">
                    {purchaseOrderStatusLabel(labels, receiveEditor.order.status)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {receiveEditor.lines.map((line) => {
                const product = productOptionById.get(line.productId);
                const receiveQuantity = numberOrNull(line.receiveQuantity);
                const receivedNow = receiveQuantity ?? 0;
                const shortfallAfterReceive = Math.max(
                  0,
                  line.remaining - receivedNow
                );
                const hasSupplierShortfall = shortfallAfterReceive > 0;

                return (
                  <div
                    className="rounded-md bg-white p-3 ring-1 ring-gray-200"
                    key={line.lineId}
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
                        <div className="mt-1 text-xs font-semibold text-gray-700">
                          {labels.stock.ordered}: {line.remaining} /{" "}
                          {labels.stock.receivedNow}: {receivedNow} /{" "}
                          {labels.stock.shortfall}: {shortfallAfterReceive}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {labels.stock.quantity}: {line.quantityReceived}/
                          {line.quantityOrdered}
                          {line.quantityClosedShort > 0 ? (
                            <>
                              {" · "}
                              {labels.stock.closedShort}: {line.quantityClosedShort}
                            </>
                          ) : null}
                          {" · "}
                          {labels.stock.remaining}: {line.remaining}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <label className="grid gap-1 text-xs font-semibold text-gray-500">
                        {labels.stock.receive}
                        <input
                          className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                          disabled={Boolean(busyId)}
                          max={line.remaining}
                          min={0}
                          onChange={(event) =>
                            updateReceiveLineDraft(line.lineId, {
                              receiveQuantity: event.target.value
                            })
                          }
                          step="1"
                          type="number"
                          value={line.receiveQuantity}
                        />
                      </label>
                      <AdminButton
                        className="bg-emerald-600 px-4 text-white hover:bg-emerald-700"
                        disabled={Boolean(busyId) || line.remaining < 1}
                        onClick={() =>
                          updateReceiveLineDraft(line.lineId, {
                            receiveQuantity: String(line.remaining)
                          })
                        }
                        variant="primary"
                      >
                        {labels.stock.receiveAll}
                      </AdminButton>
                    </div>
                    <div className="mt-3 grid gap-3 rounded-md bg-[#F8FAFC] p-3 ring-1 ring-gray-200 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
                      <label className="grid gap-1 text-xs font-semibold text-gray-500">
                        {labels.stock.shortfallHandling}
                        <select
                          className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                          disabled={Boolean(busyId) || !hasSupplierShortfall}
                          onChange={(event) =>
                            updateReceiveLineDraft(line.lineId, {
                              shortfallResolution:
                                event.target.value as RetailPurchaseOrderShortfallResolution
                            })
                          }
                          value={
                            hasSupplierShortfall
                              ? line.shortfallResolution
                              : "no_shortfall"
                          }
                        >
                          <option value="no_shortfall">
                            {labels.stock.noSupplierShortfall}
                          </option>
                          {([
                            "supplier_backorder",
                            "replacement_shipment",
                            "supplier_credit",
                            "supplier_refund",
                            "close_short",
                            "damaged_rejected"
                          ] as const).map((resolution) => (
                            <option key={resolution} value={resolution}>
                              {shortfallResolutionLabel(labels, resolution)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-gray-500">
                        {labels.stock.shortfallReference}
                        <input
                          className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                          disabled={Boolean(busyId) || !hasSupplierShortfall}
                          onChange={(event) =>
                            updateReceiveLineDraft(line.lineId, {
                              shortfallReference: event.target.value
                            })
                          }
                          value={hasSupplierShortfall ? line.shortfallReference : ""}
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-gray-500">
                        {labels.stock.shortfallExpectedAt}
                        <input
                          className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                          disabled={Boolean(busyId) || !hasSupplierShortfall}
                          onChange={(event) =>
                            updateReceiveLineDraft(line.lineId, {
                              shortfallExpectedAt: event.target.value
                            })
                          }
                          type="date"
                          value={hasSupplierShortfall ? line.shortfallExpectedAt : ""}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.stock.notes}
              <textarea
                className="min-h-20 rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                onChange={(event) =>
                  setReceiveEditor({
                    ...receiveEditor,
                    notes: event.target.value
                  })
                }
                value={receiveEditor.notes}
              />
            </label>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
		            <AdminButton
		              disabled={Boolean(busyId)}
		              onClick={() => setReceiveEditor(null)}
	              variant="secondary"
		            >
		              {labels.stock.cancel}
		            </AdminButton>
			            <AdminButton disabled={!canSaveReceive} onClick={() => saveReceiving()}>
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
