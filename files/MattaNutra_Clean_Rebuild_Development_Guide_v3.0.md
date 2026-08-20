# MattaNutra Agentic Commerce

## Clean-Rebuild Development Guide

**Companion specification:** MattaNutra_Agentic_Commerce_Specification_v3.0.md  
**Target contract:** 3.0.0  
**Build policy:** DEV 10/10 first; UAT only for Stripe and retailer connectivity  

---

## 1. How to use this guide

This guide starts from the application state before MCP development. It does not prescribe replaying old commits or porting the reverted MCP implementation.

Build from the companion specification in small, independently testable slices. The six-tool contract and domain invariants are the source of truth. If an earlier branch, report or implementation conflicts with the specification, do not copy it.

The rebuild has two goals:

1. reach the complete agreed product with the fewest moving parts;
2. make each layer independently testable so future defects do not require redesigning the whole flow.

## 2. Delivery rules

1. Work only in DEV until the full pack is 10/10.
2. Never debug functional behavior by changing UAT first.
3. Use one business implementation for every host adapter.
4. Keep host continuation polling-only.
5. Keep the public MCP surface at six tools: info, plan, execute, order, support and optional feedback.
6. Reuse Agentic, RBAC, Task and i18n platform services.
7. Use anonymous capabilities for client resources; use RBAC for staff/services.
8. Treat retail OMS submission as part of the paid-order transaction flow, not a later optional integration.
9. Reject invalid input before search.
10. Make every mutation idempotent before adding retries.
11. Do not expose test mutation controls in public MCP.
12. Promote the same immutable build through environments.
13. Require destination country and derive retailer, products and currency server-side.
14. Treat retailer backorder as orderable stock.
15. Return only facts needed for the next client decision or authoritative state.
16. Return at most three materially different complete-stack options.

---

## 3. Repository and module shape

Use the existing project conventions, but preserve these logical boundaries:

~~~text
mattanutra/
  agentic/
    mcp/
      server
      discovery
      tools
      response-mappers
    adapters/
      openai
      anthropic
      xai
  plan/
    domain
    application
    persistence
    matching
    safety
  catalogue/
    ingestion
    normalization
    snapshot
    availability
    market
  commerce/
    order
    checkout
    payment
    fulfilment
  retail/
    port
    adapters
    mapping
  support/
    domain
    application
  feedback/
    domain
    application
  capabilities/
    domain
    persistence
  qa/
    harness
    fixtures
    journeys
  platform-integration/
    rbac
    task
    i18n
    observability
~~~

These are logical modules, not a requirement to create a separate deployable service for each folder. Prefer a modular monolith for the first clean rebuild unless the existing platform already separates the modules.

### 3.1 Dependency direction

- MCP tool handlers call application services.
- Application services call domain services and ports.
- Domain code does not import MCP, Stripe, retailer or host SDKs.
- Stripe and OMS implementations satisfy ports.
- Platform wrappers satisfy RBAC, Task, i18n and observability ports.
- Host adapters import generated MCP contract types, not domain persistence types.

---

## 4. Source-control strategy

### 4.1 Baseline

Create and tag a known pre-MCP baseline:

~~~text
mattanutra-pre-mcp-baseline
~~~

Record:

- baseline commit;
- database migration level;
- existing Agentic/RBAC/Task/i18n versions;
- current checkout and retailer integration behavior;
- test status before new work.

Do not delete historical branches. Do not merge reverted MCP branches into the clean branch.

### 4.2 Clean branch

Use one integration branch:

~~~text
feature/mattanutra-agentic-v3-clean
~~~

Each pull request implements one vertical or foundational slice and must leave existing tests green.

### 4.3 Pull-request size

Prefer:

- one schema/migration unit;
- one domain transaction;
- one tool;
- one adapter;
- one journey;
- one performance change.

Do not combine contract redesign, payment changes, OMS integration and UI changes in one pull request.

---

## 5. Recommended implementation sequence

The sequence below is mandatory unless an existing platform dependency requires a small reordering.

## Stage 0 — baseline and architecture mapping

### Deliverables

- Clean branch from the tagged pre-MCP baseline.
- Architecture note mapping existing Agentic, RBAC, Task and i18n extension points.
- Existing retail order flow diagram.
- Existing checkout/payment boundary diagram.
- Data-classification list for plans, medical context, capabilities, addresses and payment metadata.
- Decision record confirming modular-monolith first, six public tools, minimal responses and polling only.

### Tests

- Existing unit/integration tests pass unchanged.
- Existing application boots in DEV.
- Existing checkout/retail functions are characterized before modification.

### Exit criteria

- Team agrees which existing modules are reused.
- No new MCP code has been written before this map is reviewed.

