# MattaNutra Agentic Commerce

## Clean-Rebuild Product and Technical Specification

**Target contract:** 3.0.0  
**Status:** Normative build specification  
**Starting point:** Application code reverted to before MCP development  
**Development rule:** Complete and score 10/10 in DEV before any UAT Stripe work  
**Primary environments:** DEV → UAT → Production  

---

## 1. Purpose

MattaNutra is an agent-first supplement commerce service. It participates in a three-way conversation:

1. the client explains goals, desired nutrients, constraints and relevant safety context;
2. the client’s AI agent manages the conversation and decides when MattaNutra is useful;
3. MattaNutra converts the agreed ideal supplement stack into an explainable, purchasable product basket and fulfils the resulting retail order.

The service is not a generic product-search endpoint and is not a medical-diagnosis service. It supplies:

- current catalogue and commercial facts;
- deterministic product matching;
- selected-product coverage and exposure;
- structured safety-review facts;
- alternatives and quantified trade-offs;
- a frozen external checkout after explicit approval;
- authoritative payment and fulfilment state through polling;
- order-linked support.

The clean rebuild must reach the agreed functionality directly, without reconstructing discarded intermediate designs.

## 2. Mandatory design principles

### 2.1 Keep the public surface small

The public MCP contract contains exactly five business tools:

1. info
2. plan
3. execute
4. order
5. support

No customer tool, payment-fixture tool, callback tool, resume-callback tool or host-specific business tool is exposed.

### 2.2 Polling is the only host-continuation mechanism

The host AI learns payment and order state only by calling order with the opaque orderHandle.

The product must not implement:

- host callbacks;
- signed events sent to an AI host;
- return-to-client URLs;
- push continuation;
- host webhooks;
- native embedded AI-host checkout;
- elicitation levels;
- a second continuation protocol.

Stripe may use its own server-to-server webhook internally to notify MattaNutra. That is payment-provider ingestion, not AI-host continuation. It must never contact, resume or identify an AI conversation. The AI still observes the result only by polling order.

### 2.3 External merchant checkout only

Checkout is hosted by MattaNutra. The AI presents the returned checkout URL to the client. The checkout page collects address, contact and payment details directly. Sensitive payment values never pass through MCP.

### 2.4 Anonymous shopping, secure multi-user isolation

Clients are not forced to create accounts. Every plan, order and support case is accessed through an opaque, unguessable capability handle.

Anonymous does not mean shared or unauthorised. Every capability is:

- environment-bound;
- tenant/principal-bound where a host principal exists;
- resource-bound;
- action-scoped;
- random and unguessable;
- stored as a hash;
- revocable;
- omitted from logs and analytics;
- never interchangeable with a human-readable reference.

The service must work concurrently for many users and many AI conversations without cross-user disclosure or mutation.

### 2.5 Deterministic and explainable

Identical normalized requests against the same catalogue, guidance and availability snapshots must produce structurally identical results, excluding declared opaque IDs and timestamps.

Every selected basket must expose:

- the optimization objective;
- binding requirements;
- product contributions;
- coverage and gaps;
- incidental nutrients;
- pill/form burden;
- total price and currency;
- alternatives where meaningful;
- reasons for differences;
- applicable safety guidance.

### 2.6 Agent autonomy with client control

The AI may choose and revise search priorities on the client’s behalf, but MattaNutra must not silently change the client’s stated hard constraints.

Every question returned by plan must have a typed answer that maps to canonical plan state. After an answer is accepted:

- the canonical request state changes;
- requestSnapshot shows the resolved value;
- the plan is fully rematched;
- the change is explained;
- stale answers cannot affect a newer revision.

### 2.7 Reuse platform architecture

MCP is an adapter and orchestration layer over existing platform modules. It must respect:

- **Agentic architecture:** MCP registration, discovery, orchestration and agent-facing response shaping.
- **RBAC architecture:** internal staff, service accounts, QA operators, retail operations and support permissions.
- **Task architecture:** durable payment ingestion, expiry, OMS submission, fulfilment synchronization and retries.
- **i18n architecture:** locale negotiation, translation keys, checkout copy, support copy and error wording.

No MCP-specific duplicate implementation of authentication, task queues, localization or retail operations is permitted.

### 2.8 Retail order-management integration is core

A paid MattaNutra order must flow into the configured retail order-management system through an adapter. Fulfilment changes must flow back into the MattaNutra order read model and become visible through order polling.

### 2.9 Environment discipline

- DEV uses deterministic mock payment and mock/sandbox OMS adapters.
- DEV must reach 100/100 and have no open P0/P1 before UAT begins.
- UAT uses Stripe Test Mode and the retailer’s UAT/sandbox OMS connection.
- Functional development does not continue in UAT.
- Any functional code change made after the DEV gate sends the build back to DEV for the complete pack.
- Production is outside the initial build gate and is not tested from DEV/UAT fixtures.

---

## 3. Non-goals

The first release does not include:

- mandatory client accounts;
- a customer-history/listing tool;
- subscriptions or recurring replenishment;
- marketplace basket editing inside the AI host;
- AI-host-specific payment sheets;
- medical diagnosis or prescriptive medical advice;
- host push notifications;
- arbitrary agent-authored SQL/search expressions;
- direct MCP access to payment-provider events;
- direct MCP access to internal OMS credentials or IDs;
- production-visible QA fixtures;
- a feedback tool; feedback may be added later only after the five-tool contract is stable.

