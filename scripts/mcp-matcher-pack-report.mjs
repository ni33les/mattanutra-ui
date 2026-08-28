import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  freezeKey,
  loadDetCatalog,
  runDetPack
} from "../test/agentic-det-pack.test.ts";
import { canonicalAeReport, runAePack } from "../test/agentic-ae-pack.test.ts";
import { canonicalAeC2Report, runAeC2Pack } from "../test/agentic-ae-c2-pack.test.ts";
import { canonicalAeC3Report, runAeC3Pack } from "../test/agentic-ae-c3-pack.test.ts";
import { canonicalAeC4Report, runAeC4Pack } from "../test/agentic-ae-c4-pack.test.ts";
import { replaceCatalogueSnapshot, resetCatalogueSnapshotCache } from "../lib/agentic/catalogue/snapshot.ts";
import { resetMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import { setAgenticRuntimeForTests } from "../lib/agentic/runtime.ts";

export const MATCHER_BAR = 9;
export const BASELINE_PATH = fileURLToPath(
  new URL("./mcp-matcher-pack-baseline.json", import.meta.url)
);

const ROWS = [
  {
    category: "Matcher quality",
    id: "matching",
    purpose:
      "Live retail catalog covers the official five targets, prefers fewer pills, and does not invent leftovers"
  },
  {
    category: "Matcher quality",
    id: "safety",
    purpose:
      "Mag at 351 mg hits the catalog ceiling, and Mag plus CKD is a hard stop with real exposure"
  },
  {
    category: "Matcher quality",
    id: "efficiency",
    purpose:
      "Agent matching is not the 400 ms web trap; pinning does not rematch; live baskets are not fixture SKUs"
  },
  {
    category: "MCP contract",
    id: "AE-01",
    purpose: "Tool blurbs are short and do not leak QA-pack scripts"
  },
  {
    category: "MCP contract",
    id: "AE-02",
    purpose: "Plan admits create, revise, answer, select, and get"
  },
  {
    category: "MCP contract",
    id: "AE-03",
    purpose: "A bad request returns a small business error, not a schema dump"
  },
  {
    category: "MCP contract",
    id: "AE-04",
    purpose: "A slow match returns a small processing payload the agent can poll"
  },
  {
    category: "MCP contract",
    id: "AE-05",
    purpose: "Isolated info is compact: countries, codes, no catalogue dump"
  },
  {
    category: "MCP contract",
    id: "AE-06",
    purpose: "Ordinary plan JSON has no matcher telemetry"
  },
  {
    category: "MCP contract",
    id: "AE-07",
    purpose: "An unknown medicine stays unassessed; we do not silently drop it"
  },
  {
    category: "MCP contract",
    id: "AE-08",
    purpose: "Apixaban plus omega-3 asks for a safety acknowledgement before ready"
  },
  {
    category: "MCP contract",
    id: "AE-09",
    purpose: "CKD plus magnesium is blocked, not offered as ready to buy"
  },
  {
    category: "MCP contract",
    id: "AE-10",
    purpose: "After acknowledgement, the safety facts are still on the plan"
  },
  {
    category: "MCP contract",
    id: "AE-11",
    purpose: "Guidance ids are stable and selectable, not product-id soup"
  },
  {
    category: "MCP contract",
    id: "AE-12",
    purpose: "The chosen option stays sticky until the request actually changes"
  },
  {
    category: "MCP contract",
    id: "AE-13",
    purpose: "Compact options are enough to select; no fat internal alternatives"
  },
  {
    category: "MCP contract",
    id: "AE-14",
    purpose: "A stale write fails abortably and tells the agent to reload"
  },
  {
    category: "MCP contract",
    id: "AE-15",
    purpose:
      "Next actions match the state: answer, confirm, or change — not execute while blocked"
  },
  {
    category: "MCP contract",
    id: "AE-16",
    purpose: "Execute is only in play after the plan is ready"
  },
  {
    category: "MCP contract",
    id: "AE-17",
    purpose: "Wrong revision is stale_revision, not a crash or a silent overwrite"
  },
  {
    category: "MCP contract",
    id: "AE-18",
    purpose: "Get returns the same plan the agent already has"
  },
  {
    category: "MCP contract",
    id: "AE-19",
    purpose: "Thai copy is keyed; English keys do not leak into Thai"
  },
  {
    category: "MCP honesty",
    id: "AX2-01",
    purpose: "Acknowledging warfarin must not pretend we assessed it"
  },
  {
    category: "MCP honesty",
    id: "AX2-02",
    purpose: "Unassessed medicines and conditions stay listed after later answers"
  },
  {
    category: "MCP honesty",
    id: "AX2-03",
    purpose: "After a real medicine-interaction ack, the plan can become ready"
  },
  {
    category: "MCP honesty",
    id: "AX2-04",
    purpose:
      "Two D3 SKUs under the ceiling are information, not “acknowledge to continue”"
  },
  {
    category: "MCP honesty",
    id: "AX2-05",
    purpose: "Isolated info still has no recognised-name dump, gaps dump, or latency"
  },
  {
    category: "MCP honesty",
    id: "AX2-06",
    purpose: "Ordinary public plan still has no matcherTelemetry / ackMs / catalogId"
  },
  {
    category: "MCP honesty",
    id: "AX2-07",
    purpose:
      "Several schema problems come back as one invalid_request with several issues"
  },
  {
    category: "MCP honesty",
    id: "AX2-08",
    purpose: "Options stay compact (id, reason, summary) and selectable"
  },
  {
    category: "MCP honesty",
    id: "AX2-09",
    purpose: "Requested nutrient names on a line are the targets that SKU is for"
  },
  {
    category: "MCP honesty",
    id: "AX2-10",
    purpose:
      "Option reasons use the public codes (balanced / fewest pills / cost / coverage)"
  },
  {
    category: "MCP honesty",
    id: "AX2-11",
    purpose: "Two overlap facts get two different guidance ids"
  },
  {
    category: "MCP honesty",
    id: "AX2-12",
    purpose: "Thai plan copy stays Thai-keyed, including option reasons"
  },
  {
    category: "MCP honesty",
    id: "AX2-13",
    purpose:
      "Ordinary info is only the agent capability boundary: countries, locales, codes, continuation — no catalogue or performance dump"
  },
  {
    category: "MCP planning",
    id: "AX3-01",
    purpose: "A ready plan is small and has no matcher internals"
  },
  {
    category: "MCP planning",
    id: "AX3-02",
    purpose: "Get, answer, select and revise use that same clean contract"
  },
  {
    category: "MCP planning",
    id: "AX3-03",
    purpose: "A bad create returns one small field-level error"
  },
  {
    category: "MCP planning",
    id: "AX3-04",
    purpose: "Pending safety ack is one status: pending — never a competing boolean"
  },
  {
    category: "MCP planning",
    id: "AX3-05",
    purpose: "After the safety answer, ack is acknowledged and get does not rematch"
  },
  {
    category: "MCP planning",
    id: "AX3-06",
    purpose: "Acknowledging warfarin does not pretend we assessed it"
  },
  {
    category: "MCP planning",
    id: "AX3-07",
    purpose: "Acknowledging diabetes stays a condition, not a medicine"
  },
  {
    category: "MCP planning",
    id: "AX3-08",
    purpose: "Option reason code, key and message come from one value"
  },
  {
    category: "MCP planning",
    id: "AX3-09",
    purpose: "Product reasons name only the requested targets that caused selection"
  },
  {
    category: "MCP planning",
    id: "AX3-10",
    purpose: "Selecting an option keeps the other compact options for comparison"
  },
  {
    category: "MCP planning",
    id: "AX3-11",
    purpose: "Thai option reasons are Thai, like the rest of the plan copy"
  },
  {
    category: "MCP planning",
    id: "AX3-12",
    purpose: "Product cost, shipping and estimated payable total are three named amounts"
  },
  {
    category: "MCP planning",
    id: "AX3-13",
    purpose: "Processing is a tiny poll payload; get does not start another match"
  },
  {
    category: "MCP planning",
    id: "AX3-14",
    purpose: "Only create and a real requirements change call the matcher"
  },
  {
    category: "MCP planning",
    id: "AX3-15",
    purpose: "The one pack still holds matcher quality plus all earlier agentic cases"
  },
  {
    category: "MCP explanations",
    id: "AX4-01",
    purpose: "A finished plan still has no matcher or catalogue internals"
  },
  {
    category: "MCP explanations",
    id: "AX4-02",
    purpose: "A bad create returns one small field-level error"
  },
  {
    category: "MCP explanations",
    id: "AX4-03",
    purpose: "Option reasons match the real coverage, cost and pill extremes"
  },
  {
    category: "MCP explanations",
    id: "AX4-04",
    purpose: "Option reason code, key and message come from one value"
  },
  {
    category: "MCP explanations",
    id: "AX4-05",
    purpose: "An EPA fact still names the requested Omega-3 target"
  },
  {
    category: "MCP explanations",
    id: "AX4-06",
    purpose: "A hard block cannot be acknowledged; the only move is to change the request"
  },
  {
    category: "MCP explanations",
    id: "AX4-07",
    purpose: "Thai option comparisons are keyed Thai, not satang-English"
  },
  {
    category: "MCP explanations",
    id: "AX4-08",
    purpose: "The clean serializer still keeps every earlier agentic behaviour"
  },
  {
    category: "MCP explanations",
    id: "AX4-09",
    purpose: "The one pack still holds matcher quality plus all earlier agentic cases"
  }
];

function failNoteFromEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") {
    return "FAIL";
  }
  const compact = JSON.stringify(evidence);
  if (compact === "{}") {
    return "FAIL";
  }
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
}