## Stage 1 — contract-first scaffold

### Deliverables

- Contract 3.0.0 checked into a versioned contract directory.
- Exact initialize instructions and six tool descriptions from the specification.
- JSON Schemas with additionalProperties=false.
- Generated request/response types.
- Shared business error type with category, reasonCode, fieldPath, messageKey, message and retryable.
- Contract snapshot tests.
- No-op application service ports for info, plan, execute, order, support and feedback.

### Implementation notes

- Tool descriptions are product behavior, not documentation decoration.
- Schema generation must be deterministic.
- Keep protocol errors separate from business errors.
- Reject any accidental seventh public tool in a snapshot test.

### Tests

- initialize reports contract/service version.
- tools/list exposes exactly info, plan, execute, order, support and feedback.
- Each schema rejects unexpected properties.
- Required reasonCode is structurally present in error responses.
- OpenAI, Anthropic and xAI adapter packages compile against the same generated types.

### Exit criteria

- Contract can be reviewed without running the application.
- No host-specific field exists in a business schema.

## Stage 2 — persistence, capabilities and idempotency

### Deliverables

- Plan, PlanRevision, Capability, IdempotencyRecord and OutboxEvent persistence.
- Order-related tables may be created here but are not yet exposed.
- Capability issuer/resolver.
- Neutral not_found behavior.
- Mutation idempotency service.
- Transaction helper for state + audit + outbox.
- Environment and tenant/principal scoping.

### Capability implementation

Generate a cryptographically random public value. Persist only a keyed hash. Resolve by:

1. hash;
2. environment;
3. resource type;
4. permitted action;
5. tenant/principal scope;
6. expiry/revocation.

Never query by order reference and then “check” a handle afterward.

### Idempotency implementation

Canonicalize the operation payload and hash it before mutation.

~~~text
begin transaction
  find idempotency(operation, ownerScope, key) for update
  if found and hash equal: return stored response
  if found and hash differs: return idempotency_conflict
  perform mutation
  store complete response and resource ids
commit
~~~

### Tests

- Exact concurrent retries create one resource.
- Same key/different payload conflicts.
- Plan, order and support capabilities are non-interchangeable.
- Modified/foreign-environment/expired handles return neutral not_found.
- Principal A cannot use principal B’s capability.
- Logs/traces contain no capability values.

### Exit criteria

- Two-principal proof passes before plan matching begins.

## Stage 3 — catalogue and commercial facts

### Deliverables

- Canonical supplement catalogue with aliases and accepted units.
- Product catalogue with product form, serving, daily pills, nutrient contributions, audience, dietary source and Omega-3 source.
- MarketResolver and country configuration.
- Retailer SKU/seller/currency mapping per country.
- Stock and availability snapshot.
- Immutable catalogueVersion and availabilityAsOf.
- Nutrient hierarchy graph.
- Incomplete-facts quarantine.

### Initial market configuration

Create one active market:

~~~text
country: TH
currency: THB
retailerAdapter: thailand-retailer
sellerScope: thailand-enabled-sellers
catalogueScope: thailand-orderable-products
~~~

No default country is inferred. Unsupported countries fail before candidate loading. Future countries add another validated market configuration and retailer adapter; they do not add tool fields or branches in host adapters.

Normalize retailer availability once at ingestion:

~~~text
in_stock | backorder                 -> orderable=true
out_of_stock | unavailable | ended   -> orderable=false
~~~

Do not expose raw quantities or make backorder a scoring penalty.

### Data-quality gates

Reject or quarantine products when any required fact is missing:

- retailer SKU;
- seller;
- currency/price;
- serving basis;
- contribution unit;
- form;
- daily pill count for counted forms;
- dietary source when a dietary constraint is evaluated;
- audience when age/life-stage suitability is evaluated.

### Tests

- One canonical concept per supplement.
- Alias→canonical mapping is stable.
- Each supplement’s accepted units are correct.
- Vitamin D3 in g rejects before search.
- Oral capsule/tablet/softgel/gummy products cannot report zero pills.
- Omega-3 parent/child contributions are not double counted.
- Algae-only never selects fish-derived products.
- TH deterministically selects the Thailand retailer and THB catalogue.
- Unsupported country returns unsupported_country before matching.
- Backorder is eligible exactly like in-stock; non-orderable states are excluded.
- The same product mapped only to another country never enters the TH candidate set.
- Snapshot build is deterministic.

### Exit criteria

- Catalogue facts can support every advertised optimization mode.
- No “form=other/dailyPills=0” shortcut remains for eligible counted products.

## Stage 4 — plan normalization and revision model

### Deliverables

