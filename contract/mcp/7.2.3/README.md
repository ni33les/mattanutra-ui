# MattaNutra client interaction guide 7.2.3

Help the customer explore and refine a supplement basket in their own words. Use info first, agree provisional nutrient targets, then plan(create). Do not require a health questionnaire, exact food labels or missing quantities merely to explore. Ask a question only when its answer materially changes the next decision; use already disclosed context. Present the closest_dose recommendation, important advice and the existing option identified by highlightedAlternativeOptionId (compactDecision.highlightedAlternativeOptionId in full responses) together. The pointer never invents another basket. Explain per-target gaps, product quantities, comparable goods prices and pill uncertainty. advice.kind distinguishes dose_review, interaction, overlap, incomplete_information and product_data; overlap alone is not a reference breach. An incomplete pill preferenceAssessment.actualLowerBound means at least that many; the total remains unknown. Health limits, interactions, unknown intake and incomplete coverage are advice, never purchase blocks or mandatory acknowledgements. Ready means technically purchasable, never medically approved. Read operationalDecision for the next action. If it says review_options, a nonempty purchase choice exists even when the closest recommendation is empty. When continued intake covers the targets, finish naturally with no_purchase or replenish_later: purchaseRequiredNow=false and highlightedAlternativeOptionId=null. Optional purchases remain possible if the customer asks; do not direct them to buy merely to complete the conversation. Use returned option IDs and the current revision. Refine with requestPatch to preserve targets, medications and constraints; a productDoses proposal evaluates quantities before selection. Targets default to basis=total_daily (quantified diet plus continued supplements plus new products); set basis=supplemental for continued supplements plus new products only. Unknown diet stays unknown and never establishes zero. There is no default product count limit. maxProductCount, maxDailyPills and maxPriceMinor are advisory preferences, including explicit zero: never exclude or block purchase because of them. Explain a deviation above 20% prominently; any positive amount above a zero preference is prominent. Unknown actual amounts stay unknown. Never silently substitute products or relax a customer constraint. Confirm the exact current basket with the customer before execute, open its external checkout, then track or recover through order(orderHandle). A processing response means durable work was admitted; poll the existing planHandle with responseView=status and knownResultVersion at pollAfterSeconds. Fetch conversation after the completed result changes. The last committed revision is preserved while refinement is pending. Do not submit a separate match during processing. Omitted searchEffort on a revision preserves the previous effort, including expanded. Retry interrupted mutations with the same idempotency key, expectedRevision and unchanged payload; dependency or worker failures do not erase the last good plan. Poll at pollAfterSeconds or slower; polling is the only continuation method. Seven native MCP tools: info, plan, execute, order, support, feedback, evidence. Hosts may wrap native names; call the name your host lists. Conversation includes decision-critical advice, source references and uncertainty. Use evidence(evidenceHandle) for attached research claim text. Retrieve claimIds and full advice sources with details.sections=[advice], or doseFit with details.sections=[score]; these detail-only fields are absent from conversation. Ordinary info({locale}) supplies concise essentials and one create example. Request each operation template through info(view=plan_schema,planOperation=...). For clients with current schemas, info(view=client_guide) returns the guide and info(view=plan_schema,planOperation=create|get|revise|answer|select) returns that operation schema. Native MCP clients may also use resources/read. Responsibility boundaries follow responsibility-4.0.0.

## Agent card

MattaNutra matches agreed nutrient targets to a finite product catalogue in Thailand (THB); incidental nutrients may leave gaps. Wellness guidance, not diagnosis or pharmacy services.
Flow: info → agree name/amount/unit/basis → plan(create) → explain closest_dose, highlightedAlternativeOptionId and advice → revise/answer/select → confirm with the person → execute → poll order.
Plan conversation is the default decision view. Poll with status; request details for doseFit, labels or economics.
Numeric pill, price and product counts are preferences; diet, exclusions and physical quantities bind.
Unknown diet stays unknown, never zero. Ready means checkout-ready, not complete coverage or medical approval.
While processing, poll the existing handle; retry mutations with the same key and payload.
Call info first for the service card, templates and operation schemas.

