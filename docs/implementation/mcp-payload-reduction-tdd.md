> Historical implementation record. For the current six-tool, single-recommendation protocol, use the [generated MCP client guide](../../contract/mcp/11.0.0/README.md). Retired tools, identifiers and response modes described below are not the current public API.

# MCP payload reduction: scoped TDD work package

Planning baseline: `dev` at `41e1bdceeb6eaa0a8c7054ae57833fe2ed109764`, public contract 7.0.0, 8 September 2026. Historical planning status: proposed implementation; only read-only profiling had been performed. Implementation progress and intentional expectation changes are recorded in [mcp-payload-evidence.md](mcp-payload-evidence.md); the implementation release base follows the completed DB-pool change at `23b4e4cd`.

1. **Objective and measured starting point**

   Minimize the total information and calls needed to reach the customer's next decision. A field belongs in the normal response only if it changes that decision, explains material advice, or enables the next action. Detailed information remains retrievable. Optimize complete conversations, with decision correctness and useful AX as acceptance requirements.

   This minimalist direction supersedes the earlier proposal to send all option-level detail and five templates in every overview. Keep the selected result clear, show the most useful alternative, and make other choices discoverable through short summaries. Do not make an agent navigate a new protocol or reconstruct a basket from cryptic references to save a few bytes. Keep implementation small: reuse existing contracts, readers and test infrastructure; add caches or transport negotiation only when measurements justify the complexity.

   Measurements are stored outside the checkout at `/root/.codex/visualizations/2026/09/08/mcp-payload-planning/measurements.json` and `connector-info.json`. The six historical journey files are preserved prior live responses, not fresh executions against the planning commit. Their source hashes are recorded. The info observation is a fresh, read-only call through the installed DEV connector.

   | Surface | Observed size | Main contributors |
   | --- | ---: | --- |
   | Six-tool discovery array, minified | 217,233 bytes | Repeated request and response schemas; plan alone 130,367 bytes |
   | Installed DEV `info(en)` | 20,650-byte tool envelope | Approximately 9.9 KB structured result repeated in text; examples 4,924 bytes and instructions 3,835 bytes |
   | Historical A1–A6 plan results, original/final | 48,554–118,574 bytes each, structured only | Full options, selected basket repeated at the top level, dose arithmetic and repeated advice |
   | Historical A2 final | 118,574 bytes structured; 248,033-byte reconstructed tool envelope | Options 73,315 bytes; three options only |
   | Historical checkout recovery order | 10,685 bytes structured | Frozen order 8,062 bytes repeated on reads |

   Source locations: `lib/agentic/mcp/rpc.ts` (`toolList`, `toolResult`); `lib/agentic/contract/{schemas,outputs,registry,guide}.ts`; `lib/agentic/info.ts`; `lib/agentic/public-mapper.ts` (`publicPlanFields`, `publicOption`); `lib/agentic/plan/service.ts`; `lib/agentic/commerce/{order,state}.ts`.

   A diagnostic factoring of repeated schema subtrees reduced combined schema bytes from 214,601 to 132,566, approximately 38%. This is an estimate, not a schema-equivalence or connector-compatibility pass. The current transport intentionally includes both serialized JSON text and structured content; an existing regression protects clients that read only text.

2. **Scope and invariants**

   Implement in slices on `dev`. The proposed rollout is DEV only, after scoped acceptance. UAT remains unchanged.

   Preserve the six currently callable tools (`info`, `plan`, `execute`, `order`, `support`, `feedback`) and five plan operations. Detail retrieval uses existing tools; do not advertise an unavailable evidence tool.

   This work changes public presentation, schema generation, transport and directly affected readers. Preserve matching inputs, explored options and order, scoring, search budgets, target priority, health rules, numerical preference semantics, dietary/exclusion enforcement, physical quantities and commercial calculations. Do not impose product or target cutoffs to hit a response budget. Keep existing frozen checkout contents and payment identities authoritative.

   Unknown, omitted, known-zero and explicitly empty remain distinct. Do not round doses or money more aggressively, shorten capability handles, strip meaningful nulls, merge different findings under one rule ID, or hide significant advice to meet a size target. Do not add stock messaging or health acknowledgements.

