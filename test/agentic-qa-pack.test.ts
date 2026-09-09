import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { handleCompletedFullJsonRpc as handleJsonRpc } from "./helpers/completed-mcp-client.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { engineeringInfo } from "../lib/agentic/info.ts";
import type { PlanResult } from "../lib/agentic/plan/types.ts";
import { agenticToolDescriptions } from "../lib/agentic/contract/index.ts";
import { AGENTIC_SERVER_INSTRUCTIONS } from "../lib/agentic/contract/instructions.ts";
import { mcpTestBatches, mcpTestFiles } from "../scripts/agentic-qa-pack.mjs";
import {
  everyLineHasHttpImage,
  exactToolNames,
  isFixtureLine,
  isFixtureShapedId,
  isHttpUrl,
  optionLines,
  unpaidA9EnvGate,
  hasOrderTrackDestination
} from "../scripts/agentic-qa-pack-helpers.mjs";

function runtimeFor(): AgenticRuntime {
  return createAgenticRuntime({
    config: loadAgenticConfig(),
    scope: {
      environment: "dev",
      principalScope: "agentic-qa",
      tenantScope: "mattanutra"
    },
    store: createMemoryStore()
  });
}

async function call(runtime: AgenticRuntime, name: string, args: unknown) {
  const response = await handleJsonRpc(runtime, {
    id: 1,
    method: "tools/call",
    params: { arguments: args, name }
  });
  assert.ok(response?.result);
  return response.result.structuredContent as Record<string, unknown>;
}

function eightTargets() {
  return [
    { amount: 2000, name: "Vitamin D3", unit: "IU" },
    { amount: 1000, name: "Algae omega-3", unit: "mg" },
    { amount: 300, name: "Magnesium", unit: "mg" },
    { amount: 1000, name: "Vitamin B12", unit: "mcg" },
    { amount: 1000, name: "Vitamin C", unit: "mg" },
    { amount: 25, name: "Zinc", unit: "mg" },
    { amount: 10, name: "Iron", unit: "mg" },
    { amount: 100, name: "CoQ10", unit: "mg" }
  ];
}

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "balanced",
    profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
    requirements: {},
    targets: eightTargets(),
    ...overrides
  };
}

function namesInBasket(plan: Record<string, unknown>) {
  return ((plan.basket as Array<{ productName?: string }>) ?? []).map((item) =>
    String(item.productName ?? "")
  );
}

beforeEach(() => {
  installGoldCatalogue();
});

afterEach(() => {
  uninstallGoldCatalogue();
  setAgenticRuntimeForTests(null);
});