function matcherResult(score) {
  const value = Number(score);
  const passed = Number.isFinite(value) && value >= MATCHER_BAR;
  return {
    passed,
    result: passed ? `${value}/10` : `${value}/10 FAIL`,
    note: passed ? "" : `${value}/10 under bar ${MATCHER_BAR}`
  };
}

export function canonicalPack(run) {
  return JSON.stringify({
    contract: JSON.parse(canonicalAeReport(run.contract)),
    honesty: JSON.parse(canonicalAeC2Report(run.honesty)),
    planning: JSON.parse(canonicalAeC3Report(run.planning)),
    explanations: JSON.parse(canonicalAeC4Report(run.explanations)),
    matcher: {
      efficiency: run.matcher.scores.efficiency,
      matching: run.matcher.scores.matching,
      safety: run.matcher.scores.safety
    }
  });
}

export function snapshotFromRun(run) {
  const contract = Object.fromEntries(
    run.contract.cases.map((item) => [item.id, item.result])
  );
  const honesty = Object.fromEntries(
    run.honesty.cases.map((item) => [item.id, item.result])
  );
  const planning = Object.fromEntries(
    run.planning.cases.map((item) => [item.id, item.result])
  );
  const explanations = Object.fromEntries(
    run.explanations.cases.map((item) => [item.id, item.result])
  );
  return {
    contract,
    honesty,
    planning,
    explanations,
    matcher: {
      efficiency: run.matcher.scores.efficiency,
      matching: run.matcher.scores.matching,
      safety: run.matcher.scores.safety
    }
  };
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    return null;
  }
}

