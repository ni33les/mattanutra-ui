import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { catalogueSnapshotId } from "../lib/agentic/catalogue/freeze.ts";
import {
  getCatalogueSnapshot,
  publishQaCatalogue,
  replaceCatalogueSnapshot,
  resetCatalogueSnapshotCache
} from "../lib/agentic/catalogue/snapshot.ts";
import { qaPreflight } from "../lib/agentic/qa/preflight.ts";
import { resetQaPersistForTests } from "../lib/agentic/qa/persist.ts";
import {
  beginQaRun,
  forgetFrozenSnapshotForTests,
  missingFrozenSnapshotError,
  qaSession,
  QaRunInvalidError,
  resetQaSessions,
  resolveQaSession,
  setQaClock,
  withQaSessionSnapshot
} from "../lib/agentic/qa/session.ts";
import { canonicalJson } from "./agentic/det-v3/harness.ts";
import {
  enforceRateLimit,
  publicRateLimits,
  resetRateLimitStoreForTests,
  setRateLimitNowForTests
} from "../lib/rate-limit.ts";
import { enforceMcpOrQaRateLimit, qaPackRateLimitApplies } from "../lib/agentic/qa/rate-limit.ts";

const CATALOGUE_0 = fixtureSnapshot("2026-09-03T00:00:00.000Z");
const CATALOGUE_1 = fixtureSnapshot("2026-09-03T12:00:00.000Z");
const PACK_IP = "203.0.113.10";

function mcpRequest(extra: Record<string, string> = {}) {
  return new Request("https://uat.mattanutra.com/api/mcp", {
    headers: {
      "x-forwarded-for": PACK_IP,
      ...extra
    },
    method: "POST"
  });
}

function qaRequest() {
  return new Request("https://uat.mattanutra.com/api/mcp/qa", {
    headers: { "x-forwarded-for": PACK_IP },
    method: "POST"
  });
}

function simulateInstanceRestart() {
  resetQaSessions();
  resetCatalogueSnapshotCache();
}

afterEach(() => {
  resetQaSessions();
  resetQaPersistForTests();
  resetCatalogueSnapshotCache();
  resetRateLimitStoreForTests();
  setRateLimitNowForTests(null);
  delete process.env.TRUST_PROXY;
});