- PlanRequest validator.
- Alias/unit/country normalization and derived market binding.
- Complete-state refinement.
- Revision conflict enforcement.
- Typed question/answer reducer.
- Canonical requestSnapshot persistence.
- ChangeSummary calculation.
- Status rules: ready, needs_input and blocked.
- Revision-scoped complete-option selection.

### Normalization pipeline

Implement exactly in the order defined by the specification. Invalid input stops before matching and persistence of a priced plan.

### Complete-state refinement

Do not merge omitted optional fields from the previous revision. The submitted request is the new desired state.

~~~text
oldNormalized = stored revision state
newNormalized = normalize(submitted complete state)

if expectedRevision != currentRevision:
  revision_conflict

if newNormalized != oldNormalized:
  full deterministic rematch

persist new state + result as currentRevision + 1
~~~

### Typed answers

Build a registry:

| Question choice | Canonical effect |
|---|---|
| Allow algae-only search | omega3SourcePreference=algae_only |
| Relax plant-based | dietaryPreference=any |
| Accept named uncovered target | acceptedGap for exact supplement and revision |
| Remove flagged nutrient | remove exact target |
| Proceed after review | create revision/guidance-bound acknowledgement |

The returned requestSnapshot must contain the resolved canonical effect. Never persist a fish basket beside plant_based state.

### Option selection

`selectOptionId` is the only narrow plan refinement. Validate that it belongs to the expected revision, then create one new revision selecting the stored option snapshot. Do not accept product IDs and do not rerun matching. Any change to country, targets, priority, constraints, intake or safety state uses the complete request and a full rematch.

### Tests

- Zero, duplicate, legacy, missing and unsupported inputs return exact reason codes.
- Invalid input returns no basket/price.
- Same create request with same key replays.
- Three new identical creates are structurally equal.
- Add/change/remove every optional requirement and compare with a fresh plan.
- Removing a budget restores the same result as a fresh uncapped request.
- Stale revision is atomic.
- Stale or foreign option IDs are atomic revision_conflict/not_found results.
- Selecting an option stores exactly that complete stack and increments revision once.
- Every offered choice changes canonical state or is removed from the UI.

### Exit criteria

- J2, J6 and J7 revision paths pass completely.

## Stage 5 — matching and safety

### Deliverables

- Candidate indexes.
- Deterministic bounded beam search.
- Four optimization modes.
- Selected-product coverage/exposure.
- Alternatives and optimization evidence.
- Conversational option selector: one recommendation plus at most two material Pareto alternatives.
- Safety rules and version.
- Revision-bound safety acknowledgement.

### Matching implementation

1. Resolve destination to one active market and filter by its retailer, sellers, SKU mappings, orderability and hard requirements.
2. Build candidate sets per requested supplement.
3. Apply nutrient hierarchy.
4. Generate bounded combinations with a bounded beam.
5. Calculate coverage from selected products only.
6. Calculate price, pill burden, product count and safety burden.
7. Score by selected mode.
8. Apply deterministic tie breakers.
9. Keep the recommendation plus no more than two non-dominated options with client-visible price, coverage or pill-burden differences.
10. Persist enough evidence to reproduce the decision.

### Performance implementation

- Precompute normalized contribution vectors.
- Load one immutable snapshot per process.
- Cache by normalized request hash + snapshot versions.
- Bound candidate count per supplement.
- Bound beam width.
- Stop dominated branches.
- Never persist raw beam nodes; persist the selected option and at most two alternatives.
- Instrument normalization, candidate load, search and serialization separately.

### Safety implementation

Evaluate selected-product delivered exposure plus declared current intake. Keep requested, delivered, current and total values separate.

Acknowledgement object must contain:

- plan revision;
- exact guidance IDs;
- confirmed=true.

Invalidate when the basket, exposure or guidance set changes.

### Tests

- J1 deterministic golden basket.
- Coverage, price, pill and form objectives.
- Constraint-driven alternatives.
- Option selection without product-list reconstruction.
- No duplicate/cosmetic alternatives and never more than three options.
- J3 Apixaban/AF.
- J4 cumulative zinc.
- J5 CKD/magnesium.
- J8 paediatric zinc/iron/audience.
- Guidance survives acknowledgement and execute.
- Blocking guidance cannot be acknowledged.
- Search p95/p99 budgets under representative concurrency.

### Exit criteria

- Matching and safety categories score 10/10 in DEV.

## Stage 6 — MCP application services and conversational shaping

### Deliverables

- info and plan handlers wired through Agentic. The feedback contract remains registered but its application service is completed in Stage 9.
- Agent-facing content and structured results.
- Client-summary and next-action wording.
- Locale negotiation.
- Host adapter manifests for ChatGPT, Claude and Grok.

### Response-shaping rules

Every success begins with a useful bottom line, then structured facts.

