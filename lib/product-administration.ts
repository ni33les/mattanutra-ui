/** Physical quantities, separate from nutrient amounts and advisory dose limits. */
export type ProductAdministration = Readonly<{
  route: "oral" | "topical" | "other" | "unknown";
  physicalUnit: "capsule" | "tablet" | "softgel" | "gummy" | "drop" | "ml" | "g" | "scoop" | "sachet" | "other" | "unknown";
  unitsPerServing: number | null;
  /** Smallest measurable quantity in physicalUnit, never a safety ceiling. */
  doseIncrement: number | null;
  packQuantity: number | null;
  provenance: Readonly<{
    status: "verified" | "unverified" | "conflicting";
    sourceUrl: string | null;
    sourceText: string | null;
    verifiedAt: string | null;
  }>;
}>;

export const WHOLE_PRODUCT_UNITS = new Set<ProductAdministration["physicalUnit"]>(["capsule", "tablet", "softgel", "gummy", "drop", "sachet"]);

function positiveOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Reads metadata without filling absent fields with inferred oral/solid defaults. */
export function parseProductAdministration(value: unknown): ProductAdministration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const source = row.provenance && typeof row.provenance === "object" ? row.provenance as Record<string, unknown> : {};
  const physicalUnit = ["capsule", "tablet", "softgel", "gummy", "drop", "ml", "g", "scoop", "sachet", "other", "unknown"].includes(String(row.physicalUnit)) ? row.physicalUnit as ProductAdministration["physicalUnit"] : "unknown";
  const unitsPerServing = positiveOrNull(row.unitsPerServing);
  const doseIncrement = positiveOrNull(row.doseIncrement);
  const malformedSolid = WHOLE_PRODUCT_UNITS.has(physicalUnit) && ((doseIncrement != null && !Number.isInteger(doseIncrement)) || (unitsPerServing != null && !Number.isInteger(unitsPerServing)));
  const evidence = typeof source.sourceUrl === "string" && Boolean(source.sourceUrl.trim()) && typeof source.sourceText === "string" && Boolean(source.sourceText.trim());
  return {
    route: ["oral", "topical", "other", "unknown"].includes(String(row.route)) ? row.route as ProductAdministration["route"] : "unknown",
    physicalUnit,
    unitsPerServing,
    doseIncrement: malformedSolid ? null : doseIncrement,
    packQuantity: positiveOrNull(row.packQuantity),
    provenance: {
      status: malformedSolid || source.status === "conflicting" ? "conflicting" : source.status === "verified" && evidence ? "verified" : "unverified",
      sourceUrl: typeof source.sourceUrl === "string" ? source.sourceUrl : null,
      sourceText: typeof source.sourceText === "string" ? source.sourceText : null,
      verifiedAt: typeof source.verifiedAt === "string" ? source.verifiedAt : null
    }
  };
}

export function verifiedAdministration(value: ProductAdministration | null | undefined) {
  const administration = parseProductAdministration(value);
  return administration?.provenance.status === "verified" ? administration : null;
}

export function administrationDailyPills(value: ProductAdministration | null | undefined): number | null {
  const administration = verifiedAdministration(value);
  if (!administration || administration.route !== "oral" || administration.physicalUnit === "unknown") return null;
  return ["capsule", "tablet", "softgel", "gummy"].includes(administration.physicalUnit) ? administration.unitsPerServing : 0;
}
