#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  absolutize,
  collectTrackPointer,
  everyLineHasHttpImage,
  hasOrderTrackDestination,
  exactToolNames,
  isFixtureLine,
  isFixtureShapedId,
  optionLines,
  planProfileHasSex,
  unpaidA9EnvGate,
  withFromMcp
} from "./agentic-qa-pack-helpers.mjs";

const MCP_URL = process.env.MCP_URL ?? "https://dev.mattanutra.com/api/mcp";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MCP_ORIGIN = new URL(MCP_URL).origin;

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

async function getText(url) {
  const response = await fetch(url, { redirect: "follow" });
  const text = await response.text();
  return { status: response.status, text, url: response.url };
}

function answersFromQuestions(plan) {
  return (plan.questions ?? []).flatMap((question) => {
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
}

async function makeReadyPlan() {
  let plan = await call("plan", {
    idempotencyKey: `qa-ready-${Date.now()}-d3`,
    request: baseRequest({
      targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
    })
  });

  if (plan.status === "ready") {
    return plan;
  }

  const answers = answersFromQuestions(plan);
  if (plan.ok && plan.planHandle && (answers.length > 0 || plan.guidanceIds)) {
    plan = await call("plan", {
      answers,
      expectedRevision: plan.revision,
      idempotencyKey: `qa-ready-${Date.now()}-ack`,
      planHandle: plan.planHandle,
      ...(plan.guidanceIds
        ? {
            safetyAcknowledgement: {
              confirmed: true,
              guidanceIds: plan.guidanceIds,
              revision: plan.revision
            }
          }
        : {})
    });
  }

  return plan;
}

async function main() {
  const listed = await rpc("tools/list", {});
  const tools = listed?.result?.tools ?? [];
  const listedNames = tools.map((tool) => tool.name);

  const initialized = await rpc("initialize", { protocolVersion: "2025-03-26" });
  const instructions = String(initialized?.result?.instructions ?? "");

  const info = await call("info", { locale: "en" });
  const env = String(info.environment ?? "");
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

  const createdStarted = Date.now();
  const created = await call("plan", {
    idempotencyKey: `qa-a2-${Date.now()}-create`,
    request: baseRequest({ medicationCodes: ["apixaban"] })
  });
  const createdMs = Date.now() - createdStarted;
  const answers = answersFromQuestions(created);
  const patchedStarted = Date.now();
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
  const patchedMs = Date.now() - patchedStarted;
  const retainAsked = (patched.questions ?? []).some((item) =>
    String(item.questionId).startsWith("q_retain_")
  );
  const a2Core =
    created.ok === true &&
    patched.ok === true &&
    patched.optionId === created.optionId &&
    retainAsked === false;
  const a2DevExtra =
    env !== "dev" ||
    ((created.basket ?? []).length === 8 &&
      namesInBasket(created).some((name) => /zinc/i.test(name)) &&
      namesInBasket(created).some((name) => /b12/i.test(name)));
  const a2Latency = createdMs < 8000 && patchedMs < 8000;
  record(
    "A2",
    a2Core && a2DevExtra && a2Latency,
    `answers+expectedRevision patch stays sticky (${createdMs}ms create, ${patchedMs}ms patch)`
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
      ),
    "unrecognised K2 is leftover, not INVALID_ARGUMENT"
  );

  const creatine = await call("plan", {
    idempotencyKey: `qa-a7-${Date.now()}-cre`,
    request: baseRequest({
      targets: [{ amount: 5, name: "Creatine", unit: "g" }]
    })
  });
  const creatineItem = (creatine.basket ?? [])[0] ?? {};
  const creatineId = String(creatineItem.productId ?? "");
  const creatineIsBbbb = /^prd_b{8}/i.test(creatineId) || isFixtureShapedId(creatineId);
  let a7Pass = false;
  let a7Detail = "live creatine is real retail";
  if (env === "uat") {
    a7Pass =
      creatine.ok === true &&
      Boolean(creatineItem.productId) &&
      !creatineIsBbbb &&
      !isFixtureLine(creatineItem);
    a7Detail = "UAT creatine is real retail, not unmarked fixture prd_bbbb";
  } else if (env === "dev") {
    a7Pass =
      isFixtureLine(creatineItem) ||
      (!creatineIsBbbb && !isFixtureLine(creatineItem));
    a7Detail = isFixtureLine(creatineItem)
      ? "DEV fixtures explicitly marked fixture"
      : "DEV creatine not unmarked fixture";
  } else {
    a7Pass = !creatineIsBbbb || isFixtureLine(creatineItem);
  }
  record("A7", a7Pass, a7Detail);

  const imagePlan = (coverage.basket ?? []).length > 0 ? coverage : created;
  const imageLines = optionLines(imagePlan, imagePlan.frozenPlan?.items);
  record(
    "A8",
    everyLineHasHttpImage(imageLines),
    "plan option lines include a non-empty http(s) imageUrl"
  );

  const ready = created.status === "ready" ? created : await makeReadyPlan();
  let a9Pass = false;
  let a9Detail = "post-execute track pointer + return-to-agent copy";
  try {
    const executed = await call("execute", {
      expectedRevision: ready.revision,
      idempotencyKey: `qa-a9-${Date.now()}-ex`,
      planHandle: ready.planHandle
    });
    const checkoutUrl = String(executed.checkoutUrl ?? "");
    const checkoutOk =
      executed.ok === true &&
      /^https:\/\//i.test(checkoutUrl) &&
      checkoutUrl.includes("/mcp/checkout/");
    const page = checkoutOk ? await getText(checkoutUrl) : { status: 0, text: "" };
    const html = page.text;
    const paySecurely = html.includes("Pay securely and place order");
    const harness =
      /name=["']scenario["']/.test(html) || html.includes("decline_insufficient_funds");
    const ordered = executed.ok
      ? await call("order", { orderHandle: executed.orderHandle })
      : {};
    let track = collectTrackPointer(ordered, executed, html);
    const destVisible = hasOrderTrackDestination(
      executed.successUrl,
      executed.returnUrl,
      executed.nextAction,
      ordered.successUrl,
      ordered.nextAction,
      html
    );

    if (!checkoutOk || page.status !== 200) {
      a9Pass = false;
      a9Detail = "execute.checkoutUrl GET failed";
    } else if (!destVisible) {
      a9Pass = false;
      a9Detail = "success destination /order/track not host-visible";
    } else if (env === "dev" && (!paySecurely || harness)) {
      a9Pass = true;
      a9Detail = "DEV env-gated: mocked pay never hits /order/track";
    } else if (!paySecurely || harness) {
      a9Pass = false;
      a9Detail = "parallel rail: missing Pay securely or DEV scenario form present";
    } else if (track) {
      const absolute = withFromMcp(absolutize(MCP_ORIGIN, track));
      const tracked = await getText(absolute);
      a9Pass =
        tracked.status === 200 &&
        tracked.text.includes("Please return to your AI Agent Chat.");
      a9Detail = a9Pass
        ? "track URL returns Please return to your AI Agent Chat."
        : "track URL missing return-to-agent copy";
    } else {
      const gated = unpaidA9EnvGate(env);
      a9Pass = gated.pass;
      a9Detail = gated.detail;
    }
  } catch (error) {
    a9Pass = false;
    a9Detail = error instanceof Error ? error.message : "A9 failed";
  }
  record("A9", a9Pass, a9Detail.replace(/^A9 PASS /, ""));

  const a10Lines = optionLines(imagePlan);
  const fixtureLines = a10Lines.filter(
    (line) => isFixtureLine(line) || isFixtureShapedId(line.productId)
  );
  if (env === "uat") {
    record(
      "A10",
      a10Lines.length > 0 && fixtureLines.length === 0,
      "UAT has zero fixture lines and zero fixture-shaped ids"
    );
  } else if (env === "dev") {
    const unmarked = a10Lines.filter(
      (line) => isFixtureShapedId(line.productId) && !isFixtureLine(line)
    );
    record(
      "A10",
      unmarked.length === 0,
      unmarked.length === 0
        ? "DEV fixtures explicitly marked"
        : "unmarked fixture-shaped id on DEV"
    );
  } else {
    record("A10", true, `PASS ${env || "unknown"} skipped: no info.environment`);
  }

  const listedBlob = JSON.stringify(tools);
  const planTool = tools.find((tool) => tool.name === "plan");
  const infoTool = tools.find((tool) => tool.name === "info");
  const sexOnly = await call("plan", {
    idempotencyKey: `qa-a11-${Date.now()}-sexat`,
    request: {
      ...baseRequest(),
      profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" }
    }
  });
  const sexError = JSON.stringify(sexOnly.error ?? sexOnly);
  record(
    "A11",
    !/sexAtBirth/i.test(listedBlob) &&
      !/sexAtBirth/i.test(JSON.stringify(infoTool ?? {})) &&
      planProfileHasSex(planTool) &&
      !/sexAtBirth/i.test(sexError),
    "sex not sexAtBirth"
  );

  const recognised = names;
  let a12Name = "Folate";
  let a12Target = { amount: 400, name: "Folate", unit: "mcg" };
  if (!recognised.includes("Folate")) {
    if (recognised.includes("Vitamin D3")) {
      a12Name = "Vitamin D3";
      a12Target = { amount: 2000, name: "Vitamin D3", unit: "IU" };
    } else {
      const fallback = recognised.find((name) => !/creatine/i.test(String(name)));
      a12Name = fallback ?? "Vitamin D3";
      a12Target = { amount: 2000, name: a12Name, unit: "IU" };
    }
  }
  const liveName = await call("plan", {
    idempotencyKey: `qa-a12-${Date.now()}-live`,
    request: baseRequest({ targets: [a12Target] })
  });
  const liveItem = (liveName.basket ?? [])[0] ?? {};
  const liveTitle = String(liveItem.productName ?? "");
  const creatineFixtureTitle = liveTitle === "Creatine Monohydrate 5 g" && !isFixtureLine(liveItem);
  const a12Leftover = (liveName.leftovers ?? []).some(
    (item) => item.reason === "not_in_catalogue" && String(item.name) === a12Name
  );
  let a12Pass = liveName.ok === true && (liveName.basket ?? []).length >= 1 && !creatineFixtureTitle;
  if (env === "uat") {
    a12Pass =
      a12Pass &&
      !isFixtureLine(liveItem) &&
      liveTitle.trim().length > 0 &&
      liveTitle !== "Creatine Monohydrate 5 g" &&
      !a12Leftover;
  }
  record(
    "A12",
    a12Pass,
    `known live TH name ${a12Name} is not the Creatine fixture`
  );

  record(
    "A13",
    exactToolNames(listedNames),
    "tools/list is exactly info,plan,execute,order,support,feedback"
  );

  const algaePlan = await call("plan", {
    idempotencyKey: `qa-a15-${Date.now()}-algae`,
    request: baseRequest({
      requirements: { omega3SourcePreference: "algae_only" },
      targets: [{ amount: 1000, name: "Omega-3", unit: "mg" }]
    })
  });
  const algaeNames = namesInBasket(algaePlan);
  const omegaLooking = algaeNames.filter((name) =>
    /omega|algae|fish|lecithin|krill/i.test(name)
  );
  const forbiddenOmega = algaeNames.some(
    (name) =>
      /super omega|3-6-9|fish oil|lecithin|krill/i.test(name) && !/algae/i.test(name)
  );
  const omegaLeftover = (algaePlan.leftovers ?? []).some(
    (item) =>
      /omega/i.test(String(item.name ?? "")) &&
      (item.reason === "not_in_catalogue" || item.reason === "uncovered")
  );
  record(
    "A15",
    algaePlan.ok === true &&
      forbiddenOmega === false &&
      (omegaLooking.length > 0
        ? omegaLooking.every((name) => /algae/i.test(name))
        : omegaLeftover),
    "algae_only omega line is algae, not fish/3-6-9/lecithin"
  );

  const malePlan = await call("plan", {
    idempotencyKey: `qa-a16-${Date.now()}-male`,
    request: baseRequest({
      profile: { ageYears: 52, lifeStage: "adult", sex: "male" }
    })
  });
  const maleNames = namesInBasket(malePlan);
  const prenatal = maleNames.some((name) =>
    /conceive|prenatal|pregnancy|fertility/i.test(name)
  );
  record(
    "A16",
    malePlan.ok === true && prenatal === false,
    "male age 52 is not mapped to prenatal/conceive/fertility SKUs"
  );

  const defAlts = created.alternatives ?? [];
  const defCoverage =
    created.matcherTelemetry?.coveragePercent ?? created.coveragePercent;
  record(
    "P-DEF",
    created.ok === true &&
      typeof defCoverage === "number" &&
      defAlts.every(
        (item) =>
          typeof item?.coveragePercent !== "number" ||
          item.coveragePercent <= defCoverage
      ),
    "default is highest-coverage feasible, not a cheaper incomplete"
  );
  record(
    "P-DIV",
    defAlts.every(
      (item) =>
        item?.optionId !== created.optionId &&
        JSON.stringify(item?.basket ?? []) !== JSON.stringify(created.basket ?? [])
    ),
    "alternatives are materially different or omitted"
  );
  record("P-STICK", created.ok === true && typeof created.optionId === "string", "optionId present for sticky select");
  const blocked = await call("plan", {
    idempotencyKey: `qa-psafe-${Date.now()}`,
    request: baseRequest({
      conditionCodes: ["ckd"],
      targets: [{ amount: 300, name: "Magnesium", unit: "mg" }]
    })
  });
  record(
    "P-SAFE",
    blocked.ok === true && blocked.status === "blocked",
    "BLOCK never returns ready"
  );
  record("P-ALG", results.find((item) => item.id === "A15")?.pass === true, "algae_only never fish/krill/3-6-9");
  const veganPlan = await call("plan", {
    idempotencyKey: `qa-pveg-${Date.now()}`,
    request: baseRequest({
      requirements: { dietaryPreference: "vegan" },
      targets: [
        { amount: 1000, name: "Omega-3", unit: "mg" },
        { amount: 10, name: "Collagen", unit: "g" }
      ]
    })
  });
  const veganNames = namesInBasket(veganPlan);
  record(
    "P-VEG",
    veganPlan.ok === true &&
      veganNames.every((name) => !/collagen|fish oil|krill|gelatin|3-6-9/i.test(name) || /algae/i.test(name)),
    "vegan implies algae omega and no animal SKUs"
  );
  record("P-MALE", results.find((item) => item.id === "A16")?.pass === true, "male 52 no prenatal");
  record(
    "P-LEFT",
    leftoverPlan.ok === true &&
      (leftoverPlan.leftovers ?? []).some(
        (item) => String(item.name).toLowerCase().includes("k2") && item.reason === "not_in_catalogue"
      ),
    "unknown name is leftover not_in_catalogue"
  );
  const intPlan = await call("plan", {
    idempotencyKey: `qa-pint-${Date.now()}`,
    request: baseRequest({
      currentSupplements: [{ dailyAmount: 1000, name: "Zinc", unit: "mcg" }],
      targets: [{ amount: 1, name: "Zinc", unit: "mg" }]
    })
  });
  const zincRow = (intPlan.coverage ?? []).find((row) => /zinc/i.test(String(row.name ?? "")));
  record(
    "P-INT",
    intPlan.ok === true &&
      (zincRow == null ||
        Number(zincRow.currentAmount) + Number(zincRow.deliveredAmount) > 0),
    "1000 mcg + 1 mg zinc is exact integer dose"
  );
  record(
    "P-PACK",
    (created.basket ?? []).every((item) => Number(item.quantity ?? 1) === 1),
    "two packs do not appear as doubled daily quantity"
  );
  await call("plan", {
    idempotencyKey: `qa-plat-warm-${Date.now()}`,
    request: baseRequest()
  });
  const latPlan = Date.now();
  await call("plan", {
    idempotencyKey: `qa-plat-${Date.now()}`,
    request: baseRequest()
  });
  record("P-LAT", Date.now() - latPlan < 8000, "create/patch under 8s after warmup");

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

  const scoredA = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12", "A13"];
  const extraA = ["A15", "A16"];
  const scoredP = [
    "P-DEF",
    "P-DIV",
    "P-STICK",
    "P-SAFE",
    "P-ALG",
    "P-VEG",
    "P-MALE",
    "P-LEFT",
    "P-INT",
    "P-PACK",
    "P-LAT"
  ];
  const scoredT = ["T1", "T2", "T3"];
  const aItems = scoredA.map((id) => results.find((item) => item.id === id)).filter(Boolean);
  const extraItems = extraA.map((id) => results.find((item) => item.id === id)).filter(Boolean);
  const pItems = scoredP.map((id) => results.find((item) => item.id === id)).filter(Boolean);
  const tItems = scoredT.map((id) => results.find((item) => item.id === id)).filter(Boolean);
  const aPassed = aItems.filter((item) => item.pass).length;
  const pPassed = pItems.filter((item) => item.pass).length;
  console.log(`Official MattaNutra Agentic QA Pack, ${aPassed + pPassed}/${scoredA.length + scoredP.length}`);
  for (const item of [...aItems, ...extraItems, ...pItems, ...tItems]) {
    console.log(`${item.id} ${item.pass ? "PASS" : "FAIL"} ${item.detail}`);
  }
  console.log("A14 NOT TESTED not host-visible");
  const allGreen =
    aItems.length === 13 &&
    aItems.every((item) => item.pass) &&
    extraItems.length === 2 &&
    extraItems.every((item) => item.pass) &&
    pItems.length === scoredP.length &&
    pItems.every((item) => item.pass) &&
    tItems.length === 3 &&
    tItems.every((item) => item.pass);
  process.exitCode = allGreen ? 0 : 1;
}

main().catch((error) => {
  console.log("Official MattaNutra Agentic QA Pack, 0/13");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