The public response budget is a product requirement. Omit internal scores, beam nodes, retailer/SKU IDs, raw stock states, per-item timestamps, empty collections and null placeholders. The agent receives only the facts needed to explain the current choice or take the next action.

Plan response order:

1. status and bottom line;
2. selected stack and concise coverage summary;
3. up to two materially different complete-stack options and their trade-offs;
4. safety facts;
5. smallest next client question or ready action;
6. full structured evidence.

Do not return a generic questionnaire. If enough information exists, plan immediately. If one missing fact materially changes matching, ask only that fact.

### Adapter rule

Adapters may map:

- server manifest;
- transport configuration;
- authentication configuration;
- host display metadata.

Adapters may not map or rewrite:

- plan semantics;
- payment state;
- order state;
- questions;
- safety guidance;
- capability authorization.

### Tests

- Discovery makes a factual case for MattaNutra.
- Advice-only conversation never creates checkout.
- Complete-information conversation proceeds in one plan call.
- Missing-detail conversation asks one focused question.
- Thailand is sufficient to derive retailer and THB; the agent never supplies either.
- The agent can select a returned option by optionId and revision.
- Response-size snapshots reject diagnostics, raw availability and more than three options.
- Same journey passes in ChatGPT, Claude and Grok contract harnesses.

### Exit criteria

- Discovery/adoption and conversational-fit categories score 10/10.

## Stage 7 — order, checkout and DEV payment

### Deliverables

- Order, OrderItem, CheckoutSession, PaymentAttempt, ProviderEvent and PaymentAudit persistence.
- execute and order application services.
- Merchant checkout UI.
- MockPaymentAdapter.
- Internal DEV-only QA fixture harness.
- Payment state machine.
- Checkout expiry task.

### Execute algorithm

~~~text
execute(planHandle, expectedRevision, key):
  authorize plan capability
  begin transaction
    lock plan
    verify latest revision and ready
    verify selected country market and retailer remain active
    revalidate orderability and SKU mapping in that market
    enforce idempotency
    freeze selected option, country, retailer, items, prices, currency, snapshots and guidance ids
    create order(open, unpaid, version=1)
    create order capability
    create checkout access
    store idempotent response
  commit
  ensure checkout session
  return readable order
~~~

### Payment application algorithm

~~~text
applyVerifiedPaymentEvent(providerSessionId, providerEventId, payload):
  verify event/environment before transaction
  resolve exactly one internal order from providerSessionId

  begin transaction
    insert provider event using unique providerEventId
    if duplicate: return stored outcome
    lock order
    verify frozen amount, currency and items
    apply valid transition
    if first success:
      set completed/paid/version=2
      insert one payment_confirmed audit
      insert one OMS_SUBMIT outbox event
    record payment attempt
  commit
~~~

No orderReference or orderHandle is accepted by this internal method.

### DEV fixture harness

Expose through internal authenticated QA routing, not MCP:

~~~text
simulate(orderHandle, scenario)
~~~

The harness resolves exactly one capability-bound order, then generates an internal verified mock event for that order. It must not accept orderId/orderReference.

Scenarios:

- success;
- decline_insufficient_funds;
- processing_then_success;
- provider_unavailable;
- amount_mismatch;
- currency_mismatch;
- order_mismatch attempted internally and rejected;
- duplicate_success;
- three_ds_required;
- three_ds_cancelled;
- three_ds_failed;
- three_ds_succeeded;
- expire;
- refund;
- partial_refund.

### Checkout work

- Product basket read-only.
- Address/contact fields.
- Address country fixed to the planned country; mismatch returns to the agent for a new plan.
- Shipping/tax calculation.
- AI-agent authorization acknowledgement.
- Test-mode banner in DEV/UAT.
- Card/provider component only in UAT.
- Honest state copy from i18n.
- Terminal order redirect.
- Accessibility and responsive layout.

### Tests

- Fresh order readable before execute response.
- Exact execute replay one order.
- Changed payload conflicts.
- Cross-principal order access neutral.
- Decline remains version 1.
- Same-order retry reaches version 2 once.
- Duplicate success one audit/outbox.
- Mismatches never pay.
- Expiry is terminal.
- Refund and partial refund states.
- Browser never determines payment.
- Polling interval and terminal stop.

### Exit criteria

- Purchase/execute and checkout/payment/polling categories score 10/10 with mocks.

## Stage 8 — retail OMS integration

### Deliverables

- RetailOrderManagementPort.
- DEV mock retailer adapter.
- Real retailer UAT adapter behind configuration.
- Country-driven MarketResolver and adapter registry.
- Product/SKU mapping validation.
- OMS_SUBMIT task and outbox consumer.
- Fulfilment/refund synchronization.
- Dead-letter and operator recovery.

