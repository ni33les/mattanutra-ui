import assert from "node:assert/strict";

export const SEMANTIC_NORMALIZATION = "JSON object order; generated support caseReference, messageId and thread[].id only, with a bijective identity map. Raw bytes, all other identifiers, clocks and business fields remain unchanged.";

function canonical(value) {
  return Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}

export function semanticJourney(value) {
  const copy = structuredClone(value), cases = new Map(), messages = new Map();
  function identity(map, original, pattern, kind) {
    assert.match(original, pattern, `Invalid generated support ${kind}`);
    if (!map.has(original)) map.set(original, `${kind}_${map.size + 1}`);
    return map.get(original);
  }
  const message = original => identity(messages, original, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/, "message");
  for (const outcome of copy.outcomes ?? []) for (const call of outcome.calls ?? []) {
    if (call.request?.params?.name !== "support") continue;
    const result = call.response?.result;
    const text = result?.content?.filter(row => row.type === "text").at(-1);
    const textValue = text && /^\s*[\[{]/.test(text.text) ? JSON.parse(text.text) : null;
    const wire = result?.structuredContent ?? textValue;
    if (!wire?.caseReference) continue;
    if (result?.structuredContent && textValue) assert.deepEqual(textValue, wire, "Support text/structured representations differ");
    wire.caseReference = identity(cases, wire.caseReference, /^tkt_[a-f0-9]{12}$/, "case");
    wire.messageId = message(wire.messageId);
    for (const row of wire.thread) row.id = message(row.id);
    if (textValue) text.text = JSON.stringify(canonical(wire));
  }
  return canonical(copy);
}