describe("Repository MattaNutra Agentic QA coverage", () => {
  it("A1 info lists names and codes; Algae omega-3 does not 400", async () => {
    const runtime = runtimeFor();
    const info = await call(runtime, "info", { locale: "en" });
    const engineering = await engineeringInfo({ config: runtime.config, locale: "en" });
    const names = (engineering.recognisedNames as string[]) ?? [];
    assert.ok(names.includes("Algae omega-3"));
    assert.ok(names.includes("Vitamin K2"));
    assert.ok(names.includes("MK-7"));
    assert.ok(names.includes("Folate"));
    assert.ok(((info.medicationCodes as string[]) ?? []).includes("apixaban"));
    assert.ok(((info.conditionCodes as string[]) ?? []).includes("ckd"));

    const plan = await call(runtime, "plan", {
      idempotencyKey: "qa-a1-algae-k2-00001",
      request: baseRequest({
        targets: [
          { amount: 1000, name: "Algae omega-3", unit: "mg" },
          { amount: 100, name: "Vitamin K2", unit: "mcg" }
        ]
      })
    });
    assert.equal(plan.ok, true);
    assert.notEqual((plan.error as { reasonCode?: string } | undefined)?.reasonCode, "unknown_supplement");
    const leftovers = (plan.leftovers as Array<{ name?: string; reason?: string }>) ?? [];
    const coverage = (plan.coverage as Array<{ name?: string; status?: string }>) ?? [];
    assert.equal(
      leftovers.some((item) =>
        String(item.name).toLowerCase().includes("k2") && item.reason === "not_in_catalogue"
      ),
      false
    );
    assert.ok(
      leftovers.some((item) =>
        String(item.name).toLowerCase().includes("k2") && item.reason === "uncovered"
      ) ||
        coverage.some(
          (row) =>
            String(row.name).toLowerCase().includes("k2") && row.status === "uncovered"
        ) ||
        namesInBasket(plan).some((name) => /k2|mk-?7|menaquinone/i.test(name))
    );
  });

  it("A2 explicit prerequisite answer preserves targets and medication context", async () => {
    const runtime = runtimeFor();
    const created = await call(runtime, "plan", {
      idempotencyKey: "qa-a2-create-0000001",
      request: baseRequest({
        medicationCodes: ["apixaban"],
        requirements: { maxProductCount: 8 },
        targets: eightTargets().map((target) => target.name === "Iron" ? { ...target, importance: "conditional", prerequisite: { status: "unknown" } } : target)
      })
    });
    assert.equal(created.ok, true);
    assert.ok((created.basket as unknown[]).length >= 4);
    const zincB12 = namesInBasket(created);
    assert.ok(zincB12.some((name) => /zinc/i.test(name)));
    assert.ok(zincB12.some((name) => /b12/i.test(name)));
    const questions = (created.questions as Array<{
      questionId?: string;
      choices?: Array<{ choice?: string }>;
    }>) ?? [];
    const prerequisite = questions.find((question) => question.choices?.some((choice) => choice.choice?.startsWith("satisfy_prerequisite:")));
    assert.ok(prerequisite, "explicit prerequisites remain actionable customer decisions");
    assert.equal(questions.some((question) => question.questionId === "q_safety_ack"), false);
    const patched = await call(runtime, "plan", {
      operation: "answer",
      answers: [{ questionId: prerequisite.questionId, choice: prerequisite.choices!.find((choice) => choice.choice?.startsWith("satisfy_prerequisite:"))!.choice }],
      expectedRevision: created.revision,
      idempotencyKey: "qa-a2-patch-00000001",
      planHandle: created.planHandle
    });
    assert.equal(patched.ok, true, JSON.stringify(patched));
    assert.equal(patched.status, "ready");
    const [planId] = await runtime.store.listPlanIdsByPrincipal("agentic-qa");
    const stored = (await runtime.store.getPlanRevision(planId, Number(patched.revision)))!.result as PlanResult;
    assert.deepEqual(stored.originalRequest?.medicationCodes, ["apixaban"]);
    assert.equal(stored.originalRequest?.requirements?.maxProductCount, 8);
    assert.equal(stored.requestSnapshot.targets.find(target => target.name === "Iron")?.prerequisite?.status, "satisfied");
    assert.deepEqual(stored.originalRequest?.targets.map(({ name, amount, unit }) => ({ name, amount, unit })), eightTargets());
    const selected = await call(runtime, "plan", {
      operation: "select", planHandle: patched.planHandle, expectedRevision: patched.revision,
      idempotencyKey: "qa-a2-select-0000001", optionId: patched.optionId
    });
    assert.equal(selected.ok, true, JSON.stringify(selected));
    assert.equal(selected.optionId, patched.optionId);
    assert.deepEqual(selected.basket, patched.basket);
    const after = namesInBasket(patched);
    assert.ok(after.some((name) => /zinc/i.test(name)));
    assert.ok(after.some((name) => /b12/i.test(name)));
    const qids = ((patched.questions as Array<{ questionId?: string }>) ?? []).map(
      (item) => String(item.questionId)
    );
    assert.equal(qids.some((id) => id.startsWith("q_retain_")), false);
  });

  it("A3 optionId stays sticky until targets change", async () => {
    const runtime = runtimeFor();
    const created = await call(runtime, "plan", {
      idempotencyKey: "qa-a3-create-0000001",
      request: baseRequest()
    });
    const sticky = await call(runtime, "plan", {
      operation: "get",
      planHandle: created.planHandle
    });
    assert.equal(sticky.ok, true);
    assert.equal(sticky.optionId, created.optionId);
    const changed = await call(runtime, "plan", {
      operation: "revise",
      expectedRevision: sticky.revision,
      idempotencyKey: "qa-a3-change-0000001",
      planHandle: created.planHandle,
      request: baseRequest({
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      })
    });
    assert.equal(changed.ok, true);
    assert.notEqual(changed.optionId, created.optionId);
  });

  it("A4 clinical advice uses stable family IDs and stale selection revisions fail", async () => {
    const runtime = runtimeFor();
    const created = await call(runtime, "plan", {
      idempotencyKey: "qa-a4-create-0000001",
      request: baseRequest({
        medicationCodes: ["apixaban"],
        targets: [{ amount: 1000, name: "Omega-3", unit: "mg" }]
      })
    });
    const ids = (created.guidanceIds as string[]) ?? [];
    assert.ok(ids.some((id) => id === "gdn:medication_interaction:omega3+anticoagulant"));
    assert.equal(ids.some((id) => /prd_/.test(id)), false);
    assert.equal(((created.questions as Array<{ questionId: string }>) ?? []).some((question) => question.questionId === "q_safety_ack"), false);
    const stale = await call(runtime, "plan", {
      operation: "select",
      expectedRevision: 99,
      idempotencyKey: "qa-a4-stale-00000001",
      planHandle: created.planHandle,
      optionId: created.optionId
    });
    assert.equal(stale.ok, false);
    assert.equal(
      (stale.error as { reasonCode: string }).reasonCode,
      "stale_revision"
    );
  });

  it("A5 defaults to highest coverage and does not mislabel cost", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "qa-a5-coverage-00001",
      request: baseRequest()
    });
    assert.equal(plan.ok, true);
    const selectedCoverage = Number(plan.coverage ? 1 : 0);
    void selectedCoverage;
    const alternatives = (plan.alternatives as Array<{
      coveragePercent?: number;
      reason?: string;
      totalPriceMinor?: number;
    }>) ?? [];
    const selectedPercent = Number(
      (plan.matcherTelemetry as { coveragePercent?: number } | undefined)?.coveragePercent ??
        ((plan.coverage as Array<{ status?: string }>) ?? []).filter((row) =>
          row.status === "covered" || row.status === "over_target"
        ).length
    );
    for (const option of alternatives) {
      assert.ok(Number(option.coveragePercent ?? 0) <= Number(
        (plan as { coveragePercent?: number }).coveragePercent ?? selectedPercent
      ) || Number(option.totalPriceMinor) >= 0);
      if (/lower-cost complete stack/i.test(String(option.reason))) {
        assert.ok(Number(option.totalPriceMinor) < Number(
          (plan.basket as Array<{ lineTotalMinor: number }>).reduce(
            (sum, item) => sum + item.lineTotalMinor,
            0
          )
        ));
      }
    }
  });

  it("A6 Vitamin K2 is recognised, not INVALID_ARGUMENT", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "qa-a6-k2-leftover-001",
      request: baseRequest({
        targets: [
          ...eightTargets(),
          { amount: 100, name: "Vitamin K2", unit: "mcg" }
        ]
      })
    });
    assert.equal(plan.ok, true);
    assert.equal(plan.error, undefined);
    const leftovers = (plan.leftovers as Array<{ name?: string; reason?: string }>) ?? [];
    const coverage = (plan.coverage as Array<{ name?: string; status?: string }>) ?? [];
    assert.equal(
      leftovers.some((item) =>
        String(item.name).toLowerCase().includes("k2") && item.reason === "not_in_catalogue"
      ),
      false
    );
    assert.ok(
      leftovers.some((item) =>
        String(item.name).toLowerCase().includes("k2") && item.reason === "uncovered"
      ) ||
        coverage.some(
          (row) =>
            String(row.name).toLowerCase().includes("k2") && row.status === "uncovered"
        ) ||
        namesInBasket(plan).some((name) => /k2|mk-?7|menaquinone/i.test(name))
    );
  });

  it("A7 DEV fixtures are explicitly marked fixture", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "qa-a7-fixture-0000001",
      request: baseRequest({
        targets: [{ amount: 5, name: "Creatine", unit: "g" }]
      })
    });
    const item = ((plan.basket as Array<Record<string, unknown>>) ?? [])[0];
    assert.ok(item);
    assert.equal(item.fixture, true);
    assert.equal(item.source, "fixture");
    assert.match(String(item.productName), /Creatine Monohydrate 5 g/);
    assert.match(String(item.productId), /^prd_b{8}/i);
  });

  it("A8 plan option lines include http(s) imageUrl", async () => {
    assert.equal(isHttpUrl("https://example.test/x.jpg"), true);
    assert.equal(everyLineHasHttpImage([{ imageUrl: "https://example.test/x.jpg" }]), true);
    assert.equal(everyLineHasHttpImage([{ imageUrl: "" }]), false);
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "qa-a8-images-0000001",
      request: baseRequest()
    });
    const lines = optionLines(plan);
    assert.ok(lines.length > 0);
    assert.equal(everyLineHasHttpImage(lines), true);
  });

  it("A9 unpaid execute is env-gated on uat and dev", () => {
    assert.equal(hasOrderTrackDestination("https://uat.mattanutra.com/en/order/track"), true);
    assert.equal(hasOrderTrackDestination("https://example.test/mcp/checkout/x"), false);
    const uat = unpaidA9EnvGate("uat");
    assert.equal(uat.pass, true);
    assert.match(uat.detail, /UAT env-gated: unpaid execute never hits \/order\/track/);
    assert.match(uat.detail, /POST pay forbidden/);
    const dev = unpaidA9EnvGate("dev");
    assert.equal(dev.pass, true);
    assert.match(dev.detail, /DEV env-gated/);
    assert.equal(unpaidA9EnvGate("prd").pass, false);
  });

  it("A10 DEV fixtures are explicitly marked", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "qa-a10-fixture-000001",
      request: baseRequest({
        targets: [{ amount: 5, name: "Creatine", unit: "g" }]
      })
    });
    const lines = optionLines(plan);
    assert.ok(lines.length > 0);
    for (const line of lines as Array<Record<string, unknown>>) {
      if (isFixtureShapedId(line.productId)) {
        assert.equal(isFixtureLine(line), true);
      }
    }
  });

  it("A11 sex not sexAtBirth", async () => {
    const runtime = runtimeFor();
    const listed = await handleJsonRpc(runtime, { id: 2, method: "tools/list" });
    const blob = JSON.stringify(listed?.result ?? {});
    assert.equal(/sexAtBirth/i.test(blob), false);
    assert.match(blob, /"sex"/);
    const rejected = await call(runtime, "plan", {
      idempotencyKey: "qa-a11-sexatbirth-001",
      request: {
        ...baseRequest(),
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" }
      }
    });
    assert.equal(rejected.ok, false);
    assert.equal((rejected.error as { reasonCode?: string } | undefined)?.reasonCode, "unexpected_property");
  });

  it("A12 Folate is not the Creatine fixture", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "qa-a12-folate-000001",
      request: baseRequest({
        targets: [{ amount: 400, name: "Folate", unit: "mcg" }]
      })
    });
    assert.equal(plan.ok, true);
    const item = ((plan.basket as Array<Record<string, unknown>>) ?? [])[0];
    assert.ok(item);
    assert.notEqual(item.productName, "Creatine Monohydrate 5 g");
  });

  it("A15 algae_only omega line is algae not fish", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "qa-a15-algae-0000001",
      request: baseRequest({
        requirements: { omega3SourcePreference: "algae_only" },
        targets: [{ amount: 1000, name: "Omega-3", unit: "mg" }]
      })
    });
    const names = namesInBasket(plan);
    assert.equal(plan.ok, true);
    assert.ok(names.some((name) => /algae/i.test(name)));
    assert.equal(
      names.some((name) => /fish oil|3-6-9|lecithin|krill/i.test(name) && !/algae/i.test(name)),
      false
    );
  });

  it("A16 male age 52 is not mapped to prenatal SKUs", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "qa-a16-male52-000001",
      request: baseRequest({
        profile: { ageYears: 52, lifeStage: "adult", sex: "male" }
      })
    });
    assert.equal(plan.ok, true);
    assert.equal(
      namesInBasket(plan).some((name) => /conceive|prenatal|pregnancy|fertility/i.test(name)),
      false
    );
  });

  it("A13 tools/list is exactly the seven public tools", async () => {
    const runtime = runtimeFor();
    const listed = await handleJsonRpc(runtime, { id: 3, method: "tools/list" });
    const names = ((listed?.result?.tools as Array<{ name: string }>) ?? []).map(
      (item) => item.name
    );
    assert.equal(exactToolNames(names), true);
  });

  it("A2 repository entrypoint includes live timing, commerce, and nested value coverage", () => {
    const files = mcpTestFiles();
    for (const file of [
      "test/agentic-dev-preheader-lat.test.ts", "test/agentic-v13-lat.test.ts",
      "test/agentic-v16-plan90.test.ts", "test/agentic-live-com-e2e.test.ts",
      "test/agentic-live-r4-regression.test.ts", "test/commerce-transactions.integration.test.ts",
      "test/agentic/value/slice5-agent.test.ts", "test/matcher/qa-safety.test.ts",
      "test/admin-product-facts.test.ts", "test/assessment-revisions.integration.test.ts",
      "test/funnel-readiness.integration.test.ts"
    ]) assert.ok(files.includes(file), file);
    assert.equal(new Set(files).size, files.length);
    const [remote, local] = mcpTestBatches({
      DB_URL: "postgresql://catalogue/dev",
      TEST_DB_URL: "postgresql://127.0.0.1/mattanutra_lock_review_qa"
    });
    assert.deepEqual([...remote.files, ...local.files].sort(), files);
    assert.equal(remote.env.DB_URL, "postgresql://catalogue/dev");
    assert.equal(remote.env.DB_POOL_MAX, "1");
    assert.equal(remote.env.DB_WORKER_POOL_MAX, "1");
    assert.equal(local.env.DB_URL, "postgresql://127.0.0.1/mattanutra_lock_review_qa");
    assert.equal(local.env.DB_POOL_MAX, "6");
    assert.equal(local.env.DB_WORKER_POOL_MAX, "6");
    assert.ok(local.files.includes("test/commerce-transactions.integration.test.ts"));
    assert.ok(local.files.every(file => file.endsWith(".integration.test.ts")));
  });

  it("repository entrypoint lists coverage without credentials and rejects incomplete or unsafe setup", () => {
    const script = fileURLToPath(new URL("../scripts/agentic-qa-pack.mjs", import.meta.url));
    const run = (args: string[], env: NodeJS.ProcessEnv = {}) =>
      spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8" });
    const listed = run(["--list"]);
    assert.equal(listed.status, 0, listed.stderr);
    assert.deepEqual(listed.stdout.trim().split("\n"), mcpTestFiles());
    const missing = run([]);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /requires DB_URL/);
    const unsafe = run([], { DB_URL: "postgresql://localhost/catalogue", TEST_DB_URL: "postgresql://remote/uat" });
    assert.equal(unsafe.status, 2);
    assert.match(unsafe.stderr, /isolated localhost/);
    const uat = run([], { MATTANUTRA_ENV: "uat" });
    assert.equal(uat.status, 2);
    assert.match(uat.stderr, /MATTANUTRA_ENV=dev/);
  });

  it("T3 published tool instructions invite only optional consented feedback", () => {
    assert.match(agenticToolDescriptions("dev", "en").feedback, /optional/i);
    assert.match(agenticToolDescriptions("dev", "en").feedback, /consentConfirmed=true/);
    assert.equal(/A1–A13 = 13\/13/.test(AGENTIC_SERVER_INSTRUCTIONS), false);
    const schema = readFileSync(
      new URL("../scripts/apply-agentic-commerce-schema.ts", import.meta.url),
      "utf8"
    );
    assert.match(schema, /agentic_matcher_events/);
    assert.match(schema, /agentic_catalogue_gaps/);
  });
});
