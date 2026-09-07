/** Normalize only declared run identities and clocks; preserve business values and identity relationships. */
export const CLIENT_NORMALIZATION = Object.freeze({
  discarded: ["latencyMs", "ackMs", "catalogueMs", "matchMs", "searchMs", "serializeMs"],
  opaqueIdentityFields: ["planHandle", "orderHandle", "evidenceHandle", "supportHandle", "orderReference", "caseReference", "messageId", "correlationId", "idempotencyKey", "runKey"],
  eventIdentities: "Only UUID-backed order:, payment: and fulfilment: event IDs; ordinals preserve repeated and distinct events.",
  identityMapping: "Consistent first-occurrence ordinals preserve equality and distinctness within each identity type. Exact registered references in prose and URLs share those mappings.",
  jsonText: "JSON text blocks are parsed before semantic normalization; tools/call JSON text must equal structuredContent before normalization.",
  clockFields: ["createdAt", "updatedAt", "paidAt", "checkoutExpiresAt", "availabilityAsOf"],
  checkoutUrls: "Normalize only registered handles and generated provider session/UUID components; retain other parameters and URL structure.",
  preserved: "All product/target/option IDs, dose scores, coverage, advice, prices, statuses, revisions, payment state and error semantics."
});
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const eventId = new RegExp(`^(order|payment|fulfilment):${UUID}$`, "i");
const providerId = new RegExp(`^(?:${UUID}|cs_(?:test_|live_)?[a-zA-Z0-9]+)$`, "i");
export function normalizePublishedClientResult(input, endpoint) {
  const identities = new Map(), registered = new Map();
  function register(type, value) {
    if (!identities.has(type)) identities.set(type, new Map());
    const values = identities.get(type);
    if (!values.has(value)) values.set(value, `<${type}:${values.size + 1}>`);
    const token = values.get(value);
    // The same token can appear as both a handle and a URL query value.
    if (!registered.has(value)) registered.set(value, token);
    return token;
  }
  function parseText(value, key) {
    if (key === "text" && typeof value === "string") { try { return { parsed: true, value: JSON.parse(value) }; } catch { /* Human-readable prose. */ } }
    return { parsed: false, value };
  }
  function visit(value, key = "") {
    const parsed = parseText(value, key); if (parsed.parsed) { visit(parsed.value); return; }
    if (Array.isArray(value)) { value.forEach(item => visit(item, key)); return; }
    if (value && typeof value === "object") { Object.keys(value).sort().forEach(field => visit(value[field], field)); return; }
    if (typeof value !== "string") return;
    if (CLIENT_NORMALIZATION.opaqueIdentityFields.includes(key)) register(key, value);
    else if (key === "id" && eventId.test(value)) register(`${value.split(":")[0]}EventId`, value);
  }
  visit(input);
  function reference(value) {
    let result = value;
    for (const [raw, token] of [...registered].sort((a, b) => b[0].length - a[0].length)) result = result.split(raw).join(token);
    return result;
  }
  function urlValue(value) {
    if (registered.has(value)) return registered.get(value);
    return providerId.test(value) || /^cap_[A-Za-z0-9_-]{20,}$/.test(value) ? register("checkoutId", value) : value;
  }
  function semantic(value, key = "") {
    const parsed = parseText(value, key); if (parsed.parsed) return { parsedJson: semantic(parsed.value) };
    if (Array.isArray(value)) return value.map(item => semantic(item, key));
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter(field => !CLIENT_NORMALIZATION.discarded.includes(field)).map(field => [field, semantic(value[field], field)]));
    if (typeof value !== "string") return value;
    if (CLIENT_NORMALIZATION.opaqueIdentityFields.includes(key) || (key === "id" && eventId.test(value))) return registered.get(value);
    if (CLIENT_NORMALIZATION.clockFields.includes(key)) return `<${key}>`;
    if (["checkoutUrl", "successUrl"].includes(key)) {
      const url = new URL(value, endpoint);
      const path = url.pathname.split("/").map(part => urlValue(decodeURIComponent(part))).join("/");
      const query = [...url.searchParams.entries()].sort(([ak,av],[bk,bv]) => ak.localeCompare(bk) || av.localeCompare(bv)).map(([name,item]) => `${encodeURIComponent(name)}=${encodeURIComponent(urlValue(item))}`).join("&");
      return `${url.origin}${path}${query ? `?${query}` : ""}${url.hash}`;
    }
    return key === "text" ? reference(value) : value;
  }
  return semantic(input);
}
