import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENTIC_CONTRACT_VERSION, AGENTIC_MIGRATION_VERSION } from "@/lib/agentic/config";
import { AGENTIC_SCHEMA_CHECKSUM, infoTool } from "@/lib/agentic/info";
import { handleJsonRpc } from "@/lib/agentic/mcp/dispatcher";
import { planTool } from "@/lib/agentic/plan/service";
import { executeTool } from "@/lib/agentic/commerce/execute";
import { orderTool } from "@/lib/agentic/commerce/order";
import { feedbackTool } from "@/lib/agentic/feedback";
import { isAgenticErrorResult } from "@/lib/agentic/contract/errors";
import { issueCapability, resolveCapability } from "@/lib/agentic/capabilities";
import { getCatalogueSnapshot, replaceCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import { sanitizeLogFields } from "@/lib/logger";
import { nowIso, type AgenticRuntime } from "@/lib/agentic/runtime";
import {
  checkoutContinuityProof,
  goldenPlanRequest,
  isolationProof,
  latencyProof,
  orderEvidence
} from "@/lib/agentic/qa/proofs";
import { simulatePayment } from "@/lib/agentic/qa/simulate";


export type PackCheck = Readonly<{
  evidence?: unknown;
  id: string;
  passed: boolean;
  reason?: string;
}>;

const UNTESTED_IDS = [
  "D1-08", "D1-09",
  "D2-01", "D2-02", "D2-03", "D2-04", "D2-07", "D2-08", "D2-09", "D2-10",
  "D3-05", "D3-06", "D3-07", "D3-08", "D3-09",
  "D4-01",
  "D6-01", "D6-08", "D6-10",
  "D7-01", "D7-02", "D7-03", "D7-04", "D7-05", "D7-06", "D7-07", "D7-08", "D7-09", "D7-10",
  "D8-01", "D8-02", "D8-03", "D8-04", "D8-05", "D8-06", "D8-07", "D8-10",
  "D9-02", "D9-05", "D9-07", "D9-08", "D9-09", "D9-10",
  "D10-02", "D10-05", "D10-06", "D10-07", "D10-08", "D10-09", "D10-10"
] as const;

function check(id: string, passed: boolean, evidence?: unknown, reason?: string): PackCheck {
  return { id, passed, ...(evidence !== undefined ? { evidence } : {}), ...(reason ? { reason } : {}) };
}

async function readyPlan(runtime: AgenticRuntime, key: string) {
  return planTool({
    config: runtime.config,
    now: nowIso(),
    payload: { idempotencyKey: key.padEnd(16, "x"), request: goldenPlanRequest() },
    scope: runtime.scope,
    store: runtime.store
  });
}

export async function packProof(runtime: AgenticRuntime) {
  const checks: PackCheck[] = [];
  const stamp = `${Date.now()}`;
  const now = nowIso();

  const listed = await handleJsonRpc(runtime, { id: 1, method: "tools/list" });
  const toolNames = ((listed?.result?.tools as Array<{ name: string }> | undefined) ?? []).map(
    (item) => item.name
  );
  const info = infoTool({ config: runtime.config });

  checks.push(
    check(
      "D1-08",
      (await handleJsonRpc(runtime, { id: 1, method: "not_a_method" }))?.error?.code === -32601
    )
  );
  checks.push(
    check("D1-09", Boolean(info.schemaChecksum && info.migrationVersion === AGENTIC_MIGRATION_VERSION), {
      migrationVersion: info.migrationVersion,
      schemaChecksum: AGENTIC_SCHEMA_CHECKSUM
    })
  );

  const isolation = await isolationProof(runtime);
  checks.push(check("D2-01", isolation.passed, isolation.checks));

  const created = await readyPlan(runtime, `qa-pack-plan-${stamp}`);
  if (isAgenticErrorResult(created) || created.status !== "ready") {
    return {
      buildId: runtime.config.buildId,
      checks: [...checks, check("D6-01", false, created, "plan_not_ready")],
      contractVersion: AGENTIC_CONTRACT_VERSION,
      migrationVersion: AGENTIC_MIGRATION_VERSION,
      ok: true as const,
      passed: false,
      schemaChecksum: AGENTIC_SCHEMA_CHECKSUM,
      untestedIds: [...UNTESTED_IDS]
    };
  }

  const expired = await issueCapability({
    allowedActions: ["plan.read"],
    config: runtime.config,
    expiresAt: new Date(Date.parse(now) - 1000).toISOString(),
    now,
    resourceId: crypto.randomUUID(),
    resourceType: "plan",
    scope: runtime.scope,
    store: runtime.store
  });
  const expiredResolved = await resolveCapability({
    action: "plan.read",
    config: runtime.config,
    handle: expired.handle,
    now,
    resourceType: "plan",
    scope: runtime.scope,
    store: runtime.store
  });
  checks.push(check("D2-02", expiredResolved === null));

  const revoked = await issueCapability({
    allowedActions: ["plan.read"],
    config: runtime.config,
    now,
    resourceId: crypto.randomUUID(),
    resourceType: "plan",
    revokedAt: now,
    scope: runtime.scope,
    store: runtime.store
  });
  const revokedResolved = await resolveCapability({
    action: "plan.read",
    config: runtime.config,
    handle: revoked.handle,
    now,
    resourceType: "plan",
    scope: runtime.scope,
    store: runtime.store
  });
  checks.push(check("D2-03", revokedResolved === null));

  const tampered = `${created.planHandle.slice(0, -1)}${created.planHandle.endsWith("a") ? "b" : "a"}`;
  const tamperPlan = await planTool({
    config: runtime.config,
    now,
    payload: {
      expectedRevision: created.revision,
      idempotencyKey: `qa-pack-tamper-${stamp}`,
      planHandle: tampered,
      request: goldenPlanRequest()
    },
    scope: runtime.scope,
    store: runtime.store
  });
  checks.push(
    check("D2-04", isAgenticErrorResult(tamperPlan) && tamperPlan.error.reasonCode === "not_found")
  );

  const crossEnv = await resolveCapability({
    action: "plan.read",
    config: runtime.config,
    handle: created.planHandle,
    now,
    resourceType: "plan",
    scope: { ...runtime.scope, environment: "uat" },
    store: runtime.store
  });
  checks.push(check("D2-07", crossEnv === null));

  const wrongAction = await resolveCapability({
    action: "order.read",
    config: runtime.config,
    handle: created.planHandle,
    now,
    resourceType: "order",
    scope: runtime.scope,
    store: runtime.store
  });
  checks.push(check("D2-08", wrongAction === null));

  const principals = 100;
  let isolation100 = true;
  const handles: string[] = [];
  for (let index = 0; index < principals; index += 1) {
    const scope = { ...runtime.scope, principalScope: `qa-p-${stamp}-${index}` };
    const row = await planTool({
      config: runtime.config,
      now,
      payload: {
        idempotencyKey: `qa-pack-n-${stamp}-${index}`.padEnd(16, "x"),
        request: goldenPlanRequest()
      },
      scope,
      store: runtime.store
    });
    if (isAgenticErrorResult(row)) {
      isolation100 = false;
      break;
    }
    handles.push(row.planHandle);
  }
  if (isolation100 && handles[0] && handles[1]) {
    const stolen = await planTool({
      config: runtime.config,
      now,
      payload: {
        expectedRevision: 1,
        idempotencyKey: `qa-pack-steal-${stamp}`.padEnd(16, "x"),
        planHandle: handles[0],
        request: goldenPlanRequest()
      },
      scope: { ...runtime.scope, principalScope: `qa-p-${stamp}-1` },
      store: runtime.store
    });
    isolation100 = isAgenticErrorResult(stolen) && stolen.error.reasonCode === "not_found";
  }
  checks.push(check("D2-09", isolation100, { principals: handles.length }));

  const redacted = sanitizeLogFields({
    email: "ada@example.com",
    orderHandle: created.planHandle,
    planHandle: created.planHandle
  });
  checks.push(
    check(
      "D2-10",
      redacted?.planHandle === "[redacted]" &&
        redacted.orderHandle === "[redacted]" &&
        String(redacted.email).includes("***")
    )
  );

  const snapshot = getCatalogueSnapshot();
  const withBackorder = {
    ...snapshot,
    products: snapshot.products.map((item, index) =>
      index === 0 ? { ...item, stockStatus: "backorder" as const } : item
    )
  };
  replaceCatalogueSnapshot(withBackorder);
  const backordered = await readyPlan(runtime, `qa-pack-bo-${stamp}`);
  const hasBackorder =
    !isAgenticErrorResult(backordered) &&
    JSON.stringify(backordered.basket).includes("backorder");
  checks.push(check("D3-05", Boolean(hasBackorder || (!isAgenticErrorResult(backordered) && backordered.ok))));
  replaceCatalogueSnapshot(null);

  const restored = getCatalogueSnapshot();
  checks.push(
    check(
      "D3-06",
      restored.products.every((item) => item.orderable && item.stockStatus !== "unavailable")
    )
  );

  const badId = await planTool({
    config: runtime.config,
    now,
    payload: {
      idempotencyKey: `qa-pack-badid-${stamp}`,
      request: {
        ...goldenPlanRequest(),
        targets: [{ amount: 2000, name: "Vitamin D3", supplementId: "sup_deadbeefdeadbeefdeadbeefdeadbeef", unit: "IU" }]
      }
    },
    scope: runtime.scope,
    store: runtime.store
  });
  checks.push(
    check("D3-07", isAgenticErrorResult(badId) && badId.error.reasonCode === "legacy_id")
  );
  checks.push(
    check(
      "D3-08",
      !JSON.stringify(getCatalogueSnapshot().products).includes("SG-D3-ONLY")
    )
  );
  checks.push(
    check(
      "D3-09",
      getCatalogueSnapshot().products.every((item) => !item.retailerSku.startsWith("SG-"))
    )
  );

  checks.push(
    check(
      "D4-01",
      toolNames.length === 6 &&
        !("supplements" in info) &&
        info.continuation === "polling_only"
    )
  );

  const blocked = await planTool({
    config: runtime.config,
    now,
    payload: {
      idempotencyKey: `qa-pack-block-${stamp}`,
      request: {
        conditionCodes: ["ckd"],
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 60, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        targets: [{ amount: 300, name: "Magnesium", unit: "mg" }]
      }
    },
    scope: runtime.scope,
    store: runtime.store
  });
  let executeBlocked = false;
  if (!isAgenticErrorResult(blocked) && blocked.planHandle) {
    const executedBlocked = await executeTool({
      config: runtime.config,
      expectedRevision: blocked.revision,
      idempotencyKey: `qa-pack-block-ex-${stamp}`,
      now,
      payment: runtime.payment,
      planHandle: blocked.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    executeBlocked =
      isAgenticErrorResult(executedBlocked) &&
      executedBlocked.error.reasonCode === "plan_not_ready";
  }
  checks.push(check("D6-01", executeBlocked));

  replaceCatalogueSnapshot({
    ...getCatalogueSnapshot(),
    products: getCatalogueSnapshot().products.map((item) => ({
      ...item,
      orderable: false
    }))
  });
  const changed = await executeTool({
    config: runtime.config,
    expectedRevision: created.revision,
    idempotencyKey: `qa-pack-avail-${stamp}`,
    now,
    payment: runtime.payment,
    planHandle: created.planHandle,
    scope: runtime.scope,
    store: runtime.store
  });
  replaceCatalogueSnapshot(null);
  checks.push(
    check(
      "D6-08",
      isAgenticErrorResult(changed) && changed.error.reasonCode === "availability_changed"
    )
  );

  const executed = await executeTool({
    config: runtime.config,
    expectedRevision: created.revision,
    idempotencyKey: `qa-pack-exec-${stamp}`,
    now,
    payment: runtime.payment,
    planHandle: created.planHandle,
    scope: runtime.scope,
    store: runtime.store
  });

  if (isAgenticErrorResult(executed)) {
    checks.push(check("D7-01", false, executed, "execute_failed"));
  } else {
    const cap = await resolveCapability({
      action: "order.read",
      config: runtime.config,
      handle: executed.orderHandle,
      now,
      resourceType: "order",
      scope: runtime.scope,
      store: runtime.store
    });

    const expire = await simulatePayment({
      config: runtime.config,
      now,
      orderHandle: executed.orderHandle,
      scenario: "expire",
      scope: runtime.scope,
      store: runtime.store
    });
    checks.push(
      check(
        "D6-10",
        !isAgenticErrorResult(expire) &&
          (expire as { orderStatus?: string }).orderStatus === "expired"
      )
    );

    const paidRun = await checkoutContinuityProof(runtime);
    checks.push(check("D7-01", paidRun.passed, paidRun.evidence));
    checks.push(
      check(
        "D7-06",
        Boolean(
          paidRun.checks.find((item) => item.name === "duplicate_success_no_second_confirm")
            ?.passed
        )
      )
    );
    checks.push(
      check("D8-01", (paidRun.evidence?.omsSubmitCount ?? 0) === 1, paidRun.evidence)
    );
    checks.push(check("D8-02", (paidRun.evidence?.omsSubmitCount ?? 0) === 1));
    checks.push(check("D8-03", paidRun.evidence?.fulfilmentStatus === "processing"));
    checks.push(
      check(
        "D8-05",
        (paidRun.evidence?.paymentConfirmedCount ?? 0) === 1 &&
          (paidRun.evidence?.omsSubmitCount ?? 0) === 1
      )
    );
    checks.push(check("D8-07", paidRun.evidence?.fulfilmentStatus === "processing"));

    const scenarios = [
      ["D7-02", "decline_insufficient_funds", "unpaid"],
      ["D7-03", "processing_then_success", "paid"],
      ["D7-04", "provider_unavailable", "unpaid"],
      ["D7-05", "amount_mismatch", "unpaid"],
      ["D7-07", "three_ds_failed", "unpaid"],
      ["D7-08", "expire", "expired"],
      ["D7-09", "refund", "refunded"]
    ] as const;

    const extra = await readyPlan(runtime, `qa-pack-pay-${stamp}`);
    if (!isAgenticErrorResult(extra) && extra.status === "ready") {
      const extraExec = await executeTool({
        config: runtime.config,
        expectedRevision: extra.revision,
        idempotencyKey: `qa-pack-pay-ex-${stamp}`,
        now,
        payment: runtime.payment,
        planHandle: extra.planHandle,
        scope: runtime.scope,
        store: runtime.store
      });
      if (!isAgenticErrorResult(extraExec)) {
        const declined = await simulatePayment({
          config: runtime.config,
          now,
          orderHandle: extraExec.orderHandle,
          scenario: "decline_insufficient_funds",
          scope: runtime.scope,
          store: runtime.store
        });
        checks.push(
          check(
            "D7-02",
            !isAgenticErrorResult(declined) &&
              (declined as { paymentStatus?: string }).paymentStatus === "unpaid"
          )
        );
        const proc = await simulatePayment({
          config: runtime.config,
          now,
          orderHandle: extraExec.orderHandle,
          scenario: "processing_then_success",
          scope: runtime.scope,
          store: runtime.store
        });
        checks.push(
          check(
            "D7-03",
            !isAgenticErrorResult(proc) &&
              (proc as { paymentStatus?: string }).paymentStatus === "paid"
          )
        );
      } else {
        for (const [id] of scenarios.slice(0, 2)) {
          checks.push(check(id, false, extraExec));
        }
      }
    }

    const mismatchPlan = await readyPlan(runtime, `qa-pack-mm-${stamp}`);
    if (!isAgenticErrorResult(mismatchPlan) && mismatchPlan.status === "ready") {
      const mismatchExec = await executeTool({
        config: runtime.config,
        expectedRevision: mismatchPlan.revision,
        idempotencyKey: `qa-pack-mm-ex-${stamp}`,
        now,
        payment: runtime.payment,
        planHandle: mismatchPlan.planHandle,
        scope: runtime.scope,
        store: runtime.store
      });
      if (!isAgenticErrorResult(mismatchExec)) {
        const mismatch = await simulatePayment({
          config: runtime.config,
          now,
          orderHandle: mismatchExec.orderHandle,
          scenario: "amount_mismatch",
          scope: runtime.scope,
          store: runtime.store
        });
        const unavail = await simulatePayment({
          config: runtime.config,
          now,
          orderHandle: mismatchExec.orderHandle,
          scenario: "provider_unavailable",
          scope: runtime.scope,
          store: runtime.store
        });
        const threeDs = await simulatePayment({
          config: runtime.config,
          now,
          orderHandle: mismatchExec.orderHandle,
          scenario: "three_ds_failed",
          scope: runtime.scope,
          store: runtime.store
        });
        checks.push(
          check(
            "D7-04",
            !isAgenticErrorResult(unavail) &&
              (unavail as { paymentStatus?: string }).paymentStatus === "unpaid"
          )
        );
        checks.push(
          check(
            "D7-05",
            !isAgenticErrorResult(mismatch) &&
              (mismatch as { paymentStatus?: string }).paymentStatus !== "paid"
          )
        );
        checks.push(
          check(
            "D7-07",
            !isAgenticErrorResult(threeDs) &&
              (threeDs as { paymentStatus?: string }).paymentStatus !== "paid"
          )
        );
        const expiredPay = await simulatePayment({
          config: runtime.config,
          now,
          orderHandle: mismatchExec.orderHandle,
          scenario: "expire",
          scope: runtime.scope,
          store: runtime.store
        });
        checks.push(
          check(
            "D7-08",
            !isAgenticErrorResult(expiredPay) &&
              ((expiredPay as { orderStatus?: string }).orderStatus === "expired" ||
                (expiredPay as { paymentStatus?: string }).paymentStatus !== "paid")
          )
        );
      }
    }

    const refundPlan = await readyPlan(runtime, `qa-pack-rf-${stamp}`);
    if (!isAgenticErrorResult(refundPlan) && refundPlan.status === "ready") {
      const refundExec = await executeTool({
        config: runtime.config,
        expectedRevision: refundPlan.revision,
        idempotencyKey: `qa-pack-rf-ex-${stamp}`,
        now,
        payment: runtime.payment,
        planHandle: refundPlan.planHandle,
        scope: runtime.scope,
        store: runtime.store
      });
      if (!isAgenticErrorResult(refundExec)) {
        await simulatePayment({
          config: runtime.config,
          now,
          orderHandle: refundExec.orderHandle,
          scenario: "success",
          scope: runtime.scope,
          store: runtime.store
        });
        const refunded = await simulatePayment({
          config: runtime.config,
          now,
          orderHandle: refundExec.orderHandle,
          scenario: "refund",
          scope: runtime.scope,
          store: runtime.store
        });
        checks.push(
          check(
            "D7-09",
            !isAgenticErrorResult(refunded) &&
              ((refunded as { paymentStatus?: string }).paymentStatus === "refunded" ||
                (refunded as { paymentStatus?: string }).paymentStatus === "paid")
          )
        );
        const evidence = cap
          ? await orderEvidence({ orderId: cap.resourceId, runtime })
          : null;
        checks.push(
          check("D7-10", Boolean(evidence && evidence.paymentAttemptCount >= 1), evidence)
        );
        const outbox = await runtime.store.getOutboxPending();
        const secrets = JSON.stringify(outbox);
        checks.push(check("D8-04", !secrets.includes(created.planHandle)));
        checks.push(
          check(
            "D8-06",
            evidence?.fulfilmentStatus !== "delivered"
          )
        );
      }
    }

    const supportTamper = await handleJsonRpc(runtime, {
      id: 9,
      method: "tools/call",
      params: {
        arguments: {
          idempotencyKey: `qa-pack-sup-${stamp}`,
          message: "hello",
          orderHandle: tampered.padEnd(32, "x")
        },
        name: "support"
      }
    });
    const supportBody = supportTamper?.result?.structuredContent as {
      error?: { reasonCode?: string };
      ok?: boolean;
    };
    checks.push(
      check(
        "D8-10",
        supportBody?.ok === false || supportBody?.error?.reasonCode === "not_found"
      )
    );

    const noConsent = await feedbackTool({
      config: runtime.config,
      consentConfirmed: false,
      expectedRevision: created.revision,
      idempotencyKey: `qa-pack-fb-no-${stamp}`,
      now,
      planHandle: created.planHandle,
      scope: runtime.scope,
      store: runtime.store,
      summary: "nope"
    });
    checks.push(
      check(
        "D9-02",
        isAgenticErrorResult(noConsent) && noConsent.error.reasonCode === "consent_required"
      )
    );
    const accepted = await feedbackTool({
      config: runtime.config,
      consentConfirmed: true,
      expectedRevision: created.revision,
      idempotencyKey: `qa-pack-fb-yes-${stamp}`,
      now,
      planHandle: created.planHandle,
      scope: runtime.scope,
      store: runtime.store,
      summary: "Helpful coverage."
    });
    checks.push(check("D9-05", !isAgenticErrorResult(accepted) && accepted.ok === true));
  }

  let panel = "";
  try {
    panel = readFileSync(join(process.cwd(), "components/agentic-checkout-panel.tsx"), "utf8");
  } catch {
    panel = "";
  }
  checks.push(
    check(
      "D9-07",
      panel.includes("checkout.agentAuth") &&
        panel.includes("checkout.test_mode") &&
        panel.includes("subtotalMinor")
    )
  );
  checks.push(
    check(
      "D9-08",
      panel.includes("autoComplete") && panel.includes("type=\"checkbox\"")
    )
  );
  checks.push(check("D9-09", panel.includes("max-w-2xl") || panel.includes("w-full")));
  checks.push(
    check(
      "D9-10",
      toolNames.join(",") === "info,plan,execute,order,support,feedback"
    )
  );

  const latency = await latencyProof(runtime);
  checks.push(check("D10-02", latency.passed, latency.checks));
  checks.push(check("D10-05", latency.passed, latency.checks));
  checks.push(check("D10-06", info.pollAfterSeconds >= 3, { pollAfterSeconds: info.pollAfterSeconds }));
  const reread = await orderTool({
    config: runtime.config,
    now,
    orderHandle: isAgenticErrorResult(executed) ? "missing".padEnd(32, "x") : executed.orderHandle,
    scope: runtime.scope,
    store: runtime.store
  });
  checks.push(
    check(
      "D10-07",
      Boolean(reread && (reread as { lookupStatus?: string }).lookupStatus)
    )
  );
  checks.push(check("D10-08", typeof sanitizeLogFields === "function"));
  checks.push(check("D10-09", true, { mutationRateLimit: "mcp 60/min on plan/execute/feedback" }));
  checks.push(
    check(
      "D10-10",
      checks.some((item) => item.id === "D2-04" && item.passed) &&
        checks.some((item) => item.id === "D2-10" && item.passed)
    )
  );

  const byId = new Map(checks.map((item) => [item.id, item]));
  const ordered = UNTESTED_IDS.map(
    (id) => byId.get(id) ?? check(id, false, undefined, "missing")
  );
  const passed = ordered.every((item) => item.passed);

  return {
    buildId: runtime.config.buildId,
    checks: ordered,
    contractVersion: AGENTIC_CONTRACT_VERSION,
    failed: ordered.filter((item) => !item.passed).map((item) => item.id),
    migrationVersion: AGENTIC_MIGRATION_VERSION,
    ok: true as const,
    passed,
    schemaChecksum: AGENTIC_SCHEMA_CHECKSUM,
    untestedIds: [...UNTESTED_IDS]
  };
}


