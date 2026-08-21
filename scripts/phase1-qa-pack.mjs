#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";

const MCP_URL = process.env.MCP_URL ?? "https://uat.mattanutra.com/api/mcp";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = new URL(MCP_URL).origin;
const results = [];
let rpcId = 1;

function record(id, pass, detail, score = pass ? 10 : 0) {
  results.push({ detail, id, pass: Boolean(pass), score });
}

function structured(response) {
  return response?.result?.structuredContent ?? response?.result ?? {};
}

async function rpc(method, params) {
  const response = await fetch(MCP_URL, {
    signal: AbortSignal.timeout(45_000),
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
    throw new Error(`Non-JSON MCP (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}`);
  }
  return body;
}

async function call(name, args) {
  return structured(await rpc("tools/call", { arguments: args, name }));
}

async function getText(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(45_000) });
  return {
    status: response.status,
    text: await response.text(),
    url: response.url
  };
}

async function getJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(90_000),
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { body, status: response.status, url: response.url };
}

function looksLikeId(value) {
  return /^(sup_|prd_)?[0-9a-f-]{8,}$/i.test(String(value).trim());
}

function zincRow(plan) {
  return (Array.isArray(plan.coverage) ? plan.coverage : []).find((row) =>
    /zinc/i.test(String(row.name ?? ""))
  );
}

function zincPlan(idempotencyKey, currentAmount) {
  return call("plan", {
    idempotencyKey,
    request: {
      ...(currentAmount
        ? { currentSupplements: [{ dailyAmount: currentAmount, name: "Zinc", unit: "mg" }] }
        : {}),
      destinationCountry: "TH",
      locale: "en",
      optimization: "balanced",
      profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
      requirements: {},
      targets: [{ amount: 25, name: "Zinc", unit: "mg" }]
    }
  });
}

async function t02Ceilings() {
  const modest = await zincPlan(`p1-t02-modest-${Date.now()}`, 0);
  const modestZinc = zincRow(modest);
  const ul = Number(modestZinc?.upperLimitAmount);
  const hasAdminUl = Number.isFinite(ul) && ul > 0;
  const overCurrent = hasAdminUl ? Math.ceil(ul) + 10 : 90;
  const over = await zincPlan(`p1-t02-over-${Date.now()}`, overCurrent);
  const overZinc = zincRow(over);
  const overUl = Number(overZinc?.upperLimitAmount);
  const overExposure = Number(overZinc?.totalExposureAmount ?? 0);
  const readyOverCeiling =
    over.status === "ready" && Number.isFinite(overUl) && overExposure > overUl;
  const pass =
    Boolean(modest.ok) &&
    hasAdminUl &&
    Number.isFinite(overUl) &&
    overUl > 0 &&
    !readyOverCeiling;
  record(
    "T02",
    pass,
    pass
      ? `zinc UL ${ul} mg; over current ${overCurrent} status ${over.status} exposure ${overExposure}`
      : `modestUl=${modestZinc?.upperLimitAmount} overStatus=${over.status} overUl=${overZinc?.upperLimitAmount} overExposure=${overZinc?.totalExposureAmount}`,
    pass ? 10 : hasAdminUl ? 8 : 5
  );
}

async function t03Pillars() {
  async function capture(answers) {
    return getJson(`${ORIGIN}/api/assessment`, {
      method: "POST",
      body: JSON.stringify({
        answers,
        intent: "capture",
        locale: "en"
      })
    });
  }

  const wellAnswers = {
    activity: "athlete",
    age: "36-45",
    country: "TH",
    diet: "whole",
    digestion: "none",
    energy: "excellent",
    firstName: "ArinyaQa",
    goals: ["sleep", "fitness"],
    sex: "female",
    sleepHrs: "7-8",
    smoking: "never",
    stress: "verylow"
  };
  const poorAnswers = {
    ...wellAnswers,
    activity: "sitting",
    energy: "drained",
    firstName: "ArinyaQa",
    sleepHrs: "u5",
    stress: "extreme"
  };
  const well = await capture(wellAnswers);
  const poor = await capture(poorAnswers);
  const wellId = well.body?.planId;
  const poorId = poor.body?.planId;
  const wellScore =
    well.body?.healthScore || wellId
      ? well.body?.healthScore
        ? well.body
        : (await getJson(`${ORIGIN}/api/assessment/${wellId}?view=healthscore&locale=en`)).body
      : {};
  const poorScore =
    poor.body?.healthScore || poorId
      ? poor.body?.healthScore
        ? poor.body
        : (await getJson(`${ORIGIN}/api/assessment/${poorId}?view=healthscore&locale=en`)).body
      : {};
  const wellSleep = wellScore.healthScore?.domains?.find((item) => item.id === "sleep")?.score;
  const poorSleep = poorScore.healthScore?.domains?.find((item) => item.id === "sleep")?.score;
  const wellActivity = wellScore.healthScore?.domains?.find((item) => item.id === "activity")?.score;
  const poorActivity = poorScore.healthScore?.domains?.find((item) => item.id === "activity")?.score;
  const gapText = JSON.stringify(wellScore.healthScore?.pageContent?.copySeeds?.gapTrio ?? []);
  const noFalseGap =
    Number(wellSleep) >= 70
      ? !/didn.t have time to recover|recovery is too short|การฟื้นตัวของคุณยังสั้น/i.test(gapText)
      : true;
  const moved =
    Number(wellSleep) > Number(poorSleep) && Number(wellActivity) > Number(poorActivity);
  const pass = well.status < 400 && poor.status < 400 && moved && noFalseGap;
  record(
    "T03",
    pass,
    `sleep ${wellSleep}->${poorSleep} activity ${wellActivity}->${poorActivity} falseGap=${!noFalseGap}`,
    pass ? 10 : moved ? 8 : 5
  );
  return wellId;
}

