"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AdminRetailShoppingList } from "@/lib/admin-retail-stock";
import type { AdminContent } from "@/components/admin/dashboard-content";
import { readableToken } from "@/components/admin/dashboard-shared";
import { AdminButton, AdminModal } from "@/components/admin/ui";

export type ShoppingListLineDraft = Readonly<{
  actualQuantity: string;
  assignedQuantity: string;
  brandName: string | null;
  currentStockQuantity: string;
  ean13: string | null;
  id: string;
  manufacturerSku: string | null;
  productId: string;
  productTitle: string;
  requiredQuantity: string;
  retailPriceAmount: string;
  stockedQuantity: string;
  unorderedNeedQuantity: string;
  wholesalePriceAmount: string;
}>;

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  const normalized = text.replace(/\r?\n/g, " ");

  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }

  return normalized;
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

function csvHeaderKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function csvCellByHeader(
  row: readonly string[],
  indexByName: ReadonlyMap<string, number>,
  names: readonly string[]
) {
  for (const name of names) {
    const index = indexByName.get(csvHeaderKey(name));

    if (index !== undefined) {
      return row[index] ?? "";
    }
  }

  return "";
}

function matchShoppingListImportRow(
  row: readonly string[],
  indexByName: ReadonlyMap<string, number>,
  line: ShoppingListLineDraft
) {
  const sku = csvCellByHeader(row, indexByName, [
    "sku",
    "mattaNutraSku",
    "MattaNutra SKU",
    "internalSku"
  ]).trim();
  const ean13 = csvCellByHeader(row, indexByName, ["ean13", "ean13Barcode"]).trim();
  const manufacturerSku = csvCellByHeader(row, indexByName, [
    "manufacturerSku"
  ]).trim();
  const productTitle = csvCellByHeader(row, indexByName, ["productTitle"]).trim();

  return (
    (sku.length > 0 && sku === line.productId) ||
    (ean13.length > 0 && ean13 === line.ean13) ||
    (manufacturerSku.length > 0 && manufacturerSku === line.manufacturerSku) ||
    (productTitle.length > 0 && productTitle === line.productTitle)
  );
}

function priceHeader(label: string, currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase() || "CCY";

  return `${label} (${normalizedCurrency})`;
}