3. **Compatibility and the public contract**

   Publish an additive contract **7.1.0**, preserving the historical 7.0.0 artifacts. Generate request validation, response schemas, resources, guide and connector projections from one contract source.

   **Spec/runtime alignment is a release requirement.** Maintain a small contract matrix for each tool/plan operation and response view: accepted inputs, omission defaults, required output fields, status/error variants and next actions. Every advertised combination must execute against the real dispatcher; every public response must validate against its advertised schema. Cover successful, pending, failed, stale-revision, unknown-data and replay responses, not just fixtures generated by the schema code. Explicitly test that unsupported combinations fail with the documented field error.

   Add `responseView` to presentation envelopes, outside the plan request and requestPatch:

   | Call | New views | Behaviour when omitted |
   | --- | --- | --- |
   | `plan(create/revise/answer/select)` | `conversation`, `full` | Existing full response |
   | `plan(get)` | `conversation`, `details`, `status`, `full` | Existing full response |
   | `order` | `conversation`, `details`, `status`, `full` | Existing full response |

   Published conversation examples explicitly request `conversation`; installed DEV connector journeys must demonstrate that path. Existing callers continue receiving their existing fields. A future change to the omission default would require a separate major-version rollout; do not silently change it here. Report compact-path adoption and legacy traffic separately.

   Document that omission still means full: do not describe minimal output as the API default while runtime returns full. Run each published example through the actual transport using returned identifiers in place of documented placeholders. Keep the six callable tool names identical in tools/list, schemas, ordinary info, resources, examples and the installed connector. Historical resources retain their historical versions and are clearly distinguished from the current callable surface.

   `plan(get, details)` accepts typed `sections`, optional returned `optionIds`, and `expectedRevision`. Sections cover request context, product facts, coverage/contributors, advice/sources, score breakdown and economics/schedules. It can return several sections/options in one call. Return a precise stale-revision error rather than mixing a newer result into an earlier decision. `order(details)` reads the immutable frozen order and explicitly requested event/history details under the existing order handle. Define and validate every added field; no generic untyped payload escape hatch.

   Presentation arguments do not create a new matching operation or change a mutation's business idempotency hash. Persist the same canonical result/receipt, then project the requested view, including on replay. Changing business input under the same key still conflicts. A response-only contract update must not trigger rematching or invalidate a frozen checkout; add explicit compatibility handling where current version checks would do so.

4. **Reduce discovery and instructions**

   Factor repeated schema definitions with document-local `$defs`/`$ref`, preserving required fields, unions, enums, units, defaults, ranges, descriptions and exact validation behaviour. Resolve refs in validators and documentation tooling. Compare accepted/rejected input corpora and normalized field errors against the existing schemas. Do not replace complete schemas with loosely typed objects or remove response schemas to reduce discovery size.

   Verify each actual connector accepts the emitted schema representation. Where a connector requires inline definitions, generate that projection from the same source, measure its expanded size and report that limitation. A smaller local artifact alone is not success.

   Ordinary `info({locale})` returns concise capabilities, essential workflow rules, one minimal create example, and how to obtain operation-specific help. Explain target basis, advisory limits and confirmation briefly. Put the full five-operation templates and extended recovery examples in the existing `client_guide` and `plan_schema` views, adding the selected operation's example alongside its schema. Keep patch/clearing and same-key recovery instructions in the relevant tool descriptions/help so normal refinement needs no extra documentation call. Do not repeat the overview inside detail responses. Native resources and tools-only retrieval must cover the same essentials.

   Generate immutable schema artifacts once and reuse existing caching where available. Introduce no new general-purpose cache framework. Keep customer-specific responses outside shared public caches. Preserve readable field names and localized prose; do not use positional arrays or cryptic abbreviations as compression.