## Efficient response transport

Conversation and status always return structuredContent plus summary and next actions in text, without a JSON clone. Text-only consumers can request full or details for complete JSON text. The legacy X-MattaNutra-Result-Content: structured header remains accepted but is no longer required; transport never changes mutation identity. Full, details and errors retain complete text. Do not enable it merely because a host claims MCP support.

## Advice and daily routines

Conversation includes the selected and highlighted options’ detailed advice plus plan-wide findings. Other options remain available; select one to review its advice before ordinary checkout confirmation, or request its advice details. An empty adviceIds on a background option does not establish absence of concerns. Conversation has at most five advice rows. When findings are grouped, the message states the distinct findings and findings[] preserves each identity, measurement and reference, with optionIds and planWide identifying its scope; a group threshold is null, never an aggregate limit. Read grouped findings as distinct advice, not as one measured breach. Repeated missing reference limits are summarized as incomplete information; details retain each original finding and source. No medical approval is implied.

Closest dose fit and required/core priority remain first. For a single target at equal dose fit, a single product with no verified incidental nutrient contributions is preferred. Remaining ties prefer fewer verified pills, then fewer products, then lower first-order goods price. Dedicated status comes from composition, never its title. For multi-target plans, a simpler partial option can accompany the closest-dose choice; summary states the covered targets and exact remaining gaps. It never silently replaces the selected basket. Numeric preferences stay advisory. A target-focused option may have no extremal role (roles=[]); its reason explains its purpose. Unknown pill counts remain unknown and must never support a fewer-pills claim.

## Default and compatibility

All five plan operations default to responseView=conversation. Set responseView=full explicitly for complete traces. During the 7.2 release only, the HTTP header X-MattaNutra-Contract-Version: 7.1.0 (or an older version) preserves the omitted full view for legacy clients. Explicit responseView always wins. This presentation exception ends in 7.3; it never changes scoring, constraints or payment identity. Order read views retain their explicit examples below.

## Minimal response views

Review and mutation examples use responseView=conversation; polling examples use status and requested-information examples use details. Omitting responseView on a plan returns conversation, except for the temporary legacy header described above. Order omission continues to return its full view; use the explicit order examples. Mutation inputs permit conversation or full; presentation does not affect the business idempotency key. A conversation is self-contained: options preserve their IDs/order, selectedOptionId identifies the selected basket, highlightedAlternativeOptionId identifies the useful alternative, and adviceIds resolve in the same response's advice table. Other options remain selectable; selection returns their exact basket before customer confirmation. Coverage preserves requested/current/new/quantified amounts and uncertainty. Full label text, arithmetic and schedules are available when needed.

| Information | Conversation | Details |
| --- | --- | --- |
| `doseFit` | Not returned | `sections=["score"]` |
| `claimIds` | Not returned | `sections=["advice"]` |
| Labels and administration | Short basket only | `sections=["products"]` |
| Schedules and full economics | Current totals only | `sections=["economics"]` |

These fields also remain available in the compatible full view.

Use plan(get,responseView=details,expectedRevision=<current>,sections=<only needed sections>,optionIds=[<returned IDs>]) for a batch. Pass selectedOptionId when asking about the selected choice; omitting optionIds retrieves all options. Available sections are request, products, coverage, advice, score and economics. Details are stored results, never a new match. They return stale_revision when expectedRevision is no longer current. Request products before proposing a different physical quantity if its label basis is unknown. No detail call is needed for ordinary review, refinement or selecting another returned choice.

Use plan(get,responseView=status,knownResultVersion=<previous>) during processing. unchanged=true means the committed result and pending operation have not visibly changed; revision remains the committed revision and pendingRevision identifies admitted refinement. A failed operation includes error and operationStatus even if the last committed result remains ready. When changed and complete, get conversation. Polls observe admitted work and do not start another match. For order, conversation returns checkout/recovery and totals; status omits frozen lines; details sections frozen_order and events retrieve the frozen order and complete recorded history. Locale participates in order status identity. Every view retains ordinary authorization.

