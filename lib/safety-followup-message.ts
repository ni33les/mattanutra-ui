import type { SafetyFollowupItem } from "@/lib/communications-shared";

export function safetyFollowupMessage(input: Readonly<{
  clientDose?: string | null;
  decision: string;
  reviewedItems?: SafetyFollowupItem[];
  supplementName: string;
}>) {
  const reviewedItems = input.reviewedItems ?? [];

  if (reviewedItems.length > 1) {
    const summary = reviewedItems
      .map((item) => {
        if (item.decision === "approve") {
          return item.clientDose
            ? `${item.supplementName} approved at ${item.clientDose}`
            : `${item.supplementName} approved`;
        }

        if (item.decision === "disapprove") {
          return `${item.supplementName} removed`;
        }

        return `${item.supplementName} reviewed`;
      })
      .join("; ");

    return `Your human safety review is complete. We have updated your nutrition plan after reviewing ${reviewedItems.length} supplements: ${summary}.`;
  }

  const singleItem = reviewedItems[0];

  if (singleItem) {
    return safetyFollowupMessage({
      clientDose: singleItem.clientDose,
      decision: singleItem.decision,
      supplementName: singleItem.supplementName
    });
  }

  if (input.decision === "approve") {
    return input.clientDose
      ? `Your human safety review for ${input.supplementName} is complete. The reviewed dose is ${input.clientDose}. Your nutrition plan has been updated.`
      : `Your human safety review for ${input.supplementName} is complete. Your nutrition plan has been updated.`;
  }

  return `Your human safety review for ${input.supplementName} is complete. We have removed that suggestion from your nutrition plan.`;
}