function downloadShoppingListCsv(
  listNumber: string,
  lines: readonly ShoppingListLineDraft[]
) {
  const columns = [
    "sku",
    "ean13",
    "manufacturerSku",
    "productTitle",
    "requiredQuantity",
    "actualQuantity",
    "wholesalePrice",
    "retailPrice"
  ];
  const csv = [
    columns.join(","),
    ...lines.map((line) =>
      [
        line.productId,
        line.ean13,
        line.manufacturerSku,
        line.productTitle,
        line.requiredQuantity,
        line.actualQuantity,
        line.wholesalePriceAmount,
        line.retailPriceAmount
      ]
        .map(csvCell)
        .join(",")
    )
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${listNumber}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function printShoppingListPdf(
  labels: AdminContent,
  list: AdminRetailShoppingList,
  lines: readonly ShoppingListLineDraft[]
) {
  if (typeof window === "undefined") {
    return;
  }

  const generatedAt = displayDateTime(new Date().toISOString());
  const sortedLines = [...lines].sort((left, right) => {
    const brandCompare = (left.brandName ?? "").localeCompare(right.brandName ?? "");

    return brandCompare === 0
      ? left.productTitle.localeCompare(right.productTitle)
      : brandCompare;
  });
  const itemRows = sortedLines
    .map((line) => {
      const identifiers = [
        `SKU: ${line.productId}`,
        line.manufacturerSku ? `Manufacturer SKU: ${line.manufacturerSku}` : null,
        line.ean13 ? `EAN-13: ${line.ean13}` : null
      ].filter(Boolean);

      return `
        <tr>
          <td>${escapeHtml(line.brandName ?? "")}</td>
          <td>
            <div class="product-title">${escapeHtml(line.productTitle)}</div>
            <div class="identifiers">${identifiers.map(escapeHtml).join(" · ")}</div>
          </td>
          <td>${escapeHtml(line.requiredQuantity)}</td>
          <td>${escapeHtml(line.actualQuantity)}</td>
          <td>${escapeHtml(line.wholesalePriceAmount)}</td>
          <td>${escapeHtml(line.retailPriceAmount)}</td>
        </tr>
      `;
    })
    .join("");
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(labels.stock.shoppingList)} ${escapeHtml(list.listNumber)}</title>
        <style>
          @page { margin: 16mm; }
          * { box-sizing: border-box; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; }
          main { padding: 24px; }
          header { align-items: flex-start; border-bottom: 1px solid #d1d5db; display: flex; justify-content: space-between; margin-bottom: 18px; padding-bottom: 14px; }
          h1 { font-size: 26px; margin: 4px 0 0; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 9px 8px; text-align: left; vertical-align: top; }
          th { color: #4b5563; font-size: 11px; text-transform: uppercase; }
          dl { display: grid; grid-template-columns: 140px 1fr; margin: 0 0 16px; row-gap: 6px; }
          dt { color: #6b7280; font-weight: 700; }
          dd { margin: 0; }
          .eyebrow, .generated, .identifiers { color: #6b7280; font-size: 12px; }
          .identifiers { margin-top: 4px; }
          .product-title { font-weight: 700; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            main { padding: 0; }
          }
        </style>
      </head>
      <body>
        <main>
          <header>
            <div>
              <div class="eyebrow">${escapeHtml(labels.stock.shoppingList)}</div>
              <h1>${escapeHtml(list.listNumber)}</h1>
            </div>
            <div class="generated">${escapeHtml(generatedAt)}</div>
          </header>
          <dl>
            <dt>${escapeHtml(labels.stock.organisation)}</dt>
            <dd>${escapeHtml(list.organisationName)}</dd>
            <dt>${escapeHtml(labels.stock.status)}</dt>
            <dd>${escapeHtml(readableToken(list.status))}</dd>
            <dt>${escapeHtml(labels.stock.created)}</dt>
            <dd>${escapeHtml(displayDateTime(list.createdAt))}</dd>
            <dt>${escapeHtml(labels.stock.currency)}</dt>
            <dd>${escapeHtml(list.currency)}</dd>
          </dl>
          <table>
            <thead>
              <tr>
                <th>Brand</th>
                <th>${escapeHtml(labels.stock.product)}</th>
                <th>${escapeHtml(labels.stock.requiredQuantity)}</th>
                <th>${escapeHtml(labels.stock.actualQuantity)}</th>
                <th>${escapeHtml(priceHeader("Wholesale Price", list.currency))}</th>
                <th>${escapeHtml(priceHeader(labels.stock.priceOverride, list.currency))}</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows || `<tr><td colspan="6">${escapeHtml(labels.stock.noItemsSelected)}</td></tr>`}
            </tbody>
          </table>
        </main>
      </body>
    </html>
  `;
  const popup = window.open("", "_blank", "width=900,height=1200");

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

type RetailShoppingListModalProps = Readonly<{
  busy: boolean;
  labels: AdminContent;
  lines: ShoppingListLineDraft[];
  list: AdminRetailShoppingList;
  onClose: () => void;
  onLinesChange: Dispatch<SetStateAction<ShoppingListLineDraft[]>>;
  onReopen: () => void;
  onSave: () => void;
}>;

export function RetailShoppingListModal({
  busy,
  labels,
  lines,
  list,
  onClose,
  onLinesChange,
  onReopen,
  onSave
}: RetailShoppingListModalProps) {
  const editorDisabled = busy || list.status !== "active";
  const sortedLines = [...lines].sort((left, right) => {
    const brandCompare = (left.brandName ?? "").localeCompare(right.brandName ?? "");

    return brandCompare === 0
      ? left.productTitle.localeCompare(right.productTitle)
      : brandCompare;
  });

  function updateLine(lineId: string, patch: Partial<ShoppingListLineDraft>) {
    onLinesChange((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    );
  }

  async function importCsv(file: File | null) {
    if (!file) {
      return;
    }

    const text = await file.text();
    const rows = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((line) => line.trim());
    const header = parseCsvLine(rows[0] ?? "");
    const indexByName = new Map(
      header.map((name, index) => [csvHeaderKey(name), index])
    );
    const imported = rows.slice(1).map(parseCsvLine);

    onLinesChange((current) =>
      current.map((line) => {
        const row = imported.find((cells) =>
          matchShoppingListImportRow(cells, indexByName, line)
        );

        if (!row) {
          return line;
        }

        const cell = (...names: string[]) => csvCellByHeader(row, indexByName, names);

        return {
          ...line,
          actualQuantity:
            cell("actualQuantity", "Actual Quantity", "amountToBuy") ||
            line.actualQuantity,
          retailPriceAmount: cell("retailPrice", "Retail Price", "retailPriceOverride"),
          wholesalePriceAmount: cell("wholesalePrice", "Wholesale Price")
        };
      })
    );
  }

  return (
    <AdminModal
      closeDisabled={busy}
      closeLabel={labels.stock.cancel}
      onClose={onClose}
      size="2xl"
      title={`${labels.stock.shoppingList}: ${list.listNumber}`}
    >
      <div className="space-y-4 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {readableToken(list.status)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {list.actualUnits}/{list.requiredUnits} {labels.stock.units}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50">
              {labels.stock.importCsv}
              <input
                accept=".csv,text/csv"
                className="sr-only"
                disabled={editorDisabled}
                onChange={(event) => {
                  void importCsv(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
            <AdminButton
              disabled={lines.length === 0}
              onClick={() => downloadShoppingListCsv(list.listNumber, lines)}
              variant="secondary"
            >
              {labels.stock.exportCsv}
            </AdminButton>
            <AdminButton
              disabled={lines.length === 0}
              onClick={() => printShoppingListPdf(labels, list, lines)}
              variant="secondary"
            >
              {labels.stock.exportPdf}
            </AdminButton>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md ring-1 ring-gray-200">
          <table className="min-w-[840px] w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pl-3 pr-3">Brand</th>
                <th className="py-2 pr-3">{labels.stock.product}</th>
                <th className="py-2 pr-3">{labels.stock.requiredQuantity}</th>
                <th className="py-2 pr-3">{labels.stock.actualQuantity}</th>
                <th className="py-2 pr-3">
                  {priceHeader("Wholesale Price", list.currency)}
                </th>
                <th className="py-2 pr-3">
                  {priceHeader(labels.stock.priceOverride, list.currency)}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {sortedLines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2 pl-3 pr-3 text-gray-600">
                    {line.brandName ?? "-"}
                  </td>
                  <td className="py-3 pr-3">
                    <h4 className="text-sm font-semibold leading-5 text-gray-900">
                      {line.productTitle}
                    </h4>
                    <div className="mt-1 text-xs font-medium text-gray-500">
                      SKU {line.productId}
                    </div>
                    {line.ean13 || line.manufacturerSku ? (
                      <div className="mt-1 text-xs text-gray-500">
                        {[
                          line.ean13 ? `EAN ${line.ean13}` : null,
                          line.manufacturerSku
                            ? `Manufacturer SKU ${line.manufacturerSku}`
                            : null
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-sm font-semibold tabular-nums text-gray-900">
                    {line.requiredQuantity}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className="w-28 rounded-md bg-white px-2 py-1 text-sm text-gray-900 ring-1 ring-gray-200 disabled:bg-gray-50 disabled:text-gray-500"
                      disabled={editorDisabled}
                      inputMode="numeric"
                      min={0}
                      onChange={(event) =>
                        updateLine(line.id, { actualQuantity: event.target.value })
                      }
                      step={1}
                      type="number"
                      value={line.actualQuantity}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className="w-28 rounded-md bg-white px-2 py-1 text-sm ring-1 ring-gray-200"
                      disabled={editorDisabled}
                      inputMode="decimal"
                      onChange={(event) =>
                        updateLine(line.id, {
                          wholesalePriceAmount: event.target.value
                        })
                      }
                      value={line.wholesalePriceAmount}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className="w-28 rounded-md bg-white px-2 py-1 text-sm ring-1 ring-gray-200"
                      disabled={editorDisabled}
                      inputMode="decimal"
                      onChange={(event) =>
                        updateLine(line.id, { retailPriceAmount: event.target.value })
                      }
                      value={line.retailPriceAmount}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          {list.status === "closed" ? (
            <AdminButton disabled={busy} onClick={onReopen}>
              Reopen
            </AdminButton>
          ) : (
            <AdminButton disabled={editorDisabled} onClick={() => onSave()}>
              {busy ? labels.stock.updatingStockCounts : labels.stock.updateStockCounts}
            </AdminButton>
          )}
        </div>
      </div>
    </AdminModal>
  );
}
