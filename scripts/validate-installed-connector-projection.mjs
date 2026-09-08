import { isDeepStrictEqual } from "node:util";

/** Accept only an actual installed-client export. A repository snapshot or a
 * fresh native endpoint probe is not evidence of the client-visible projection. */
export function validateInstalledConnectorProjection(evidence, published) {
  const failures = [];
  if (evidence?.source !== "installed_connector" || !evidence.connectorId || !evidence.observedAt ||
      !["dev", "uat"].includes(evidence.environment)) failures.push("installed_projection_evidence_required");
  // These are the documented application/host wrappers. Never strip an
  // arbitrary prefix: that could accept another environment's connector.
  const prefix = evidence?.environment === "uat" ? "mattanutra_uat" : "mattanutra_dev";
  const canonicalName = name => {
    if (typeof name !== "string") return name;
    for (const wrapper of [`mcp__codex_apps__${prefix}_`, `${prefix}___`, `${prefix}.`]) {
      if (name.startsWith(wrapper)) return name.slice(wrapper.length);
    }
    return name;
  };
  const observed = Array.isArray(evidence?.tools) ? evidence.tools.map(row => ({ ...row, name: canonicalName(row.name) })) : evidence?.tools;
  const expected = published?.tools;
  if (!Array.isArray(observed) || !Array.isArray(expected) || !expected.length ||
      new Set(expected.map(row => row.name)).size !== expected.length ||
      new Set(observed.map(row => row.name)).size !== observed.length) {
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