---

## 4. System context

~~~mermaid
flowchart LR
    C[Client] <--> H[ChatGPT / Claude / Grok agent]
    H <--> M[MCP Agentic Adapter]
    M --> P[Plan Domain]
    M --> O[Order Domain]
    M --> S[Support Domain]
    P --> CAT[Catalogue + Availability]
    P --> SAFE[Guidance Rules]
    O --> CO[MattaNutra Checkout]
    CO --> PAY[Payment Adapter]
    PAY --> T[Task / Outbox]
    T --> O
    T --> OMS[Retail OMS Adapter]
    OMS --> T
    T --> O
    RBAC[Platform RBAC] --> M
    RBAC --> T
    I18N[Platform i18n] --> M
    I18N --> CO
    I18N --> S
~~~

### 4.1 Responsibility boundaries

| Component | Owns | Must not own |
|---|---|---|
| Agentic/MCP adapter | Discovery, tool schemas, orchestration, response shaping, host adapters | Matching algorithm, payment truth, RBAC implementation, translations |
| Plan domain | Normalization, deterministic search, revisions, questions, guidance binding | Checkout, payment, OMS submission |
| Order domain | Frozen basket, order/payment/fulfilment state, order capability | Card details, AI-host callbacks |
| Checkout | Delivery/contact capture, shipping/tax calculation, provider session | Agent continuation |
| Payment adapter | Provider session and verified provider events | Order selection from public references |
| Task module | Durable processing, retries, outbox, expiry, OMS synchronization | User-facing business authorization |
| Retail OMS adapter | SKU/order mapping, submit, fulfilment/refund synchronization | Agent schemas |
| RBAC | Staff/service authorization and tenant scopes | Anonymous capability encoding |
| i18n | Translation keys and rendered client copy | Business-state decisions |

---

## 5. Actors, tenancy and authorization

### 5.1 Actors

| Actor | Authentication | Allowed actions |
|---|---|---|
| Anonymous client through AI | Opaque capability handles | Read/refine its plan, execute approved plan, poll its order, support its order |
| Host integration | Platform agentic principal or configured connector identity | Invoke public tools; cannot bypass capabilities |
| Support operator | RBAC role SUPPORT_AGENT | View assigned permitted cases; reply; no payment mutation |
| Retail operator | RBAC role RETAIL_OPERATOR | View/order fulfilment operations within tenant |
| QA operator | RBAC role QA_OPERATOR; DEV only | Drive isolated mock scenarios through internal test harness |
| Payment worker | Service role PAYMENT_WORKER | Apply verified provider events to one bound order |
| OMS worker | Service role OMS_WORKER | Submit/read OMS orders idempotently |
| Platform admin | RBAC role PLATFORM_ADMIN | Configuration and emergency operations; fully audited |

### 5.2 Multi-user invariants

1. A capability authorizes exactly one resource.
2. A request accepts exactly one resource selector.
3. Human references such as ord_… and tkt_… are never authorization.
4. A planHandle cannot read an order.
5. An orderHandle cannot revise a plan.
6. A supportHandle must be bound to the same order capability and owner scope.
7. A handle from DEV, UAT or production is invalid in every other environment.
8. Modified, expired or revoked handles return the same neutral not_found result.
9. One principal cannot enumerate another principal’s plans, orders or cases.
10. Capability values, checkout access values and provider secrets never appear in logs, traces, metrics or support messages.

### 5.3 Capability format

Implementation may use a random bearer token or sealed token, but the public value must have at least 192 bits of entropy. The database stores only a keyed hash plus:

- resourceType;
- resourceId;
- environment;
- tenantScope;
- principalScope when available;
- allowedActions;
- issuedAt;
- expiresAt when applicable;
- revokedAt;
- keyVersion.

Checkout access is a separate short-lived order-bound capability. It is never accepted by MCP tools.

---

## 6. Public MCP contract

### 6.1 Endpoint and version

- Remote endpoint: /api/mcp
- Transport: the platform-supported remote MCP transport
- Contract version: 3.0.0
- JSON-RPC errors are reserved for protocol/transport failure.
- Business validation errors are returned as structured tool results.

### 6.2 Exact server instructions

The initialize response must include this meaning, localized only where the MCP host supports localized discovery:

> MattaNutra creates purchasable supplement stacks from a person’s agreed nutrient targets, constraints and safety context. Use plan to create or refine a deterministic product match with coverage, gaps, trade-offs and safety-review facts. Use execute only after the person explicitly approves a ready plan revision. Execute creates one external MattaNutra checkout. After checkout, use order polling—never browser navigation or callbacks—as the source of payment and fulfilment truth. Use support only for an existing order. MattaNutra supplies product and safety facts; it does not diagnose or replace qualified clinical advice.

### 6.3 Exact tool descriptions

#### info

> Check MattaNutra availability, supported destinations, currencies, locales, catalogue concepts and the purchasing flow before planning. This tool does not create or change a plan, checkout, order or support case.

#### plan

