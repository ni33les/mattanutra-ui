/** External fixture driver for the documented HTTP client. Never makes a provider request. */
import "../test/helpers/offline-network.mjs";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { isolatedValidationEnvironment } from "./run-dev-advisory-validation.mjs";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { drivePaymentFixture, driveFulfilmentFixture } from "../lib/agentic/commerce/fixture-driver.ts";
import { isAgenticErrorResult } from "../lib/agentic/contract/errors.ts";
import { createPostgresStore } from "../lib/agentic/store/postgres.ts";
import { closeSqlPool, getSql } from "../lib/db.ts";

isolatedValidationEnvironment(process.env); // Validate only; retain the candidate's capability key.
assert.equal(process.env.MCP_ISOLATED_CANDIDATE, "1");
assert.equal(process.env.AGENTIC_PAYMENT_PROVIDER, "mock");
assert.equal(process.env.TH_RETAILER_ADAPTER, "mock_thailand");
assert.match(process.env.AGENTIC_CAPABILITY_KEY ?? "", /^fixture-[0-9a-f]{64}$/);
assert.equal(process.argv.length, 4, "Usage: settle-local-mcp-client-fixture.ts receipt.json evidence.json");
const receipt = JSON.parse(await readFile(process.argv[2], "utf8"));
assert.equal(receipt.endpoint, "http://127.0.0.1:3100/api/mcp");
assert.equal(typeof receipt.checkout?.orderHandle, "string");
const config = loadAgenticConfig();
assert.equal(config.environment, "dev");
assert.equal(config.paymentProvider, "mock");
assert.equal(config.thailandRetailerAdapter, "mock_thailand");
const now = new Date().toISOString();
const scope = { environment: "dev" as const, tenantScope: "mattanutra", principalScope: null };
const sql = getSql();
assert.ok(sql, "An isolated PostgreSQL store is required; no memory fallback.");
const store = createPostgresStore(sql);
try {
  const orderHandle = receipt.checkout.orderHandle;
  const capability = await resolveCapability({ action: "order.read", config, handle: orderHandle, now, resourceType: "order", scope, store });
  assert.ok(capability, "The candidate capability must resolve in the isolated store.");
  assert.equal(capability.principalScope, null, "Only the public documented client's order is eligible.");
  const before = await store.getOrder(capability.resourceId);
  assert.ok(before, "The public order must exist in the isolated store.");
  assert.ok(before.providerSessionId?.startsWith("mock_cs_"), "A real provider checkout cannot be settled by this fixture.");
  assert.equal(before.principalScope, null);
  const payment = await drivePaymentFixture({ config, now, orderHandle, scenario: "success", scope, store });
  assert.ok(payment && !isAgenticErrorResult(payment), "Verified mock payment application must succeed.");
  const fulfilment = [];
  for (const status of ["packed", "shipped", "delivered"] as const) {
    const updated = await driveFulfilmentFixture({ config, now, orderHandle, scope, status, store });
    assert.ok(updated && !isAgenticErrorResult(updated), `Verified fixture fulfilment ${status} must succeed.`);
    fulfilment.push({ requestedStatus: status, result: updated });
  }
  const after = await store.getOrder(capability.resourceId);
  assert.ok(after);
  assert.equal(after.paymentStatus, "paid");
  assert.equal(after?.fulfilmentStatus, "delivered");
  await writeFile(process.argv[3], `${JSON.stringify({ fixture: true, externalToDocumentedClient: true, providerRequests: 0, now, orderHandle, before, payment, fulfilment, after }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ fixture: true, providerRequests: 0, paymentStatus: after.paymentStatus, fulfilmentStatus: after.fulfilmentStatus, output: process.argv[3] }));
} finally { await closeSqlPool(); }
