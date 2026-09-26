import assert from "node:assert/strict";
import { after, beforeEach, mock, test } from "node:test";
import * as shared from "../../lib/communications-shared.ts";

const planId = "fe2b1a6f-cd85-4193-b3d6-718d8077fc84";
const otherPlanId = "a8b87c16-87ba-488c-8169-1c0fcbd8c0e1";
type Token = { id: string; planId: string; hash: string; expiresAt: Date; metadata: unknown };
let codes: string[], generated: number, inserts: number, planExists: boolean;
let tokens: Token[], events: unknown[], failure: Error | null;
const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const query = strings.join(" ? ");
  if (/insert into public.customer_line_connect_tokens/i.test(query)) {
    inserts++;
    if (failure) throw failure;
    if (!planExists) return [];
    const [id, orderId, hash, expiresAt, metadata, requestedPlan] = values;
    const conflicting = tokens.some(token => token.hash === hash);
    if (conflicting) {
      if (!/on conflict\s*\(token_hash\)\s*where consumed_at is null and status in \('active', 'consuming'\)\s*do nothing/i.test(query)) {
        throw Object.assign(new Error("duplicate key value violates unique constraint"), {
          code: "23505", constraint_name: "customer_line_connect_tokens_active_hash_idx"
        });
      }
      return [];
    }
    tokens.push({ id: String(id), planId: String(requestedPlan), hash: String(hash), expiresAt: expiresAt as Date, metadata });
    return [{ id, expires_at: expiresAt, retail_customer_order_id: orderId }];
  }
  if (/select.*from public.assessments/is.test(query)) return planExists ? [{ plan_id: planId }] : [];
  throw new Error(`Unexpected SQL: ${query}`);
}, { json: (value: unknown) => value });
mock.module("../../lib/communications-shared.ts", { namedExports: {
  ...shared,
  sqlOrThrow: () => sql,
  newLineConnectCode: () => codes[generated++] ?? "AAAAAA"
} });
mock.module("../../lib/bpm.ts", { namedExports: { writeBpmEvent: async (event: unknown) => { events.push(event); } } });
const { createCustomerLineConnectToken } = await import("../../lib/communications-organisation.ts");
after(() => mock.restoreAll());
beforeEach(() => {
  codes = ["AAAAAA", "BBBBBB", "CCCCCC"]; generated = 0; inserts = 0;
  planExists = true; tokens = []; events = []; failure = null;
});
const prior = (code: string, expiresAt: Date): Token => ({ id: "existing-token", planId: otherPlanId,
  hash: shared.hashLineConnectCode(code), expiresAt, metadata: { source: "pharmacy_plan" } });

test("PHARM-LINE-COLLISION-01 active and expired active codes retry without changing another plan's token", async () => {
  tokens.push(prior("AAAAAA", new Date(Date.now() + 60_000)), prior("BBBBBB", new Date(0)));
  const original = structuredClone(tokens);
  const result = await createCustomerLineConnectToken({ planId, source: "pharmacy_plan", planDelivery: { locale: "th", planUrl: "https://example.test/th/plan" } });
  assert.equal(result.code, "CCCCCC"); assert.equal(inserts, 3); assert.equal(generated, 3);
  assert.deepEqual(tokens.slice(0, 2), original);
  assert.equal(tokens[2].hash, shared.hashLineConnectCode(result.code)); assert.equal(tokens[2].planId, planId);
  assert.deepEqual(tokens[2].metadata, { expiresInMinutes: 15, retailCustomerOrderId: null, source: "pharmacy_plan", planDelivery: { locale: "th", planUrl: "https://example.test/th/plan" } });
  assert.equal(events.length, 1); assert.equal((events[0] as { properties: { tokenId: string } }).properties.tokenId, result.id);
});

test("PHARM-LINE-COLLISION-02 concurrent callers persist distinct codes when generation collides", async () => {
  codes = ["AAAAAA", "AAAAAA", "BBBBBB"];
  const results = await Promise.all([createCustomerLineConnectToken({ planId }), createCustomerLineConnectToken({ planId: otherPlanId })]);
  assert.equal(new Set(results.map(result => result.code)).size, 2); assert.equal(tokens.length, 2);
  for (let index = 0; index < results.length; index++) {
    const saved = tokens.find(token => token.id === results[index].id)!;
    assert.equal(saved.hash, shared.hashLineConnectCode(results[index].code));
    assert.equal(saved.planId, index === 0 ? planId : otherPlanId);
  }
  assert.equal(events.length, 2); assert.equal(inserts, 3);
});

test("PHARM-LINE-COLLISION-03 repeated collisions stop after a bounded number without false creation events", async () => {
  codes = []; tokens.push(prior("AAAAAA", new Date(Date.now() + 60_000)));
  const original = structuredClone(tokens);
  await assert.rejects(createCustomerLineConnectToken({ planId }), /Unable to allocate a LINE connection code/);
  assert.ok(inserts > 1 && inserts <= 5); assert.equal(generated, inserts);
  assert.deepEqual(tokens, original); assert.deepEqual(events, []);
});

test("PHARM-LINE-COLLISION-04 missing plans retain their precise failure without repeated insert attempts", async () => {
  planExists = false;
  await assert.rejects(createCustomerLineConnectToken({ planId }), /Plan not found/);
  assert.equal(inserts, 1); assert.equal(generated, 1); assert.deepEqual(events, []);
});

test("PHARM-LINE-COLLISION-05 unrelated database errors are preserved and never retried", async () => {
  failure = Object.assign(new Error("different uniqueness failure"), { code: "23505", constraint_name: "customer_line_connect_tokens_pkey" });
  await assert.rejects(createCustomerLineConnectToken({ planId }), error => error === failure);
  assert.equal(inserts, 1); assert.equal(generated, 1); assert.deepEqual(events, []);
});