> Create or refine a purchasable supplement stack from the person’s agreed targets, profile, current supplements, medication/condition context, dietary requirements, budget, pill/form limits and optimization priority. Omit planHandle to create; include planHandle and expectedRevision to submit the complete desired state for a revision. This tool never purchases.

#### execute

> Freeze exactly one explicitly approved ready plan revision and create one external MattaNutra checkout. Send only planHandle, expectedRevision and a stable idempotencyKey. Do not call for needs_input or blocked plans, and do not rebuild or send product IDs.

#### order

> Read authoritative payment and fulfilment state using only the opaque orderHandle returned by execute. Poll no faster than pollAfterSeconds, keep one call in flight, and stop at a terminal state. Browser state and human order references are not payment proof.

#### support

> Create or reply to support for an existing order using its orderHandle. Omit supportHandle to create a case; include it to reply to that case. Do not use this tool for planning, payment polling or general health advice.

### 6.4 Common error object

Every business error returns:

~~~json
{
  "ok": false,
  "error": {
    "category": "INVALID_ARGUMENT",
    "reasonCode": "unsupported_unit",
    "fieldPath": "request.targets[0].unit",
    "messageKey": "mcp.errors.unsupported_unit",
    "message": "Vitamin D3 does not accept unit g. Use IU, mcg or mg.",
    "retryable": false
  }
}
~~~

Required reason codes include:

- positive_number_required
- duplicate_supplement
- unsupported_unit
- legacy_id
- required
- unsupported_country
- unsupported_currency
- unexpected_property
- revision_conflict
- idempotency_conflict
- not_found
- plan_not_ready
- availability_changed
- checkout_expired
- rate_limited
- temporarily_unavailable

The reasonCode is not embedded only in prose.

---

## 7. Tool schemas

The schemas below are normative at the business-contract level. The generated MCP JSON Schema must set additionalProperties=false for every object unless explicitly stated.

### 7.1 info

#### Input

~~~json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "locale": {
      "type": "string",
      "description": "Optional BCP 47 response locale."
    }
  }
}
~~~

#### Structured output

~~~json
{
  "ok": true,
  "serviceName": "MattaNutra",
  "environment": "dev",
  "contractVersion": "3.0.0",
  "serviceVersion": "3.0.0",
  "buildId": "immutable-build-id",
  "catalogueVersion": "immutable-catalogue-snapshot",
  "guidanceRulesVersion": "immutable-guidance-version",
  "availabilityAsOf": "2026-08-20T00:00:00Z",
  "checkoutBuild": "immutable-checkout-build",
  "authenticationMode": "anonymous_capability_handles",
  "checkoutMode": "external_merchant_hosted",
  "continuation": "polling_only",
  "coreFlow": "plan -> execute -> external checkout -> order polling",
  "userAccountRequired": false,
  "pollAfterSeconds": 3,
  "supportedLocales": ["en", "th", "zh-CN"],
  "supportedCountries": [
    {
      "countryCode": "TH",
      "countryName": "Thailand",
      "currency": "THB"
    }
  ],
  "supplements": [
    {
      "supplementId": "sup_...",
      "name": "Vitamin D3",
      "aliases": ["Vitamin D", "D3"],
      "acceptedUnits": ["IU", "mcg", "mg"]
    }
  ],
  "supportAvailable": true
}
~~~

No QA mutation control appears in info.

### 7.2 plan

#### Input