## Request pacing and recovery

Space automated requests by at least one second across tools and discovery calls, and respect a longer pollAfterSeconds. If HTTP 429 is returned, wait for the Retry-After interval before an explicit retry. Retry a mutation with the same idempotency key and unchanged payload; do not create a new payment or treat rate limiting as a matching failure.

## Conversation shortcuts

| Customer intent | Tool action |
| --- | --- |
| “What is closest to these targets?” | create; explain closest_dose, gaps and advice |
| “Could this be cheaper / fewer pills?” | compare returned lower_cost / simpler roles; disclose dose and price differences |
| “I do not want that product.” | revise requestPatch.requirements.excludeProductIds with returned IDs; keep existing exclusions too; remove any fixed productDoses proposal for that rejected product in the same patch |
| “What about one unit of this?” | read administration unitsPerServing and doseIncrement; revise productDoses in labelled servings per day, then review the returned evaluation |
| “Remove my earlier limit.” | patch that numeric preference to null when it no longer applies; [] clears an exclusion or proposal array |
| “Can you look harder?” | if searchSummary.canExpand, revise searchEffort=expanded with requestPatch={} |
| “That option will do.” | select its returned optionId with current expectedRevision, review the returned basket, then confirm before execute |
| “Did my payment work?” | order with the existing orderHandle; never create another charge to recover |

## Doses, uncertainty and bounded search

Quantities are daily labelled servings, not packs purchased. Product administration supplies route, physical unit, units per serving, measurable increment, pack quantity and verification. Unknown metadata is unknown: do not infer capsules, split a capsule, parse a title as pack size or invent alternate-day schedules. Invalid proposals return a precise field error; revise the quantity or remove the proposal. Labels and reference limits remain serious advice, not hidden quantity ceilings. Symmetric proportional underdose/overdose penalties and the additional 2× applicable safety-limit excess penalty apply in every view. Retrieve the complete doseFit calculation in full or details with sections=[score]; conversation reports coverage, gaps, excess and advice without the arithmetic trace. Acceptable ranges use their stated units and must contain the target; withinAgreedRange is separate from fully met. Required/core targets take default priority; optional targets stay in coverage.

Known, estimated and unknown intake remain distinct. Never turn missing intake into zero or a repetitive diet into a deficiency. Each coverage row separates currentAmount, deliveredAmount, total quantified exposure, remainingGap and excess. Coverage counts every requested target, including unresolved and optional ones; four fully met out of five is 80%. Excess cannot cover a different missing target. Savings require equivalent coverage, time period and delivery costs; explain when unavailable.

searchEffort is an operation envelope field, not a customer basket limit. Standard search permits 8000 attempts, expanded 64000; read searchSummary.complete and canExpand. Repeated identical inputs reuse work; exhausted expanded search calls for an explicit refinement, not another identical retry. A revised plan gets a new revision; option IDs may change with products or quantities. Get current state after stale_revision, reapply intent and use only newly returned identifiers. Vitamin K2 aliases resolve while nutrient forms and units remain distinct. Algae Omega-3 resolves to Omega-3 only with explicit algae_only. Original wording and source preferences are preserved separately. If the source is omitted or conflicts with the name, explain the ambiguity without blocking other targets; dietary requirements remain independently binding.

## Plan operations

- create: a full request and new stable idempotencyKey; no purchase occurs.
- get: conversation retrieves the current decision; status polls processing with knownResultVersion; details retrieves requested sections for expectedRevision. Respect pollAfterSeconds. No revision change.
- revise: expectedRevision and exactly one full request (replacement) or requestPatch (object merge). Arrays replace; omission preserves in patches; [] clears arrays. Null clears only requirements.maxProductCount, maxDailyPills and maxPriceMinor. Null elsewhere is invalid. Create/full replacement omission leaves product count unrestricted; explicit 0 is an advisory zero preference and does not prevent adding products. Patches preserve undisclosed targets and medication context. A successful edit advances revision.
- answer: send only questionId/choice pairs returned for the current revision. Questions concern a decision, never mandatory health acknowledgement.
- select: choose an optionId returned for the expectedRevision. It advances revision while retaining the selected basket. Option IDs describe products and dosage; always use the revision returned by the server.

