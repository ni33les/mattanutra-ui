"use client";

import { useState } from "react";
import type {
  AdminReviewQueueData,
  AdminReviewTaskRow,
} from "@/lib/admin-review-queue";
import type { AdminProductsData } from "@/lib/admin-products";
import type { AdminFoodsData } from "@/lib/admin-foods";
import type {
  AdminSupplementRow,
  AdminSupplementsData,
} from "@/lib/admin-supplements";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  PlanIdLink,
  ReviewAgeTimer,
  adminLocaleTextClass,
  businessMetricColors,
  classNames,
  formatGeneratedAt,
  readableToken,
  taskStatusClass,
  taskValueClass,
  taskValueLabel,
  type BusinessMetric,
} from "@/components/admin/dashboard-shared";
import { safetyMetric } from "@/components/admin/safety-view-helpers";
import { SupplementDetailsModal } from "@/components/admin/supplement-view";
import { PlanSafetyReviewModal } from "@/components/admin/plan-safety-review-modal";
import { ProductImportReviewModal } from "@/components/admin/product-import-review-modal";
import {
  groupReviewRows,
  reviewDisplayName,
  reviewMatchesMetric,
  reviewMetricCounts,
  reviewProposedDose,
  reviewRowToSupplementDraft,
  reviewScopeLabel,
  type FoodReviewDraftFields,
  type ReviewMetricFilter,
} from "@/components/admin/review-queue-helpers";

