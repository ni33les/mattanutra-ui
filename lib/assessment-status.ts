export type AssessmentSnapshotStatus = "failed" | "preparing" | "queued" | "ready";

export function healthScoreAnalysisStatusFromTaskStatuses(
  hasAdvice: boolean,
  statuses: readonly unknown[]
): AssessmentSnapshotStatus {
  if (hasAdvice) {
    return "ready";
  }

  if (
    statuses.some(
      (status) =>
        status === "queued" ||
        status === "reserved" ||
        status === "running" ||
        status === "needs_review" ||
        status === "waiting_approval"
    )
  ) {
    return "preparing";
  }

  if (
    statuses.some(
      (status) =>
        status === "failed" ||
        status === "cancelled" ||
        status === "completed" ||
        status === "skipped"
    )
  ) {
    return "failed";
  }

  return "preparing";
}
