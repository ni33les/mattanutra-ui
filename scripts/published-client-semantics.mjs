/** Normalize only declared run identities and clocks; preserve business values and identity relationships. */
export const CLIENT_NORMALIZATION = Object.freeze({
  discarded: ["latencyMs", "ackMs", "catalogueMs", "matchMs", "searchMs", "serializeMs"],
  opaqueIdentityFields: ["planHandle", "orderHandle", "optionId", "recommendedOptionId", "selectedOptionId", "evidenceHandle", "supportHandle", "orderReference", "caseReference", "messageId", "correlationId", "idempotencyKey", "runKey"],
  eventIdentities: "Only UUID-backed order:, payment: and fulfilment: event IDs; ordinals preserve repeated and distinct events.",
  supportMessageIdentities: "UUID-backed thread[].id values in support payloads containing caseReference and supportHandle share the messageId mapping; message references and distinct thread entries remain distinguishable.",
  identityMapping: "Consistent first-occurrence ordinals preserve equality and distinctness within each identity type. Exact registered references in prose and URLs share those mappings.",
  jsonText: "JSON text blocks are parsed before semantic normalization; transport must contain only one substantive representation.",
  clockFields: ["createdAt", "updatedAt", "paidAt", "checkoutExpiresAt", "availabilityAsOf"],
  checkoutUrls: "Normalize only registered handles and generated provider session/UUID components; retain other parameters and URL structure.",
  preserved: "All product/target IDs, option order and equality relationships, dose scores, coverage, advice, prices, statuses, revisions, payment state and error semantics."
});
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const uuidId = new RegExp(`^${UUID}$`, "i");
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
  function identityType(value, key, supportIdentity) {
    if (["optionId", "recommendedOptionId", "selectedOptionId"].includes(key)) return "optionId";
    if (CLIENT_NORMALIZATION.opaqueIdentityFields.includes(key)) return key;
    if (key === "id" && supportIdentity && uuidId.test(value)) return "messageId";
    if (key === "id" && eventId.test(value)) return `${value.split(":")[0]}EventId`;
  }
  function childSupportIdentity(value, key, field, supportIdentity) {
    return (field === "thread" && typeof value.caseReference === "string" && typeof value.supportHandle === "string") ||
      (key === "thread" && supportIdentity && field === "id");
  }
  function visit(value, key = "", supportIdentity = false) {
    const parsed = parseText(value, key); if (parsed.parsed) { visit(parsed.value); return; }
    if (Array.isArray(value)) { value.forEach(item => visit(item, key, supportIdentity)); return; }
    if (value && typeof value === "object") { Object.keys(value).sort().forEach(field => visit(value[field], field, childSupportIdentity(value, key, field, supportIdentity))); return; }
    if (typeof value !== "string") return;
    const type = identityType(value, key, supportIdentity);
    if (type) register(type, value);
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
  function semantic(value, key = "", supportIdentity = false) {
    const parsed = parseText(value, key); if (parsed.parsed) return { parsedJson: semantic(parsed.value) };
    if (Array.isArray(value)) return value.map(item => semantic(item, key, supportIdentity));
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter(field => !CLIENT_NORMALIZATION.discarded.includes(field)).map(field => [field, semantic(value[field], field, childSupportIdentity(value, key, field, supportIdentity))]));
    if (typeof value !== "string") return value;
    if (identityType(value, key, supportIdentity)) return registered.get(value);
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
