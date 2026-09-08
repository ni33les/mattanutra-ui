import { isDeepStrictEqual } from "node:util";

/** Accept only an actual installed-client export. A repository snapshot or a
 * fresh native endpoint probe is not evidence of the client-visible projection. */
export function validateInstalledConnectorProjection(evidence, published) {
  const failures = [];
  if (evidence?.source !== "installed_connector" || !evidence.connectorId || !evidence.observedAt ||
      !["dev", "uat"].includes(evidence.environment)) failures.push("installed_projection_evidence_required");
  const observed = evidence?.tools;
  const expected = published?.tools;
  if (!Array.isArray(observed) || !Array.isArray(expected) || expected.length !== 6) {
    failures.push("complete_tool_inventory_required");
    return { passed: false, failures };
  }
  const ordered = rows => [...rows].map(row => row.name).sort();
  if (!isDeepStrictEqual(ordered(observed), ordered(expected))) failures.push("tool_inventory_mismatch");
  for (const tool of expected) {
    const actual = observed.find(row => row.name === tool.name);
    if (!actual) continue;
    if (!isDeepStrictEqual(actual.inputSchema, tool.inputSchema)) failures.push(`${tool.name}:input_schema_mismatch`);
    if (actual.description !== tool.description) failures.push(`${tool.name}:description_mismatch`);
  }
  if (evidence?.contractVersion !== published?.contractVersion || evidence?.schemaChecksum !== published?.schemaChecksum) failures.push("contract_identity_mismatch");
  return { passed: failures.length === 0, failures };
}