### Implementation order

1. Build the interface, MarketResolver and Thailand mock adapter.
2. Resolve only TH to the Thailand retailer/THB configuration; fail closed for every other country.
3. Submit one paid order idempotently.
4. Map parent/child lines.
5. Read fulfilment back.
6. Add shipment/tracking mapping.
7. Add cancellation/refund mapping.
8. Add failure/retry/dead-letter.
9. Add retailer UAT adapter behind the same Thailand market key.

### Tests

- One paid event produces one retail order.
- Payment/worker retries do not duplicate.
- Retail failure leaves payment paid and fulfilment delayed.
- Fulfilment updates appear through order polling.
- Address/contact are sent only to the retailer service.
- Medication/condition/goal data are never sent.
- Cross-tenant retailer credentials cannot be selected.
- Country deterministically selects the retailer, currency, products and credentials.
- Backorder submits normally; unavailable products fail before checkout.
- Checkout country mismatch cannot switch retailer or basket.

### Exit criteria

- Paid golden order completes DEV mock OMS round-trip.

## Stage 9 — support, feedback and i18n

### Deliverables

- SupportCase and SupportMessage.
- support handler.
- Create/reply idempotency.
- Order/case capability binding.
- Platform support queue integration if available.
- Feedback record and write-only application service.
- feedback MCP handler returning only `{ok, accepted}`.
- Exact plan revision/selected-stack reference without duplicating plan data.
- Consent timestamp, bounded summary/points and optional rating.
- Feedback retention and approved product/operations read permission.
- en, th and zh-CN catalogues.
- Translation-key completeness tests.

The English invitation is:

> Would you like me to send MattaNutra a short summary of what worked well and what could be improved? It is optional and will not affect your plan or order.

Translate this meaning through platform i18n. Do not add a marketing message, incentive, second prompt or required rating.

### Tests

- Exact support create replay returns original case/message.
- Same key/different payload conflicts.
- Exact reply replay returns original message.
- Invalid/foreign supportHandle is neutral.
- Automated acknowledgement says open/unreviewed.
- No address, capability or medical profile leaks.
- Every client-visible key has all required translations.
- Locale fallback is deterministic.
- Feedback cannot be submitted without `consentConfirmed=true`.
- Feedback links to the exact plan revision and selected option snapshot.
- Exact feedback replay returns the original minimal receipt; changed payload conflicts.
- Stale/foreign plan handles or revisions do not write feedback.
- Feedback cannot contain capability values, contact/payment secrets or a conversation transcript.
- Declining feedback creates no record and does not affect the journey.
- The invitation appears at most once after a natural outcome and never blocks purchase/support.

### Exit criteria

- Post-purchase, feedback and i18n categories score 10/10.

## Stage 10 — observability, security and performance hardening

### Deliverables

- Correlation IDs and redaction.
- Metrics and alerts from the specification.
- Security threat model.
- Rate limits.
- Load tests.
- Dead-letter/runbook.
- Built-in non-mutating proofs for two-principal isolation and checkout continuity.

### Built-in proofs

Proofs must:

- create fresh isolated fixtures;
- report current build/snapshot IDs;
- run substantive named checks;
- clean up through test-data lifecycle;
- fail closed;
- never return passed=true with empty checks;
- never mutate arbitrary existing QA orders.

### Security tests

- Handle tamper, swap, replay, expiry and cross-environment.
- Principal A/B matrix for every operation.
- Resource selector accepts one handle only.
- Provider session/order mismatch.
- Signature/environment mismatch.
- Checkout access tamper.
- Staff/service RBAC matrix.
- Log and trace secret scan.
- Rate-limit/idempotency interaction.
- SQL/NoSQL injection and oversized inputs.

### Load tests

Test representative concurrent users:

- 100 simultaneous plan creates;
- 100 simultaneous plan refinements;
- 500 order polls with correct intervals;
- concurrent exact execute retries;
- concurrent payment duplicates;
- OMS worker retry bursts;
- support create/reply retries;
- feedback replay and cross-principal attempts.

Validate correctness before throughput. No performance optimization may weaken transactions or authorization.

### Exit criteria

- All performance SLOs pass.
- No secrets in logs.
- Security/portability/operations category scores 10/10.

---

## 6. DEV QA program

## 6.1 Test layers

| Layer | Purpose |
|---|---|
| Unit | Normalization, scoring, guidance, state transitions, i18n keys |
| Property-based | Unit conversion, duplicate detection, deterministic tie breakers |
| Contract | MCP initialize/tools/list and six tool schemas |
| Persistence integration | Locks, unique constraints, idempotency, outbox |
| Adapter integration | Payment mock, OMS mock, host manifests |
| End-to-end agentic | Complete client–agent–MattaNutra journeys |
| Browser | Checkout accessibility, responsive behavior and terminal state |
| Security | Capabilities, RBAC, environment isolation and secret leakage |
| Performance | Latency, concurrency and retry storms |