~~~json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["idempotencyKey", "request"],
  "properties": {
    "idempotencyKey": {
      "type": "string",
      "minLength": 16,
      "maxLength": 128
    },
    "planHandle": {
      "type": "string",
      "minLength": 32
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 1
    },
    "request": {
      "$ref": "#/$defs/PlanRequest"
    }
  },
  "$defs": {
    "PlanRequest": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "locale",
        "currency",
        "destinationCountry",
        "optimization",
        "profile",
        "requirements",
        "targets"
      ],
      "properties": {
        "locale": {
          "type": "string"
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        },
        "destinationCountry": {
          "type": "string",
          "pattern": "^[A-Z]{2}$"
        },
        "optimization": {
          "enum": ["balanced", "best_coverage", "lowest_cost", "fewest_pills"]
        },
        "profile": {
          "type": "object",
          "additionalProperties": false,
          "required": ["ageYears", "sex", "lifeStage"],
          "properties": {
            "ageYears": {"type": "integer", "minimum": 0, "maximum": 120},
            "sex": {
              "enum": ["female", "male", "unspecified"]
            },
            "lifeStage": {
              "enum": ["adult", "child", "pregnant", "breastfeeding", "trying_to_conceive"]
            },
            "goals": {
              "type": "array",
              "uniqueItems": true,
              "items": {"type": "string", "maxLength": 80}
            }
          }
        },
        "targets": {
          "type": "array",
          "minItems": 1,
          "maxItems": 30,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "supplementId", "amount", "unit"],
            "properties": {
              "name": {"type": "string", "minLength": 1},
              "supplementId": {"type": "string", "pattern": "^sup_"},
              "amount": {"type": "number", "exclusiveMinimum": 0},
              "unit": {
                "enum": ["mcg", "mg", "g", "IU", "CFU", "ml", "serving"]
              }
            }
          }
        },
        "currentSupplements": {
          "type": "array",
          "maxItems": 50,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "supplementId", "dailyAmount", "unit"],
            "properties": {
              "name": {"type": "string"},
              "supplementId": {"type": "string", "pattern": "^sup_"},
              "dailyAmount": {"type": "number", "exclusiveMinimum": 0},
              "unit": {
                "enum": ["mcg", "mg", "g", "IU", "CFU", "ml", "serving"]
              }
            }
          }
        },
        "medicationCodes": {
          "type": "array",
          "uniqueItems": true,
          "items": {"type": "string"}
        },
        "conditionCodes": {
          "type": "array",
          "uniqueItems": true,
          "items": {"type": "string"}
        },
        "requirements": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "dietaryPreference": {
              "enum": ["any", "plant_based"]
            },
            "omega3SourcePreference": {
              "enum": ["any", "algae_only", "fish_allowed"]
            },
            "excludeSupplementIds": {
              "type": "array",
              "uniqueItems": true,
              "items": {"type": "string", "pattern": "^sup_"}
            },
            "retainSupplementIds": {
              "type": "array",
              "uniqueItems": true,
              "items": {"type": "string", "pattern": "^sup_"}
            },
            "retainProductIds": {
              "type": "array",
              "uniqueItems": true,
              "items": {"type": "string", "pattern": "^prd_"}
            },
            "allowedForms": {
              "type": "array",
              "uniqueItems": true,
              "items": {
                "enum": [
                  "capsule",
                  "softgel",
                  "tablet",
                  "powder",
                  "liquid",
                  "gummy",
                  "sachet",
                  "other"
                ]
              }
            },
            "maxPriceMinor": {
              "type": "integer",
              "minimum": 0
            },
            "maxDailyPills": {
              "type": "number",
              "minimum": 0
            },
            "maxProductCount": {
              "type": "integer",
              "minimum": 1,
              "maximum": 30
            }
          }
        },
        "answers": {
          "type": "array",
          "uniqueItems": true,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["questionId", "choice"],
            "properties": {
              "questionId": {"type": "string"},
              "choice": {"type": "string"}
            }
          }
        },
        "safetyAcknowledgement": {
          "type": "object",
          "additionalProperties": false,
          "required": ["revision", "guidanceIds", "confirmed"],
          "properties": {
            "revision": {"type": "integer", "minimum": 1},
            "guidanceIds": {
              "type": "array",
              "minItems": 1,
              "uniqueItems": true,
              "items": {"type": "string"}
            },
            "confirmed": {"const": true}
          }
        }
      }
    }
  }
}
~~~

Creation requires no planHandle or expectedRevision. Refinement requires both. A refinement is the complete desired state, not a patch.

#### Structured output

The output contains:

- ok=true;
- planHandle;
- revision;
- status: ready, needs_input or blocked;
- requestSnapshot containing the resolved canonical state;
- summary;
- basket;
- coverage;
- safetyGuidance;
- questions;
- alternatives;
- appliedRequirements;
- unmetRequirements;
- assumptions;
- optimizationEvidence;
- changeSummary;
- catalogueVersion, guidanceRulesVersion and availabilityAsOf.

Each basket item must include:

- productId;
- retailerSku;
- sellerId and seller display name;
- product name;
- quantity;
- form;
- dailyPills;
- unitPriceMinor;
- lineTotalMinor;
- currency;
- stockStatus;
- availabilityAsOf;
- deliveryWindow when qualified;
- contributionSupplementIds;
- incompleteCommercialFacts.

Each coverage row must include:

- supplementId and name;
- requestedAmount;
- deliveredAmount from selected products only;
- currentAmount;
- totalExposureAmount;
- unit;
- coveragePercent;
- status: covered, partial, uncovered, over_target or upper_limit_risk;
- upperLimitAmount and percentOfUpperLimit when applicable.

Each safety guidance item must include:

- guidanceId;
- code;
- severity;
- action;
- messageKey;
- message;
- supplementIds;
- productIds;
- exposure and threshold values where relevant;
- rulesVersion.

### 7.3 execute

#### Input

~~~json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["planHandle", "expectedRevision", "idempotencyKey"],
  "properties": {
    "planHandle": {"type": "string", "minLength": 32},
    "expectedRevision": {"type": "integer", "minimum": 1},
    "idempotencyKey": {
      "type": "string",
      "minLength": 16,
      "maxLength": 128
    }
  }
}
~~~

#### Structured output

~~~json
{
  "ok": true,
  "orderHandle": "opaque-capability",
  "orderReference": "ord_...",
  "orderStatus": "open",
  "paymentStatus": "unpaid",
  "stateVersion": 1,
  "checkoutUrl": "https://merchant.example/checkout?...",
  "checkoutExpiresAt": "2026-08-20T12:15:00Z",
  "pollAfterSeconds": 3,
  "frozenPlan": {
    "planRevision": 3,
    "catalogueVersion": "snapshot",
    "availabilityAsOf": "timestamp",
    "items": [],
    "coveragePercent": 100,
    "dailyPills": 4,
    "totalPriceMinor": 293500,
    "currency": "THB",
    "safetyGuidanceIds": []
  }
}
~~~

Execute never accepts product IDs, an order reference, address or payment data.

### 7.4 order

#### Input

