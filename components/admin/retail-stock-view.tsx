"use client";

import { useMemo, useState } from "react";
import type {
  AdminRetailStockData,
  AdminRetailStockRow,
  RetailStockStatus
} from "@/lib/admin-retail-stock";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  adminLocaleTextClass,
  classNames,
  formatGeneratedAt
} from "@/components/admin/dashboard-shared";
import { AdminButton, AdminModal } from "@/components/admin/ui";

type StockResponse = Readonly<{
  data?: AdminRetailStockData;
  error?: string;
  updated?: boolean;
}>;

type StockDraft = Readonly<{
  expiresAt: string;
  leadTimeDays: string;
  notes: string;
  retailPriceAmount: string;
  status: RetailStockStatus;
  stockQuantity: string;
  wholesalePriceAmount: string;
}>;

const emptyDraft: StockDraft = {
  expiresAt: "",
  leadTimeDays: "0",
  notes: "",
  retailPriceAmount: "",
  status: "active",
  stockQuantity: "0",
  wholesalePriceAmount: ""
};

function draftFromRow(row: AdminRetailStockRow): StockDraft {
  return {
    expiresAt: row.expiresAt ?? "",
    leadTimeDays: String(row.leadTimeDays),
    notes: row.notes ?? "",
    retailPriceAmount:
      row.retailPriceAmount === null ? "" : String(row.retailPriceAmount),
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

function priceFormatter(locale: Locale, currency: string) {
  return new Intl.NumberFormat(locale, {
    currency,
    maximumFractionDigits: 2,
    style: "currency"
  });
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

function StockNumberInput({
  disabled,
  label,
  min = 0,
  onChange,
  step = "1",
  value
}: Readonly<{
  disabled: boolean;
  label: string;
  min?: number;
  onChange: (value: string) => void;
  step?: string;
  value: string;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-gray-500">
      {label}
      <input
        className="w-28 rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
        disabled={disabled}
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
  data: initialData,
  labels,
  locale
}: Readonly<{
  data: AdminRetailStockData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const [data, setData] = useState(initialData);
  const [drafts, setDrafts] = useState<Record<string, StockDraft>>({});
  const [selectedOrganisationId, setSelectedOrganisationId] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<StockDraft>(emptyDraft);
  const [addProductId, setAddProductId] = useState("");
  const [addOrganisationId, setAddOrganisationId] = useState(
    initialData.organisations[0]?.id ?? ""
  );
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const rows = useMemo(
    () =>
      selectedOrganisationId === "all"
        ? data.rows
        : data.rows.filter((row) => row.organisationId === selectedOrganisationId),
    [data.rows, selectedOrganisationId]
  );
  const currentOrganisationId =
    selectedOrganisationId === "all" ? addOrganisationId : selectedOrganisationId;
  const currentOrganisation = data.organisations.find(
    (organisation) => organisation.id === currentOrganisationId
  ) ?? data.organisations[0];
  const currentCurrency = currentOrganisation?.currency ?? "THB";
  const existingProductIds = new Set(
    data.rows
      .filter((row) => row.organisationId === currentOrganisation?.id)
      .map((row) => row.productId)
  );
  const addProductOptions = data.productOptions.filter(
    (product) => !existingProductIds.has(product.id)
  );

  function updateDraft(id: string, patch: Partial<StockDraft>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? draftFromRow(data.rows.find((row) => row.id === id)!)),
        ...patch
      }
    }));
  }

  async function saveRow(row: AdminRetailStockRow) {
    const draft = drafts[row.id] ?? draftFromRow(row);

    setBusyId(row.id);
    setError("");

    try {
      const result = await saveStock({
        action: "upsert_stock_item",
        expiresAt: draft.expiresAt || null,
        leadTimeDays: numberOrNull(draft.leadTimeDays),
        locale,
        notes: draft.notes,
        organisationId: row.organisationId,
        productId: row.productId,
        retailPriceAmount: numberOrNull(draft.retailPriceAmount),
        status: draft.status,
        stockQuantity: numberOrNull(draft.stockQuantity),
        wholesalePriceAmount: numberOrNull(draft.wholesalePriceAmount)
      });

      if (result.data) {
        setData(result.data);
        setDrafts({});
      }
    } catch {
      setError(labels.stock.saveError);
    } finally {
      setBusyId("");
    }
  }

  async function addStockItem() {
    if (!addProductId || !currentOrganisation) {
      return;
    }

    setBusyId("new");
    setError("");

    try {
      const result = await saveStock({
        action: "upsert_stock_item",
        expiresAt: addDraft.expiresAt || null,
        leadTimeDays: numberOrNull(addDraft.leadTimeDays),
        locale,
        notes: addDraft.notes,
        organisationId: currentOrganisation.id,
        productId: addProductId,
        retailPriceAmount: numberOrNull(addDraft.retailPriceAmount),
        status: addDraft.status,
        stockQuantity: numberOrNull(addDraft.stockQuantity),
        wholesalePriceAmount: numberOrNull(addDraft.wholesalePriceAmount)
      });

      if (result.data) {
        setData(result.data);
      }

      setAddDraft(emptyDraft);
      setAddProductId("");
      setAddOpen(false);
    } catch {
      setError(labels.stock.saveError);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2
              className={classNames(
                "text-base font-semibold text-gray-900",
                adminLocaleTextClass(locale, "heading")
              )}
            >
              {labels.stock.title}
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              {labels.generated}: {formatGeneratedAt(data.generatedAt, locale)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {data.canFilterOrganisation ? (
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.stock.organisation}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  onChange={(event) => {
                    setSelectedOrganisationId(event.target.value);
                    if (event.target.value !== "all") {
                      setAddOrganisationId(event.target.value);
                    }
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
            {data.canWrite ? (
              <AdminButton onClick={() => setAddOpen(true)}>
                {labels.stock.addProduct}
              </AdminButton>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500">
                <th className="py-2 pr-4">{labels.stock.product}</th>
                <th className="py-2 pr-4">{labels.stock.organisation}</th>
                <th className="py-2 pr-4">{labels.stock.currency}</th>
                <th className="py-2 pr-4">{labels.stock.stockQuantity}</th>
                <th className="py-2 pr-4">{labels.stock.leadTimeDays}</th>
                <th className="py-2 pr-4">{labels.stock.wholesalePrice}</th>
                <th className="py-2 pr-4">{labels.stock.retailPrice}</th>
                <th className="py-2 pr-4">{labels.stock.expiresAt}</th>
                <th className="py-2 pr-4">{labels.stock.status}</th>
                <th className="py-2 pr-4">{labels.stock.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const draft = drafts[row.id] ?? draftFromRow(row);
                const disabled = !data.canWrite || busyId === row.id;
                const rowFormatter = priceFormatter(locale, row.currency);

                return (
                  <tr key={row.id}>
                    <td className="min-w-64 py-3 pr-4">
                      <div className="font-medium text-gray-900">
                        {row.productTitle}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {[row.brandName, row.productKind].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-gray-600">{row.organisationName}</td>
                    <td className="py-3 pr-4 text-gray-600">{row.currency}</td>
                    <td className="py-3 pr-4">
                      <StockNumberInput
                        disabled={disabled}
                        label={labels.stock.stockQuantity}
                        onChange={(value) => updateDraft(row.id, { stockQuantity: value })}
                        value={draft.stockQuantity}
                      />
                      {Number(draft.stockQuantity) === 0 ? (
                        <div className="mt-1 text-xs font-medium text-amber-700">
                          {labels.stock.outOfStock}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      <StockNumberInput
                        disabled={disabled}
                        label={labels.stock.leadTimeDays}
                        onChange={(value) => updateDraft(row.id, { leadTimeDays: value })}
                        value={draft.leadTimeDays}
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <StockNumberInput
                        disabled={disabled}
                        label={labels.stock.wholesalePrice}
                        onChange={(value) =>
                          updateDraft(row.id, { wholesalePriceAmount: value })
                        }
                        step="0.01"
                        value={draft.wholesalePriceAmount}
                      />
                      {row.wholesalePriceAmount !== null ? (
                        <div className="mt-1 text-xs text-gray-400">
                          {rowFormatter.format(row.wholesalePriceAmount)}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      <StockNumberInput
                        disabled={disabled}
                        label={labels.stock.retailPrice}
                        onChange={(value) =>
                          updateDraft(row.id, { retailPriceAmount: value })
                        }
                        step="0.01"
                        value={draft.retailPriceAmount}
                      />
                      {row.retailPriceAmount !== null ? (
                        <div className="mt-1 text-xs text-gray-400">
                          {rowFormatter.format(row.retailPriceAmount)}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                        disabled={disabled}
                        onChange={(event) =>
                          updateDraft(row.id, { expiresAt: event.target.value })
                        }
                        type="date"
                        value={draft.expiresAt}
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                        disabled={disabled}
                        onChange={(event) =>
                          updateDraft(row.id, {
                            status: event.target.value as RetailStockStatus
                          })
                        }
                        value={draft.status}
                      >
                        {(["active", "disabled", "deleted"] as const).map((status) => (
                          <option key={status} value={status}>
                            {statusLabel(labels, status)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <AdminButton
                        disabled={disabled}
                        onClick={() => saveRow(row)}
                        variant="secondary"
                      >
                        {labels.stock.save}
                      </AdminButton>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-sm text-gray-500" colSpan={10}>
                    {labels.stock.empty}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {addOpen ? (
        <AdminModal
          closeLabel={labels.stock.cancel}
          onClose={() => setAddOpen(false)}
          size="lg"
          title={labels.stock.addProduct}
        >
          <div className="grid gap-4 px-6 py-5">
            {data.canFilterOrganisation ? (
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.stock.organisation}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  onChange={(event) => setAddOrganisationId(event.target.value)}
                  value={addOrganisationId}
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
              {labels.stock.selectProduct}
              <select
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                onChange={(event) => setAddProductId(event.target.value)}
                value={addProductId}
              >
                <option value="">{labels.stock.selectProduct}</option>
                {addProductOptions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {[product.title, product.brandName].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <StockNumberInput
                disabled={busyId === "new"}
                label={labels.stock.stockQuantity}
                onChange={(value) =>
                  setAddDraft((current) => ({ ...current, stockQuantity: value }))
                }
                value={addDraft.stockQuantity}
              />
              <StockNumberInput
                disabled={busyId === "new"}
                label={labels.stock.leadTimeDays}
                onChange={(value) =>
                  setAddDraft((current) => ({ ...current, leadTimeDays: value }))
                }
                value={addDraft.leadTimeDays}
              />
              <StockNumberInput
                disabled={busyId === "new"}
                label={`${labels.stock.wholesalePrice} (${currentCurrency})`}
                onChange={(value) =>
                  setAddDraft((current) => ({
                    ...current,
                    wholesalePriceAmount: value
                  }))
                }
                step="0.01"
                value={addDraft.wholesalePriceAmount}
              />
              <StockNumberInput
                disabled={busyId === "new"}
                label={`${labels.stock.retailPrice} (${currentCurrency})`}
                onChange={(value) =>
                  setAddDraft((current) => ({ ...current, retailPriceAmount: value }))
                }
                step="0.01"
                value={addDraft.retailPriceAmount}
              />
            </div>

            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.stock.expiresAt}
              <input
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                onChange={(event) =>
                  setAddDraft((current) => ({
                    ...current,
                    expiresAt: event.target.value
                  }))
                }
                type="date"
                value={addDraft.expiresAt}
              />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.stock.notes}
              <textarea
                className="min-h-20 rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                onChange={(event) =>
                  setAddDraft((current) => ({ ...current, notes: event.target.value }))
                }
                value={addDraft.notes}
              />
            </label>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <AdminButton
              disabled={busyId === "new"}
              onClick={() => setAddOpen(false)}
              variant="secondary"
            >
              {labels.stock.cancel}
            </AdminButton>
            <AdminButton
              disabled={!addProductId || busyId === "new"}
              onClick={addStockItem}
            >
              {labels.stock.addProduct}
            </AdminButton>
          </div>
        </AdminModal>
      ) : null}
    </div>
  );
}