## 6.2 Mandatory synthetic journeys

Use stable fixtures:

- J1: adult general wellness; D3, Omega-3, Magnesium, B12 and C.
- J2: plant-based Omega-3 with algae preference.
- J3: atrial fibrillation + Apixaban + Omega-3.
- J4: existing Zinc 15 mg + requested Zinc 50 mg.
- J5: CKD + Magnesium.
- J6: exclude D3; retain CoQ10, collagen, Magnesium, Omega-3 and plant sterols.
- J7: high coverage then lower budget/pill constraint, then remove it.
- J8: child with deliberately high Zinc and Iron.

Each journey has frozen expected semantics, not necessarily frozen product IDs when catalogueVersion changes.

For J1, run the conversational variants:

- recommended balanced stack;
- lower-cost option, when materially distinct;
- lower-pill option, when materially distinct;
- select one returned option by optionId;
- refine the full request after changing a constraint;
- verify no more than three complete options and no dominated/cosmetic duplicate.

Run every journey with `destinationCountry=TH` and assert the Thailand retailer, THB and Thailand product set are derived. Add negative journeys for unsupported `SG` until Singapore is enabled, a product mapped only to another market, checkout-country mismatch, and backordered versus unavailable products.

## 6.3 Full DEV payment matrix

For every scenario assert:

- same frozen items;
- same frozen subtotal/currency;
- correct attempt status/reason;
- correct order/payment/version;
- correct retryable/nextAction;
- correct audit count;
- correct outbox count;
- correct OMS submissions;
- correct terminal checkout behavior.

Mandatory decline→retry:

~~~text
after decline
  found
  open
  unpaid
  declined / insufficient_funds
  version 1
  retryable true
  payment_confirmed count 0

after same-order success
  found
  completed
  paid
  succeeded
  version 2
  retryable false
  payment_confirmed count 1
  OMS_SUBMIT count 1
~~~

## 6.4 Browser matrix in DEV

- widths 320, 375, 768 and 1440;
- keyboard-only;
- visible focus;
- labels and inline errors;
- 200% zoom;
- contrast;
- reduced motion;
- automated WCAG scan;
- en, th and zh-CN;
- test payment methods;
- authorization reset when payment method changes;
- refresh/back/forward;
- decline/retry;
- processing;
- expiry;
- terminal checkout;
- support link.
- optional feedback invitation after the outcome, shown once and never blocking.

## 6.5 Cross-agent matrix

Run the complete golden journey through:

- ChatGPT adapter;
- Claude adapter;
- Grok adapter.

Record:

- discovery selection;
- number of tool calls;
- whether the smallest missing fact was requested;
- whether country correctly selected retailer/products/currency without agent input;
- whether option comparison and optionId selection were easy to explain;
- whether execute waited for approval;
- whether orderHandle survived the conversation;
- polling behavior;
- client-facing explanation quality;
- support continuation.
- optional feedback consent, submission and minimal receipt.

## 6.6 DEV score gate

DEV promotion requires:

- 100/100 = 10/10;
- no P0;
- no P1;
- all failed/untested points rerun;
- then one complete regression pack;
- full browser PASS;
- ChatGPT/Claude/Grok PASS;
- mock OMS round-trip PASS;
- TH market selection/backorder semantics PASS;
- option navigation and response-size budget PASS;
- optional feedback linkage/privacy PASS;
- performance budgets PASS;
- security proofs PASS.

The QA report records build, catalogue, guidance, availability and checkout identifiers.

---

## 7. CI/CD pipeline

### 7.1 Pull request

Run:

- formatting/lint;
- generated-contract drift;
- unit/property tests;
- database migration validation;
- contract snapshots;
- security scans;
- affected integration tests.

### 7.2 DEV deployment

Run:

- migration;
- smoke;
- full service integration;
- mock payment matrix;
- mock OMS;
- agentic journey suite;
- browser suite;
- security suite;
- performance suite on release candidate;
- score report.

### 7.3 Promotion artifact

Create one immutable artifact containing:

- commit/build ID;
- contract version;
- migration version;
- generated schema checksum;
- checkout build;
- supported adapter versions.

Environment configuration selects providers. Rebuilding for UAT is prohibited.

### 7.4 UAT deployment

Deploy only the DEV-approved artifact. Configure Stripe Test Mode and retailer UAT adapter. Public mock fixtures stay disabled.

Any source change invalidates DEV approval.

---

## 8. Environment configuration

### DEV

