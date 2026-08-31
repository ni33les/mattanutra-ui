"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  FileDown,
  FileText,
  PackageCheck,
  ReceiptText,
  Truck
} from "lucide-react";
import type {
  AdminRetailCustomerOrder,
  AdminRetailStockData,
  AdminRetailStockMovement,
  AdminRetailStockProductOption,
  AdminRetailStockRow,
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
import {
  buildCustomerOrderWorkflowSteps,
  customerOrderIncludedInAllMetric,
  customerOrderMatchesFilter,
  customerOrderMetricColor,
  customerOrderProcessingFeeAmount,
  customerOrderRetailValue,
  customerOrderStatusDisplay,
  customerOrderSubtotalAmount,
  customerOrderStatusFilterLabel,
  customerOrderStatusFilters,
  customerOrderStatusMetricKey,
  customerOrderStatusPillClass,
  type CustomerOrderFilter,
  type CustomerOrderMetricKey
} from "@/components/admin/retail-stock/customer-order-display";
import {
  addressDisplayLines,
  addressNoteLines,
  deliveryAddressForOrder,
  emptyRetailField,
  formatDate,
  formatDateTime,
  orderLineAwaitingStockUnits,
  orderLineIdentifierParts,
  openRetailPlanInsert,
  printRetailOrderDocument,
  printShipmentLabel
} from "@/components/admin/retail-stock/order-documents";
import {
  activeShoppingListCoverageUnits,
  activeShoppingListReturnedDemandUnits,
  orgProductKey,
  type ReorderPurchaseItem
} from "@/components/admin/retail-stock/shopping-list-view-model";
import {
  ProductThumbnail,
  StockNumberInput,
  backorderPolicyClass,
  backorderPolicyLabel,
  draftFromRow,
  emptyStockDraft,
  movementLabel,
  numberOrNull,
  retailAvailabilityLabel,
  statusLabel,
  stockAvailabilityStatus,
  type StockDraft
} from "@/components/admin/retail-stock/stock-controls";
import {
  stockRowEligibleForSale,
  stockRowIneligibleReason,
  stockRowIsOnSale,
  stockRowIsSelected,
  stockRowIsUnavailable,
  stockRowIsUnselected
} from "@/lib/admin-retail-stock-eligibility";

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

const kexCarrierName = "KEX Express (Thailand)";
const grabCarrierName = "Grab";
const showKexCarrierSetup = false;
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
  | "unselected"
  | "selected"
  | "on_sale"
  | "unavailable";

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

type PickupDialogDraft = Readonly<{
  carrierName: string;
  shipmentNotes: string;
  trackingNumber: string;
  trackingUrl: string;
}>;

type PickupDialog = Readonly<{
  draft: PickupDialogDraft;
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
  const [pickupDialog, setPickupDialog] = useState<PickupDialog | null>(null);
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
          if (selectedStockFilter === "all") {
            return true;
          }

          if (selectedStockFilter === "unselected") {
            return stockRowIsUnselected(row);
          }

          if (selectedStockFilter === "selected") {
            return stockRowIsSelected(row);
          }

          if (selectedStockFilter === "on_sale") {
            return stockRowIsOnSale(row);
          }

          if (selectedStockFilter === "unavailable") {
            return stockRowIsUnavailable(row);
          }

          return true;
        })
        .filter((row) =>
          searchMatches(stockSearch, [
            row.productTitle,
            row.brandName,
            row.productKind,
            row.organisationName,
            row.productId,
            row.retailSellableProductId,
            row.ean13,
            row.manufacturerSku,
            row.currency,
            statusLabel(labels, row.status)
          ])
        ),
    [labels, organisationStockRows, selectedStockFilter, stockSearch]
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
  const productCatalogueExportHref = hygeiaOrganisationId
    ? `/api/admin/products/catalogue/export?scope=retail&organisationId=${encodeURIComponent(
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
            ...orderLines.flatMap((line) => [
              line.productId,
              line.productTitle,
              line.ean13,
              line.manufacturerSku,
              line.notes
            ])
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
    const selectedRows = organisationStockRows.filter(stockRowIsSelected);
    let eligible = 0;

    for (const row of organisationStockRows) {
      if (stockRowEligibleForSale(row)) {
        eligible += 1;
      }
    }

    return {
      on_sale: eligible,
      selected: selectedRows.length,
      unavailable: selectedRows.filter(stockRowIsUnavailable).length,
      unselected: organisationStockRows.filter(stockRowIsUnselected).length
    };
  }, [organisationStockRows]);
  const stockMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "unselected",
      label: labels.stock.unselected ?? "Unselected",
      series: [],
      value: formatNumber(stockSummary.unselected, locale)
    },
    {
      color: businessMetricColors.active,
      id: "selected",
      label: labels.stock.selectedForSale ?? "Selected",
      series: [],
      value: formatNumber(stockSummary.selected, locale)
    },
    {
      color: businessMetricColors.succeeded,
      id: "on_sale",
      label: labels.stock.onSale ?? "On sale",
      series: [],
      value: formatNumber(stockSummary.on_sale, locale)
    },
    {
      color: businessMetricColors.failed,
      id: "unavailable",
      label: labels.stock.unavailable ?? "Unavailable",
      series: [],
      value: formatNumber(stockSummary.unavailable, locale)
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
          product.productKind,
          product.id,
          product.ean13,
          product.manufacturerSku
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
            product.productKind,
            product.id,
            product.ean13,
            product.manufacturerSku
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
  // Shopping list is backorder demand only (no predictive recommendations).
  const reorderPurchaseItems = useMemo(
    () =>
      outstandingPurchaseItems.filter((item) => item.unassignedDemandUnits > 0),
    [outstandingPurchaseItems]
  );
  const shoppingListCandidateItems = useMemo(
    () => reorderPurchaseItems,
    [reorderPurchaseItems]
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
  const defaultOutstandingPurchaseKeySignature = useMemo(
    () => defaultOutstandingPurchaseKeys.join("\u0000"),
    [defaultOutstandingPurchaseKeys]
  );
  useEffect(() => {
    queueMicrotask(() => {
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
    });
  }, [defaultOutstandingPurchaseKeys, defaultOutstandingPurchaseKeySignature]);

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
  const shoppingListModalList = activeShoppingList;
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
    if (!activeShoppingList) {
      return;
    }

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
  }, [activeShoppingList, activeShoppingListLines]);

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

  async function importRetailProductCatalogueFile(file: File | null) {
    if (!file || !hygeiaOrganisationId) {
      return;
    }

    setBusyId("product-catalogue-import");
    setError("");

    try {
      const csvText = await file.text();
      const response = await fetch("/api/admin/products/catalogue/import", {
        body: JSON.stringify({
          accessToken,
          csvText,
          organisationId: hygeiaOrganisationId,
          scope: "retail"
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
      setError(actionErrorMessage(error, labels.stock.saveError));
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

    const selectedLineInputs = selectedOutstandingPurchaseItems.map((item) => {
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
        assignedQuantity,
        currentStockQuantity: row?.stockQuantity ?? 0,
        item,
        requiredQuantity,
        unorderedNeedQuantity
      };
    });

    // Create silently — no create popup (previous pending modal was non-dismissible).
    setSelectedShoppingListId("");
    setShoppingListDraftLines([]);

    const created = await runRetailAction(
      {
        action: "create_shopping_list",
        lines: selectedLineInputs.map(
          ({
            assignedQuantity,
            currentStockQuantity,
            item,
            requiredQuantity,
            unorderedNeedQuantity
          }) => ({
            actualQuantity: assignedQuantity,
            assignedQuantity,
            currentStockQuantity,
            productId: item.productId,
            requiredQuantity,
            retailPriceAmount: null,
            unorderedNeedQuantity,
            wholesalePriceAmount: item.wholesalePriceAmount
          })
        ),
        organisationId
      },
      `shopping-list:${organisationId}`
    );

    if (created) {
      setSelectedOutstandingPurchaseKeys(null);
      setSelectedShoppingListId("");
      // Refresh so the new list appears in the table; open only on explicit row click.
      void refreshRetailStockData().catch((error) => {
        setError(actionErrorMessage(error, labels.stock.saveError));
      });
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
            // UI only offers Add (receive +) and Remove (adjustment -).
            quantity: (() => {
              const qty = numberOrNull(movementEditor.draft.quantity);
              if (qty === null) return null;
              const absolute = Math.abs(qty);
              return movementEditor.draft.movementType === "adjustment"
                ? -absolute
                : absolute;
            })(),
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

  function openPickupDialog(order: AdminRetailCustomerOrder) {
    const existingCarrierName = order.shipment?.carrierName ?? "";

    setPickupDialog({
      draft: {
        carrierName: shipmentCarrierOptions.some(
          (carrier) => carrier === existingCarrierName
        )
          ? existingCarrierName
          : kexCarrierName,
        shipmentNotes: order.shipment?.shipmentNotes ?? "",
        trackingNumber: order.shipment?.trackingNumber ?? "",
        trackingUrl: order.shipment?.trackingUrl ?? ""
      },
      order
    });
  }

  function updatePickupDraft(patch: Partial<PickupDialogDraft>) {
    setPickupDialog((current) =>
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

  async function markCustomerOrderShipped(order: AdminRetailCustomerOrder) {
    const saved = await runRetailAction(
      {
        action: "advance_customer_order",
        carrierName: order.shipment?.carrierName ?? null,
        customerOrderId: order.id,
        orderAction: "mark_shipped",
        shipmentNotes: order.shipment?.shipmentNotes ?? null,
        trackingNumber: order.shipment?.trackingNumber ?? null,
        trackingUrl: order.shipment?.trackingUrl ?? null
      },
      `order:${order.id}:mark_shipped`,
      { closeWorkflows: false }
    );

    if (saved) {
      setPickupDialog(null);
    }
  }

  async function bookPickupForCustomerOrder() {
    if (!pickupDialog) {
      return;
    }

    const saved = await runRetailAction(
      {
        action: "book_order_pickup",
        carrierName: pickupDialog.draft.carrierName || null,
        customerOrderId: pickupDialog.order.id,
        shipmentNotes: pickupDialog.draft.shipmentNotes || null,
        trackingNumber: pickupDialog.draft.trackingNumber || null,
        trackingUrl: pickupDialog.draft.trackingUrl || null
      },
      `order:${pickupDialog.order.id}:book_pickup`,
      { closeWorkflows: false }
    );

    if (saved) {
      setPickupDialog(null);
    }
  }

  async function printOrRequestShipmentLabel() {
    if (!pickupDialog) {
      return;
    }

    const selectedCarrier = shipmentCarrierSelectValue(
      pickupDialog.draft.carrierName
    );

    if (pickupDialog.order.shipment?.labelUrl || selectedCarrier !== kexCarrierName) {
      printShipmentLabel({
        labels,
        lines: pickupDialogLines,
        locale,
        order: pickupDialog.order
      });
      return;
    }

    await runRetailAction(
      {
        action: "generate_order_shipping_label",
        carrierName: pickupDialog.draft.carrierName || kexCarrierName,
        customerOrderId: pickupDialog.order.id
      },
      `order:${pickupDialog.order.id}:generate_shipping_label`,
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
          ean13: editor.row.ean13,
          id: editor.row.productId,
          imageUrl: editor.row.imageUrl,
          manufacturerSku: editor.row.manufacturerSku,
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
  const customerOrderDeliveryAddressLines = addressDisplayLines(
    customerOrderDeliveryAddress
  );
  const customerOrderDeliveryNoteLines = addressNoteLines(
    labels,
    customerOrderDeliveryAddress
  );
  const customerOrderWorkflowSteps = customerOrderDetail
    ? buildCustomerOrderWorkflowSteps(labels, customerOrderDetail)
    : [];
  const pickupDialogLines = pickupDialog
    ? data.customerOrderLines.filter(
        (line) => line.customerOrderId === pickupDialog.order.id
      )
    : [];
  const pickupDialogAddressLines = pickupDialog
    ? addressDisplayLines(deliveryAddressForOrder(pickupDialog.order))
    : [];
  const pickupDialogItemCount = pickupDialogLines.reduce(
    (total, line) => total + line.quantityOrdered,
    0
  );
  const pickupDialogLabelAction =
    pickupDialog?.order.shipment?.labelUrl
      ? "Print label"
      : shipmentCarrierSelectValue(pickupDialog?.draft.carrierName ?? "") ===
          kexCarrierName
        ? "Generate official label"
        : "Print fallback label";
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
	            {productCatalogueExportHref ? (
	              <a
	                className="inline-flex items-center justify-center rounded-md bg-[#1FA77A] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#188865]"
	                href={productCatalogueExportHref}
	              >
	                {labels.stock.exportJson}
	              </a>
	            ) : (
	              <AdminButton disabled>
	                {labels.stock.exportJson}
	              </AdminButton>
	            )}
	            {data.canWrite ? (
	              <label
	                className={classNames(
	                  Boolean(busyId) || !hygeiaOrganisationId
	                    ? "cursor-not-allowed opacity-60"
	                    : "cursor-pointer hover:bg-[#188865]",
	                  "inline-flex items-center justify-center rounded-md bg-[#1FA77A] px-3 py-2 text-sm font-semibold text-white shadow-sm transition"
	                )}
	                title={
	                  hygeiaOrganisationId
	                    ? undefined
	                    : labels.stock.hygeiaRetailerRequired
	                }
	              >
	                {labels.stock.importCsv}
	                <input
	                  accept=".csv,text/csv"
	                  className="sr-only"
	                  disabled={Boolean(busyId) || !hygeiaOrganisationId}
	                  onChange={(event) => {
	                    void importRetailProductCatalogueFile(event.target.files?.[0] ?? null);
	                    event.target.value = "";
	                  }}
	                  type="file"
	                />
	              </label>
	            ) : null}
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
	        {showKexCarrierSetup ? (
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
	        ) : null}
	        <div className="mt-4 overflow-x-auto">
	          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
                <tr className="text-left text-xs font-semibold text-gray-500">
                  <th className="py-2 pr-4">{labels.stock.product}</th>
                  {showOrganisationContext ? (
                    <th className="py-2 pr-4">{labels.stock.organisation}</th>
                  ) : null}
                  <th className="py-2 pr-4">
                    {labels.stock.onSale ?? "On sale"}
                  </th>
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
                const onSale = stockRowIsOnSale(row);
                const unavailable = stockRowIsUnavailable(row);

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
                      <span
                        className={classNames(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                          onSale
                            ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
                            : unavailable
                              ? "bg-amber-50 text-amber-800 ring-amber-100"
                              : "bg-gray-50 text-gray-700 ring-gray-200"
                        )}
                        title={
                          onSale
                            ? labels.stock.onSale ?? "On sale"
                            : unavailable
                              ? stockRowIneligibleReason(row, labels.stock)
                              : labels.stock.unselected ?? "Unselected"
                        }
                      >
                        {onSale
                          ? labels.stock.onSaleShort ?? "On sale"
                          : unavailable
                            ? labels.stock.unavailable ?? "Unavailable"
                            : labels.stock.unselected ?? "Unselected"}
                      </span>
                      {unavailable ? (
                        <div className="mt-1 max-w-[10rem] text-xs text-gray-500">
                          {stockRowIneligibleReason(row, labels.stock)}
                        </div>
                      ) : null}
                    </td>
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
                    colSpan={showOrganisationContext ? 11 : 10}
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
                {customerOrderProcessingFeeAmount(customerOrderDetail) > 0 ? (
                  <div className="mt-1 text-xs font-semibold text-gray-600">
                    {labels.stock.processingFee ?? "Processing fee"}:{" "}
                    <span className="text-gray-900">
                      {formatPrice(
                        locale,
                        customerOrderDetail.currency,
                        customerOrderProcessingFeeAmount(customerOrderDetail)
                      ) ?? emptyRetailField}
                    </span>
                  </div>
                ) : null}
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
                  {customerOrderDetail.planInsertAvailable ? (
                    <AdminButton
                      className="gap-2"
                      onClick={() =>
                        openRetailPlanInsert(customerOrderDetail, locale)
                      }
                      variant="secondary"
                    >
                      <FileText aria-hidden="true" className="size-4" />
                      {labels.stock.planInsert}
                    </AdminButton>
                  ) : null}
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
                  <div className="mt-3 grid gap-4 text-sm text-gray-600 md:grid-cols-1">
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
                  <div className="rounded-md bg-white p-4 ring-1 ring-gray-200">
                    <dl className="ml-auto grid max-w-sm gap-2 text-sm">
                      <div className="flex justify-between gap-6">
                        <dt className="text-gray-500">
                          {labels.stock.subtotal ?? "Subtotal"}
                        </dt>
                        <dd className="font-semibold text-gray-900">
                          {formatPrice(
                            locale,
                            customerOrderDetail.currency,
                            customerOrderSubtotalAmount(customerOrderDetail)
                          ) ?? emptyRetailField}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-6">
                        <dt className="text-gray-500">
                          {labels.stock.processingFee ?? "Processing fee"}
                        </dt>
                        <dd className="font-semibold text-gray-900">
                          {formatPrice(
                            locale,
                            customerOrderDetail.currency,
                            customerOrderProcessingFeeAmount(customerOrderDetail)
                          ) ?? emptyRetailField}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-6 border-t border-gray-100 pt-2 text-base">
                        <dt className="font-semibold text-gray-900">
                          {labels.stock.total}
                        </dt>
                        <dd className="font-semibold text-gray-900">
                          {formatPrice(
                            locale,
                            customerOrderDetail.currency,
                            customerOrderRetailValue(customerOrderDetail)
                          ) ?? emptyRetailField}
                        </dd>
                      </div>
                    </dl>
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
              {data.canWrite && customerOrderDetail.actionStates.pack.enabled ? (
                <AdminButton
                  disabled={Boolean(busyId)}
                  onClick={() =>
                    runCustomerOrderAction(customerOrderDetail, "mark_packed")
                  }
                  title={customerOrderDetail.actionStates.pack.reason ?? undefined}
                >
                  Mark Packed
                </AdminButton>
              ) : null}
              {data.canWrite &&
              customerOrderDetail.actionStates.bookPickup.enabled ? (
                <AdminButton
                  disabled={Boolean(busyId)}
                  onClick={() => openPickupDialog(customerOrderDetail)}
                  title={
                    customerOrderDetail.actionStates.bookPickup.reason ??
                    undefined
                  }
                >
                  {labels.stock.bookPickup}
                </AdminButton>
              ) : null}
              {data.canWrite && customerOrderDetail.actionStates.ship.enabled ? (
                <AdminButton
                  disabled={Boolean(busyId)}
                  onClick={() => void markCustomerOrderShipped(customerOrderDetail)}
                  title={customerOrderDetail.actionStates.ship.reason ?? undefined}
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
            <label className="block w-full max-w-md">
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
              <header className="mb-4">
                <h3
                  className={classNames(
                    "text-lg font-semibold text-gray-900",
                    adminLocaleTextClass(locale, "heading")
                  )}
                >
                  {labels.stock.reorderBackorders}
                </h3>
                <p className="mt-1 text-sm font-normal leading-6 text-gray-600">
                  {labels.stock.reorderBackordersDescription}
                </p>
              </header>
              <div className="overflow-x-auto">
                <table className="min-w-[640px] w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-16" />
                    <col />
                    <col className="w-48" />
                    <col className="w-28" />
                  </colgroup>
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="py-2 pl-3 pr-3">
                        <span className="sr-only">
                          {labels.stock.selectProduct}
                        </span>
                      </th>
                      <th className="py-2 pr-3">{labels.stock.product}</th>
                      <th className="py-2 pr-3">{labels.stock.brand ?? "Brand"}</th>
                      <th className="py-2 pr-3">{labels.stock.quantity}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
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
                              onChange={() =>
                                toggleOutstandingPurchaseItem(item)
                              }
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
                  </tbody>
                </table>
              </div>
              {data.canWrite ? (
                <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
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
            </section>

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
              <div className="overflow-x-auto">
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
      {shoppingListModalList ? (
        <RetailShoppingListModal
          busy={Boolean(busyId)}
          labels={labels}
          lines={shoppingListDraftLines}
          list={shoppingListModalList}
          onClose={() => {
            setSelectedShoppingListId("");
          }}
          onLinesChange={setShoppingListDraftLines}
          onReopen={() => void reopenShoppingList()}
          onSave={() => void saveShoppingListDraft()}
        />
      ) : null}
      {pickupDialog ? (
        <AdminModal
          closeDisabled={Boolean(busyId)}
          closeLabel={labels.stock.cancel}
          description={
            <span>
              Select the courier and book pickup. Labels are helpful but not
              required before pickup is requested.
            </span>
          }
          onClose={() => setPickupDialog(null)}
          size="lg"
          title={labels.stock.bookPickup}
        >
          <div className="space-y-5 px-6 py-5">
            <section className="grid gap-3 rounded-md bg-gray-50 p-4 text-sm ring-1 ring-gray-100 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase text-gray-500">
                  {labels.stock.customerOrders}
                </div>
                <div className="mt-1 font-semibold text-gray-900">
                  {pickupDialog.order.orderNumber}
                </div>
                <div className="mt-1 text-gray-600">
                  {pickupDialog.order.customerName ||
                    pickupDialog.order.customerEmail ||
                    emptyRetailField}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-gray-500">
                  {labels.stock.orderItems}
                </div>
                <div className="mt-1 font-semibold text-gray-900">
                  {formatNumber(pickupDialogItemCount, locale)}{" "}
                  {labels.stock.units}
                </div>
                <div className="mt-1 text-gray-600">
                  {pickupDialog.order.organisationName}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs font-semibold uppercase text-gray-500">
                  {labels.stock.deliveryAddress}
                </div>
                <div className="mt-1 space-y-1 text-gray-800">
                  {pickupDialogAddressLines.length > 0 ? (
                    pickupDialogAddressLines.map((line) => (
                      <div key={line}>{line}</div>
                    ))
                  ) : (
                    <div className="text-gray-500">{emptyRetailField}</div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                Carrier
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  onChange={(event) => {
                    updatePickupDraft({
                      carrierName: event.target.value || kexCarrierName
                    });
                  }}
                  value={shipmentCarrierSelectValue(
                    pickupDialog.draft.carrierName
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
                {shipmentLabelStatusText(pickupDialog.order.shipment)}
              </div>
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                Tracking number
                <input
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  onChange={(event) =>
                    updatePickupDraft({ trackingNumber: event.target.value })
                  }
                  placeholder="Optional"
                  value={pickupDialog.draft.trackingNumber}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                Tracking URL
                <input
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  onChange={(event) =>
                    updatePickupDraft({ trackingUrl: event.target.value })
                  }
                  placeholder="https://..."
                  type="url"
                  value={pickupDialog.draft.trackingUrl}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500 sm:col-span-2">
                Pickup notes
                <textarea
                  className="min-h-20 rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  onChange={(event) =>
                    updatePickupDraft({ shipmentNotes: event.target.value })
                  }
                  placeholder="Optional"
                  value={pickupDialog.draft.shipmentNotes}
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
              onClick={() => setPickupDialog(null)}
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
              {pickupDialogLabelAction}
            </AdminButton>
            <AdminButton
              disabled={!data.canWrite || Boolean(busyId)}
              onClick={() => void bookPickupForCustomerOrder()}
            >
              {labels.stock.bookPickup}
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
                  {(["active", "disabled"] as const).map((status) => (
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
                          { type: "receive" as const, label: labels.stock.movementAdd },
                          { type: "adjustment" as const, label: labels.stock.movementRemove }
                        ] as const
                      ).map((option) => (
                        <option key={option.type} value={option.type}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <StockNumberInput
                    disabled={Boolean(busyId)}
                    label={labels.stock.quantity}
                    min={1}
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
