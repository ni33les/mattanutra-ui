export type InsightBucketRow = Readonly<{
  count: number;
  label: string;
  parentLabel?: string | null;
}>;

export type AdminSupplementSelectionStats = Readonly<{
  addCount: number;
  chosenPlanCount: number;
  coveredCount: number;
  lastSelectedAt: string | null;
  reviewCount: number;
  safetyHiddenCount: number;
  topDoses: InsightBucketRow[];
  unmatchedCount: number;
}>;

export type AdminProductDecisionStats = Readonly<{
  averageProductCoveragePercent: number | null;
  averageStackContributionPercent: number | null;
  chosenPlanCount: number;
  lastChosenAt: string | null;
  nearMissCount: number;
  rejectedCount: number;
  topRejectionReasons: InsightBucketRow[];
  topServingMultipliers: InsightBucketRow[];
}>;