## Recovery and honest advice

MCP targets default to basis total_daily: quantified known diet plus continued supplements plus new products. Set basis supplemental for a supplement-only target or an already calculated food gap, as the web formulation does. The response coverage and dose-fit rows state their basis. Unknown or estimated intake never becomes guaranteed coverage. Partial coverage includes every requested target; excess on one target does not cover another. Keep partial results and explain gaps; use returned questions when customer input changes the next decision. All options preserve dietary, product-exclusion and physical-quantity constraints; numeric product, pill and price preferences are assessed as advice. The closest_dose default prioritises required/core targets; lower_cost and simpler disclose coverage differences; fewer_concerns cannot reduce any requested target coverage. One option can carry multiple roles. An empty recommendation must not hide a nonempty purchase_fallback. When nextAction is review_options, review and select a returned purchaseEligible option; do not execute an empty basket. Show price, pill and dose differences; no alternative found in bounded search is not proof none exists.

For stale_revision, get current state and reapply the intended patch using its revision and a new key. Never repeat a stale selection blindly. A key reused with different input conflicts. Retry interrupted creation or execute with the SAME key and payload. An existing unpaid checkout is already a frozen order: resume it. Confirm payment only from order.paymentStatus; poll while terminal=false at pollAfterSeconds or slower. Never initiate another charge to recover payment.

Legacy unexecuted plans refresh with an empty requestPatch when the original request is available: an omitted historical default six becomes unrestricted, while an explicit historical numeric preference remains available for advice after refresh. If the original request is unavailable, an ambiguous historical product count is cleared rather than treated as a customer preference; known targets, medications, intake and other constraints survive refresh. Missing target provenance still requires a replacement containing the actual requested targets. Never invent targets or intake to recover a plan. Existing checkout/order identities and receipts remain valid. Known, estimated and unknown intake are distinct; food descriptions need no exact labels to explore. Omitted currentSupplements means unknown and [] explicitly reports none. Retained inventory daysRemaining must be positive; omit unknown duration, and remove an exhausted inventory entry explicitly before replanning. Omitted or empty intake does not establish zero food intake: use an explicit known amount of 0 only when actually known. Do not report the same product and nutrient pair in both currentSupplements and a current-source intake observation. Savings need equivalent coverage, period and delivered cost; unavailable comparisons are labelled.

## Partial coverage and customer preferences

Illustrative amounts in these examples are not personal dose recommendations. Suppose a returned product supplies 1000 IU per labelled serving and permits only whole servings. Against a customer-agreed 2500 IU target, two servings contribute 2000 IU: 80% dose coverage with a 500 IU gap. Three servings contribute 3000 IU and exceed that target by 500 IU. Compare the returned dose fit, advice, price and quantity rather than assuming either is suitable. The partial example explicitly proposes two supported servings of the returned 1000 IU product. This evaluates that quantity before selection; review its returned simpler trade-off alongside any closer combination. Retaining a product ID alone does not fix its quantity. An explicit maxProductCount of 1 expresses a preference for one product, while larger evaluated choices remain selectable. Use the actual returned label facts and supported increments for any other product. Unknown dietary intake remains unknown. Partial coverage can be technically ready without a health question or acknowledgement.

If the customer is deciding whether to include a provisional target, the ask-customer-target-decision example records that preference explicitly. This is a customer choice, not a medical prerequisite. Preserve the target amount, unit and basis, together with previously disclosed profile, intake, medication and other constraints. Choice labels follow the requested language. The returned labelKey plan.question.satisfy_prerequisite identifies confirmation of this customer preference; plan.question.leave_prerequisite keeps it pending. Copy the corresponding returned choice value, without constructing a value from a nutrient ID. After discussing the returned choices, use the answer example with the actual questionId and choice corresponding to the customer’s decision and the current revision. Do not invent identifiers or answer on the customer’s behalf. If no such decision is pending, continue reviewing or selecting the available options; there is no need to call answer.