~~~json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["orderHandle"],
  "properties": {
    "orderHandle": {"type": "string", "minLength": 32}
  }
}
~~~

#### Structured output

~~~json
{
  "ok": true,
  "lookupStatus": "found",
  "orderReference": "ord_...",
  "orderStatus": "open",
  "paymentStatus": "unpaid",
  "latestPaymentAttempt": "declined",
  "latestPaymentReason": "insufficient_funds",
  "stateVersion": 1,
  "retryable": true,
  "nextAction": "open_checkout",
  "messageKey": "order.payment_declined_retry",
  "message": "Payment was declined. The same checkout can be retried.",
  "pollAfterSeconds": 3,
  "checkoutUrl": "https://merchant.example/checkout?...",
  "checkoutExpiresAt": "timestamp",
  "frozenOrder": {
    "items": [],
    "subtotalMinor": 293500,
    "shippingMinor": null,
    "taxMinor": null,
    "totalPriceMinor": 293500,
    "currency": "THB",
    "safetyGuidanceIds": []
  },
  "receipt": null,
  "fulfilment": {
    "status": "not_started",
    "deliveryWindow": null,
    "tracking": []
  }
}
~~~

Neutral lookup:

~~~json
{
  "ok": true,
  "lookupStatus": "not_found",
  "nextAction": "none",
  "messageKey": "order.not_found",
  "message": "Order not found."
}
~~~

### 7.5 support

#### Input

~~~json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["orderHandle", "idempotencyKey", "message"],
  "properties": {
    "orderHandle": {"type": "string", "minLength": 32},
    "supportHandle": {"type": "string", "minLength": 32},
    "idempotencyKey": {
      "type": "string",
      "minLength": 16,
      "maxLength": 128
    },
    "message": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4000
    }
  }
}
~~~

#### Structured output

~~~json
{
  "ok": true,
  "status": "open",
  "caseReference": "tkt_...",
  "supportHandle": "opaque-capability",
  "messageId": "msg_...",
  "createdAt": "timestamp",
  "responseExpectationKey": "support.acknowledgement",
  "responseExpectation": "Your message is recorded. The case is open and has not yet been reviewed."
}
~~~

Exact create and reply retries must return the original case/message. Changed payload with the same key returns idempotency_conflict.

---

## 8. Plan domain

### 8.1 Canonicalization order

Validation and normalization occur before search:

1. reject unexpected properties;
2. validate required fields;
3. reject zero/negative amounts;
4. resolve canonical supplement IDs and aliases;
5. reject legacy IDs;
6. reject duplicate supplement concepts;
7. validate unit against that supplement’s acceptedUnits;
8. validate country/currency pairing;
9. normalize medication and condition aliases;
10. reduce typed answers into canonical state;
11. validate retained/excluded contradictions;
12. bind or invalidate safety acknowledgement;
13. compute normalized request hash;
14. search.

An invalid request never produces a priced basket.

### 8.2 Complete-state refinement

Plan refinement is replacement semantics:

- request contains the entire desired current state;
- omission of an optional constraint removes it;
- any normalized change forces a complete rematch;
- the previous basket is not a search seed unless retainedProductIds explicitly requires it;
- changeSummary compares old and new results;
- revision increments exactly once on a committed valid refinement;
- stale revisions fail before work or persistence.

### 8.3 Questions and answers

Questions are returned only when a material unknown or client choice changes the result.

Every question has:

- stable questionId scoped to plan revision;
- promptKey and localized prompt;
- typed choices;
- effect metadata showing which canonical fields each choice changes.

Examples:

- Allow algae-only search → requirements.omega3SourcePreference=algae_only
- Relax plant-based → requirements.dietaryPreference=any
- Accept uncovered target → explicit acceptedGap for that supplement
- Proceed after safety review → safetyAcknowledgement bound to revision and guidance IDs

An answer that cannot change canonical state must not be offered.

### 8.4 Ready-state rule

A plan is ready only when:

- every hard requirement is satisfied;
- every selected product has sufficient product and commercial facts;
- no invalid unit/input exists;
- no blocking guidance exists;
- every required client choice has been resolved;
- any accepted gap is explicit and revision-bound;
- no stale safety acknowledgement is used.

A plan may be ready below 100% coverage only when the client explicitly accepts the named gaps. A 0% plan is never ready.

---

## 9. Matching and optimization

### 9.1 Product eligibility

A product contributes only when:

- current catalogue version includes it;
- retailer SKU mapping is valid;
- seller is eligible for destination;
- stock/availability policy permits it;
- dietary source and form meet hard constraints;
- it is not excluded;
- nutrient contribution facts have known units and serving basis;
- audience restrictions do not make it invalid;
- price and currency are current;
- daily serving/pill facts are complete for pill optimization.

Rejected or unavailable products contribute zero coverage, exposure and safety flags.

### 9.2 Nutrient hierarchy

The catalogue owns an explicit nutrient graph. Parent and child facts are never double counted. For example:

- EPA and DHA may contribute to Omega-3 according to a versioned rule;
- Omega-3 does not contribute back into both EPA and DHA;
- algae-only selection requires dietarySource and omega-source facts, not product-name guessing.

### 9.3 Deterministic search

The engine uses precomputed product contribution vectors plus deterministic filtering and beam/branch search.

