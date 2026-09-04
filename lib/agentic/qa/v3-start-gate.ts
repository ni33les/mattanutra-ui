export type V3StartGate = Readonly<{
  reason: "missing_live_build_id" | "missing_live_schema_checksum" | null;
  runA: "pending" | null;
  runB: "pending" | null;
  score: number | null;
  status: "ELIGIBLE" | "INVALID_RUN";
}>;

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function evaluateV3StartGate(publicInfo: unknown): V3StartGate {
  const info =
    publicInfo && typeof publicInfo === "object" && !Array.isArray(publicInfo)
      ? (publicInfo as Record<string, unknown>)
      : {};
  const buildId = asTrimmedString(info.buildId);
  const schemaChecksum = asTrimmedString(info.schemaChecksum);

  if (!buildId) {
    return {
      reason: "missing_live_build_id",
      runA: null,
      runB: null,
      score: null,
      status: "INVALID_RUN"
    };
  }

  if (!/^[0-9a-f]{64}$/.test(schemaChecksum)) {
    return {
      reason: "missing_live_schema_checksum",
      runA: null,
      runB: null,
      score: null,
      status: "INVALID_RUN"
    };
  }

  return {
    reason: null,
    runA: "pending",
    runB: "pending",
    score: null,
    status: "ELIGIBLE"
  };
}
