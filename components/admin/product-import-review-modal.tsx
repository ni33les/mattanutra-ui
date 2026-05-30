"use client";

import { useState } from "react";
import Image from "next/image";
import type { AdminReviewTaskRow } from "@/lib/admin-review-queue";
import type { AdminProductsData } from "@/lib/admin-products";
import { adminLocalizedProductText } from "@/lib/admin-localized-display";
import type { Locale } from "@/lib/i18n";
import { productDoseUnitSelectOptions } from "@/components/admin/product-view-helpers";
import type { AdminContent } from "@/components/admin/dashboard-content";
import { classNames } from "@/components/admin/dashboard-shared";
import { AdminModal } from "@/components/admin/ui";
import type { ProductImportFactDraft } from "@/components/admin/review-queue-helpers";

export function ProductImportReviewModal({
  displayName,
  error,
  labels,
  locale,
  onClose,
  onDecision,
  productsData,
  row,
  saving,
}: Readonly<{
  displayName: string;
  error: boolean;
  labels: AdminContent;
  locale: Locale;
  onClose: () => void;
  onDecision: (
    action: "approve_product" | "ignore_import" | "merge_product",
    mergeProductId: string | null,
    reviewerNote: string | null,
    parsedFacts?: Array<{
      amount: number | null;
      confidence: "high" | "low" | "moderate";
      name: string;
      unit: string | null;
    }>,
    description?: string | null,
    descriptionEn?: string | null,
    descriptionTh?: string | null,
    translations?: Record<
      string,
      {
        description?: string | null;
        status?: "complete" | "draft" | "missing";
        title?: string | null;
      }
    >,
  ) => void;
  productsData: AdminProductsData;
  row: AdminReviewTaskRow;
  saving: boolean;
}>) {
  const [mergeProductId, setMergeProductId] = useState(
    row.productImport?.duplicateProductIds[0] ?? "",
  );
  const [description, setDescription] = useState(
    row.productImport?.description ?? "",
  );
  const [descriptionEn, setDescriptionEn] = useState(
    row.productImport?.descriptionEn ?? row.productImport?.description ?? "",
  );
  const [descriptionTh, setDescriptionTh] = useState(
    row.productImport?.descriptionTh ?? "",
  );
  const [descriptionZhCn, setDescriptionZhCn] = useState(
    row.productImport?.translations["zh-CN"]?.description ?? "",
  );
  const [facts, setFacts] = useState<ProductImportFactDraft[]>(() =>
    (row.productImport?.parsedFacts ?? []).map((fact) => ({
      amount: fact.amount === null ? "" : String(fact.amount),
      confidence:
        fact.confidence === "high" || fact.confidence === "low"
          ? fact.confidence
          : ("moderate" as const),
      name: fact.name,
      unit: fact.unit ?? "",
    })),
  );
  const [reviewerNote, setReviewerNote] = useState("");
  const sourceUrl = row.productImport?.sourceUrl;
  const imageUrl = row.productImport?.imageUrls[0] ?? null;
  const duplicateOptions = productsData.rows.filter((product) =>
    row.productImport?.duplicateProductIds.includes(product.id),
  );
  const mergeOptions =
    duplicateOptions.length > 0
      ? duplicateOptions
      : productsData.rows.slice(0, 80);
  const inputClass =
    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]";
  const parsedFacts = facts.flatMap((fact) => {
    const name = fact.name.trim();

    if (!name) {
      return [];
    }

    const amount = fact.amount.trim() ? Number(fact.amount) : null;

    return [
      {
        amount:
          amount !== null && Number.isFinite(amount) && amount >= 0
            ? amount
            : null,
        confidence: fact.confidence,
        name,
        unit: fact.unit.trim() || null,
      },
    ];
  });

  return (
    <AdminModal onClose={onClose} panelClassName="max-w-3xl">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 pr-14">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-gray-900">{displayName}</h2>
          {row.productImport?.fdaApprovalNumber ? (
            <p className="mt-1 text-sm text-gray-500">
              FDA {row.productImport.fdaApprovalNumber}
            </p>
          ) : null}
        </div>
      </div>

      <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-6">
        <div className="flex gap-4">
          {imageUrl ? (
            <Image
              alt=""
              className="size-24 rounded-xl object-cover ring-1 ring-gray-200"
              height={96}
              src={imageUrl}
              unoptimized={true}
              width={96}
            />
          ) : (
            <div className="flex size-24 items-center justify-center rounded-xl bg-gray-50 text-xs font-semibold text-gray-400 ring-1 ring-gray-200">
              Product
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2 text-sm text-gray-600">
            {sourceUrl ? (
              <a
                className="block truncate font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
                href={sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                {sourceUrl}
              </a>
            ) : null}
            <p>
              Review the imported label facts before this product can be
              recommended.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium text-gray-700">
            Description EN
            <textarea
              className={classNames(inputClass, "min-h-24 resize-y")}
              onChange={(event) => {
                setDescriptionEn(event.target.value);
                setDescription(event.target.value);
              }}
              value={descriptionEn}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-gray-700">
            Description TH
            <textarea
              className={classNames(inputClass, "min-h-24 resize-y")}
              onChange={(event) => setDescriptionTh(event.target.value)}
              value={descriptionTh}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-gray-700">
            Description 中文
            <textarea
              className={classNames(inputClass, "min-h-24 resize-y")}
              onChange={(event) => setDescriptionZhCn(event.target.value)}
              value={descriptionZhCn}
            />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Parsed facts
            </h3>
            <button
              className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-[#126B4F] ring-1 ring-emerald-200 hover:bg-emerald-50"
              onClick={() =>
                setFacts((current) => [
                  ...current,
                  {
                    amount: "",
                    confidence: "moderate",
                    name: "",
                    unit: "",
                  },
                ])
              }
              type="button"
            >
              Add fact
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {facts.length ? (
              facts.map((fact, index) => (
                <div
                  className="grid gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_8rem_auto]"
                  key={`${index}:${fact.name}`}
                >
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setFacts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder={labels.reviewQueue.ingredient}
                    value={fact.name}
                  />
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    onChange={(event) =>
                      setFacts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, amount: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder={labels.supplements.maxAmount}
                    value={fact.amount}
                  />
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      setFacts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, unit: event.target.value }
                            : item,
                        ),
                      )
                    }
                    value={fact.unit}
                  >
                    <option value="">{labels.supplements.maxUnit}</option>
                    {productDoseUnitSelectOptions(fact.unit).map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      setFacts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                confidence: event.target.value as
                                  | "high"
                                  | "low"
                                  | "moderate",
                              }
                            : item,
                        ),
                      )
                    }
                    value={fact.confidence}
                  >
                    <option value="high">
                      {labels.reviewQueue.confidenceHigh}
                    </option>
                    <option value="moderate">
                      {labels.reviewQueue.confidenceModerate}
                    </option>
                    <option value="low">
                      {labels.reviewQueue.confidenceLow}
                    </option>
                  </select>
                  <button
                    className="rounded-md bg-white px-2.5 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                    onClick={() =>
                      setFacts((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    type="button"
                  >
                    {labels.reviewQueue.remove}
                  </button>
                </div>
              ))
            ) : (
              <span className="text-sm text-amber-700">
                {labels.reviewQueue.noParsedFacts}
              </span>
            )}
          </div>
        </div>

        <label className="grid gap-2 text-sm font-medium text-gray-700">
          {labels.reviewQueue.duplicateProduct}
          <select
            className={inputClass}
            onChange={(event) => setMergeProductId(event.target.value)}
            value={mergeProductId}
          >
            <option value="">{labels.reviewQueue.selectProduct}</option>
            {mergeOptions.map((product) => {
              const title = adminLocalizedProductText(product, locale).title
                .value;

              return (
                <option key={product.id} value={product.id}>
                  {[title, product.brandName].filter(Boolean).join(" · ")}
                </option>
              );
            })}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-gray-700">
          Reviewer note
          <textarea
            className={classNames(inputClass, "min-h-24 resize-y")}
            onChange={(event) => setReviewerNote(event.target.value)}
            value={reviewerNote}
          />
        </label>

        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
            {labels.supplements.updateError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
          onClick={onClose}
          type="button"
        >
          {labels.supplements.close}
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-[#126B4F] ring-1 ring-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving || !mergeProductId}
            onClick={() =>
              onDecision(
                "merge_product",
                mergeProductId,
                reviewerNote.trim() || null,
              )
            }
            type="button"
          >
            Mark duplicate
          </button>
          <span className="isolate inline-flex rounded-md shadow-xs">
            <button
              className="relative inline-flex items-center rounded-l-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 focus:z-10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={() =>
                onDecision("ignore_import", null, reviewerNote.trim() || null)
              }
              type="button"
            >
              Ignore
            </button>
            <button
              className="relative -ml-px inline-flex items-center rounded-r-md bg-[#1FA77A] px-3.5 py-2.5 text-sm font-semibold text-white ring-1 ring-[#1FA77A] hover:bg-[#188865] focus:z-10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={() =>
                onDecision(
                  "approve_product",
                  null,
                  reviewerNote.trim() || null,
                  parsedFacts,
                  description.trim() ||
                    descriptionEn.trim() ||
                    descriptionTh.trim() ||
                    descriptionZhCn.trim() ||
                    null,
                  descriptionEn.trim() || null,
                  descriptionTh.trim() || null,
                  {
                    en: {
                      description: descriptionEn.trim() || null,
                      status: descriptionEn.trim() ? "draft" : "missing",
                      title: null,
                    },
                    th: {
                      description: descriptionTh.trim() || null,
                      status: descriptionTh.trim() ? "draft" : "missing",
                      title: null,
                    },
                    "zh-CN": {
                      description: descriptionZhCn.trim() || null,
                      status: descriptionZhCn.trim() ? "draft" : "missing",
                      title: null,
                    },
                  },
                )
              }
              type="button"
            >
              {saving ? "..." : labels.reviewQueue.approve}
            </button>
          </span>
        </div>
      </div>
    </AdminModal>
  );
}