Hard constraints are applied before scoring. Tie-break order is stable:

1. objective score;
2. fewer unmet targets;
3. lower safety burden;
4. lower price;
5. fewer daily pills;
6. fewer products;
7. lexical productId order.

No random seed, database row order or wall-clock time may affect ranking.

### 9.4 Optimization modes

- **best_coverage:** maximize weighted coverage, then minimize price, pills and product count.
- **lowest_cost:** satisfy explicit minimum/accepted coverage first, then minimize subtotal.
- **fewest_pills:** satisfy explicit minimum/accepted coverage first, then minimize counted daily pills.
- **balanced:** deterministic weighted combination of coverage, price, pill burden and product count.

If all modes legitimately select the same basket, the response states that no materially better alternative exists. It does not fabricate a difference.

### 9.5 Search efficiency

Required performance:

- info p95 ≤ 300 ms from cache;
- order p95 ≤ 500 ms;
- support p95 ≤ 1 second excluding external operator work;
- execute p95 ≤ 1.5 seconds excluding checkout-provider session latency; hard limit 5 seconds;
- plan p95 ≤ 5 seconds; p99 ≤ 10 seconds;
- no successful plan call exceeds 15 seconds.

The implementation must:

- load immutable snapshots once per worker;
- precompute normalized product/nutrient vectors;
- index by destination, dietary source, form and supplement;
- bound beam width and candidate count;
- cache identical normalized request hashes by snapshot;
- persist only final search evidence, not every intermediate node;
- expose stage timing metrics.

---

## 10. Safety and client autonomy

Safety output is factual decision support, not diagnosis.

### 10.1 Required guidance classes

- medication_interaction
- condition_review_required
- dose_review_required
- pediatric_review_required
- audience_mismatch
- duplicate_or_overlap

### 10.2 Exposure semantics

The contract distinguishes:

- requestedAmount;
- deliveredAmount from selected products;
- currentAmount declared by the client;
- totalExposureAmount = deliveredAmount + currentAmount;
- upperLimitAmount when a versioned rule applies;
- percentOfUpperLimit.

Thresholds are evaluated against totalExposureAmount, not merely requestedAmount.

### 10.3 Guidance behavior

- Guidance never silently removes a requested nutrient.
- High guidance normally produces needs_input.
- The client may remove the nutrient, seek qualified review or explicitly acknowledge and proceed where policy permits.
- Acknowledgement is bound to plan revision and exact guidance IDs.
- Any basket or exposure change invalidates acknowledgement.
- Guidance IDs freeze into execute and the order.
- Blocking guidance cannot be acknowledged.

---

## 11. Order, checkout and payment

### 11.1 Order state

Order states:

- open
- completed
- cancelled
- expired

Payment states:

- unpaid
- processing
- paid
- refunded
- partially_refunded

Fulfilment states:

- not_started
- processing
- shipped
- delivered
- cancelled

### 11.2 Execute transaction

Execute performs one database transaction:

1. resolve plan capability;
2. authorize owner/environment;
3. lock current plan revision;
4. require status=ready;
5. verify expectedRevision;
6. revalidate availability and retailer SKU mapping;
7. verify the idempotency record;
8. freeze plan snapshot and guidance IDs;
9. create one open/unpaid/stateVersion-1 order;
10. create order capability and short-lived checkout access;
11. commit;
12. create provider checkout session if required;
13. return only after order is readable.

If provider session creation fails, the order remains recoverable and no duplicate order is created on exact retry.

### 11.3 Checkout

The checkout shows:

- MattaNutra/retailer identity;
- UAT/test indication outside production;
- order reference;
- frozen products, quantities and subtotal;
- delivery/contact fields;
- shipping, tax and grand total before payment;
- payment methods;
- AI-agent authorization acknowledgement;
- honest processing, decline, 3DS, expiry and success wording.

The checkout cannot edit the product basket. Terminal orders never reopen a usable payment form.

### 11.4 Payment invariants

1. The browser is never payment truth.
2. Provider events bind to one internal providerSessionId and one internal orderId.
3. Public orderReference and MCP orderHandle do not select provider-event targets.
4. Provider signature and environment are verified before persistence.
5. providerEventId has a unique database constraint.
6. A successful payment transition is conditional on order=open and payment not already paid.
7. State advances 1→2 exactly once for the initial paid transition.
8. One payment_confirmed audit and one OMS submission intent are created in the same transaction.
9. Duplicate events return the existing result without a new transition, audit or task.
10. Items, amount and currency are compared to the frozen payable snapshot before paid.
11. Mismatch leaves the order unpaid and raises an operations alert.
12. Decline leaves order open/unpaid/version 1 and retryable.
13. Same-order retry preserves items, amount and currency.
14. Expiry makes the order terminal and invalidates checkout.
15. Refund transitions preserve the original receipt and expose refund totals.

### 11.5 DEV payment fixtures

DEV uses MockPaymentAdapter. Fixtures are not public MCP tools.

The internal QA harness:

- is available only in DEV;
- requires QA_OPERATOR/service authentication;
- accepts exactly one orderHandle;
- resolves one order before any write;
- rejects modified, foreign-environment or terminal handles;
- drives the same order-domain transition service as Stripe events;
- supports success, decline, retry success, 3DS required/cancel/fail/success, processing, unavailable, mismatch, duplicate, expiry, refund and partial refund;
- records deterministic fixture IDs;
- cannot exist in UAT/production routing.

