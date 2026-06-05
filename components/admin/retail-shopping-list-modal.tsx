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

function downloadShoppingListCsv(
  listNumber: string,
  lines: readonly ShoppingListLineDraft[]
) {
  const columns = [
    "productId",
    "sku",
    "ean13",
    "manufacturerSku",
    "productTitle",
    "amountToBuy",
    "wholesalePrice",
    "retailPrice"
  ];
  const csv = [
    columns.join(","),
    ...lines.map((line) =>
      [
        line.productId,
        line.productId,
        line.ean13,
        line.manufacturerSku,
        line.productTitle,
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

type RetailShoppingListModalProps = Readonly<{
  busy: boolean;
  labels: AdminContent;
  lines: ShoppingListLineDraft[];
  list: AdminRetailShoppingList;
  onClose: () => void;
  onLinesChange: Dispatch<SetStateAction<ShoppingListLineDraft[]>>;
  onReopen: () => void;
  onSave: (status?: "active" | "closed") => void;
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
    const indexByName = new Map(header.map((name, index) => [name, index]));
    const imported = rows.slice(1).map(parseCsvLine);

    onLinesChange((current) =>
      current.map((line) => {
        const row = imported.find(
          (cells) => cells[indexByName.get("productId") ?? -1] === line.productId
        );

        if (!row) {
          return line;
        }

        const cell = (name: string) => row[indexByName.get(name) ?? -1] ?? "";

        return {
          ...line,
          actualQuantity:
            cell("amountToBuy") || cell("actualQuantity") || line.actualQuantity,
          retailPriceAmount: cell("retailPrice") || cell("retailPriceOverride"),
          wholesalePriceAmount: cell("wholesalePrice")
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
            <AdminButton
              disabled={lines.length === 0}
              onClick={() => downloadShoppingListCsv(list.listNumber, lines)}
              variant="secondary"
            >
              {labels.stock.exportCsv}
            </AdminButton>
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
          </div>
        </div>
        <div className="overflow-x-auto rounded-md ring-1 ring-gray-200">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pl-3 pr-3">Brand</th>
                <th className="py-2 pr-3">{labels.stock.product}</th>
                <th className="py-2 pr-3">Amount to buy</th>
                <th className="py-2 pr-3">{labels.stock.wholesalePrice}</th>
                <th className="py-2 pr-3">Retail Price</th>
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
                      placeholder="Optional"
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
                      placeholder="Optional"
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
            <>
              <AdminButton
                disabled={editorDisabled}
                onClick={() => onSave("closed")}
                variant="secondary"
              >
                Close list
              </AdminButton>
              <AdminButton disabled={editorDisabled} onClick={() => onSave()}>
                Save
              </AdminButton>
            </>
          )}
        </div>
      </div>
    </AdminModal>
  );
}