5. **A concise conversation response**

   Introduce one typed projection from the canonical business result. Give each response a clear purpose:

   | Stage | Normal information |
   | --- | --- |
   | Discover | What the service can do, essential rules, one starting example |
   | Create/refine | Selected recommendation, most useful alternative, short summaries of other choices, meaningful gaps/advice, next action |
   | Select | Exact selected basket, payable amounts, material advice and confirmation action; available alternatives remain retrievable |
   | Processing/poll | State, handle/version, pacing and actionable error; changed status permits retrieving the current decision |
   | Checkout/order | Checkout or payment/fulfilment state, relevant totals, existing handle and recovery action |
   | Explicit details | Only requested sections/options, in a single batch |

   The create/refine decision contains:

   - Handle, revision, result version, locale, status, one operational decision, concise summary, next action and required recovery fields.
   - The selected/default option ID and existing highlighted alternative ID, with readable products, exact daily servings, packs to buy, price/currency, pills or known lower bound, product count and purchase eligibility. Every other returned option stays discoverable through its original ID, roles, concise coverage/price/pill comparison and material advice. Preserve the supplied option order and option set; highlighting is presentation, not pruning.
   - One selected-result coverage table with requested amount/basis, quantified current intake, new contribution, quantified total, certainty, gap and excess. Preserve unresolved and optional targets and the original denominator. The highlighted alternative shows the target differences needed to assess its trade-off. Other choices show aggregate coverage and consequential differences; exhaustive contributor matrices remain available on request. Do not repeat every target row for every option automatically.
   - Every distinct applicable safety-limit finding, important interaction and significant preference overrun for the selected/highlighted choice, with concise wording, exact exposure/reference amount and unit/scope, relevant ingredient, short source reference and material uncertainty. Other option summaries disclose any material concern introduced or worsened by choosing them; selection returns complete decision-critical advice before confirmation. Do not hide new safety-limit breaches or claim unknown information is reassuring. Routine caveats are stated once, with explicit applicability. Readiness means operational readiness.
   - Purchase-required/no-purchase/replenishment status and known timing; current goods/delivery/total amounts. Return a comparison-unavailable reason when a comparison is offered or requested, rather than enumerating every calculation the customer has not asked for. Never turn first-order differences into recurring savings.

   Store each option once and reference the selected option by ID. Deduplicate large repeated product metadata and source citations using shallow, response-local references only where they materially reduce size. Keep short product names and units inline for readability. Share an advice row only when its full meaning, scope, exposures, uncertainty and provenance are identical; preserve distinct option applicability. Selected and highlighted choices must resolve all their critical advice within the same response. Prefer one clear decision sentence over repeated summary, explanation and reason paragraphs.

   Move full arithmetic traces, exhaustive label/source text, images, repeated incidental facts, historical comparison ledgers and detailed 30/90-day schedules to `details`. Retain their values in canonical storage and allow retrieval without recalculation. Reference evidence through a working `plan(get)` path; an opaque handle without a callable reader is insufficient.

   Return a short `availableDetails` list when applicable; document its use once through discovery. Routine review/refine/select needs no additional detail call. Reviewing any other option uses its existing summary and the normal select operation, whose response supplies its exact basket and decision-critical advice before confirmation; a separate detail call is optional. A person asking for sources, pack basis or the full calculation receives the relevant sections in one batch. No generic byte-limit truncation is allowed; legitimately large advice remains complete and is measured explicitly.

   Response fields have an explicit inclusion rule. Do not emit empty diagnostics, repetitive successful checks, whole requests, deep evidence, descriptions of irrelevant capabilities, or full schemas during ordinary matching. Preserve semantic nulls, zeros and empty values where they communicate uncertainty, clearing or no purchase. A fresh get can reconstruct the current decision without earlier transcript state; do not require clients to replay response deltas.

6. **Lightweight status, recovery and transport**

   Add `knownResultVersion` for status reads. An unchanged result returns a small `unchanged=true` response with handle, committed/pending revision, lifecycle state, poll interval and current recovery error if any. A changed version tells the client to fetch the conversation view. Do not replace MCP success/error envelopes with an HTTP 304 response body that clients cannot interpret.

   Result versions must change for every customer-visible transition, including pending refinement failure/cancellation, new advice, stale input/catalogue identity and payment or fulfilment changes. An unchanged committed plan revision does not prove an unchanged pending operation. Never return `unchanged=true` for a different locale or representation identity.

   Validate access and operation state before answering unchanged. Polling must observe or resume the admitted operation, never start matching independently. Preserve the existing deadlines and poll pacing. Fetch order history/frozen product payloads when requested or first needed, rather than on every status poll. If history pagination is necessary, bind cursors to owner, order and a stable snapshot; preserve all events and explicit continuation.

   Select the view before expensive public projection where possible. Measure serialization, output validation and allocation separately from matching. A small status wire response should also avoid building the full basket/advice/schedule response in memory. Do not expand into task-cursor storage or matcher changes.

   Preserve text-only continuation and structured-content compatibility. First shrink the logical result in both representations. Test native MCP clients, text-only readers and the installed DEV connector before considering a negotiated single-representation optimization. Do not infer support from a user-agent string or unverified protocol version. If negotiation is unavailable, retain the compatibility duplication and still meet the compact-body target.

   Measure raw JSON, the actual tool envelope and client-visible text separately. HTTP compression is an additional bandwidth optimization; record real content encoding where used. It does not establish reduced model context. Do not base an AX success claim on gzip size.