export function AdminReviewQueueView({
  accessToken,
  data,
  foodsData,
  labels,
  locale,
  productsData,
  selectedReviewTaskId,
  supplementsData,
}: Readonly<{
  accessToken: string;
  data: AdminReviewQueueData;
  foodsData: AdminFoodsData;
  labels: AdminContent;
  locale: Locale;
  productsData: AdminProductsData;
  selectedReviewTaskId?: string | null;
  supplementsData: AdminSupplementsData;
}>) {
  const [queueState, setQueueState] = useState<{
    data: AdminReviewQueueData;
    generatedAt: string;
  }>({
    data,
    generatedAt: data.generatedAt,
  });
  const [errorReviewId, setErrorReviewId] = useState<string | null>(null);
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<{
    associatedSupplementId: string;
    draft: AdminSupplementRow;
    queuedLabel: string;
    row: AdminReviewTaskRow;
  } | null>(null);
  const [selectedReviewMetricId, setSelectedReviewMetricId] =
    useState<ReviewMetricFilter>("reviewsTotal");
  const [dismissedReviewTaskId, setDismissedReviewTaskId] = useState<
    string | null
  >(null);
  const queueData =
    queueState.generatedAt === data.generatedAt ? queueState.data : data;
  const reviewMetricSummary = reviewMetricCounts(queueData.rows);
  const visibleReviewRows = queueData.rows.filter((row) =>
    reviewMatchesMetric(row, selectedReviewMetricId),
  );
  const reviewGroups = groupReviewRows(labels, visibleReviewRows);

  function setLocalQueueData(
    next:
      | AdminReviewQueueData
      | ((currentData: AdminReviewQueueData) => AdminReviewQueueData),
  ) {
    setQueueState((currentState) => {
      const currentData =
        currentState.generatedAt === data.generatedAt
          ? currentState.data
          : data;

      return {
        data: typeof next === "function" ? next(currentData) : next,
        generatedAt: data.generatedAt,
      };
    });
  }

  async function saveReview(
    row: AdminSupplementRow,
    associatedSupplementId: string,
  ) {
    setSavingReviewId(row.id);
    setErrorReviewId(null);

    try {
      const response = await fetch(`/api/admin/review-tasks/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          action: "resolve",
          associatedSupplementId: associatedSupplementId || null,
          category: row.category,
          confidence: row.confidence,
          listStatus: row.listStatus,
          maxAmount: row.maxAmount,
          maxUnit: row.maxUnit,
          safetyFlags: row.safetyFlags,
          safetyNotes: row.safetyNotes,
          supplementName: row.name,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        throw new Error(
          errorPayload?.message ?? "Unable to resolve review task",
        );
      }

      const payload = (await response.json()) as {
        data?: AdminReviewQueueData;
        result?: {
          removedTaskIds?: string[];
        };
      };

      if (payload.data) {
        setLocalQueueData(payload.data);
      } else {
        const removedTaskIds = new Set(
          payload.result?.removedTaskIds?.length
            ? payload.result.removedTaskIds
            : [row.id],
        );

        setLocalQueueData((currentData) => {
          const rows = currentData.rows.filter(
            (item) => !removedTaskIds.has(item.id),
          );

          return {
            ...currentData,
            rows,
            summary: {
              doseReduced: rows.filter(
                (item) => item.reviewKind === "dose_reduced",
              ).length,
              reviewRequired: rows.filter(
                (item) =>
                  item.reviewKind !== "dose_reduced" &&
                  item.reviewKind !== "unknown_supplement" &&
                  item.reviewKind !== "unknown_food",
              ).length,
              total: rows.length,
              unknown: rows.filter(
                (item) =>
                  item.reviewKind === "unknown_supplement" ||
                  item.reviewKind === "unknown_food",
              ).length,
            },
          };
        });
      }

      setDismissedReviewTaskId(row.id);
      setSelectedReview(null);
    } catch (saveError) {
      console.error("Unable to resolve review task", saveError);
      setErrorReviewId(row.id);
    } finally {
      setSavingReviewId(null);
    }
  }

  async function decidePlanReview(
    row: AdminReviewTaskRow,
    decision: "approve" | "disapprove",
    clientDoseAmount: number | null,
    clientDoseUnit: string,
    reviewerNote: string | null,
    foodDetails?: FoodReviewDraftFields | null,
  ) {
    setSavingReviewId(row.id);
    setErrorReviewId(null);

    try {
      const response = await fetch(`/api/admin/review-tasks/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          action: decision,
          clientDoseAmount,
          clientDoseUnit,
          foodFrequency: foodDetails?.frequency ?? null,
          foodRationale: foodDetails?.rationale ?? null,
          foodServing: foodDetails?.serving ?? null,
          reviewerNote,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        throw new Error(
          errorPayload?.message ?? "Unable to update plan review",
        );
      }

      const payload = (await response.json()) as {
        data?: AdminReviewQueueData;
        result?: {
          removedTaskIds?: string[];
        };
      };

      if (payload.data) {
        setLocalQueueData(payload.data);
      } else {
        const removedTaskIds = new Set(
          payload.result?.removedTaskIds?.length
            ? payload.result.removedTaskIds
            : [row.id],
        );

        setLocalQueueData((currentData) => {
          const rows = currentData.rows.filter(
            (item) => !removedTaskIds.has(item.id),
          );

          return {
            ...currentData,
            rows,
            summary: {
              doseReduced: rows.filter(
                (item) => item.reviewKind === "dose_reduced",
              ).length,
              reviewRequired: rows.filter(
                (item) =>
                  item.reviewKind !== "dose_reduced" &&
                  item.reviewKind !== "unknown_supplement" &&
                  item.reviewKind !== "unknown_food",
              ).length,
              total: rows.length,
              unknown: rows.filter(
                (item) =>
                  item.reviewKind === "unknown_supplement" ||
                  item.reviewKind === "unknown_food",
              ).length,
            },
          };
        });
      }

      setDismissedReviewTaskId(row.id);
      setSelectedReview(null);
    } catch (decisionError) {
      console.error("Unable to update plan review", decisionError);
      setErrorReviewId(row.id);
    } finally {
      setSavingReviewId(null);
    }
  }

  async function decideProductImportReview(
    row: AdminReviewTaskRow,
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
  ) {
    setSavingReviewId(row.id);
    setErrorReviewId(null);

    try {
      const response = await fetch(`/api/admin/review-tasks/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          action,
          description,
          descriptionEn,
          descriptionTh,
          mergeProductId,
          parsedFacts,
          reviewerNote,
          translations,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        throw new Error(
          errorPayload?.message ?? "Unable to update product import review",
        );
      }

      const payload = (await response.json()) as {
        result?: {
          removedTaskIds?: string[];
        };
      };
      const removedTaskIds = new Set(
        payload.result?.removedTaskIds?.length
          ? payload.result.removedTaskIds
          : [row.id],
      );

      setLocalQueueData((currentData) => {
        const rows = currentData.rows.filter(
          (item) => !removedTaskIds.has(item.id),
        );

        return {
          ...currentData,
          rows,
          summary: {
            doseReduced: rows.filter(
              (item) => item.reviewKind === "dose_reduced",
            ).length,
            reviewRequired: rows.filter(
              (item) =>
                item.reviewKind !== "dose_reduced" &&
                item.reviewKind !== "unknown_supplement" &&
                item.reviewKind !== "unknown_food",
            ).length,
            total: rows.length,
            unknown: rows.filter(
              (item) =>
                item.reviewKind === "unknown_supplement" ||
                item.reviewKind === "unknown_food",
            ).length,
          },
        };
      });

      setDismissedReviewTaskId(row.id);
      setSelectedReview(null);
    } catch (decisionError) {
      console.error("Unable to update product import review", decisionError);
      setErrorReviewId(row.id);
    } finally {
      setSavingReviewId(null);
    }
  }

  function selectReview(row: AdminReviewTaskRow) {
    setDismissedReviewTaskId(null);
    setSelectedReview({
      associatedSupplementId: "",
      draft: reviewRowToSupplementDraft(labels, row),
      queuedLabel: formatGeneratedAt(row.queuedAt, locale),
      row,
    });
  }

  const linkedReviewRow =
    selectedReviewTaskId && dismissedReviewTaskId !== selectedReviewTaskId
      ? (queueData.rows.find((item) => item.id === selectedReviewTaskId) ??
        null)
      : null;
  const visibleReview =
    selectedReview ??
    (linkedReviewRow
      ? {
          associatedSupplementId: "",
          draft: reviewRowToSupplementDraft(labels, linkedReviewRow),
          queuedLabel: formatGeneratedAt(linkedReviewRow.queuedAt, locale),
          row: linkedReviewRow,
        }
      : null);

  function closeReviewModal() {
    setDismissedReviewTaskId(
      selectedReviewTaskId ?? visibleReview?.row.id ?? null,
    );
    setSelectedReview(null);
  }

  const reviewMetrics: BusinessMetric[] = [
    safetyMetric({
      color: businessMetricColors.total,
      id: "reviewsTotal",
      label: labels.reviewQueue.total,
      locale,
      value: reviewMetricSummary.total,
    }),
    safetyMetric({
      color: businessMetricColors.pendingReviews,
      id: "reviewsPlan",
      label: labels.reviewQueue.plan,
      locale,
      value: reviewMetricSummary.plan,
    }),
    safetyMetric({
      color: businessMetricColors.succeeded,
      id: "reviewsSupplement",
      label: labels.pageTitles.supplements,
      locale,
      value: reviewMetricSummary.supplement,
    }),
    safetyMetric({
      color: businessMetricColors.queued,
      id: "reviewsFood",
      label: labels.pageTitles.foods,
      locale,
      value: reviewMetricSummary.food,
    }),
    safetyMetric({
      color: businessMetricColors.active,
      id: "reviewsProduct",
      label: labels.pageTitles.products,
      locale,
      value: reviewMetricSummary.product,
    }),
  ];

  return (
    <section className="mt-8 space-y-6">
      <BusinessStatsGrid
        metrics={reviewMetrics}
        onMetricSelect={(metricId) =>
          setSelectedReviewMetricId(metricId as ReviewMetricFilter)
        }
        selectedMetricId={selectedReviewMetricId}
      />

      {reviewGroups.length > 0 ? (
        <div className="space-y-7">
          {reviewGroups.map((group) => (
            <section key={group.key} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-baseline gap-x-1 text-sm font-semibold text-gray-900">
                    {group.planReview && group.planId ? (
                      <>
                        <span>{labels.reviewQueue.reviewPlanSafety}</span>
                        <PlanIdLink
                          className="break-all"
                          locale={locale}
                          planId={group.planId}
                        />
                      </>
                    ) : (
                      group.title
                    )}
                  </h3>
                  <p className="mt-0.5 text-xs font-medium text-gray-500">
                    <ReviewAgeTimer
                      createdAt={group.createdAt}
                      initialNow={queueData.generatedAt}
                      locale={locale}
                    />
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={classNames(
                      taskValueClass(group.businessValue),
                      "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                    )}
                  >
                    {taskValueLabel(group.businessValue, locale)}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                {group.rows.map((row) => (
                  <article
                    key={row.id}
                    className="grid w-full cursor-pointer gap-3 rounded-2xl bg-white px-5 py-3 text-left shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] sm:grid-cols-[8rem_8rem_9rem_minmax(0,1fr)_8rem_7rem] sm:items-center"
                    onClick={() => selectReview(row)}
                    onKeyDown={(event) => {
                      if (
                        event.target instanceof HTMLElement &&
                        event.target.closest("a")
                      ) {
                        return;
                      }

                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectReview(row);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span
                      className={classNames(
                        taskStatusClass(row.status),
                        "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                      )}
                    >
                      {readableToken(row.status)}
                    </span>
                    <span
                      className={classNames(
                        taskValueClass(row.businessValue),
                        "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                      )}
                    >
                      {taskValueLabel(row.businessValue, locale)}
                    </span>
                    <span className="w-max rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                      {reviewScopeLabel(labels, row)}
                    </span>
                    <h3 className="min-w-0 truncate text-sm font-semibold text-gray-900 sm:text-base">
                      <span
                        className={classNames(
                          "mr-2 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500",
                          locale === "en"
                            ? "uppercase tracking-[0.08em]"
                            : adminLocaleTextClass(locale, "label"),
                        )}
                      >
                        {row.itemType === "food"
                          ? labels.reviewQueue.foodItem
                          : row.itemType === "product"
                            ? labels.reviewQueue.productItem
                            : labels.reviewQueue.suppItem}
                      </span>{" "}
                      {reviewDisplayName(
                        row,
                        locale,
                        productsData,
                        supplementsData,
                        foodsData,
                      )}
                    </h3>
                    {row.planId ? (
                      <span className="truncate text-sm font-semibold text-gray-700">
                        {reviewProposedDose(row, locale)}
                      </span>
                    ) : (
                      <span className="hidden sm:block" />
                    )}
                    {row.planId ? (
                      <PlanIdLink
                        className="truncate text-sm sm:justify-self-end"
                        compact={true}
                        locale={locale}
                        planId={row.planId}
                        stopPropagation={true}
                      />
                    ) : (
                      <span className="hidden sm:block" />
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.reviewQueue.empty}
        </div>
      )}

      {visibleReview?.row.reviewKind === "product_import" &&
      visibleReview.row.itemType === "product" ? (
        <ProductImportReviewModal
          displayName={reviewDisplayName(
            visibleReview.row,
            locale,
            productsData,
            supplementsData,
            foodsData,
          )}
          error={errorReviewId === visibleReview.row.id}
          labels={labels}
          locale={locale}
          onClose={closeReviewModal}
          onDecision={(
            action,
            mergeProductId,
            reviewerNote,
            parsedFacts,
            description,
            descriptionEn,
            descriptionTh,
            translations,
          ) =>
            void decideProductImportReview(
              visibleReview.row,
              action,
              mergeProductId,
              reviewerNote,
              parsedFacts,
              description,
              descriptionEn,
              descriptionTh,
              translations,
            )
          }
          productsData={productsData}
          row={visibleReview.row}
          saving={savingReviewId === visibleReview.row.id}
        />
      ) : visibleReview?.row.reviewKind === "unknown_supplement" &&
        visibleReview.row.itemType === "supplement" ? (
        <SupplementDetailsModal
          accessToken={accessToken}
          associatedSupplementId={visibleReview.associatedSupplementId}
          associationOptions={supplementsData.rows}
          draft={visibleReview.draft}
          error={errorReviewId === visibleReview.draft.id}
          headerNote={visibleReview.queuedLabel}
          labels={labels}
          locale={locale}
          onAssociateSupplement={(supplementId) =>
            setSelectedReview((currentReview) =>
              currentReview
                ? {
                    ...currentReview,
                    associatedSupplementId: supplementId,
                  }
                : currentReview,
            )
          }
          onChange={(patch) =>
            setSelectedReview((currentReview) =>
              currentReview
                ? {
                    ...currentReview,
                    draft: { ...currentReview.draft, ...patch },
                  }
                : currentReview,
            )
          }
          onClose={closeReviewModal}
          onSave={() =>
            void saveReview(
              visibleReview.draft,
              visibleReview.associatedSupplementId,
            )
          }
          saving={savingReviewId === visibleReview.draft.id}
        />
      ) : visibleReview ? (
        <PlanSafetyReviewModal
          key={visibleReview.row.id}
          accessToken={accessToken}
          displayName={reviewDisplayName(
            visibleReview.row,
            locale,
            productsData,
            supplementsData,
            foodsData,
          )}
          error={errorReviewId === visibleReview.row.id}
          labels={labels}
          locale={locale}
          onClose={closeReviewModal}
          onDecision={(
            decision,
            clientDoseAmount,
            clientDoseUnit,
            reviewerNote,
            foodDetails,
          ) =>
            void decidePlanReview(
              visibleReview.row,
              decision,
              clientDoseAmount,
              clientDoseUnit,
              reviewerNote,
              foodDetails,
            )
          }
          row={visibleReview.row}
          saving={savingReviewId === visibleReview.row.id}
        />
      ) : null}
    </section>
  );
}