describe("UAT QA infrastructure Slice A manifest freeze", () => {
  it("RED-A0 / UAT-MAN-01 unscoped preflight must not change checksum when live catalogue reloads", async () => {
    replaceCatalogueSnapshot(CATALOGUE_0);
    const first = await qaPreflight(undefined, "uat");
    replaceCatalogueSnapshot(CATALOGUE_1);
    const second = await qaPreflight(undefined, "uat");
    assert.notEqual(
      catalogueSnapshotId(CATALOGUE_0),
      catalogueSnapshotId(CATALOGUE_1),
      "fixtures must actually diverge"
    );
    assert.equal(
      first.manifest.catalogueChecksum,
      second.manifest.catalogueChecksum,
      `divergent field catalogueChecksum ${first.manifest.catalogueChecksum} ${second.manifest.catalogueChecksum}`
    );
    assert.equal(canonicalJson(first.manifest), canonicalJson(second.manifest));
  });

  it("UAT-MAN-01 cross-instance preflights share one published manifest", async () => {
    replaceCatalogueSnapshot(CATALOGUE_0);
    const first = await qaPreflight(undefined, "uat");
    simulateInstanceRestart();
    replaceCatalogueSnapshot(CATALOGUE_1);
    const second = await qaPreflight(undefined, "uat");
    assert.equal(canonicalJson(first.manifest), canonicalJson(second.manifest));
    assert.equal(second.manifest.catalogueChecksum, catalogueSnapshotId(CATALOGUE_0));
  });

  it("UAT-MAN-02 beginRun binds the namespace to the frozen manifest", async () => {
    replaceCatalogueSnapshot(CATALOGUE_0);
    const begun = await beginQaRun("A", { environment: "uat", buildId: "build-a" });
    const session = qaSession(begun.namespace);
    assert.equal(session?.catalogueChecksum, catalogueSnapshotId(CATALOGUE_0));
    assert.equal(session?.buildId, "build-a");
    assert.equal(session?.catalogueVersion, CATALOGUE_0.catalogueVersion);
    replaceCatalogueSnapshot(CATALOGUE_1);
    const again = await qaPreflight(begun.namespace, "uat");
    assert.equal(again.manifest.catalogueChecksum, catalogueSnapshotId(CATALOGUE_0));
  });

  it("UAT-MAN-03 twenty-two A/B child namespaces share one manifest", async () => {
    replaceCatalogueSnapshot(CATALOGUE_0);
    const manifests: string[] = [];
    for (let index = 0; index < 11; index += 1) {
      const runA = await beginQaRun("A", { environment: "uat", buildId: "build-a" });
      const runB = await beginQaRun("B", { environment: "uat", buildId: "build-a" });
      manifests.push(String(qaSession(runA.namespace)?.catalogueChecksum));
      manifests.push(String(qaSession(runB.namespace)?.catalogueChecksum));
    }
    assert.equal(manifests.length, 22);
    assert.equal(new Set(manifests).size, 1);
    assert.equal(manifests[0], catalogueSnapshotId(CATALOGUE_0));
  });

  it("UAT-MAN-04 other instances use the namespace frozen catalogue", async () => {
    replaceCatalogueSnapshot(CATALOGUE_0);
    const begun = await beginQaRun("A", { environment: "uat", buildId: "build-a" });
    simulateInstanceRestart();
    replaceCatalogueSnapshot(CATALOGUE_1);
    const hydrated = await resolveQaSession(begun.namespace);
    assert.equal(hydrated?.catalogueChecksum, catalogueSnapshotId(CATALOGUE_0));
    const preflight = await qaPreflight(begun.namespace, "uat");
    assert.equal(preflight.manifest.catalogueChecksum, catalogueSnapshotId(CATALOGUE_0));
    const used = await withQaSessionSnapshot(begun.namespace, () =>
      catalogueSnapshotId(getCatalogueSnapshot())
    );
    assert.equal(used, catalogueSnapshotId(CATALOGUE_0));
  });

  it("UAT-MAN-05 mid-run publish does not mix catalogues", async () => {
    replaceCatalogueSnapshot(CATALOGUE_0);
    const running = await beginQaRun("A", { environment: "uat", buildId: "build-a" });
    publishQaCatalogue(CATALOGUE_1);
    const later = await beginQaRun("B", { environment: "uat", buildId: "build-a" });
    const runningManifest = await qaPreflight(running.namespace, "uat");
    const laterManifest = await qaPreflight(later.namespace, "uat");
    assert.equal(runningManifest.manifest.catalogueChecksum, catalogueSnapshotId(CATALOGUE_0));
    assert.equal(laterManifest.manifest.catalogueChecksum, catalogueSnapshotId(CATALOGUE_1));
  });

  it("UAT-MAN-06 restart reloads the namespace snapshot from persist", async () => {
    replaceCatalogueSnapshot(CATALOGUE_0);
    const begun = await beginQaRun("A", { environment: "uat", buildId: "build-a" });
    const before = await qaPreflight(begun.namespace, "uat");
    simulateInstanceRestart();
    const after = await qaPreflight(begun.namespace, "uat");
    assert.equal(canonicalJson(before.manifest), canonicalJson(after.manifest));
  });

  it("UAT-MAN-07 missing frozen snapshot is run-invalid before matching", async () => {
    replaceCatalogueSnapshot(CATALOGUE_0);
    const begun = await beginQaRun("A", { environment: "uat", buildId: "build-a" });
    forgetFrozenSnapshotForTests(begun.namespace);
    replaceCatalogueSnapshot(CATALOGUE_1);
    const session = await resolveQaSession(begun.namespace);
    const error = missingFrozenSnapshotError(session);
    assert.equal(error?.reasonCode, "run_invalid");
    let matchingRan = false;
    await assert.rejects(
      () =>
        withQaSessionSnapshot(begun.namespace, () => {
          matchingRan = true;
          return catalogueSnapshotId(getCatalogueSnapshot());
        }),
      (caught: unknown) => caught instanceof QaRunInvalidError
    );
    assert.equal(matchingRan, false);
  });

  it("UAT-MAN-08 start, child beginRun, and end manifests are byte-identical", async () => {
    replaceCatalogueSnapshot(CATALOGUE_0);
    const start = await qaPreflight(undefined, "uat");
    const childManifests: string[] = [];
    for (let index = 0; index < 11; index += 1) {
      const runA = await beginQaRun("A", { environment: "uat", buildId: "build-a" });
      const runB = await beginQaRun("B", { environment: "uat", buildId: "build-a" });
      childManifests.push(canonicalJson((await qaPreflight(runA.namespace, "uat")).manifest));
      childManifests.push(canonicalJson((await qaPreflight(runB.namespace, "uat")).manifest));
    }
    const end = await qaPreflight(undefined, "uat");
    const expected = canonicalJson(start.manifest);
    assert.equal(canonicalJson(end.manifest), expected);
    assert.equal(new Set([expected, ...childManifests]).size, 1);
  });
});