7. **Measurement targets and corpus**

   Establish a fresh, isolated pre-change baseline at the frozen release base before setting final absolute per-case byte budgets. Use Anna and the six AX requests, original/revised selections, empty/no-purchase results, unknown pills/intake, multiple distinct breaches, many-product baskets, stale revisions, processing/failure, checkout reuse and order recovery in English, Thai and Chinese. Preserve historical inputs/prices/results. Include all six tool surfaces, errors, initialization, tools/list and resource/detail retrieval.

   Initial engineering targets, to be locked with the baseline before implementation:

   | Metric | Target |
   | --- | --- |
   | Conversation plan result and full tool envelope, across the named normal journeys | At least 60% lower aggregate bytes; aim for 75%; no silent semantic loss |
   | Entire documented review/refine/select journey, including discovery, details and polling | At least 60% lower aggregate raw bytes; report every case and locale |
   | Generated discovery schemas | At least 35% lower while retaining equivalent validation; measure actual installed projection separately |
   | Ordinary info overview | At least 35% lower; one useful starting example and essential instructions; five templates available through operation help |
   | Unchanged status response for plan/order | At least 90% lower than the corresponding full read, with a 4 KiB normal envelope budget |
   | Requests needed for ordinary compare/refine/select | No increase attributable to missing decision information |

   Publish median, p95 and largest result, per-field byte attribution, total request/response bytes, call count and serialized bytes. Report token counts only with a named, pinned tokenizer suitable for the client; otherwise label estimates and use UTF-8 bytes as the reproducible hard metric. Capture latency descriptively; functional timeouts are failures.

   Targets are fixture acceptance criteria, not runtime size caps. Explicitly enumerate advice-heavy stress cases, assert complete advice and record their growth. No blanket stress-case exemption, fixture shrinkage, price change or target weakening to obtain green. If a target conflicts with retained functionality, report the measured shortfall and propose a reviewed change.

8. **TDD slices**

   Each slice records a meaningful failing behavioural test before implementation, then passes its focused inventory and receives a separate commit. Maintain case IDs `PAY-BASE`, `PAY-SCHEMA`, `PAY-VIEW`, `PAY-POLL`, `PAY-TRANSPORT` and `PAY-AX` with numbered subcases in the impact manifest.

   | Slice | Required RED cases | GREEN evidence |
   | --- | --- | --- |
   | 1. Baseline/profiler/hygiene | Text duplication missed; UTF-8 measured as characters; request/detail calls omitted from journey totals; missing fixture/case falsely passes | Byte attribution includes actual envelopes and all journey calls; baseline and inventory hashes retained |
   | 2. Schema/discovery | Repeated schema exceeds budget; ref resolution changes required fields/errors; overview repeats every operation example; operation help loses patch/quantity/recovery instructions | Equivalent input/output validation, minimal overview, five valid templates on demand, resource/tools-only parity |
   | 3. Conversation/details projection | Selected basket serialized twice; material finding disappears; two exposures merged by rule ID; unknown pills become zero; hidden option or unresolved target; unreachable source details; select replays unrelated alternative detail | Unchanged supplied options and business semantics, purpose-specific minimal responses, critical advice, readable choices, complete batch detail retrieval |
   | 4. Versioned reads and replay | Failed pending revision reports unchanged; details cross revisions; view change creates new mutation; order status replays frozen lines; cross-owner cache hit | Small truthful reads, isolated view cache, no rematch, same-key replay, immutable checkout and payment identity |
   | 5. Transport/consumer compatibility | Text-only client loses an option ID/error; connector rejects references or lacks new view fields; detail query performs a mutation; schema default differs from dispatcher; advertised view fails on a replay/error path | Both client representations usable, runtime contract matrix and examples pass, actual DEV projection verified separately from generated artifacts |
   | 6. Scoped paired acceptance and DEV rollout | Journey needs extra ordinary calls; too-small payload hides advice; stale or mismatched deployment proof accepted | Paired semantic/size evidence, scoped quality checks, measured DEV rollout |

   For projection equivalence, keep the baseline canonical result frozen and independently assert expected products, order, quantities, money, coverage, preferences, sources, uncertainty, next actions and eligibility. Compare conversation plus explicitly retrieved details with the baseline semantic inventory. Do not use the new mapper to generate its own expected values. Separately assert that routine conversations work without details, so reconstruction alone cannot hide AX regressions. Add negative assertions that normal responses omit deep calculations, repeated examples and unrelated sections. Add a fresh-client get and selection of a non-highlighted choice, proving no hidden transcript dependency or extra mandatory detail call.

   Use published schemas and returned identifiers for scripted clients. Run both tools-only/text readers and resource-capable/structured readers in all three locales. Include asking for a cheaper alternative, selecting a highlighted option, quantity proposal, exclusions, clearing preferences, stale-revision recovery, natural no-purchase completion, above-limit advice and recovering the same payment. The external isolated harness controls settlement; clients do not use database access or private fixture endpoints.

