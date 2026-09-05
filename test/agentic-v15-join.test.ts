import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AGENTIC_SCHEMA_CHECKSUM } from "../lib/agentic/info.ts";
import { V12_TEST_IDS } from "./agentic/v12/manifest.ts";
import { V13_TEST_IDS } from "./agentic/v13/manifest.ts";
import { V14_TEST_IDS } from "./agentic/v14/manifest.ts";
import {
  beginV15Run,
  canonicalHash,
  canonicalJson,
  completeSection4Journey,
  createHandlerCluster,
  endV15Run,
  eventLedger,
  firstDiff,
  observeEvidence,
  observeOn,
  orderOn
} from "./agentic/v15/harness.ts";
import {
  V15_CLOCK_09,
  V15_CLOCK_10,
  V15_CLOCK_20,
  V15_CLOCK_30,
  V15_CLOCK_40,
  V15_FUNNEL,
  V15_SEQUENCES,
  V15_TEST_IDS
} from "./agentic/v15/manifest.ts";

describe("v1.5 joined non-latency gate", () => {
  beforeEach(() => {
    beginV15Run();
  });
  afterEach(() => {
    endV15Run();
  });

  it("JOIN-NL-01 pack manifest lists every clock, event, counter and join id", () => {
    assert.equal(V15_TEST_IDS.includes("CLOCK-RED-01"), true);
    assert.equal(V15_TEST_IDS.includes("EVENT-RED-01"), true);
    assert.equal(V15_TEST_IDS.includes("COUNT-RED-01"), true);
    assert.equal(V15_TEST_IDS.includes("JOIN-NL-09"), true);
    assert.equal(V15_TEST_IDS.length, 8 + 8 + 10 + 9);
  });

  it("JOIN-NL-02 section 4 timestamps and event order on every worker route", async () => {
    const cluster = createHandlerCluster();
    const ready = await completeSection4Journey(cluster, "join02");
    for (const worker of ["A", "B", "C"] as const) {
      const ledger = eventLedger(await orderOn(cluster, worker, { orderHandle: ready.orderHandle }));
      const byStatus = Object.fromEntries(ledger.map((item) => [item.status, item.createdAt]));
      assert.equal(byStatus.open, V15_CLOCK_09, canonicalJson({ worker, ledger }));
      assert.equal(byStatus.declined, V15_CLOCK_09);
      assert.equal(byStatus.succeeded, V15_CLOCK_10);
      assert.equal(
        ledger.filter((item) => item.status === "preparing").some((item) => item.createdAt === V15_CLOCK_20),
        true
      );
      assert.equal(byStatus.dispatched, V15_CLOCK_30);
      assert.equal(byStatus.delivered, V15_CLOCK_40);
      const statuses = ledger.map((item) => item.status);
      assert.equal(statuses.indexOf("open") < statuses.indexOf("declined"), true, canonicalJson(statuses));
    }
  });

  it("JOIN-NL-03 every observation reports 1/1/1/0", async () => {
    const cluster = createHandlerCluster();
    const ready = await completeSection4Journey(cluster, "join03");
    for (const worker of ["A", "B", "C"] as const) {
      const observed = await observeOn(cluster, worker, {
        namespace: ready.namespace,
        orderHandle: ready.orderHandle
      });
      const evidence = observeEvidence(observed) as {
        planMatch: unknown;
        planMatchHit: unknown;
        planMatchHits: unknown;
        planMatchMisses: unknown;
      };
      assert.equal(evidence.planMatch, 1, canonicalJson(evidence));
      assert.equal(evidence.planMatchHit, 1);
      assert.equal(evidence.planMatchHits, 1);
      assert.equal(evidence.planMatchMisses, 0);
    }
  });

  it("JOIN-NL-04 two developer runs have one hash and zero differing paths", async () => {
    const hashes = [];
    const bodies = [];
    for (const pass of [1, 2]) {
      beginV15Run();
      const cluster = createHandlerCluster();
      const ready = await completeSection4Journey(cluster, `join04${pass}`);
      const observed = await observeOn(cluster, "A", {
        namespace: ready.namespace,
        orderHandle: ready.orderHandle
      });
      const body = observeEvidence(observed);
      bodies.push(body);
      hashes.push(canonicalHash(body));
      endV15Run();
    }
    assert.equal(hashes[0], hashes[1], canonicalJson(firstDiff(bodies[0], bodies[1])));
  });

  it("JOIN-NL-09 prior value matching safety commercial marketing and agentic ids remain", async () => {
    assert.equal(V12_TEST_IDS.length >= 28, true, canonicalJson(V12_TEST_IDS));
    assert.equal(V13_TEST_IDS.length >= 25, true, canonicalJson(V13_TEST_IDS));
    assert.equal(V14_TEST_IDS.length >= 42, true, canonicalJson(V14_TEST_IDS));
    assert.equal(V15_TEST_IDS.length, 8 + 8 + 10 + 9);
    assert.equal(
      AGENTIC_SCHEMA_CHECKSUM,
      "5a34f93589f374518b642359e0cbe1b419dcfb0230cdfe5e1f85fe95e32a63e6"
    );
    for (const relative of [
      "test/agentic-v12-ctx.test.ts",
      "test/agentic-v13-obs.test.ts",
      "test/agentic-v13-ctx.test.ts",
      "test/agentic-v14-exec-rc.test.ts",
      "test/agentic-v14-qa-rc.test.ts",
      "test/agentic-v14-attr.test.ts"
    ]) {
      assert.equal(existsSync(relative), true, relative);
    }
    const cluster = createHandlerCluster();
    const ready = await completeSection4Journey(cluster, "join09");
    const observed = await observeOn(cluster, "B", {
      namespace: ready.namespace,
      orderHandle: ready.orderHandle
    });
    const evidence = observeEvidence(observed) as {
      events: Array<{ eventType?: string; sequence?: number }>;
      planMatch: unknown;
      planMatchHit: unknown;
      planMatchHits: unknown;
      planMatchMisses: unknown;
    };
    assert.deepEqual(
      evidence.events.map((item) => item.eventType),
      [...V15_FUNNEL]
    );
    assert.deepEqual(
      evidence.events.map((item) => Number(item.sequence)),
      [...V15_SEQUENCES]
    );
    assert.equal(evidence.planMatch, 1);
    assert.equal(evidence.planMatchHit, 1);
    assert.equal(evidence.planMatchHits, 1);
    assert.equal(evidence.planMatchMisses, 0);
  });
});