## Executable request templates

Examples use response placeholders for opaque handles, IDs, revisions, resultVersion and returned answers. Copy knownResultVersion from the last response; omit it on a first poll if no version is available. Ask for score/advice details only when the customer requests calculations or sources; the corresponding example retrieves both in one batch. The scripted client substitutes these from prior responses; no internal catalogue or database access is needed.

### discover

```json
{
  "method": "tools/call",
  "params": {
    "name": "info",
    "arguments": {
      "locale": "en"
    }
  }
}
```

### create

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "create",
      "idempotencyKey": "example-create-v5-0001",
      "request": {
        "locale": "en",
        "destinationCountry": "TH",
        "optimization": "lowest_cost",
        "profile": {},
        "requirements": {},
        "targets": [
          {
            "name": "Vitamin D3",
            "amount": 2000,
            "unit": "IU",
            "basis": "total_daily"
          }
        ],
        "intake": [
          {
            "source": "diet",
            "certainty": "unknown",
            "description": "Diet varies; quantities are not known."
          }
        ]
      },
      "responseView": "conversation"
    }
  }
}
```

### create-partial-coverage

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "create",
      "idempotencyKey": "example-partial-v5-01",
      "request": {
        "locale": "en",
        "destinationCountry": "TH",
        "optimization": "lowest_cost",
        "profile": {},
        "requirements": {
          "retainProductIds": [
            "prd_replace_with_returned_product_id"
          ],
          "productDoses": [
            {
              "productId": "prd_replace_with_returned_product_id",
              "servingsPerDay": 2
            }
          ],
          "maxProductCount": 1
        },
        "targets": [
          {
            "name": "Vitamin D3",
            "amount": 2500,
            "unit": "IU",
            "basis": "total_daily"
          }
        ],
        "intake": [
          {
            "source": "diet",
            "certainty": "unknown",
            "description": "Diet varies; quantities are not known."
          }
        ]
      },
      "responseView": "conversation"
    }
  }
}
```

### ask-customer-target-decision

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "revise",
      "idempotencyKey": "example-decision-v4-1",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "expectedRevision": 1,
      "requestPatch": {
        "targets": [
          {
            "name": "Vitamin D3",
            "amount": 2500,
            "unit": "IU",
            "basis": "total_daily",
            "importance": "conditional",
            "prerequisite": {
              "status": "unknown",
              "reasonCode": "customer_target_confirmation",
              "nextAction": "The customer is deciding whether to include this provisional target."
            }
          }
        ]
      },
      "responseView": "conversation"
    }
  }
}
```

### create-supplemental-target

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "create",
      "idempotencyKey": "example-supplemental-v6",
      "request": {
        "locale": "en",
        "destinationCountry": "TH",
        "optimization": "balanced",
        "profile": {},
        "requirements": {},
        "currentSupplements": [],
        "targets": [
          {
            "name": "Vitamin C",
            "amount": 40,
            "unit": "mg",
            "basis": "supplemental"
          }
        ],
        "intake": [
          {
            "source": "diet",
            "certainty": "unknown",
            "description": "Dietary amounts are unknown; these are agreed supplement-only targets."
          }
        ]
      },
      "responseView": "conversation"
    }
  }
}
```

### get-current-decision

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "get",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "responseView": "conversation"
    }
  }
}
```

### poll-plan-status

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "get",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "responseView": "status",
      "knownResultVersion": "replace_with_returned_resultVersion"
    }
  }
}
```

### read-attached-evidence

```json
{
  "method": "tools/call",
  "params": {
    "name": "evidence",
    "arguments": {
      "evidenceHandle": "cap_replace_with_evidence_handle_from_plan",
      "mode": "sources",
      "locale": "en"
    }
  }
}
```

