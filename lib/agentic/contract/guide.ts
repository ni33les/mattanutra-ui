import { importanceInstructions } from "@/lib/agentic/contract/importance";
import { LIMIT_ADVICE_POLICY } from "@/lib/agentic/presentation/limit-advice";
import { positioning, environmentWarning } from "@/lib/agentic/discovery/positioning";
import { AGENTIC_CONTRACT_VERSION, type AgenticEnvironment } from "@/lib/agentic/config";
import { OVERVIEW_CARD } from "@/lib/agentic/contract/agent-card";
import { AGENTIC_CONTRACT_REGISTRY } from "@/lib/agentic/contract/registry";
import { PLAN_INPUT_SCHEMA } from "@/lib/agentic/contract/schemas";
import { MCP_SCORING_PRESETS } from "@/lib/agentic/contract/scoring";
import { negotiateLocale } from "@/lib/agentic/i18n";

export const CLIENT_GUIDE_URI = `mattanutra://contract/${AGENTIC_CONTRACT_VERSION}/client-guide`;
export const CONTRACT_SCHEMA_URI = `mattanutra://contract/${AGENTIC_CONTRACT_VERSION}/schema`;
export { OVERVIEW_CARD as GUIDE_ESSENTIALS } from "@/lib/agentic/contract/agent-card";
const handle = "cap_replace_with_returned_plan_handle";
const controls = { planHandle: handle, expectedRevision: 1, idempotencyKey: "example-change-key-0001" };
export const CLIENT_EXAMPLES = [
  { name: "create-provisional-targets", tool: "plan", arguments: { idempotencyKey: "example-create-key-0001", locale: "en", destinationCountry: "TH", targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU", basis: "supplemental" }] } },
  { name: "read-or-poll", tool: "plan", arguments: { planHandle: handle } },
  { name: "fewer-pills", tool: "plan", arguments: { ...controls, requirements: { maxDailyPills: 3 }, scoring: { weights: { pills: 2 } } } },
  { name: "prioritise-lower-cost", tool: "plan", arguments: { ...controls, scoring: { weights: { price: 2 } } } },
  { name: "minimise-incidental-ingredient", tool: "plan", arguments: { ...controls, targets: [{ ingredientId: "sup_replace_with_returned_selenium", amount: 0, unit: "mcg" }], scoring: { weights: { nutrients: { sup_replace_with_returned_selenium: 1 } } } } },
  { name: "pill-count-matters-a-little", tool: "plan", arguments: { ...controls, scoring: { weights: { pills: 0.543 } } } },
  { name: "pill-count-does-not-matter", tool: "plan", arguments: { ...controls, scoring: { weights: { pills: 0 } } } },
  { name: "exclude-selenium", tool: "plan", arguments: { ...controls, requirements: { excludeSupplementIds: ["sup_replace_with_returned_selenium"] } } },
  { name: "raise-target-importance", tool: "plan", arguments: { ...controls, scoring: { weights: { nutrients: { sup_replace_with_returned_selenium: 2 } } } } },
  { name: "change-agreed-dose", tool: "plan", arguments: { ...controls, targets: [{ ingredientId: "sup_replace_with_returned_selenium", amount: 120 }] } },
  { name: "exclude-a-product", tool: "plan", arguments: { ...controls, requirements: { excludeProductIds: ["prd_replace_with_returned_product"] } } },
  { name: "clear-preference", tool: "plan", arguments: { ...controls, requirements: { maxDailyPills: null } } },
  { name: "reset-preset", tool: "plan", arguments: { ...controls, scoring: { profile: "best_match" } } },
  { name: "reset-one-weight", tool: "plan", arguments: { ...controls, scoring: { weights: { pills: null } } } },
  { name: "recover-failed-or-stale-work", tool: "plan", arguments: { ...controls, scoring: {} } },
  { name: "answer-current-question", tool: "plan", arguments: { ...controls, answers: [{ questionId: "returned_question", choice: "returned_choice" }] } },
  { name: "confirm-recommendation", tool: "plan", arguments: { ...controls } },
  { name: "confirmed-checkout", tool: "execute", arguments: { ...controls } },
  { name: "recover-or-track-order", tool: "order", arguments: { orderHandle: "cap_replace_with_returned_order_handle" } }
] as const;
export function publicContractBundle() { return { contractVersion: AGENTIC_CONTRACT_VERSION, planSchema: PLAN_INPUT_SCHEMA, examples: CLIENT_EXAMPLES, tools: AGENTIC_CONTRACT_REGISTRY }; }
const RULES = `Illustrative amounts are protocol examples, not personal dose recommendations. Answer using the actual questionId and choice corresponding to the customer’s answer. Replace placeholder identifiers with returned values; each new mutation needs a new idempotencyKey and current expectedRevision. Retry a lost response with exactly the same key and input. Handle-only calls poll existing work at pollAfterSeconds; stop at a terminal result.

Use one flat plan call repeatedly. Omit unchanged fields. Start with best_match by omitting scoring; it uses the existing balanced coefficients, all initially one. balanced remains an accepted input alias and is returned as best_match. Adjust weights conversationally to get one recommendation per round. Selection, answers and refinements must be separate calls. profile is reported customer context; scoring.profile is a preset of effective weights. Nothing requires exact diet labels or demographics merely to explore.

${importanceInstructions()} Up to six decimal places (for example 0.543). Overrides replace preset values; they are never multiplied by the preset. Ask “How important is this preference?” rather than requiring coefficients from the person. A nutrient weight without a target does not create a hidden fitting or avoidance objective; add an explicit target first. Independently existing continued-dose terms may still apply.

Zero-target comparison scales: Vitamin D3 25 mcg (1000 IU); Selenium 50 mcg. These are versioned engineering scales anchored to captured catalogue amounts, not recommended doses or safety limits, and are not claimed to be clinically calibrated. Other ingredients require an explicit scale review; an unsupported zero target returns a field error. At zero, exposure divided by this scale replaces proportional deviation. total_daily includes fixed diet and continued intake; supplemental excludes diet. The matcher cannot remove fixed intake. Coverage of a zero goal is binary: fully quantified zero contributes 100%, confirmed positive or uncertain exposure contributes 0%; unknown remains explicit. No zero-target percentage divides by zero.

Result delivery: clients that consume structuredContent receive one structured decision plus brief text. Verified text-only clients send X-MattaNutra-Result-Content: text to receive complete JSON text instead. X-MattaNutra-Result-Content: structured explicitly confirms structured support. Do not concatenate both representations.

Nested context merges. Supplied medication, condition and intake arrays replace only that array. Missing intake is unknown on create and preserved on refinement; clearing observations never reports known zero. Numeric max* preferences are advisory: omission preserves; null clears; zero is a real preference, never a purchase veto. ${LIMIT_ADVICE_POLICY} maxPriceMinor uses THB minor units for first-order goods; 50000 is THB500, delivery separate. Exclusion and productDoses arrays replace; [] clears. Physically supported productDoses are evaluated before selection, never bought directly.

Targets upsert by ingredientId. New rows require amount/unit and a name or published ingredient ID. Existing rows preserve omitted values; amount-only uses the saved unit, unit-only converts physical amount. amount:null removes that target and its explicit weight; targets:[] changes nothing. Removing all targets means no purchase is recommended. Unsupported requested targets keep IDs and gaps. Duplicate aliases resolving to one identity are invalid.

scoring.weights patches overrides; null clears all overrides; {} preserves. Individual null resets to the preset. scoring.profile resets old overrides then applies accompanying overrides. scoring:null and scoring.profile:null are invalid. Omitted searchEffort is standard on create and preserved on refinement. scoring:{} retries failed/stale work; for a fresh successful unchanged plan it is a no-op.

Explain the routine and any returned limit-excess advice. Keep other health-review commentary out of the plan response. supplied is new-product contribution; requested:null marks an incidental ingredient. total_daily includes applicable diet and supplements; supplemental includes continued and new supplements only. Unknown diet remains unknown. All requested targets count in coverage, including unsupported or weight-zero targets. When pillCount is null, pillCountAtLeast is a verified lower bound: say “at least …; total unknown”. Unknown quantities and prices remain unknown; first-order savings are not recurring savings.

The existing choices envelope contains only the current recommendation, never alternative baskets. With no targets it may be empty; a no-purchase recommendation retains any requested ingredients and gaps. Adjust scoring.weights with the current revision and a new key to receive a revised recommendation; do not ask the customer to choose from a menu. After the customer agrees, send only planHandle, expectedRevision and a new idempotencyKey to plan. This confirms the current recommendation without matching again and advances the revision. Use the returned revision when executing checkout. A handle-only read never confirms, and scoring:{} remains a recovery/refinement call. Confirm the selected routine and its ingredient advice with the customer before execute. plan never orders or charges. Finish naturally at no_purchase, or replenish_later when known. order reports verified payment and fulfilment state and recovery links. Each returned product includes its recorded imageUrl (absolute HTTPS), or null when no image is recorded. Keep that URL with its product; do not invent an image or fetch images to make a plan decision. Unknown tool calls return JSON-RPC -32601 (Unknown tool: <name>) without tool data or mutation.`;
export function clientGuideMarkdown(locale?: string, environment: AgenticEnvironment = "dev") {
  return `# MattaNutra conversational client guide ${AGENTIC_CONTRACT_VERSION}\n\n${positioning(locale).initialization}\n\n${environmentWarning(environment, locale)}\n\n${OVERVIEW_CARD}\n\n${importanceInstructions(locale)}\n\n${RULES}\n\nPresets (effective assignments):\n\n${JSON.stringify(MCP_SCORING_PRESETS, null, 2)}\n\nCopyable templates:\n\n${CLIENT_EXAMPLES.map(example => `### ${example.name}\n\n${example.tool}\n\n\`\`\`json\n${JSON.stringify(example.arguments, null, 2)}\n\`\`\``).join("\n\n")}`;
}
export const CONTRACT_RESOURCES = [
  { uri: CLIENT_GUIDE_URI, name: "MattaNutra conversational guide", mimeType: "text/markdown", description: "Flat conversational workflow, weight meanings, refinements and recovery." },
  { uri: CONTRACT_SCHEMA_URI, name: "MattaNutra contract", mimeType: "application/schema+json", description: "The same input and response contracts used by tool cards and runtime validation." }
] as const;
export function readContractResource(uri: string, locale?: string, environment: AgenticEnvironment = "dev") {
  const resource = CONTRACT_RESOURCES.find(row => row.uri === uri);
  return resource ? { contents: [{ uri, mimeType: resource.mimeType, text: uri === CLIENT_GUIDE_URI ? clientGuideMarkdown(locale, environment) : JSON.stringify(publicContractBundle()) }] } : null;
}
export function clientDiscovery(localeInput?: string, view: "overview" | "client_guide" | "plan_schema" = "overview", environment: AgenticEnvironment = "dev") {
  const locale = negotiateLocale(localeInput);
  return { clientInstructions: `${positioning(locale).invocationGuidance} ${environmentWarning(environment, locale)}\n${OVERVIEW_CARD}${locale === "en" ? "" : `\n${importanceInstructions(locale)}`}`,
    clientExamples: (view === "overview" ? CLIENT_EXAMPLES.slice(0, 2) : CLIENT_EXAMPLES).map(example => ({ ...example, arguments: { ...structuredClone(example.arguments), ...("locale" in example.arguments ? { locale } : {}) } })) };
}