async function t04Prices() {
  let plan = await call("plan", {
    idempotencyKey: `p1-t04-${Date.now()}`,
    request: {
      destinationCountry: "TH",
      locale: "en",
      optimization: "balanced",
      profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
      requirements: {},
      targets: [
        { amount: 2000, name: "Vitamin D3", unit: "IU" },
        { amount: 1000, name: "Vitamin C", unit: "mg" }
      ]
    }
  });
  if (plan.status !== "ready" && plan.planHandle) {
    const answers = (plan.questions ?? []).flatMap((question) => {
      const choice = question.choices?.[0]?.choice;
      return choice ? [{ choice, questionId: question.questionId }] : [];
    });
    plan = await call("plan", {
      answers,
      expectedRevision: plan.revision,
      idempotencyKey: `p1-t04-ack-${Date.now()}`,
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
  if (plan.status !== "ready" || !plan.planHandle) {
    record("T04", false, `plan not ready ${plan.status ?? plan.error?.reasonCode}`, 4);
    return plan;
  }
  const executed = await call("execute", {
    expectedRevision: plan.revision,
    idempotencyKey: `p1-t04-ex-${Date.now()}`,
    planHandle: plan.planHandle
  });
  const checkoutUrl = executed.checkoutUrl;
  if (!checkoutUrl) {
    record("T04", false, `no checkoutUrl ${executed.error?.reasonCode ?? ""}`, 4);
    return executed;
  }
  const page = await getText(checkoutUrl);
  const money = [...page.text.matchAll(/฿\s*([\d,]+(?:\.\d+)?)/g)].map((item) =>
    Number(item[1].replace(/,/g, ""))
  );
  const hasUnit = page.text.includes("Qty") || page.text.includes("quantity") || /฿/.test(page.text);
  const noZeroSku = !/>\s*฿\s*0(\.00)?\s*</.test(page.text);
  const basket = Array.isArray(plan.basket) ? plan.basket : [];
  const lineSum = basket.reduce(
    (sum, item) => sum + Number(item.lineTotalMinor ?? item.unitPriceMinor ?? 0),
    0
  );
  const frozen =
    executed.frozenPlan && typeof executed.frozenPlan === "object"
      ? executed.frozenPlan
      : {};
  const subtotal = Number(frozen.subtotalMinor ?? lineSum);
  const shipping = Number(frozen.shippingMinor ?? 0);
  const tax = Number(frozen.taxMinor ?? 0);
  const grand = Number(frozen.totalPriceMinor ?? plan.totalPriceMinor ?? lineSum);
  const sums =
    basket.length > 0 &&
    Math.abs(lineSum - subtotal) < 1 &&
    Math.abs(lineSum + shipping + tax - grand) < 1;
  const priced = basket.every((item) => Number(item.unitPriceMinor ?? 0) > 0);
  const pass = page.status < 400 && priced && noZeroSku && sums;
  record(
    "T04",
    pass,
    `checkout ${page.status} lines=${basket.length} sum=${lineSum} subtotal=${subtotal} grand=${grand} priced=${priced}`,
    pass ? 10 : priced ? 8 : 6
  );
  return { checkoutUrl, plan };
}

async function t05Reveal(planId) {
  const name = "ArinyaQa";
  const captured = await getJson(`${ORIGIN}/api/assessment`, {
    method: "POST",
    body: JSON.stringify({
      answers: {
        activity: "moderate",
        age: "36-45",
        country: "TH",
        diet: "balanced",
        energy: "good",
        firstName: name,
        goals: ["energy"],
        sex: "female",
        sleepHrs: "7-8",
        stress: "moderate"
      },
      intent: "capture",
      locale: "en"
    })
  });
  const capturedBody = captured.body;
  const id = capturedBody.planId ?? planId;
  const score = id
    ? (await getJson(`${ORIGIN}/api/assessment/${id}?view=healthscore&locale=en`)).body
    : {};
  const healthHtml = await getText(`${ORIGIN}/en/nutrition/healthscore?plan=${id}`);
  const revealHtml = await getText(`${ORIGIN}/en/nutrition/reveal?plan=${id}`);
  const formulation = id
    ? await getJson(`${ORIGIN}/api/assessment/${id}/formulation?locale=en`)
    : { body: {}, status: 0 };
  const formulationBody = formulation.body ?? {};
  const jsonHasName = score.firstName === name || formulationBody.firstName === name;
  const htmlHasName =
    healthHtml.text.includes(name) ||
    (revealHtml.text.includes(`data-testid="reveal-hero-name"`) &&
      revealHtml.text.includes(name));
  const notFallbackBrand = !/\bPanya\b|\bDemo\b/.test(
    `${healthHtml.text} ${revealHtml.text}`
  );
  const pass = captured.status < 400 && htmlHasName && notFallbackBrand;
  record(
    "T05",
    pass,
    `jsonName=${score.firstName ?? formulationBody.firstName ?? "none"} html=${htmlHasName} reveal=${revealHtml.url}`,
    pass ? 10 : htmlHasName ? 8 : 5
  );
}

async function t06Brand() {
  const pages = await Promise.all([
    getText(`${ORIGIN}/en`),
    getText(`${ORIGIN}/th`),
    getText(`${ORIGIN}/en/nutrition/quiz`)
  ]);
  const initialized = await rpc("initialize", { protocolVersion: "2025-03-26" });
  const blob = `${pages.map((item) => item.text).join("\n")}\n${initialized?.result?.instructions ?? ""}`;
  const leftover = /\bPanya\b|\bPANYA\b/.test(blob);
  const hasNong = /Nong Mata/.test(blob) || pages.some((item) => item.status < 400);
  record(
    "T06",
    !leftover && hasNong,
    leftover ? "Panya still in public HTML/instructions" : "no Panya on public pages",
    leftover ? 6 : 10
  );
}

async function t07Names(checkoutUrl) {
  const enPlan = await call("plan", {
    idempotencyKey: `p1-t07-en-${Date.now()}`,
    request: {
      destinationCountry: "TH",
      locale: "en",
      optimization: "balanced",
      profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
      requirements: {},
      targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
    }
  });
  const thPlan = await call("plan", {
    idempotencyKey: `p1-t07-th-${Date.now()}`,
    request: {
      destinationCountry: "TH",
      locale: "th",
      optimization: "balanced",
      profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
      requirements: {},
      targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
    }
  });
  const enNames = (enPlan.basket ?? []).map((item) => String(item.productName ?? ""));
  const thNames = (thPlan.basket ?? []).map((item) => String(item.productName ?? ""));
  const noIds =
    [...enNames, ...thNames].every((name) => name.trim() && !looksLikeId(name));
  const checkout = checkoutUrl ? await getText(checkoutUrl.replace("/en/", "/th/")) : { text: "", status: 0 };
  const checkoutNamesOk = !looksLikeId(checkout.text.match(/line-clamp-2[^>]*>([^<]+)/)?.[1] ?? "ok");
  const pass = noIds && (enNames.length > 0 || thNames.length > 0) && checkoutNamesOk;
  record(
    "T07",
    pass,
    `en=${enNames.slice(0, 2).join("|")} th=${thNames.slice(0, 2).join("|")} noIds=${noIds}`,
    pass ? 10 : noIds ? 8 : 6
  );
}

async function main() {
  try {
    await t02Ceilings();
  } catch (error) {
    record("T02", false, error instanceof Error ? error.message : String(error), 0);
  }
  let capturedId;
  try {
    capturedId = await t03Pillars();
  } catch (error) {
    record("T03", false, error instanceof Error ? error.message : String(error), 0);
  }
  let t04;
  try {
    t04 = await t04Prices();
  } catch (error) {
    record("T04", false, error instanceof Error ? error.message : String(error), 0);
  }
  try {
    await t05Reveal(capturedId);
  } catch (error) {
    record("T05", false, error instanceof Error ? error.message : String(error), 0);
  }
  try {
    await t06Brand();
  } catch (error) {
    record("T06", false, error instanceof Error ? error.message : String(error), 0);
  }
  try {
    await t07Names(t04?.checkoutUrl);
  } catch (error) {
    record("T07", false, error instanceof Error ? error.message : String(error), 0);
  }

  const passed = results.filter((item) => item.pass).length;
  console.log(`Official MattaNutra Phase 1 Pack, ${passed}/${results.length}`);
  for (const item of results) {
    console.log(
      `${item.id} ${item.pass ? "10/10" : `${item.score}/10`} ${item.pass ? "PASS" : "FAIL"} ${item.detail}`
    );
  }
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