describe("UAT QA infrastructure Slice B rate allowance", () => {
  it("RED-B0 / UAT-RATE-01 the exact pack volume must not 429 a valid QA namespace", async () => {
    process.env.TRUST_PROXY = "1";
    setRateLimitNowForTests(1_000_000);
    replaceCatalogueSnapshot(CATALOGUE_0);
    const begun = await beginQaRun("A", {
      clientKey: PACK_IP,
      environment: "uat",
      buildId: "build-a"
    });
    const qaClient = mcpRequest({ "x-mattanutra-qa-namespace": begun.namespace });
    const hits: Array<number | null> = [];
    for (let index = 0; index < 200; index += 1) {
      const limited = await enforceMcpOrQaRateLimit(qaClient, "uat");
      hits.push(limited?.status ?? 200);
    }
    assert.equal(
      hits.filter((status) => status === 429).length,
      0,
      `first 429 at request ${hits.indexOf(429)}`
    );
    assert.equal(hits.length, 200);
  });

  it("UAT-RATE-01 pack IP without a header still uses the QA budget", async () => {
    process.env.TRUST_PROXY = "1";
    setRateLimitNowForTests(1_000_000);
    replaceCatalogueSnapshot(CATALOGUE_0);
    await beginQaRun("A", { clientKey: PACK_IP, environment: "uat", buildId: "build-a" });
    const unheadered = mcpRequest();
    const hits: Array<number | null> = [];
    for (let index = 0; index < 80; index += 1) {
      const limited = await enforceMcpOrQaRateLimit(unheadered, "uat");
      hits.push(limited?.status ?? 200);
    }
    assert.equal(hits.filter((status) => status === 429).length, 0);
  });

  it("UAT-RATE-02 twenty-two beginRun and setClock calls succeed", async () => {
    process.env.TRUST_PROXY = "1";
    setRateLimitNowForTests(1_000_000);
    replaceCatalogueSnapshot(CATALOGUE_0);
    const namespaces = new Set<string>();
    for (let index = 0; index < 11; index += 1) {
      const limited = await enforceMcpOrQaRateLimit(qaRequest(), "uat");
      assert.equal(limited, null);
      const runA = await beginQaRun("A", { clientKey: PACK_IP, environment: "uat", buildId: "build-a" });
      const runB = await beginQaRun("B", { clientKey: PACK_IP, environment: "uat", buildId: "build-a" });
      assert.ok(await setQaClock(runA.namespace, "2026-09-02T00:00:00.000Z"));
      assert.ok(await setQaClock(runB.namespace, "2026-09-02T00:00:00.000Z"));
      namespaces.add(runA.namespace);
      namespaces.add(runB.namespace);
    }
    assert.equal(namespaces.size, 22);
  });

  it("UAT-RATE-03 thirty plans at concurrency 10 are not throttled", async () => {
    process.env.TRUST_PROXY = "1";
    setRateLimitNowForTests(1_000_000);
    replaceCatalogueSnapshot(CATALOGUE_0);
    const begun = await beginQaRun("A", {
      clientKey: PACK_IP,
      environment: "uat",
      buildId: "build-a"
    });
    const qaClient = mcpRequest({ "x-mattanutra-qa-namespace": begun.namespace });
    const batches = [0, 1, 2];
    for (const _batch of batches) {
      const statuses = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const limited = await enforceMcpOrQaRateLimit(qaClient, "uat");
          return limited?.status ?? 200;
        })
      );
      assert.deepEqual(statuses, Array.from({ length: 10 }, () => 200));
    }
  });

  it("UAT-RATE-04 proof endpoints remain inside the QA budget after pack volume", async () => {
    process.env.TRUST_PROXY = "1";
    setRateLimitNowForTests(1_000_000);
    replaceCatalogueSnapshot(CATALOGUE_0);
    const begun = await beginQaRun("A", {
      clientKey: PACK_IP,
      environment: "uat",
      buildId: "build-a"
    });
    const qaClient = mcpRequest({ "x-mattanutra-qa-namespace": begun.namespace });
    for (let index = 0; index < 200; index += 1) {
      assert.equal(await enforceMcpOrQaRateLimit(qaClient, "uat"), null);
    }
    for (const _proof of [
      "latencyProof",
      "isolationProof",
      "checkoutContinuityProof",
      "observe",
      "evidence"
    ]) {
      assert.equal(await enforceMcpOrQaRateLimit(qaRequest(), "uat"), null);
    }
  });

  it("UAT-RATE-05 unscoped public clients still hit the ordinary 60/min bucket", async () => {
    process.env.TRUST_PROXY = "1";
    setRateLimitNowForTests(2_000_000);
    replaceCatalogueSnapshot(CATALOGUE_0);
    await beginQaRun("A", { clientKey: PACK_IP, environment: "uat", buildId: "build-a" });
    const customer = mcpRequest({ "x-forwarded-for": "198.51.100.20" });
    for (let index = 0; index < 60; index += 1) {
      assert.equal(enforceRateLimit(customer, publicRateLimits.mcp), null);
    }
    assert.equal(enforceRateLimit(customer, publicRateLimits.mcp)?.status, 429);
    assert.equal(await qaPackRateLimitApplies(customer, "uat"), false);
  });

  it("UAT-RATE-06 unknown namespace does not receive the QA allowance", async () => {
    process.env.TRUST_PROXY = "1";
    const forged = mcpRequest({ "x-mattanutra-qa-namespace": "qa-v3:forged:nope" });
    assert.equal(await qaPackRateLimitApplies(forged, "uat"), false);
  });

  it("UAT-RATE-07 production never receives the QA allowance", async () => {
    process.env.TRUST_PROXY = "1";
    replaceCatalogueSnapshot(CATALOGUE_0);
    const begun = await beginQaRun("A", {
      clientKey: PACK_IP,
      environment: "uat",
      buildId: "build-a"
    });
    const request = mcpRequest({ "x-mattanutra-qa-namespace": begun.namespace });
    assert.equal(await qaPackRateLimitApplies(request, "prd"), false);
    assert.equal(await qaPackRateLimitApplies(qaRequest(), "prd"), false);
  });

  it("UAT-RATE-08 passing does not retry or sleep through 429s", async () => {
    process.env.TRUST_PROXY = "1";
    setRateLimitNowForTests(1_000_000);
    replaceCatalogueSnapshot(CATALOGUE_0);
    const begun = await beginQaRun("A", {
      clientKey: PACK_IP,
      environment: "uat",
      buildId: "build-a"
    });
    const qaClient = mcpRequest({ "x-mattanutra-qa-namespace": begun.namespace });
    for (let index = 0; index < 136; index += 1) {
      const limited = await enforceMcpOrQaRateLimit(qaClient, "uat");
      assert.equal(limited, null, `attempt ${index + 1} was retried or throttled`);
    }
  });
});