### 11.6 Polling

The agent:

1. retains orderHandle in conversation state;
2. waits pollAfterSeconds;
3. calls order;
4. keeps one call in flight;
5. repeats only while nextAction=poll or open processing state requires it;
6. stops at completed, cancelled, expired, refunded or partially refunded;
7. treats temporary read failure as unknown and retries after bounded delay;
8. reports payment confirmed only from paymentStatus=paid.

No other host continuation is implemented.

---

## 12. Retail OMS integration

### 12.1 Adapter contract

Each retailer implements one adapter with:

- validateAvailability(frozenItems, destination)
- calculateDeliveryOptions(items, address)
- createRetailOrder(command, idempotencyKey)
- getRetailOrderStatus(retailOrderReference)
- cancelRetailOrder(command, idempotencyKey)
- getRefundStatus(retailOrderReference)

The domain uses internal productId; adapters map to retailerSku.

### 12.2 Submission sequence

1. Execute validates stock and SKU mapping.
2. Checkout collects final address and calculates shipping/tax.
3. Verified payment commits the MattaNutra paid state and an OMS_SUBMIT outbox record atomically.
4. Task worker reads the outbox and calls createRetailOrder with orderReference as the stable idempotency key.
5. Adapter returns retailer reference and per-line mapping.
6. Worker records the result and advances fulfilment to processing.
7. Scheduled/task-driven synchronization reads shipment, cancellation and refund state.
8. order polling returns the normalized fulfilment state.

### 12.3 OMS invariants

- A payment retry cannot create a second retail order.
- A task retry cannot create a second retail order.
- Retailer failure never changes payment truth.
- An OMS submission failure is visible as fulfilment delayed/contact_support, not unpaid.
- Retail credentials and raw payloads are never returned through MCP.
- Address is encrypted and limited to checkout/retail fulfilment services.
- Multiple retailer child orders remain one MattaNutra parent order to the agent.

---

## 13. Platform integration

### 13.1 Agentic

Use the platform’s MCP server registry, tracing, connector identity and tool execution middleware. Host-specific adapters contain transport/manifest mapping only.

Required adapter packages:

- ChatGPT/OpenAI adapter
- Claude/Anthropic adapter
- Grok/xAI adapter

They must call the same five business services and expose identical schemas. No vendor-specific field enters the domain model.

### 13.2 RBAC

Reuse the platform policy engine. Required permissions:

- mattanutra.qa.fixture.execute
- mattanutra.support.case.read
- mattanutra.support.case.reply
- mattanutra.order.read
- mattanutra.order.manage
- mattanutra.retail.submit
- mattanutra.configuration.manage

Public MCP capability authorization is checked in addition to host/service identity, never replaced by RBAC.

### 13.3 Task

Use the platform task/outbox framework for:

- payment-provider event application;
- checkout expiry;
- OMS submission;
- OMS status synchronization;
- refunds;
- support acknowledgement;
- dead-letter recovery;
- alerting.

Every handler is idempotent and carries environment, tenant, orderId and correlationId.

### 13.4 i18n

Use platform locale negotiation and translation catalogues.

Required first locales:

- en
- th
- zh-CN

All client-visible strings use messageKey plus rendered text. Business codes remain language-neutral. Checkout, errors, questions, guidance, order messages and support acknowledgements must have translations and fallback tests.

---

## 14. Persistence and transactions

Minimum entities:

- Plan
- PlanRevision
- Capability
- IdempotencyRecord
- Order
- OrderItem
- PaymentAttempt
- ProviderEvent
- PaymentAudit
- CheckoutSession
- RetailOrderLink
- FulfilmentEvent
- SupportCase
- SupportMessage
- OutboxEvent

Required unique constraints:

- idempotency scope + key;
- provider + providerEventId;
- orderId + initial payment_confirmed audit type;
- orderId + retailer adapter;
- support create scope + key;
- support reply scope + key;
- capabilityHash;
- planId + revision.

State transition, audit and outbox creation must share a transaction.

---

## 15. Idempotency

Every mutation accepts a client-generated stable idempotency key except provider events, which use providerEventId.

An idempotency record stores:

- operation;
- owner/environment scope;
- key;
- canonical request hash;
- committed resource IDs;
- complete stored response;
- createdAt and expiry policy.

Rules:

- identical scope/key/hash returns the stored response;
- same scope/key with a different hash returns idempotency_conflict;
- concurrent identical calls result in one mutation;
- failures before commit do not consume the key unless a recoverable resource was created and recorded;
- support create and reply have different operation scopes.

---

## 16. Security and privacy

Mandatory:

- TLS everywhere;
- secrets from platform secret management;
- capability hashes at rest;
- encrypted checkout address/contact;
- CSP and secure iframe policy for checkout;
- provider signature verification;
- environment-specific keys;
- strict input size/rate limits;
- no secrets in logs;
- neutral not_found;
- audited RBAC operations;
- dependency and SAST scanning;
- replay protection;
- checkout-access expiry;
- data-retention schedule;
- least-privilege OMS credentials.

