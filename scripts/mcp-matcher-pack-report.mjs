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
import { canonicalAeC5Report, runAeC5Pack } from "../test/agentic-ae-c5-pack.test.ts";
import { canonicalAeC6Report, runAeC6Pack } from "../test/agentic-ae-c6-pack.test.ts";
import { canonicalAeC7Report, runAeC7Pack } from "../test/agentic-ae-c7-pack.test.ts";
import { canonicalAeC8Report, runAeC8Pack } from "../test/agentic-ae-c8-pack.test.ts";
import { canonicalComReport, runComPack } from "../test/agentic-com-pack.test.ts";
import { canonicalCvFixReport, runCvFixPack } from "../test/agentic-cv-fix-pack.test.ts";
import { canonicalCvImplReport, runCvImplPack } from "../test/agentic-cv-impl-pack.test.ts";
import { canonicalR2Report, runCvR2Pack } from "../test/agentic-cv-r2-pack.test.ts";
import { canonicalR3Report, runCvR3Pack } from "../test/agentic-cv-r3-pack.test.ts";
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
  },
  {
    category: "MCP copy",
    id: "AX5-01",
    purpose: "Every finished plan operation still has no matcher internals"
  },
  {
    category: "MCP copy",
    id: "AX5-02",
    purpose: "A bad create returns one small field-level error"
  },
  {
    category: "MCP copy",
    id: "AX5-03",
    purpose: "Cleaning the serializer does not drop state, safety, options or prices"
  },
  {
    category: "MCP copy",
    id: "AX5-04",
    purpose: "Each product line names its real job, not a generic filler sentence"
  },
  {
    category: "MCP copy",
    id: "AX5-05",
    purpose: "A lone option is “best available”, not a fake comparison"
  },
  {
    category: "MCP copy",
    id: "AX5-06",
    purpose: "Option summaries state price, pills and coverage when they all change"
  },
  {
    category: "MCP copy",
    id: "AX5-07",
    purpose: "The one pack still holds matcher quality plus all earlier agentic cases"
  },
  {
    category: "MCP state",
    id: "AX6-01",
    purpose: "Every ordinary plan response is allow-listed and diagnostic-free"
  },
  {
    category: "MCP state",
    id: "AX6-02",
    purpose: "A malformed create returns one compact public error"
  },
  {
    category: "MCP state",
    id: "AX6-03",
    purpose: "Cleaning the serializer still keeps the complete agent contract"
  },
  {
    category: "MCP state",
    id: "AX6-04",
    purpose: "Public leftovers are unique and numerically honest"
  },
  {
    category: "MCP state",
    id: "AX6-05",
    purpose: "English option comparisons use exact coverage language"
  },
  {
    category: "MCP state",
    id: "AX6-06",
    purpose: "The one pack still holds matcher quality plus all earlier agentic cases"
  },
  {
    category: "MCP boundary",
    id: "AX7-01",
    purpose: "Raw schema dumps are impossible at the public boundary"
  },
  {
    category: "MCP boundary",
    id: "AX7-02",
    purpose: "Every plan operation uses one compact validation contract"
  },
  {
    category: "MCP boundary",
    id: "AX7-03",
    purpose: "A 30-target request is meaningful or explicitly too broad"
  },
  {
    category: "MCP boundary",
    id: "AX7-04",
    purpose: "Broad-request recovery preserves every target"
  },
  {
    category: "MCP boundary",
    id: "AX7-05",
    purpose: "Incidental composition uses progressive disclosure"
  },
  {
    category: "MCP boundary",
    id: "AX7-06",
    purpose: "The one pack still holds matcher quality plus all earlier agentic cases"
  },
  {
    category: "MCP evidence",
    id: "AX8-01",
    purpose: "Incidental nutrients cannot become coverage claims"
  },
  {
    category: "MCP evidence",
    id: "AX8-02",
    purpose: "Every product explanation is exactly the positive-contributor set"
  },
  {
    category: "MCP evidence",
    id: "AX8-03",
    purpose: "Broad unresolved targets use one labelled review structure"
  },
  {
    category: "MCP evidence",
    id: "AX8-04",
    purpose: "One answer applies multiple gap decisions without rematching"
  },
  {
    category: "MCP evidence",
    id: "AX8-05",
    purpose: "Every leftover uses one complete numerical contract"
  },
  {
    category: "MCP evidence",
    id: "AX8-06",
    purpose: "Explanation and gap contracts remain concise and localisable"
  },
  {
    category: "MCP evidence",
    id: "AX8-07",
    purpose: "Complete agentic and matcher regression gates remain deterministic"
  },
  {
    category: "Customer value remediation",
    id: "FIX-01",
    purpose: "Optional and deferred targets do not block a valid core option"
  },
  {
    category: "Customer value remediation",
    id: "FIX-02",
    purpose: "Conditional-only requests have a coherent state and continuation"
  },
  {
    category: "Customer value remediation",
    id: "FIX-03",
    purpose: "One current supplement produces one safety contributor"
  },
  {
    category: "Customer value remediation",
    id: "FIX-04",
    purpose: "Pack facts produce real 30/90-day economics"
  },
  {
    category: "Customer value remediation",
    id: "FIX-05",
    purpose: "Baseline and savings are comparable and reproducible"
  },
  {
    category: "Customer value remediation",
    id: "FIX-06",
    purpose: "Direct endpoint and installed connector advertise the same schema"
  },
  {
    category: "Customer value remediation",
    id: "FIX-07",
    purpose: "Public MCP metadata exposes no QA credential or driver instructions"
  },
  {
    category: "Customer value remediation",
    id: "FIX-08",
    purpose: "DEV safety values match the pinned rule ledger"
  },
  {
    category: "Customer value remediation",
    id: "FIX-09",
    purpose: "Complete remediation pack is deterministic"
  },
  {
    category: "Customer value implementation v1.1",
    id: "REG-CV-01",
    purpose: "Ready core with optional omission and conditional deferral"
  },
  {
    category: "Customer value implementation v1.1",
    id: "REG-CV-02",
    purpose: "Conditional state machine stays coherent"
  },
  {
    category: "Customer value implementation v1.1",
    id: "REG-CV-03",
    purpose: "Current-intake deduplication and positive overlap"
  },
  {
    category: "Customer value implementation v1.1",
    id: "REG-CV-04",
    purpose: "Public-surface isolation"
  },
  {
    category: "Customer value implementation v1.1",
    id: "REG-CV-05",
    purpose: "Exact same-key replay of the primary case"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-STATE-01",
    purpose: "Answer inherits the frozen plan snapshot"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-STATE-02",
    purpose: "Every plan transition retains canonical identity"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-STATE-03",
    purpose: "Pinned snapshot does not silently refresh mid-plan"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-PACK-01",
    purpose: "Selected line exposes authoritative pack facts"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-PACK-02",
    purpose: "Missing pack data fails closed"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-ECON-01",
    purpose: "Long-lived pack supply and horizon economics reproduce"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SAVE-01",
    purpose: "Self-equivalent baseline has exact zero saving"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SAVE-02",
    purpose: "Current inventory covering the horizon is not a mag saving"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SAVE-03",
    purpose: "In-horizon stock exhaustion buys only required replenishment"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SAVE-04",
    purpose: "Cheaper non-equivalent baskets cannot claim equivalent saving"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SAVE-05",
    purpose: "Incomplete economics suppress every numeric saving"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SAVE-06",
    purpose: "First-order cash is not 30-day consumption"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-CONTRACT-01",
    purpose: "Direct plan schema remains explicit"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-CONTRACT-02",
    purpose: "Fresh session schema hash matches info.schemaChecksum"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-CONTRACT-03",
    purpose: "Advertised plan is not a catch-all object"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-CONTRACT-04",
    purpose: "Snapshot, well-known, and adapters share one checksum"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SAFETY-01",
    purpose: "Every upper limit resolves to one pinned rule"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SAFETY-02",
    purpose: "Coverage and guidance share rule identity"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SAFETY-03",
    purpose: "Boundary behaviour derives from the ledger"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SAFETY-04",
    purpose: "Missing or ambiguous rules fail closed"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SAFETY-05",
    purpose: "D3 owner attestation references the DEV ledger"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SAFETY-06",
    purpose: "Deduplication does not weaken safety contributors"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SEC-01",
    purpose: "Public surfaces remain clean with scanner controls"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SEC-02",
    purpose: "Previously exposed QA credential is invalid"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SEC-03",
    purpose: "Replacement QA authorization stays off the public MCP"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-SEC-04",
    purpose: "Logs and errors do not disclose secrets"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-DET-01",
    purpose: "Whole pack twice-identical on one freeze"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-DET-02",
    purpose: "Same-key replay is byte-identical"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-DET-03",
    purpose: "Fresh-key equivalence of material fields"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-DET-04",
    purpose: "Hidden order permutations do not change selection"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-DET-05",
    purpose: "Existing matcher and safety packs remain green"
  },
  {
    category: "Customer value implementation v1.1",
    id: "DEV-DET-06",
    purpose: "Canonical compare fails when material fields change"
  },
  {
    category: "MCP commercial",
    id: "COM-01",
    purpose: "A ready plan creates one open unpaid v1 order and checkout"
  },
  {
    category: "MCP commercial",
    id: "COM-02",
    purpose: "needs_input and blocked plans return plan_not_ready with empty stores"
  },
  {
    category: "MCP commercial",
    id: "COM-03",
    purpose: "Exact execute replay returns the same order, checkout, expiry and snapshot"
  },
  {
    category: "MCP commercial",
    id: "COM-04",
    purpose: "A different valid key for the same revision recovers the existing identity"
  },
  {
    category: "MCP commercial",
    id: "COM-05",
    purpose: "Same key with a changed payload is idempotency_conflict"
  },
  {
    category: "MCP commercial",
    id: "COM-06",
    purpose: "A genuine stale revision returns currentRevision and reload_plan"
  },
  {
    category: "MCP commercial",
    id: "COM-07",
    purpose: "Frozen line totals, shipping, tax, payable total and currency reconcile"
  },
  {
    category: "MCP commercial",
    id: "COM-08",
    purpose: "The selected option ID is frozen on execute and order reads"
  },
  {
    category: "MCP commercial",
    id: "COM-09",
    purpose: "An earlier order stays unchanged after the plan advances"
  },
  {
    category: "MCP commercial",
    id: "COM-10",
    purpose: "Acknowledged safety guidance IDs stay on the frozen snapshot"
  },
  {
    category: "MCP commercial",
    id: "COM-11",
    purpose: "A new ready revision may create one separate order"
  },
  {
    category: "MCP commercial",
    id: "COM-12",
    purpose: "Fresh checkout is open, unpaid, v1, with fulfilment not_started"
  },
  {
    category: "MCP commercial",
    id: "COM-13",
    purpose: "Decline stays on the same unpaid order and creates no OMS handoff"
  },
  {
    category: "MCP commercial",
    id: "COM-14",
    purpose: "Decline then success on the same order reaches paid completed v2 once"
  },
  {
    category: "MCP commercial",
    id: "COM-15",
    purpose: "Direct success reaches paid completed v2 with one capture and one OMS intent"
  },
  {
    category: "MCP commercial",
    id: "COM-16",
    purpose: "Duplicate provider events are successful no-ops"
  },
  {
    category: "MCP commercial",
    id: "COM-17",
    purpose: "A late decline cannot reverse paid state"
  },
  {
    category: "MCP commercial",
    id: "COM-18",
    purpose: "Processing and mocked 3DS never claim premature success"
  },
  {
    category: "MCP commercial",
    id: "COM-19",
    purpose: "Polling without events does not change state or version"
  },
  {
    category: "MCP commercial",
    id: "COM-20",
    purpose: "A completed read has receipt, amount, currency and no payment retry"
  },
  {
    category: "MCP commercial",
    id: "COM-21",
    purpose: "Clock expiry is one terminal unpaid transition; later pay cannot reopen"
  },
  {
    category: "MCP commercial",
    id: "COM-22",
    purpose: "Unpaid expiry creates no refund; paid cancel or refund is explicit"
  },
  {
    category: "MCP commercial",
    id: "COM-23",
    purpose: "Unknown, tampered and foreign handles return identical not_found"
  },
  {
    category: "MCP commercial",
    id: "COM-24",
    purpose: "Support create is idempotent on the exact replay"
  },
  {
    category: "MCP commercial",
    id: "COM-25",
    purpose: "Support reply stays on the same case; isolation is not_found"
  },
  {
    category: "MCP commercial",
    id: "COM-26",
    purpose: "Feedback requires consent and cannot mutate commerce state"
  },
  {
    category: "MCP commercial",
    id: "COM-27",
    purpose: "Malformed execute, order, support and feedback return compact invalid_request"
  },
  {
    category: "MCP commercial",
    id: "COM-28",
    purpose: "Public commercial responses leak no schema, secrets or diagnostics"
  },
  {
    category: "MCP commercial",
    id: "COM-29",
    purpose: "Checkout render matches the frozen order, THB, TH and mock payment identity"
  },
  {
    category: "MCP commercial",
    id: "COM-30",
    purpose: "Missing or foreign address fields are recoverable and cannot switch country"
  },
  {
    category: "MCP commercial",
    id: "COM-31",
    purpose: "Reload keeps one order; success page and MCP order agree after pay"
  },
  {
    category: "MCP commercial",
    id: "COM-32",
    purpose: "One paid order produces one OMS intent and one retailer order"
  },
  {
    category: "MCP commercial",
    id: "COM-33",
    purpose: "OMS payload is frozen SKUs, delivery and money only"
  },
  {
    category: "MCP commercial",
    id: "COM-34",
    purpose: "OMS timeout retry does not duplicate the retailer order"
  },
  {
    category: "MCP commercial",
    id: "COM-35",
    purpose: "Accepted or processing fulfilment does not change money or payment truth"
  },
  {
    category: "MCP commercial",
    id: "COM-36",
    purpose: "Shipped state exposes stable carrier tracking"
  },
  {
    category: "MCP commercial",
    id: "COM-37",
    purpose: "A delivery exception is explicit with a customer next action"
  },
  {
    category: "MCP commercial",
    id: "COM-38",
    purpose: "The agent learns fulfilment only by later order polling"
  },
  {
    category: "MCP commercial",
    id: "COM-39",
    purpose: "A full refund reconciles with captured payment and keeps the receipt"
  },
  {
    category: "MCP commercial",
    id: "COM-40",
    purpose: "A partial refund is an explicit reconciled state"
  },
  {
    category: "MCP commercial",
    id: "COM-41",
    purpose: "A duplicate refund event is a no-op"
  },
  {
    category: "MCP commercial",
    id: "COM-42",
    purpose: "Wrong amount or currency fails closed and raises an operations alert"
  },
  {
    category: "MCP commercial",
    id: "COM-43",
    purpose: "Delivered is terminal and cannot move backwards"
  },
  {
    category: "MCP commercial",
    id: "COM-44",
    purpose: "Happy path is one order, checkout, capture, receipt, retailer order and delivered"
  },
  {
    category: "MCP commercial",
    id: "COM-45",
    purpose: "Decline then retry keeps the same option, basket, amount and currency"
  },
  {
    category: "MCP commercial",
    id: "COM-46",
    purpose: "A fixed exception reaches exactly one explicit recoverable outcome"
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

function caseResults(report) {
  return {
    passedCases: report.passedCases,
    totalCases: report.totalCases,
    results: (report.cases ?? []).map((item) => ({ id: item.id, result: item.result }))
  };
}

export function canonicalPack(run) {
  return JSON.stringify({
    contract: caseResults(run.contract),
    honesty: caseResults(run.honesty),
    planning: caseResults(run.planning),
    explanations: caseResults(run.explanations),
    copy: caseResults(run.copy),
    state: caseResults(run.state),
    boundary: caseResults(run.boundary),
    evidence: caseResults(run.evidence),
    commercial: caseResults(run.commercial),
    valueRemediation: caseResults(run.valueRemediation),
    valueImplementation: caseResults(run.valueImplementation),
    valueR2: caseResults(run.valueR2),
    valueR3: caseResults(run.valueR3),
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
  const copy = Object.fromEntries(
    run.copy.cases.map((item) => [item.id, item.result])
  );
  const state = Object.fromEntries(
    run.state.cases.map((item) => [item.id, item.result])
  );
  const boundary = Object.fromEntries(
    run.boundary.cases.map((item) => [item.id, item.result])
  );
  const evidence = Object.fromEntries(
    run.evidence.cases.map((item) => [item.id, item.result])
  );
  const commercial = Object.fromEntries(
    run.commercial.cases.map((item) => [item.id, item.result])
  );
  const valueRemediation = Object.fromEntries(
    run.valueRemediation.cases.map((item) => [item.id, item.result])
  );
  const valueImplementation = Object.fromEntries(
    run.valueImplementation.cases.map((item) => [item.id, item.result])
  );
  const valueR2 = Object.fromEntries(
    run.valueR2.cases.map((item) => [item.id, item.result])
  );
  const valueR3 = Object.fromEntries(
    run.valueR3.cases.map((item) => [item.id, item.result])
  );
  return {
    contract,
    honesty,
    planning,
    explanations,
    copy,
    state,
    boundary,
    evidence,
    commercial,
    valueRemediation,
    valueImplementation,
    valueR2,
    valueR3,
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
  const section = id.startsWith("R2-")
    ? "valueR2"
    : id.startsWith("REG-CV-") || id.startsWith("DEV-")
    ? "valueImplementation"
    : id.startsWith("FIX-")
    ? "valueRemediation"
    : id.startsWith("COM-")
    ? "commercial"
    : id.startsWith("AX8-")
    ? "evidence"
    : id.startsWith("AX7-")
    ? "boundary"
    : id.startsWith("AX6-")
    ? "state"
    : id.startsWith("AX5-")
      ? "copy"
      : id.startsWith("AX4-")
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
  const copyPass = run.copy.passedCases === run.copy.totalCases;
  const statePass = run.state.passedCases === run.state.totalCases;
  const boundaryPass = run.boundary.passedCases === run.boundary.totalCases;
  const evidencePass = run.evidence.passedCases === run.evidence.totalCases;
  const commercialPass = run.commercial.passedCases === run.commercial.totalCases;
  const valueRemediationPass =
    run.valueRemediation.passedCases === run.valueRemediation.totalCases;
  const valueImplementationPass =
    run.valueImplementation.passedCases === run.valueImplementation.totalCases;
  const valueR2Pass = run.valueR2.passedCases === run.valueR2.totalCases;
  const valueR3Pass = run.valueR3.passedCases === run.valueR3.totalCases;
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
    copy: {
      passed: copyPass,
      text: `${run.copy.passedCases}/${run.copy.totalCases}`
    },
    state: {
      passed: statePass,
      text: `${run.state.passedCases}/${run.state.totalCases}`
    },
    boundary: {
      passed: boundaryPass,
      text: `${run.boundary.passedCases}/${run.boundary.totalCases}`
    },
    evidence: {
      passed: evidencePass,
      text: `${run.evidence.passedCases}/${run.evidence.totalCases}`
    },
    commercial: {
      passed: commercialPass,
      text: `${run.commercial.passedCases}/${run.commercial.totalCases}`
    },
    valueRemediation: {
      passed: valueRemediationPass,
      text: `${run.valueRemediation.passedCases}/${run.valueRemediation.totalCases}`
    },
    valueImplementation: {
      passed: valueImplementationPass,
      text: `${run.valueImplementation.passedCases}/${run.valueImplementation.totalCases}`
    },
    valueR2: {
      passed: valueR2Pass,
      text: `${run.valueR2.passedCases}/${run.valueR2.totalCases}`
    },
    valueR3: {
      passed: valueR3Pass,
      text: `${run.valueR3.passedCases}/${run.valueR3.totalCases}`
    },
    matcher: {
      passed: matcherPass,
      text: `matching ${run.matcher.scores.matching}/10, safety ${run.matcher.scores.safety}/10, efficiency ${run.matcher.scores.efficiency}/10`
    },
    packPass:
      matcherPass &&
      contractPass &&
      honestyPass &&
      planningPass &&
      explanationsPass &&
      copyPass &&
      statePass &&
      boundaryPass &&
      evidencePass &&
      commercialPass &&
      valueRemediationPass &&
      valueImplementationPass &&
      valueR2Pass &&
      valueR3Pass
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
  for (const item of run.copy.cases) {
    byId.set(item.id, item);
  }
  for (const item of run.state.cases) {
    byId.set(item.id, item);
  }
  for (const item of run.boundary.cases) {
    byId.set(item.id, item);
  }
  for (const item of run.evidence.cases) {
    byId.set(item.id, item);
  }
  for (const item of run.commercial.cases) {
    byId.set(item.id, item);
  }
  for (const item of run.valueRemediation.cases) {
    byId.set(item.id, item);
  }
  for (const item of run.valueImplementation.cases) {
    byId.set(item.id, item);
  }
  for (const item of run.valueR2.cases) {
    byId.set(item.id, item);
  }
  for (const item of run.valueR3.cases) {
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
  console.log(
    `MCP copy: ${totals.copy.text} — ${totals.copy.passed ? "PASS" : "FAIL"}`
  );
  console.log(
    `MCP state: ${totals.state.text} — ${totals.state.passed ? "PASS" : "FAIL"}`
  );
  console.log(
    `MCP boundary: ${totals.boundary.text} — ${totals.boundary.passed ? "PASS" : "FAIL"}`
  );
  console.log(
    `MCP evidence: ${totals.evidence.text} — ${totals.evidence.passed ? "PASS" : "FAIL"}`
  );
  console.log(
    `MCP commercial: ${totals.commercial.text} — ${totals.commercial.passed ? "PASS" : "FAIL"}`
  );
  console.log(
    `Customer value remediation: ${totals.valueRemediation.text} — ${totals.valueRemediation.passed ? "PASS" : "FAIL"}`
  );
  console.log(
    `Customer value implementation v1.1: ${totals.valueImplementation.text} — ${totals.valueImplementation.passed ? "PASS" : "FAIL"}`
  );
  console.log(
    `Customer value implementation v1.2: ${totals.valueR2.text} — ${totals.valueR2.passed ? "PASS" : "FAIL"}`
  );
  console.log(
    `Customer value implementation v1.3: ${totals.valueR3.text} — ${totals.valueR3.passed ? "PASS" : "FAIL"}`
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
  const copy = await runAeC5Pack();
  const state = await runAeC6Pack();
  const boundary = await runAeC7Pack();
  const evidence = await runAeC8Pack();
  await resetAfterMatcher();
  const commercial = await runComPack();
  await resetAfterMatcher();
  const valueRemediation = await runCvFixPack();
  await resetAfterMatcher();
  const valueImplementation = await runCvImplPack(1);
  await resetAfterMatcher();
  const valueR2 = await runCvR2Pack(1);
  await resetAfterMatcher();
  const valueR3 = await runCvR3Pack(1);
  return {
    contract,
    honesty,
    planning,
    explanations,
    copy,
    state,
    boundary,
    evidence,
    commercial,
    valueRemediation,
    valueImplementation,
    valueR2,
    valueR3,
    matcher
  };
}
