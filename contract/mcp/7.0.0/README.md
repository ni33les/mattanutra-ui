# MattaNutra client interaction guide 7.0.0

Help the customer explore and refine a supplement basket in their own words. Use info first, agree provisional nutrient targets, then plan(create). Do not require a health questionnaire, exact food labels or missing quantities merely to explore. Ask a question only when its answer materially changes the next decision; use already disclosed context. Present the closest_dose recommendation, important advice and the existing option identified by compactDecision.highlightedAlternativeOptionId together. The pointer never invents another basket. Explain per-target gaps, product quantities, comparable goods prices and pill uncertainty. advice.kind distinguishes dose_review, interaction, overlap, incomplete_information and product_data; overlap alone is not a reference breach. An incomplete pill preferenceAssessment.actualLowerBound means at least that many; the total remains unknown. Health limits, interactions, unknown intake and incomplete coverage are advice, never purchase blocks or mandatory acknowledgements. Ready means technically purchasable, never medically approved. Read operationalDecision for the next action. If it says review_options, a nonempty purchase choice exists even when the closest recommendation is empty. When continued intake covers the targets, finish naturally with no_purchase or replenish_later: purchaseRequiredNow=false and highlightedAlternativeOptionId=null. Optional purchases remain possible if the customer asks; do not direct them to buy merely to complete the conversation. Use returned option IDs and the current revision. Refine with requestPatch to preserve targets, medications and constraints; a productDoses proposal evaluates quantities before selection. Targets default to basis=total_daily (quantified diet plus continued supplements plus new products); set basis=supplemental for continued supplements plus new products only. Unknown diet stays unknown and never establishes zero. There is no default product count limit. maxProductCount, maxDailyPills and maxPriceMinor are advisory preferences, including explicit zero: never exclude or block purchase because of them. Explain a deviation above 20% prominently; any positive amount above a zero preference is prominent. Unknown actual amounts stay unknown. Never silently substitute products or relax a customer constraint. Confirm the exact current basket with the customer before execute, open its external checkout, then track or recover through order(orderHandle). A processing response means durable work was admitted; poll the existing planHandle and respect pollAfterSeconds. The last committed revision is preserved while refinement is pending. Do not submit a separate match during processing. Omitted searchEffort on a revision preserves the previous effort, including expanded. Retry interrupted mutations with the same idempotency key, expectedRevision and unchanged payload; dependency or worker failures do not erase the last good plan. Poll at pollAfterSeconds or slower; polling is the only continuation method. Use only the six short tool names: info, plan, execute, order, support, feedback; never prefix a server name. Supporting sources, evidence, claim IDs and uncertainty are returned in plan response fields. Ordinary info({locale}) includes these essentials and copyable operation examples. For clients with current schemas, info(view=client_guide) returns the guide and info(view=plan_schema,planOperation=create|get|revise|answer|select) returns that operation schema. Native MCP clients may also use resources/read. Responsibility boundaries follow responsibility-4.0.0.

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

Quantities are daily labelled servings, not packs purchased. Product administration supplies route, physical unit, units per serving, measurable increment, pack quantity and verification. Unknown metadata is unknown: do not infer capsules, split a capsule, parse a title as pack size or invent alternate-day schedules. Invalid proposals return a precise field error; revise the quantity or remove the proposal. Labels and reference limits remain serious advice, not hidden quantity ceilings. Symmetric proportional underdose/overdose penalties and the additional 2× applicable safety-limit excess penalty remain visible in doseFit. Acceptable ranges use their stated units and must contain the target; withinAgreedRange is separate from fully met. Required/core targets take default priority; optional targets stay in coverage.

Known, estimated and unknown intake remain distinct. Never turn missing intake into zero or a repetitive diet into a deficiency. Each coverage row separates currentAmount, deliveredAmount, total quantified exposure, remainingGap and excess. Coverage counts every requested target, including unresolved and optional ones; four fully met out of five is 80%. Excess cannot cover a different missing target. Savings require equivalent coverage, time period and delivery costs; explain when unavailable.

searchEffort is an operation envelope field, not a customer basket limit. Standard search permits 8000 attempts, expanded 64000; read searchSummary.complete and canExpand. Repeated identical inputs reuse work; exhausted expanded search calls for an explicit refinement, not another identical retry. A revised plan gets a new revision; option IDs may change with products or quantities. Get current state after stale_revision, reapply intent and use only newly returned identifiers. Vitamin K2 aliases resolve while nutrient forms and units remain distinct. Algae Omega-3 resolves to Omega-3 only with explicit algae_only. Original wording and source preferences are preserved separately. If the source is omitted or conflicts with the name, explain the ambiguity without blocking other targets; dietary requirements remain independently binding.

## Plan operations

- create: a full request and new stable idempotencyKey; no purchase occurs.
- get: current plan by handle; processing uses pollAfterSeconds. No revision change.
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

Examples use response placeholders for opaque handles, IDs, revisions and returned answers. The scripted client substitutes these from prior responses; no internal catalogue or database access is needed.

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
      }
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
      }
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
      }
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
      }
    }
  }
}
```

### get-current-or-processing

```json
{
  "method": "tools/call",
  "params": {
    "name": "plan",
    "arguments": {
      "operation": "get",
      "planHandle": "cap_replace_with_plan_handle_from_create"
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
      }
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
      }
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
      ]
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
      "optionId": "opt_replace_with_current_optionId"
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
      "orderHandle": "cap_replace_with_order_handle_from_execute"
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
      }
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
      }
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
      }
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
      "requestPatch": {}
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
      "requestPatch": {}
    }
  }
}
```