~~~text
ENVIRONMENT=dev
PAYMENT_PROVIDER=mock
ACTIVE_MARKETS=TH
TH_CURRENCY=THB
TH_RETAILER_ADAPTER=mock_thailand
PUBLIC_QA_FIXTURES=false
INTERNAL_QA_HARNESS=true
MCP_CONTINUATION=polling_only
USER_ACCOUNT_REQUIRED=false
~~~

### UAT

~~~text
ENVIRONMENT=uat
PAYMENT_PROVIDER=stripe_test
ACTIVE_MARKETS=TH
TH_CURRENCY=THB
TH_RETAILER_ADAPTER=<retailer_uat_adapter>
PUBLIC_QA_FIXTURES=false
INTERNAL_QA_HARNESS=false
MCP_CONTINUATION=polling_only
USER_ACCOUNT_REQUIRED=false
~~~

### Production

Defined only after UAT approval. Production never shares DEV/UAT keys, data, capabilities, fixtures or provider sessions.

Configuration must be validated at startup. An invalid combination fails startup, for example:

- mock payment outside DEV;
- live Stripe in DEV/UAT;
- internal QA harness outside DEV;
- missing environment-specific capability key;
- retailer production credentials outside production.

---

## 9. UAT development and test rule

UAT is an integration-verification environment, not the next development phase.

### 9.1 Before UAT

Required signed evidence:

- DEV 10/10 report;
- full regression report;
- security proof report;
- browser report;
- cross-agent report;
- performance report;
- mock OMS report;
- immutable artifact ID.

### 9.2 UAT work

Configure and verify:

- Stripe Test Mode credentials;
- provider webhook destination and signature secret;
- checkout hostname/origins;
- retailer UAT credentials;
- retailer SKU mappings;
- locale assets;
- observability/alerts.

### 9.3 UAT tests

1. info/build/snapshot check.
2. Golden J1 plan/execute smoke.
3. Open external checkout and verify Stripe Test Mode.
4. Fresh insufficient-funds decline.
5. Poll open/unpaid/version 1.
6. Retry the same checkout with Stripe success.
7. Poll completed/paid/version 2.
8. Verify exactly one confirmation and one OMS submission.
9. Fresh separate 3DS success order.
10. Poll and verify one paid transition.
11. Verify retailer UAT order creation and fulfilment readback.
12. Verify checkout terminal state and locale smoke.

### 9.4 UAT failure handling

- Configuration/mapping defect: fix configuration if no source change.
- Functional/source defect: stop UAT, fix in DEV, rerun full DEV gate, promote a new artifact.
- Payment correctness defect: P0/P1; stop all release activity.
- Retail duplicate/mismatch: P0/P1; stop all release activity.

---

## 10. Operational runbooks required

Before UAT, write:

- payment event rejected;
- duplicate event observed;
- paid order missing OMS submission;
- OMS submission retry/dead-letter;
- fulfilment stale;
- checkout expired;
- capability compromise/revocation;
- catalogue snapshot rollback;
- guidance-rule rollback;
- retailer outage;
- Stripe outage;
- support escalation;
- environment key rotation.

Every runbook identifies:

- alert;
- customer-visible effect;
- safe read-only checks;
- allowed operator action and RBAC role;
- idempotency considerations;
- rollback/recovery;
- audit evidence.

---

## 11. Code-review checklist

### Contract

- Does this change preserve exactly six public tools?
- Does additionalProperties remain false?
- Is the error reason machine-readable?
- Is the change vendor-neutral?
- Does every returned field help the next decision, explain material evidence or prove authoritative state?
- Are raw search, stock, retailer and diagnostic internals absent?

### Multi-user security

- Is exactly one capability selector accepted?
- Is human reference excluded from authorization?
- Are environment/tenant/principal/resource/action checked before data access?
- Can two resources be mutated in one request accidentally?
- Are capability values absent from logs?

### Plan correctness

- Does invalid input stop before search?
- Does complete-state refinement remove omitted constraints?
- Does every answer update canonical requestSnapshot?
- Is a full rematch forced when normalized state changes?
- Is search deterministic?
- Is option selection revision-scoped and limited to a returned optionId?
- Are there at most three materially different complete-stack options?

### Market and availability

- Does destination country select exactly one retailer, product scope and currency?
- Is TH the only active market until another market is explicitly configured and tested?
- Are in-stock and backorder both `orderable=true` without a score penalty?
- Can checkout address mismatch ever switch market silently? It must not.

### Payment/order

- Is the provider event bound by internal provider session?
- Are amount/currency/items verified?
- Are transition, audit and outbox atomic?
- Are duplicates idempotent?
- Is polling still the only host continuation?

### OMS

