#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MCP_URL = process.env.MCP_URL ?? "https://dev.mattanutra.com/api/mcp";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let rpcId = 1;
const results = [];

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

function baseRequest(overrides = {}) {
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

function structured(response) {
  return response?.result?.structuredContent ?? response?.result ?? {};
}

async function rpc(method, params) {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: rpcId,
      jsonrpc: "2.0",
      method,
      params
    })
  });
  rpcId += 1;
  const text = await response.text();
  let body;

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON MCP response (${response.status}): ${text.slice(0, 240)}`);
  }

  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}: ${text.slice(0, 240)}`);
  }

  return body;
}

async function call(name, args) {
  const body = await rpc("tools/call", { arguments: args, name });
  return structured(body);
}

function record(id, pass, detail) {
  results.push({ detail, id, pass: Boolean(pass) });
}

function namesInBasket(plan) {
  return (plan.basket ?? []).map((item) => String(item.productName ?? ""));
}

async function main() {
  const listed = await rpc("tools/list", {});
  const listedNames = (listed?.result?.tools ?? []).map((tool) => tool.name);
  if (listedNames.join(",") !== "info,plan,execute,order,support,feedback") {
    record("tools/list", false, `tools/list was ${listedNames.join(",")}`);
  }

  const initialized = await rpc("initialize", { protocolVersion: "2025-03-26" });
  const instructions = String(initialized?.result?.instructions ?? "");

  const info = await call("info", { locale: "en" });
  const names = info.recognisedNames ?? [];
  record(
    "A1",
    names.includes("Algae omega-3") &&
      names.includes("Folate") &&
      (info.medicationCodes ?? []).includes("apixaban") &&
      (info.conditionCodes ?? []).includes("ckd") &&
      (await call("plan", {
        idempotencyKey: `qa-a1-${Date.now()}-algae`,
        request: baseRequest({
          targets: [
            { amount: 1000, name: "Algae omega-3", unit: "mg" },
            { amount: 100, name: "Vitamin K2", unit: "mcg" }
          ]
        })
      }).then((plan) => {
        const leftovers = plan.leftovers ?? [];
        return (
          plan.ok === true &&
          plan.error?.reasonCode !== "unknown_supplement" &&
          leftovers.some(
            (item) =>
              String(item.name).toLowerCase().includes("k2") &&
              item.reason === "not_in_catalogue"
          )
        );
      })),
    "info names/codes and Algae omega-3 / Vitamin K2 leftovers"
  );

  const created = await call("plan", {
    idempotencyKey: `qa-a2-${Date.now()}-create`,
    request: baseRequest({ medicationCodes: ["apixaban"] })
  });
  const questions = created.questions ?? [];
  const answers = questions.flatMap((question) => {
    const choice = question.choices?.[0]?.choice;
    if (
      (question.questionId === "q_safety_ack" ||
        String(question.questionId).startsWith("q_gap_")) &&
      choice
    ) {
      return [{ choice, questionId: question.questionId }];
    }
    return [];
  });
  const patched = await call("plan", {
    answers,
    expectedRevision: created.revision,
    idempotencyKey: `qa-a2-${Date.now()}-patch`,
    planHandle: created.planHandle,
    ...(created.guidanceIds
      ? {
          safetyAcknowledgement: {
            confirmed: true,
            guidanceIds: created.guidanceIds,
            revision: created.revision
          }
        }
      : {})
  });
  const patchedNames = namesInBasket(patched);
  const retainAsked = (patched.questions ?? []).some((item) =>
    String(item.questionId).startsWith("q_retain_")
  );
  record(
    "A2",
    created.ok === true &&
      (created.basket ?? []).length === 8 &&
      namesInBasket(created).some((name) => /zinc/i.test(name)) &&
      namesInBasket(created).some((name) => /b12/i.test(name)) &&
      patched.ok === true &&
      patched.optionId === created.optionId &&
      (patched.basket ?? []).length === 8 &&
      patchedNames.some((name) => /zinc/i.test(name)) &&
      patchedNames.some((name) => /b12/i.test(name)) &&
      retainAsked === false,
    "answers patch keeps 8-product option with zinc/B12"
  );

  const sticky = await call("plan", {
    expectedRevision: patched.revision,
    idempotencyKey: `qa-a3-${Date.now()}-sticky`,
    planHandle: created.planHandle
  });
  const changed = await call("plan", {
    expectedRevision: sticky.revision,
    idempotencyKey: `qa-a3-${Date.now()}-change`,
    planHandle: created.planHandle,
    request: baseRequest({
      targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
    })
  });
  record(
    "A3",
    sticky.ok === true &&
      sticky.optionId === created.optionId &&
      changed.ok === true &&
      changed.optionId !== created.optionId,
    "optionId sticky until targets change"
  );

  const safety = await call("plan", {
    idempotencyKey: `qa-a4-${Date.now()}-create`,
    request: baseRequest({
      medicationCodes: ["apixaban"],
      targets: [{ amount: 1000, name: "Omega-3", unit: "mg" }]
    })
  });
  const guidanceIds = safety.guidanceIds ?? [];
  const stale = await call("plan", {
    expectedRevision: safety.revision,
    idempotencyKey: `qa-a4-${Date.now()}-stale`,
    planHandle: safety.planHandle,
    safetyAcknowledgement: {
      confirmed: true,
      guidanceIds,
      revision: 99
    }
  });
  record(
    "A4",
    guidanceIds.includes("gdn:medication_interaction:omega3+anticoagulant") &&
      guidanceIds.every((id) => !/prd_/.test(id)) &&
      stale.ok === false &&
      stale.error?.reasonCode === "stale_safety_acknowledgement",
    "family safety ack and wrong revision error"
  );

  const coverage = await call("plan", {
    idempotencyKey: `qa-a5-${Date.now()}-cov`,
    request: baseRequest()
  });
  const selectedTotal = (coverage.basket ?? []).reduce(
    (sum, item) => sum + Number(item.lineTotalMinor ?? 0),
    0
  );
  const selectedCoverage = Number(coverage.matcherTelemetry?.coveragePercent ?? 0);
  const mislabeled = (coverage.alternatives ?? []).some((option) => {
    const reason = String(option.reason ?? "");
    if (!/lower-cost complete stack/i.test(reason)) {
      return false;
    }
    const cheaper = Number(option.totalPriceMinor) < selectedTotal;
    const complete = Number(option.coveragePercent) >= 90;
    return !cheaper || !complete;
  });
  const weakerSelected = (coverage.alternatives ?? []).some(
    (option) => Number(option.coveragePercent) > selectedCoverage
  );
  record(
    "A5",
    coverage.ok === true && mislabeled === false && weakerSelected === false,
    "highest-coverage default; no false lower-cost complete label"
  );

  const leftoverPlan = await call("plan", {
    idempotencyKey: `qa-a6-${Date.now()}-k2`,
    request: baseRequest({
      targets: [...eightTargets(), { amount: 100, name: "Vitamin K2", unit: "mcg" }]
    })
  });
  record(
    "A6",
    leftoverPlan.ok === true &&
      leftoverPlan.error == null &&
      (leftoverPlan.leftovers ?? []).some(
        (item) =>
          String(item.name).toLowerCase().includes("k2") &&
          item.reason === "not_in_catalogue"
      ) &&
      (leftoverPlan.basket ?? []).length === 8,
    "unrecognised names become leftover list"
  );

  const creatine = await call("plan", {
    idempotencyKey: `qa-a7-${Date.now()}-cre`,
    request: baseRequest({
      targets: [{ amount: 5, name: "Creatine", unit: "g" }]
    })
  });
  const creatineItem = (creatine.basket ?? [])[0] ?? {};
  record(
    "A7",
    creatineItem.fixture === true &&
      creatineItem.source === "fixture" &&
      /Creatine Monohydrate 5 g/.test(String(creatineItem.productName)) &&
      /^prd_b{8}/i.test(String(creatineItem.productId)),
    "fixture products marked fixture"
  );

  record(
    "T1",
    Array.isArray(leftoverPlan.leftovers) &&
      leftoverPlan.leftovers.length > 0 &&
      leftoverPlan.matcherTelemetry &&
      Array.isArray(leftoverPlan.matcherTelemetry.requestedNames) &&
      leftoverPlan.matcherTelemetry.requestedNames.some((name) =>
        String(name).toLowerCase().includes("k2")
      ),
    "plan writes matcher leftovers/telemetry"
  );

  let schemaText = "";
  try {
    schemaText = readFileSync(path.join(ROOT, "scripts/apply-agentic-commerce-schema.ts"), "utf8");
  } catch {
    schemaText = "";
  }
  record(
    "T2",
    /agentic_matcher_events/.test(schemaText) && /agentic_catalogue_gaps/.test(schemaText),
    "catalogue-gap view/query is in the usual DB schema"
  );

  record(
    "T3",
    /HARD RULE 6 — HOST FEEDBACK/.test(instructions) &&
      /after 3 plan calls/.test(instructions) &&
      /plan_feedback/.test(instructions),
    "initialize.instructions require feedback after execute or N plan calls"
  );

  const scored = results.filter((item) => ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "T1", "T2", "T3"].includes(item.id));
  const passed = scored.filter((item) => item.pass).length;
  console.log(`Official MattaNutra Agentic QA Pack, ${passed}/10`);
  for (const item of scored) {
    console.log(`${item.id} ${item.pass ? "PASS" : "FAIL"} ${item.detail}`);
  }
  if (listedNames.join(",") !== "info,plan,execute,order,support,feedback") {
    console.log(`tools/list FAIL expected six bare names, got ${listedNames.join(",")}`);
  } else {
    console.log("tools/list PASS info,plan,execute,order,support,feedback");
  }
  process.exitCode = passed === 10 ? 0 : 1;
}

main().catch((error) => {
  console.log("Official MattaNutra Agentic QA Pack, 0/10");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