Medical/safety context is retained only as needed for the plan/order relationship and is not sent to the retailer unless operationally necessary and explicitly defined. Retail fulfilment normally receives products, quantities, delivery/contact data and commercial totals—not the client’s goals, medications or conditions.

---

## 17. Observability

Every operation carries:

- correlationId;
- environment;
- tenant/principal scope identifier;
- planReference/orderReference/supportReference where available;
- buildId;
- catalogueVersion;
- guidanceRulesVersion.

Never include capability values.

Required metrics:

- tool latency and errors;
- plan normalization/search/cache timing;
- determinism failures;
- plan revision conflicts;
- execute create/replay/conflict;
- order polling rate and overlap violations;
- provider events received/applied/deduplicated/rejected;
- duplicate payment_confirmed prevention;
- OMS submission/retry/dead-letter;
- support create/reply idempotency;
- unauthorized capability attempts;
- cross-order mismatch attempts;
- checkout conversion and expiry.

Required alerts:

- any cross-order selector mismatch;
- duplicate order or retail order;
- more than one initial payment confirmation;
- paid amount/currency/item mismatch;
- paid order without OMS outbox;
- unauthorized access spike;
- provider signature failure;
- stale catalogue/availability snapshot;
- plan p95/p99 budget breach.

---

## 18. Cross-agent portability

Contract-test the same journey in ChatGPT, Claude and Grok:

discover → plan → refine → approve → execute → external checkout → poll order → support

Acceptance rules:

- the same five tools and JSON shapes;
- no host-specific business field;
- no callback assumption;
- no host-specific checkout;
- no reliance on hidden conversation IDs;
- the agent can retain opaque handles;
- the agent can explain questions, trade-offs and safety facts;
- the agent confirms purchase before execute;
- the agent reports payment only from order polling.

Adapter code may translate manifest/transport conventions but must not fork business behavior.

---

## 19. Acceptance and release gates

### 19.1 DEV gate — mandatory before UAT

DEV must score 100/100 on the complete agentic QA pack, including:

- discovery/adoption;
- complete and missing-detail conversations;
- canonical validation;
- J1–J8;
- determinism;
- all search priorities;
- block/unblock/reblock;
- constraint add/change/remove;
- safety acknowledgement;
- plan and execute idempotency;
- two-principal isolation;
- checkout presentation;
- full mock payment matrix;
- polling;
- refunds;
- support idempotency;
- retail OMS stub integration;
- i18n;
- ChatGPT/Claude/Grok contract tests;
- performance budgets;
- security tests;
- full browser matrix.

No open P0 or P1. Required built-in proofs pass with non-empty evidence and current snapshot IDs.

### 19.2 UAT gate

Only the DEV-approved immutable build is promoted.

UAT configures:

- Stripe Test Mode;
- UAT checkout hostname;
- retailer UAT/sandbox OMS;
- UAT secrets;
- fixtures disabled from public routing.

Run:

1. environment/build/snapshot verification;
2. one golden smoke journey;
3. Stripe insufficient-funds decline→same-order success;
4. successful Stripe 3DS on a separate order;
5. payment duplicate/event audit verification;
6. OMS UAT submission and fulfilment readback;
7. checkout browser smoke in supported locales.

If any functional code changes, return to DEV and repeat the full 100/100 pack.

### 19.3 UAT Stripe invariants

Decline:

- same order handle;
- found/open/unpaid;
- latest attempt declined/insufficient_funds;
- version 1;
- retryable;
- zero payment_confirmed.

Same-order success:

- one order;
- completed/paid;
- version 2 once;
- exactly one payment_confirmed;
- unchanged frozen items, amount and currency;
- browser confirms only after commit;
- agent observes through polling.

3DS:

- separate fresh order;
- authentication challenge shown;
- remains unpaid while incomplete;
- success bound to the same order;
- one paid transition and one confirmation;
- agent observes through polling.

---

## 20. Definition of done

The clean rebuild is complete only when:

- the five-tool contract is stable and documented;
- multi-user capability isolation passes;
- all client choices round-trip into canonical state;
- matching facts are complete enough for every optimization mode;
- safety facts and acknowledgements are revision-bound;
- execute freezes one approved plan and is idempotent;
- checkout is merchant-hosted;
- polling is the only host continuation;
- payment invariants pass;
- the paid order reaches retail OMS exactly once;
- fulfilment returns through order polling;
- support create/reply are idempotent;
- Agentic, RBAC, Task and i18n integrations are used rather than duplicated;
- ChatGPT, Claude and Grok pass the same contract;
- DEV scores 10/10 before UAT;
- UAT Stripe and OMS connectivity pass on the unchanged build.

---

## 21. Explicit “do not build” list

To prevent renewed churn, do not add:

- another public MCP tool without an approved contract change;
- orderId as an authorization input;
- more than one resource selector in a mutation;
- public payment fixtures;
- callbacks or return-to-client infrastructure;
- host-specific continuation;
- embedded AI-host checkout;
- a second plan state model;
- patch semantics for plan refinement;
- free-text answers that do not map to canonical state;
- MCP-owned RBAC, task queues or translation catalogues;
- payment or OMS business logic in host adapters;
- UAT-only functional fixes that bypass the DEV gate.

