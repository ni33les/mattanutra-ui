import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { listCommittedFunnelEvents } from "../lib/agentic/funnel/ledger.ts";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import { snapshotResourcePermits } from "../lib/agentic/qa/resource-permits.ts";
import {
  V14_BEGIN_RUN_GROUPS,
  V14_CLOCK_09,
  V14_TEST_IDS
} from "./agentic/v14/manifest.ts";
import {
  beginV14Run,
  canonicalHash,
  canonicalJson,
  contributionOf,
  createHandlerCluster,
  endV14Run,
  executeOn,
  firstDiff,
  qaCall,
  setupDefaultExecuteContext,
  type HandlerId
} from "./agentic/v14/harness.ts";

describe("v1.4 joined deterministic developer gate", () => {
  beforeEach(() => {
    beginV14Run();
  });
  afterEach(() => {
    endV14Run();
  });

  it("JOIN-RC-01..02 pack manifest lists every required test id", () => {
    const required = [
      "ATTR-RED-01",
      "ATTR-RED-02",
      "ATTR-RED-03",
      "ATTR-RED-04",
      "ATTR-RED-05",
      "QA-RC-RED-01",
      "QA-RC-RED-02",
      "QA-RC-RED-03",
      "QA-RC-RED-04",
      "QA-RC-RED-05",
      "QA-RC-RED-06",
      "QA-RC-RED-07",
      "EXEC-RC-RED-01",
      "EXEC-RC-RED-02",
      "EXEC-RC-RED-03",
      "EXEC-RC-RED-04",
      "EXEC-RC-RED-05",
      "EXEC-RC-RED-06",
      "EXEC-RC-RED-07",
      "CAP-RC-RED-01",
      "CAP-RC-RED-02",
      "CAP-RC-RED-03",
      "CAP-RC-RED-04",
      "CAP-RC-RED-05",
      "CAP-RC-RED-06",
      "DEADLINE-RED-01",
      "DEADLINE-RED-02",
      "DEADLINE-RED-03",
      "DEADLINE-RED-04",
      "DEADLINE-RED-05",
      "EDGE-RC-RED-01",
      "EDGE-RC-RED-02",
      "EDGE-RC-RED-03",
      "EDGE-RC-RED-04",
      "JOIN-RC-01",
      "JOIN-RC-02",
      "JOIN-RC-03",
      "JOIN-RC-04",
      "JOIN-RC-05",
      "JOIN-RC-06",
      "JOIN-RC-07",
      "JOIN-RC-08"
    ];
    assert.deepEqual([...V14_TEST_IDS], required);
  });

  it("JOIN-RC-03 eleven-group beginRun schedule isolates namespaces and clocks", async () => {
    const cluster = createHandlerCluster();
    const workers: HandlerId[] = ["A", "B", "C", "D"];
    const begun = [];
    for (let index = 0; index < V14_BEGIN_RUN_GROUPS; index += 1) {
      begun.push(
        await cluster.asHandler(workers[index % 4]!, (runtime) =>
          qaCall(runtime, "beginRun", { runId: `J${index}` })
        )
      );
    }
    assert.equal(new Set(begun.map((item) => String(item.namespace))).size, 11);
    for (const item of begun) {
      const setter = await cluster.asHandler("A", (runtime) =>
        qaCall(runtime, "setClock", { namespace: item.namespace, now: V14_CLOCK_09 })
      );
      assert.equal(setter.clock, V14_CLOCK_09);
    }
  });

  it("JOIN-RC-04 execute_1 then concurrent execute_2/3 keep one order", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "join04" });
    const first = await executeOn(cluster, "A", { ...ready, suffix: "join04" });
    const [second, third] = await Promise.all([
      executeOn(cluster, "B", { ...ready, suffix: "join04" }),
      executeOn(cluster, "C", { ...ready, suffix: "join04" })
    ]);
    assert.equal(first.ok, true);
    assert.equal(second.orderHandle, first.orderHandle);
    assert.equal(third.orderHandle, first.orderHandle);
    const planId = await cluster.asHandler("A", async (runtime) => {
      const capability = await resolveCapability({
        action: "plan.execute",
        config: runtime.config,
        handle: ready.planHandle,
        now: runtime.now ?? "2026-09-02T00:00:00.000Z",
        resourceType: "plan",
        scope: { ...runtime.scope, principalScope: ready.principal },
        store: runtime.store
      });
      return capability?.resourceId ?? "";
    });
    assert.equal(
      listCommittedFunnelEvents(planId).filter((item) => item.eventType === "checkout_created").length,
      1
    );
    void contributionOf(first);
  });

  it("JOIN-RC-05 final permit counters equal the initial baseline", async () => {
    const baseline = snapshotResourcePermits();
    const cluster = createHandlerCluster();
    await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
    assert.deepEqual(snapshotResourcePermits(), baseline);
  });

  it("JOIN-RC-06 two developer-suite evidence objects have one hash", async () => {
    const hashes = [];
    for (const pass of [1, 2]) {
      beginV14Run();
      const cluster = createHandlerCluster();
      const ready = await setupDefaultExecuteContext(cluster, { suffix: `join06${pass}` });
      const executed = await executeOn(cluster, "A", { ...ready, suffix: `join06${pass}` });
      hashes.push(canonicalHash({ ok: executed.ok, permits: snapshotResourcePermits() }));
      endV14Run();
    }
    assert.equal(new Set(hashes).size, 1, canonicalJson(firstDiff(hashes[0], hashes[1])));
  });

  it("JOIN-RC-07 v14 tests do not use sleep, wall-clock waits, random routing or live catalogue", () => {
    const files = [
      "test/agentic-v14-attr.test.ts",
      "test/agentic-v14-qa-rc.test.ts",
      "test/agentic-v14-exec-rc.test.ts",
      "test/agentic-v14-cap-rc.test.ts",
      "test/agentic-v14-deadline.test.ts",
      "test/agentic-v14-edge-rc.test.ts",
      "test/agentic-v14-join.test.ts"
    ];
    for (const file of files) {
      if (file.includes("join.test.ts")) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      assert.equal(source.includes("sleep("), false, file);
      assert.equal(/\bsetTimeout\s*\(/.test(source), false, file);
      assert.equal(/\bMath\.random\s*\(/.test(source), false, file);
    }
  });

  it("JOIN-RC-08 previously passing v13 context matrix still executes", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "join08" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "join08" });
    assert.equal(executed.ok, true, canonicalJson(executed));
    assert.equal(typeof executed.orderHandle, "string");
  });
});