- Is createRetailOrder idempotent?
- Are retailer credentials tenant-scoped?
- Is sensitive health context excluded?
- Is fulfilment normalized into the parent order?

### Platform

- Is existing RBAC used?
- Is existing Task/outbox used?
- Is existing i18n used?
- Is MCP kept out of domain logic?

### Feedback

- Is submission optional, consented and write-only?
- Is it linked by reference to the exact plan revision/selected stack without duplicating them?
- Are text fields bounded and free of transcripts, capabilities and contact/payment data?
- Are retry, stale-revision, cross-principal and retention rules tested?

### Testing

- Is there a regression test for the bug/change?
- Are two-principal and concurrency cases included?
- Are latency and response-size effects measured?

---

## 12. Anti-churn rules

When a test fails:

1. classify the failure at the correct layer;
2. write the smallest reproducer;
3. fix that layer without changing public contract unless the contract is wrong;
4. add a regression test;
5. rerun affected journeys;
6. before promotion, rerun the complete pack.

Do not respond to a defect by:

- adding a seventh tool;
- adding another continuation mechanism;
- adding another resource identifier;
- bypassing capability authorization;
- storing duplicated plan state;
- moving domain logic into a host adapter;
- weakening idempotency;
- changing UAT without DEV regression;
- converting missing evidence into a pass;
- returning raw beam nodes, stock quantities or debug payloads to compensate for missing explanation.

---

## 13. Suggested pull-request sequence

1. Baseline tag and architecture decision records.
2. Contract 3.0.0, six schemas and generated types.
3. Business errors and i18n keys.
4. Capabilities, owner scopes and neutral lookup.
5. Idempotency and outbox foundation.
6. MarketResolver with TH/THB/Thailand retailer configuration.
7. Catalogue canonicalization, availability normalization and snapshots.
8. Product commercial/form/pill data quality.
9. Plan normalization, revision and option-selection model.
10. Typed answers and safety acknowledgement.
11. Deterministic beam search and conversational options.
12. Safety guidance engine.
13. info, plan and feedback MCP tools.
14. ChatGPT/Claude/Grok adapter manifests.
15. Order/execute transaction.
16. Merchant checkout.
17. Mock payment adapter and internal DEV harness.
18. Payment state machine and order polling.
19. Retail OMS port and Thailand mock adapter.
20. Retail UAT adapter.
21. Support create/reply and feedback persistence.
22. Built-in security/continuity proofs.
23. Full i18n and accessibility.
24. Performance and observability hardening.
25. DEV full QA 10/10.
26. Immutable promotion to UAT.
27. Stripe and retail UAT release-boundary verification.

Each PR must list the relevant specification sections and acceptance tests.

---

## 14. Final handover checklist

### Product

- Complete agentic flow from discovery to support.
- Client approval before execute.
- Honest coverage, trade-offs, safety and commercial facts.
- Country-derived retailer, products and currency.
- Recommended stack plus no more than two material alternatives.
- External checkout and polling-only continuation.
- Optional consented feedback.

### Multi-user

- Anonymous capability isolation.
- Two-principal proof.
- No enumeration.
- RBAC for internal roles.

### Correctness

- Deterministic plan.
- Complete-state refinement.
- Revision-scoped option selection.
- Exact idempotency.
- One paid transition.
- One retail order.
- Support idempotency.

### Integration

- Agentic module.
- RBAC module.
- Task/outbox module.
- i18n module.
- Retail OMS adapter.
- MarketResolver and Thailand market configuration.
- Feedback domain.
- ChatGPT, Claude and Grok adapters.

### Quality gates

- DEV 10/10.
- No P0/P1.
- Browser PASS.
- Performance PASS.
- Security PASS.
- OMS mock PASS.
- Immutable build.
- UAT Stripe decline→retry PASS.
- UAT 3DS PASS.
- UAT retailer order/fulfilment PASS.

---

## 15. Definition of success

The clean rebuild succeeds when an unfamiliar AI agent can:

1. discover why and when to use MattaNutra;
2. gather only material missing information;
3. create the client’s ideal supplement targets;
4. obtain a deterministic purchasable match;
5. derive the correct retailer, products and currency from the client’s country;
6. compare a recommendation with at most two materially different complete-stack options;
7. select an option or revise priorities and constraints without stale state;
8. explain coverage, gaps, price, pills, forms and safety facts without unnecessary data;
9. obtain explicit client approval;
10. create one frozen checkout;
11. let the client pay on MattaNutra;
12. learn the authoritative result only by polling;
13. report fulfilment from the retailer;
14. continue the relationship through idempotent support;
15. optionally record consented improvement feedback against the exact plan and stack;
16. do all of this for many isolated users through ChatGPT, Claude and Grok.

The build team should reach that result in DEV before connecting Stripe in UAT.