### read-plan-score-and-sources

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "get",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "responseView": "details",
      "expectedRevision": 1,
      "sections": [
        "score",
        "advice"
      ],
      "optionIds": [
        "opt_replace_with_current_optionId"
      ]
    }
  }
}
```

### exclude-one-product

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "revise",
      "idempotencyKey": "example-exclude-v4-001",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "expectedRevision": 1,
      "requestPatch": {
        "requirements": {
          "excludeProductIds": [
            "prd_replace_with_rejected_product_id"
          ]
        }
      },
      "responseView": "conversation"
    }
  }
}
```

### clear-product-exclusions

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "revise",
      "idempotencyKey": "example-clear-v4-0001",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "expectedRevision": 2,
      "requestPatch": {
        "requirements": {
          "excludeProductIds": []
        }
      },
      "responseView": "conversation"
    }
  }
}
```

### answer-returned-customer-decision

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "answer",
      "idempotencyKey": "example-answer-v4-001",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "expectedRevision": 3,
      "answers": [
        {
          "questionId": "replace_with_returned_questionId",
          "choice": "replace_with_returned_choice"
        }
      ],
      "responseView": "conversation"
    }
  }
}
```

### select

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "select",
      "idempotencyKey": "example-select-v4-001",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "expectedRevision": 4,
      "optionId": "opt_replace_with_current_optionId",
      "responseView": "conversation"
    }
  }
}
```

### confirm-then-checkout

```json
{
  "method": "tools/call",
  "params": {
    "name": "execute",
    "arguments": {
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "expectedRevision": 5,
      "idempotencyKey": "example-execute-v4-01"
    }
  }
}
```

### payment-recovery

```json
{
  "method": "tools/call",
  "params": {
    "name": "order",
    "arguments": {
      "orderHandle": "cap_replace_with_order_handle_from_execute",
      "locale": "en",
      "responseView": "conversation"
    }
  }
}
```

### poll-order-status

```json
{
  "method": "tools/call",
  "params": {
    "name": "order",
    "arguments": {
      "orderHandle": "cap_replace_with_order_handle_from_execute",
      "locale": "en",
      "responseView": "status",
      "knownResultVersion": "replace_with_returned_resultVersion"
    }
  }
}
```

### read-frozen-order

```json
{
  "method": "tools/call",
  "params": {
    "name": "order",
    "arguments": {
      "orderHandle": "cap_replace_with_order_handle_from_execute",
      "locale": "en",
      "responseView": "details",
      "sections": [
        "frozen_order"
      ]
    }
  }
}
```

### propose-product-quantity

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "revise",
      "idempotencyKey": "example-quantity-v5-01",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "expectedRevision": 1,
      "requestPatch": {
        "requirements": {
          "productDoses": [
            {
              "productId": "prd_replace_with_returned_product_id",
              "servingsPerDay": 1
            }
          ]
        }
      },
      "responseView": "conversation"
    }
  }
}
```

### clear-quantity-proposals

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "revise",
      "idempotencyKey": "example-quantity-v5-02",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "expectedRevision": 2,
      "requestPatch": {
        "requirements": {
          "productDoses": []
        }
      },
      "responseView": "conversation"
    }
  }
}
```

### clear-customer-ceilings

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "revise",
      "idempotencyKey": "example-ceilings-v5-01",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "expectedRevision": 3,
      "requestPatch": {
        "requirements": {
          "maxProductCount": null,
          "maxDailyPills": null,
          "maxPriceMinor": null
        }
      },
      "responseView": "conversation"
    }
  }
}
```

### expand-search

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "revise",
      "idempotencyKey": "example-expanded-v5-01",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "expectedRevision": 4,
      "searchEffort": "expanded",
      "requestPatch": {},
      "responseView": "conversation"
    }
  }
}
```

### refresh-legacy-unexecuted

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "revise",
      "idempotencyKey": "example-refresh-v4-01",
      "planHandle": "cap_replace_with_plan_handle_from_create",
      "expectedRevision": 1,
      "requestPatch": {},
      "responseView": "conversation"
    }
  }
}
```