9. **Scoped test hygiene and commands**

   Add a reviewed `test/mcp-payload/impact.json` mapping changed behaviours to selected files and case IDs. Select only projection/contract/transport/discovery tests and directly affected plan/order/checkout readers. Existing scoring/search tests are not selected unless their code or behaviour actually changes. Add browser tests only for actual changed browser consumers; discovering no browser consumer is a recorded scope result.

   Reuse the existing execution-proof and hygiene helpers, not the broad AX or full MCP command. Bind this package to its own release base rather than the older AX runner's hard-coded base. Recursively discover within the declared scope and reconcile selected files and cases with execution. Reject `.only`, skips, todos, cancellations, retries, empty-precondition passes, missing database prerequisites and omitted affected tests. Preserve unrelated tests and historical assertions; document intentional shape changes with their replacement semantic assertions.

   Proposed commands:

   ```bash
   npm run mcp:payload-profile -- --corpus ax-six-and-anna --output /absolute/evidence/path
   npm run test:mcp-payload -- --list
   npm run test:mcp-payload -- --slice projection --output /absolute/evidence/path
   npm run validate:dev:mcp-payload -- --output /absolute/evidence/path
   ```

   Memory tests receive no ambient database credentials. Database-bound revision/replay/cache tests use isolated PostgreSQL, controlled clocks/barriers, test payments and an email sink. No mutation of live customer plans is needed for acceptance.

   During development, run only tests directly affected by each change. At completion run the complete package inventory twice from independent clean state, typecheck, lint across the entire release diff and one production build. Compare full semantic results and deterministic size reports; normalize only declared generated identities/timestamps and diagnostic timings. Do not strip advice, money, array order, state transitions or work counts. Rerun after relevant changes or failures only. No full application/MCP suite or full-suite green claim belongs to this package.

10. **DEV rollout and completion**

   Extend the existing DEV-only scoped deployment proof for this named package. Bind source commit/hash, release base, contract/generated schema checksums, fixture/catalogue/reference identities, inventory, passing stages and paired semantics/size reports. Reject stale, altered, incomplete or wrong-environment proofs; retain the ordinary full-gate path. Do not use a generic skip-verification switch or the prior package's attestation.

   Deploy the validated source to DEV, restart affected application processes/workers and verify version/discovery identity. This presentation package should require no catalogue corrections or clinical data changes; test any strictly necessary additive cache/version migration in isolation. Refresh the installed DEV connector and verify its actual accepted parameters and returned representations. Endpoint-only success is not connector completion.

   Ship implementation and generated specification together. Verify live tools/list and resource schemas against the deployed contract, then invoke the installed DEV connector with the new arguments and validate its actual results. Generated adapter files and endpoint checks cannot substitute for this integration check. If the connector still exposes an older contract, keep its compatible full path working and record the rollout as incomplete; do not claim minimal-mode availability or spec alignment. A failed alignment check prevents declaring the DEV release complete.

   Smoke the concise Anna/six-profile flow, detail retrieval, pending failure, no-purchase completion, above-limit selectable option and checkout recovery using controlled data. Re-measure the actual connector envelope. Record use of concise/full views, response bytes, detail-fetch frequency, cache misses, projection errors and failures without logging health payloads or handles.

   Completion requires preserved business behaviour and every option/advice invariant, passing scoped tests, reproducible whole-journey reductions, functional text-only and installed-connector flows, and verified DEV deployment. Prefer the smallest implementation meeting those requirements; speculative caching, paging and transport negotiation are not completion requirements. Report unmet reduction targets or unavailable connector evidence explicitly. Rollback restores the compatible full presentation and preserves canonical results, additive data and frozen orders. UAT remains unchanged.
