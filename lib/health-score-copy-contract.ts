/** Shared visible copy for the web HealthScore and pharmacy detailed plan. */
export const HEALTHSCORE_COPY_VERSION = 2 as const;
export const HEALTHSCORE_COPY_TEXT_KEYS = [
  "bandLine", "heroBody", "heroTitle", "highestLeverageBody", "strengthNote", "subtractionBody"
] as const;

/** Unversioned stored responses keep their original completeness contract. */
export const LEGACY_HEALTHSCORE_COPY_TEXT_KEYS = [
  "findingsHeadline", "findingsSub", "methodHeadline", "pillarHeadline", "relativityHeadline", "relativitySub"
] as const;
