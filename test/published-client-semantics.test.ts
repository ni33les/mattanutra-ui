import assert from "node:assert/strict";
import { it } from "node:test";
import { normalizePublishedClientResult as normalize } from "../scripts/published-client-semantics.mjs";

const endpoint = "http://127.0.0.1:3100/api/mcp";
function fixture(n: number) {
  const order = `ord_${n}`, handle = `cap_${n}`;
  const uuid = `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const body = {
    orderReference: order, orderHandle: handle,
    checkoutUrl: `http://127.0.0.1:3100/en/basket/checkout?mode=agentic&order=${handle}`,
    events: [{ id: `order:${uuid}`, sequence: 0, status: "open", createdAt: `date${n}` }],
    totalPriceMinor: 102000, coveragePercent: 80, dailyPills: 2,
    advice: [{ amount: 300, limit: 250 }], productId: "prd_real"
  };
  return { receipt: body, transcript: [{ latencyMs: n, response: {
    content: [{ text: `Checkout ready for ${order}. Poll the order.` }, { text: JSON.stringify(body) }],
    structuredContent: body
  } }] };
}

it("compares independent run identities, event IDs, prose references and clocks equally", () => {
  assert.deepEqual(normalize(fixture(1), endpoint), normalize(fixture(2), endpoint));
});

it("retains different quantities, advice, money and catalogue identities", () => {
  const mutations = [
    (row: ReturnType<typeof fixture>) => { row.receipt.totalPriceMinor = 1; },
    (row: ReturnType<typeof fixture>) => { row.receipt.coveragePercent = 79; },
    (row: ReturnType<typeof fixture>) => { row.receipt.dailyPills = 3; },
    (row: ReturnType<typeof fixture>) => { row.receipt.advice = [{ amount: 300, limit: 350 }]; },
    (row: ReturnType<typeof fixture>) => { row.receipt.productId = "prd_other"; }
  ];
  for (const mutate of mutations) {
    const next = fixture(2);
    mutate(next);
    assert.notDeepEqual(normalize(fixture(1), endpoint), normalize(next, endpoint));
  }
});

it("retains checkout mode and incorrect unregistered prose references", () => {
  const next = fixture(2);
  next.receipt.checkoutUrl = next.receipt.checkoutUrl.replace("agentic", "wrong");
  assert.notDeepEqual(normalize(fixture(1), endpoint), normalize(next, endpoint));
  const wrong = fixture(2);
  wrong.transcript[0].response.content[0].text = "Checkout ready for ord_wrong. Poll the order.";
  assert.notDeepEqual(normalize(fixture(1), endpoint), normalize(wrong, endpoint));
});

it("preserves repeated versus distinct event and handle identities", () => {
  const first = fixture(1), second = fixture(2);
  first.receipt.events.push({ ...first.receipt.events[0] });
  second.receipt.events.push({ ...second.receipt.events[0], id: "order:00000000-0000-0000-0000-000000000003" });
  assert.notDeepEqual(normalize(first, endpoint), normalize(second, endpoint));
  const unrelated = fixture(2);
  unrelated.transcript[0].response.content[1].text = JSON.stringify({ ...unrelated.receipt, orderHandle: "cap_unrelated" });
  assert.notDeepEqual(normalize(fixture(1), endpoint), normalize(unrelated, endpoint));
});

it("keeps UUID business IDs and non-support thread IDs meaningful", () => {
  const left = "00000000-0000-0000-0000-000000000001", right = "00000000-0000-0000-0000-000000000002";
  for (const make of [
    (id: string) => ({ id }),
    (id: string) => ({ thread: [{ id, body: "A business thread" }] }),
    (id: string) => ({ productId: id, optionId: id }),
    (id: string) => ({ supportHandle: "cap_support", caseReference: "tkt_case", thread: [{ id: "business-id" }], business: { id } })
  ]) assert.notDeepEqual(normalize(make(left), endpoint), normalize(make(right), endpoint));
});

it("preserves distinct URL-only checkout capabilities while normalizing generated tokens", () => {
  const first = fixture(1), second = fixture(2);
  first.receipt.checkoutUrl = "http://127.0.0.1:3100/checkout?order=cap_aaaaaaaaaaaaaaaaaaaaaaaa";
  second.receipt.checkoutUrl = "http://127.0.0.1:3100/checkout?order=cap_bbbbbbbbbbbbbbbbbbbbbbbb";
  // Repeated use of the same capability must remain distinguishable from a new one.
  const left = { first: first.receipt.checkoutUrl, second: first.receipt.checkoutUrl };
  const right = { first: second.receipt.checkoutUrl, second: second.receipt.checkoutUrl };
  const urls = (value: typeof left) => [{ checkoutUrl: value.first }, { checkoutUrl: value.second }];
  assert.deepEqual(normalize(urls(left), endpoint), normalize(urls(right), endpoint));
  right.second = "http://127.0.0.1:3100/checkout?order=cap_cccccccccccccccccccccccc";
  assert.notDeepEqual(normalize(urls(left), endpoint), normalize(urls(right), endpoint));
});

it("V5-CLIENT-05 acceptance retains option roles, eligibility, physical quantities and search results", () => {
  const baseline = { options: [{ optionId: "opt-current", roles: ["closest_dose", "simpler"], purchaseEligible: true,
    basket: [{ productId: "p", servingsPerDay: 0.5, administration: { route: "oral", physicalUnit: "capsule", unitsPerServing: 2, doseIncrement: 1, provenance: { status: "verified", verifiedAt: "2026-09-01T00:00:00Z" } } }] }],
    searchSummary: { effort: "expanded", complete: false, canExpand: false, expansionAttempts: 64000, expansionBudget: 64000 },
    coverage: [{ currentAmount: 100, deliveredAmount: 50, remainingGap: 50, intakeCertainty: "unknown" }], locale: "zh-CN" };
  const mutations = [
    (row: typeof baseline) => { row.options[0].purchaseEligible = false; },
    (row: typeof baseline) => { row.options[0].roles = ["lower_cost"]; },
    (row: typeof baseline) => { row.options[0].basket[0].servingsPerDay = 1; },
    (row: typeof baseline) => { row.options[0].basket[0].administration.provenance.status = "unverified"; },
    (row: typeof baseline) => { row.options[0].basket[0].administration.provenance.verifiedAt = "2026-09-02T00:00:00Z"; },
    (row: typeof baseline) => { row.searchSummary.expansionAttempts = 8000; },
    (row: typeof baseline) => { row.coverage[0].intakeCertainty = "known"; },
    (row: typeof baseline) => { row.locale = "en"; }
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(baseline); mutate(changed);
    assert.notDeepEqual(normalize(baseline, endpoint), normalize(changed, endpoint));
  }
});