export function writeBaseline(run) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(snapshotFromRun(run), null, 2)}\n`);
}

function regressNote(id, current, baseline) {
  if (!baseline) {
    return "";
  }
  if (id === "matching" || id === "safety" || id === "efficiency") {
    const oldValue = baseline.matcher?.[id];
    const newValue = current;
    if (typeof oldValue === "number" && typeof newValue === "number" && newValue < oldValue) {
      return `REGRESS ${oldValue} → ${newValue}`;
    }
    return "";
  }
  const section = id.startsWith("AX4-")
    ? "explanations"
    : id.startsWith("AX3-")
      ? "planning"
      : id.startsWith("AX2-")
        ? "honesty"
        : "contract";
  const oldValue = baseline[section]?.[id];
  const newValue = current;
  if (oldValue === "PASS" && newValue === "FAIL") {
    return `REGRESS PASS → FAIL`;
  }
  if (oldValue === "PASS" && newValue == null) {
    return "REGRESS PASS → missing";
  }
  return "";
}

export function sectionTotals(run) {
  const matching = matcherResult(run.matcher.scores.matching);
  const safety = matcherResult(run.matcher.scores.safety);
  const efficiency = matcherResult(run.matcher.scores.efficiency);
  const matcherPass = matching.passed && safety.passed && efficiency.passed;
  const contractPass = run.contract.passedCases === run.contract.totalCases;
  const honestyPass = run.honesty.passedCases === run.honesty.totalCases;
  const planningPass = run.planning.passedCases === run.planning.totalCases;
  const explanationsPass = run.explanations.passedCases === run.explanations.totalCases;
  return {
    contract: {
      passed: contractPass,
      text: `${run.contract.passedCases}/${run.contract.totalCases}`
    },
    honesty: {
      passed: honestyPass,
      text: `${run.honesty.passedCases}/${run.honesty.totalCases}`
    },
    planning: {
      passed: planningPass,
      text: `${run.planning.passedCases}/${run.planning.totalCases}`
    },
    explanations: {
      passed: explanationsPass,
      text: `${run.explanations.passedCases}/${run.explanations.totalCases}`
    },
    matcher: {
      passed: matcherPass,
      text: `matching ${run.matcher.scores.matching}/10, safety ${run.matcher.scores.safety}/10, efficiency ${run.matcher.scores.efficiency}/10`
    },
    packPass:
      matcherPass && contractPass && honestyPass && planningPass && explanationsPass
  };
}

export function printTable(run) {
  const baseline = loadBaseline();
  const byId = new Map(run.contract.cases.map((item) => [item.id, item]));
  for (const item of run.honesty.cases) {
    byId.set(item.id, item);
  }
  for (const item of run.planning.cases) {
    byId.set(item.id, item);
  }
  for (const item of run.explanations.cases) {
    byId.set(item.id, item);
  }

  const lines = [
    "| category | purpose | id | result | note |",
    "|---|---|---|---|---|"
  ];

  for (const row of ROWS) {
    let result = "";
    let note = "";
    if (row.id === "matching" || row.id === "safety" || row.id === "efficiency") {
      const scored = matcherResult(run.matcher.scores[row.id]);
      result = scored.result;
      note = scored.note;
      const regress = regressNote(row.id, run.matcher.scores[row.id], baseline);
      note = [note, regress].filter(Boolean).join("; ");
    } else {
      const item = byId.get(row.id);
      const status = item?.result ?? "FAIL";
      result = status;
      if (status !== "PASS") {
        note = failNoteFromEvidence(item?.evidence);
      }
      const regress = regressNote(row.id, status, baseline);
      note = [note, regress].filter(Boolean).join("; ");
    }
    lines.push(
      `| ${row.category} | ${row.purpose} | ${row.id} | ${result} | ${note} |`
    );
  }

  console.log(lines.join("\n"));
  const totals = sectionTotals(run);
  console.log("");
  console.log(
    `Matcher quality: ${totals.matcher.text} — ${totals.matcher.passed ? "PASS" : "FAIL"}`
  );
  console.log(
    `MCP contract: ${totals.contract.text} — ${totals.contract.passed ? "PASS" : "FAIL"}`
  );
  console.log(
    `MCP honesty: ${totals.honesty.text} — ${totals.honesty.passed ? "PASS" : "FAIL"}`
  );
  console.log(
    `MCP planning: ${totals.planning.text} — ${totals.planning.passed ? "PASS" : "FAIL"}`
  );
  console.log(
    `MCP explanations: ${totals.explanations.text} — ${totals.explanations.passed ? "PASS" : "FAIL"}`
  );
  if (baseline) {
    console.log(`Baseline: compared ${BASELINE_PATH}`);
  } else {
    console.log("Baseline: none yet");
  }
  console.log(`Pack: ${totals.packPass ? "PASS" : "FAIL"}`);
  return totals;
}

async function resetAfterMatcher() {
  replaceCatalogueSnapshot(null);
  resetCatalogueSnapshotCache();
  resetMatcherSafetyCeilings();
  setAgenticRuntimeForTests(null);
}

export async function runPackOnce() {
  const catA = await loadDetCatalog();
  const catB = await loadDetCatalog();
  if (freezeKey(catA) !== freezeKey(catB)) {
    throw new Error("FAIL freeze");
  }
  const matcher = await runDetPack({ ...catA, freezePeer: catB });
  await resetAfterMatcher();
  const contract = await runAePack();
  const honesty = await runAeC2Pack();
  const planning = await runAeC3Pack();
  const explanations = await runAeC4Pack();
  return { contract, honesty, planning, explanations, matcher };
}
