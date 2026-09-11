import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";

it("ANNA-CLIENT-PACE-01 serializes automated calls at least 1.05 seconds apart, including process boundaries", async () => {
  const { createPacedRequest } = await import("../scripts/published-client-pacing.mjs");
  let clock = 0;
  const starts: number[] = [], sent: unknown[] = [];
  const request = createPacedRequest(async (value: unknown) => { starts.push(clock); sent.push(value); return value; }, {
    now: () => clock, sleep: async (milliseconds: number) => { clock += milliseconds; }
  });
  const inputs = [{ method: "initialize" }, { method: "tools/list" }, { method: "tools/call", params: { name: "info" } }];
  assert.deepEqual(await Promise.all(inputs.map(value => request(value))), inputs);
  assert.deepEqual(starts, [1050, 2100, 3150]);
  assert.deepEqual(sent, inputs);
  const nextProcess = createPacedRequest(async () => { starts.push(clock); }, {
    now: () => clock, sleep: async (milliseconds: number) => { clock += milliseconds; }
  });
  await nextProcess();
  assert.equal(starts.at(-1), 4200);
});

it("ANNA-CLIENT-PACE-02 pacing never retries a failed mutation, changes its key, or hides a 429", async () => {
  const { createPacedRequest } = await import("../scripts/published-client-pacing.mjs");
  let clock = 0;
  const sent: unknown[] = [];
  const failure = new Error("HTTP 429; Retry-After: 60");
  const request = createPacedRequest(async (value: unknown) => { sent.push(value); throw failure; }, {
    now: () => clock, sleep: async (milliseconds: number) => { clock += milliseconds; }
  });
  const mutation = { operation: "execute", idempotencyKey: "same-customer-mutation-key", planHandle: "returned-handle", expectedRevision: 3 };
  await assert.rejects(request(mutation), error => error === failure);
  assert.deepEqual(sent, [mutation]);
  assert.equal(clock, 1050);
});

it("ANNA-CLIENT-PACE-03 clears the earlier public window in bounded waits before the complete client matrix", async () => {
  const { clearPublicRateWindow } = await import("../scripts/published-client-pacing.mjs");
  const waits: number[] = [];
  await clearPublicRateWindow(async (milliseconds: number) => { waits.push(milliseconds); });
  assert.equal(waits.reduce((sum, value) => sum + value, 0), 61_000);
  assert.ok(waits.every(value => value > 0 && value <= 60_000));
  const gate = readFileSync("scripts/run-dev-advisory-validation.mjs", "utf8");
  const cooldown = gate.indexOf('run("documented-client-rate-window"');
  assert.ok(cooldown > gate.indexOf('run("matcher-two-runs"'));
  assert.ok(cooldown < gate.indexOf("of validationClientMatrix()"));
  assert.match(gate.slice(cooldown, gate.indexOf("of validationClientMatrix()")), /published-client-pacing\.mjs.*--clear-window/);
  const { REQUIRED_VALIDATION_STAGES } = await import("../scripts/dev-validation-proof.mjs");
  assert.ok(REQUIRED_VALIDATION_STAGES.includes("documented-client-rate-window"));
});

it("ANNA-CLIENT-PACE-04 the public client uses paced RPC and guide teaches rate-limit recovery", () => {
  const client = readFileSync("scripts/run-published-mcp-client.mjs", "utf8");
  assert.match(client, /rpc = createPacedRequest\(/);
  assert.match(client, /if \(!response\.ok \|\| body\.error\) throw/);
  const guide = readFileSync("lib/agentic/contract/guide.ts", "utf8");
  assert.match(guide, /at least one second/);
  assert.match(guide, /Retry-After/);
  assert.match(guide, /same idempotency key and unchanged payload/);
});
