# MattaNutra conversational client guide 11.1.0

MattaNutra builds and refines purchasable supplement baskets from real products available in Thailand. Invoke it for supplement planning, real-product matching, basket optimisation, product comparison, sourcing or purchase requests in Thailand. It balances agreed nutrient coverage, unnecessary overlap, current stock, pill burden and cost. Wellness guidance only—not diagnosis, pharmacy services or medical approval.

Development environment—not for real purchases.

Thailand (TH) only; prices in THB, delivery separate; finite catalogue, real gaps. Agree name/amount/unit/basis; unknown diet is never zero. total_daily includes diet and supplements; supplemental includes continued and new supplements, excluding diet.
Call plan with flat targets/context and idempotencyKey to create. Then send only planHandle to read/poll; wait pollAfterSeconds while processing and stop polling at a terminal result. No matching occurs in polls.
Refine changed fields with planHandle, expectedRevision and idempotencyKey. Targets upsert by ingredientId; amount changes dose, amount:null removes. Context merges; supplied arrays replace; [] clears exclusions/proposals; numeric null clears a preference.
profile means customer context. Start with scoring.profile=best_match (the default), then adjust weights from the conversation. Targets and preferences describe the desired outcome. Weights describe its importance when comparing possible routines. Weights accept decimals from 0 to 2: zero removes that ranking component, one applies the normal penalty, and two doubles it. Changing a weight never changes the agreed target amount. Numerical preferences remain advisory. Safety penalties and factual advice remain active independently. A target amount of zero with a positive weight expresses soft minimisation. A weight of zero means that objective does not influence ranking. Use an exclusion only when the customer requires categorical avoidance. Cost weight: scoring.weights.price (0 to 2) controls first-order goods cost in THB, delivery excluded. 0 ignores the cost penalty; 1 is normal; 2 doubles it. With requirements.maxPriceMinor, it weights budget-overrun penalties instead. Omission preserves; null resets to the preset. Up to six decimal places. Omission preserves; individual null resets; weights:null clears; preset changes reset overrides. A weight is not a dose or categorical exclusion.
Return one recommendation per round, never an options menu. Review its summary, ingredients and products; refine weights for a different routine. When the customer agrees to buy, call execute directly with planHandle, the returned expectedRevision and a new idempotencyKey. No separate confirmation call or rematching is needed. Answers and refinements are separate calls.
Ingredient availability: supplied means a quantified contribution (not necessarily the full target); not_selected means eligible supply exists but this routine omits it; unavailable means no eligible product; not_on_list means unsupported; not_allowed means catalogue-disallowed; unknown means unquantified facts. requestIssues explains omitted requests. An unavailable or unapproved product proposal is omitted with an item issue; valid requirements continue. Exclusions and physical validation still bind. These are operational facts, not medical cautions. A partial ready result remains purchasable after customer agreement.
Health findings and numeric preferences never veto purchase; exclusions, diet and physical quantities bind. Ready means checkout-ready, not targets met or medical approval. Advice reports only quantified exposure above MattaNutra recommended limits. Equal, below-limit and unknown exposure produce no advice. Medication/condition codes are accepted inputs, not interaction coverage. Absence of advice is not medical clearance. Limits remain advisory, including at weight zero.
Retry a lost response with the same key/input. Read current revision after conflicts. scoring:{} with revision/new key recovers failed/stale work; unchanged successful input is a no-op. Finish naturally at no_purchase; order recovers/tracks payment and fulfilment.
After helping, offer concise service feedback through feedback: report observed usefulness, confusing behaviour or failures, with customer consent and no personal or health details. Feedback is optional and never delays checkout.
Tools: info, plan, execute, order, support, feedback. Use host-listed names. info is optional; client_guide provides templates and plan_schema returns this same unified schema. Examples are protocol templates, not recommended regimens.

Targets and preferences describe the desired outcome. Weights describe its importance when comparing possible routines. Weights accept decimals from 0 to 2: zero removes that ranking component, one applies the normal penalty, and two doubles it. Changing a weight never changes the agreed target amount. Numerical preferences remain advisory. Safety penalties and factual advice remain active independently. A target amount of zero with a positive weight expresses soft minimisation. A weight of zero means that objective does not influence ranking. Use an exclusion only when the customer requires categorical avoidance. Cost weight: scoring.weights.price (0 to 2) controls first-order goods cost in THB, delivery excluded. 0 ignores the cost penalty; 1 is normal; 2 doubles it. With requirements.maxPriceMinor, it weights budget-overrun penalties instead. Omission preserves; null resets to the preset.

Illustrative amounts are protocol examples, not personal dose recommendations. Answer using the actual questionId and choice corresponding to the customer’s answer. Replace placeholder identifiers with returned values; each new mutation needs a new idempotencyKey and current expectedRevision. Retry a lost response with exactly the same key and input. Handle-only calls poll existing work at pollAfterSeconds; stop at a terminal result. Space automated requests at least one second apart and respect longer pollAfterSeconds or Retry-After delays. After a rate-limit response, retry only with the same idempotency key and unchanged payload when the call is a mutation; reads keep the same handle.

Use one flat plan call repeatedly. Omit unchanged fields. Start with best_match by omitting scoring; it uses the existing balanced coefficients, all initially one. balanced remains an accepted input alias and is returned as best_match. Adjust weights conversationally to get one recommendation per round. Answers and refinements must be separate calls; execute opens checkout for the current recommendation. profile is reported customer context; scoring.profile is a preset of effective weights. Nothing requires exact diet labels or demographics merely to explore.

Targets and preferences describe the desired outcome. Weights describe its importance when comparing possible routines. Weights accept decimals from 0 to 2: zero removes that ranking component, one applies the normal penalty, and two doubles it. Changing a weight never changes the agreed target amount. Numerical preferences remain advisory. Safety penalties and factual advice remain active independently. A target amount of zero with a positive weight expresses soft minimisation. A weight of zero means that objective does not influence ranking. Use an exclusion only when the customer requires categorical avoidance. Cost weight: scoring.weights.price (0 to 2) controls first-order goods cost in THB, delivery excluded. 0 ignores the cost penalty; 1 is normal; 2 doubles it. With requirements.maxPriceMinor, it weights budget-overrun penalties instead. Omission preserves; null resets to the preset. Up to six decimal places (for example 0.543). Overrides replace preset values; they are never multiplied by the preset. Ask “How important is this preference?” rather than requiring coefficients from the person. A nutrient weight without a target does not create a hidden fitting or avoidance objective; add an explicit target first. Independently existing continued-dose terms may still apply.

Zero-target comparison scales: Vitamin D3 25 mcg (1000 IU); Selenium 50 mcg. These are versioned engineering scales anchored to captured catalogue amounts, not recommended doses or safety limits, and are not claimed to be clinically calibrated. Other ingredients require an explicit scale review; an unsupported zero target returns a field error. At zero, exposure divided by this scale replaces proportional deviation. total_daily includes fixed diet and continued intake; supplemental excludes diet. The matcher cannot remove fixed intake. Coverage of a zero goal is binary: fully quantified zero contributes 100%, confirmed positive or uncertain exposure contributes 0%; unknown remains explicit. No zero-target percentage divides by zero.

Result delivery: clients that consume structuredContent receive one structured decision plus brief text. Verified text-only clients send X-MattaNutra-Result-Content: text to receive complete JSON text instead. X-MattaNutra-Result-Content: structured explicitly confirms structured support. Do not concatenate both representations.

Nested context merges. Supplied medication, condition and intake arrays replace only that array. Missing intake is unknown on create and preserved on refinement; clearing observations never reports known zero. Numeric max* preferences are advisory: omission preserves; null clears; zero is a real preference, never a purchase veto. Advice reports only quantified exposure above MattaNutra recommended limits. Equal, below-limit and unknown exposure produce no advice. Medication/condition codes are accepted inputs, not interaction coverage. Absence of advice is not medical clearance. Limits remain advisory, including at weight zero. maxPriceMinor uses THB minor units for first-order goods; 50000 is THB500, delivery separate. Exclusion and productDoses arrays replace; [] clears. Unknown, unapproved or unavailable productDoses are omitted with requestIssues; the original request is preserved for replay and refinement. Valid targets continue. Contradictory exclusions, malformed quantities and unsupported physical increments remain validation errors. Read ingredient availability and requestIssues before describing what the routine supplies; unavailable is not a medical caution. Physically supported productDoses are evaluated by plan; execute opens checkout only after the customer agrees.

Targets upsert by ingredientId. New rows require amount/unit and a name or published ingredient ID. Existing rows preserve omitted values; amount-only uses the saved unit, unit-only converts physical amount. amount:null removes that target and its explicit weight; targets:[] changes nothing. Removing all targets means no purchase is recommended. Unsupported requested targets keep IDs and gaps. Algae Omega-3 resolves only with explicit algae_only in requirements.omega3SourcePreference; Source preferences are preserved; omitted or conflicting choices are never inferred from its name. Vitamin K2 aliases resolve while nutrient forms and units remain distinct. Duplicate aliases resolving to one identity are invalid.

scoring.weights patches overrides; null clears all overrides; {} preserves. Individual null resets to the preset. scoring.profile resets old overrides then applies accompanying overrides. scoring:null and scoring.profile:null are invalid. Omitted searchEffort is standard on create and preserved on refinement. scoring:{} retries failed/stale work; for a fresh successful unchanged plan it is a no-op.

Explain the routine and any returned limit-excess advice. Keep other health-review commentary out of the plan response. supplied is new-product contribution; requested:null marks an incidental ingredient. total_daily includes applicable diet and supplements; supplemental includes continued and new supplements only. Unknown diet remains unknown. All requested targets count in coverage, including unsupported or weight-zero targets. When pillCount is null, pillCountAtLeast is a verified lower bound: say “at least …; total unknown”. Unknown quantities and prices remain unknown; first-order savings are not recurring savings.

The existing choices envelope contains only the current recommendation, never alternative baskets. With no targets it may be empty; a no-purchase recommendation retains any requested ingredients and gaps. Adjust scoring.weights with the current revision and a new key to receive a revised recommendation; do not ask the customer to choose from a menu. When the customer agrees to buy, call execute directly with planHandle, the current expectedRevision and a new idempotencyKey. It saves the exact basket and creates or recovers checkout without rematching or advancing the plan revision. There is no separate plan confirmation call. A handle-only read does not order anything; scoring:{} remains a recovery/refinement call. Discuss the routine and its ingredient advice before purchase. plan never orders or charges. Finish naturally at no_purchase, or replenish_later when known. order reports verified payment and fulfilment state and recovery links. Each returned product includes its recorded imageUrl (absolute HTTPS), or null when no image is recorded. Keep that URL with its product; do not invent an image or fetch images to make a plan decision. After helping, offer concise service feedback through feedback: report your observed usefulness, confusing behaviour or failures, clearly distinguishing agent observations from customer comments. Obtain customer consent before setting consentConfirmed=true. Omit personal and health details; do not invent a rating. Feedback is optional and never delays checkout. Unknown tool calls return JSON-RPC -32601 (Unknown tool: <name>) without tool data or mutation.

Presets (effective assignments):

{
  "best_match": {
    "pills": 1,
    "products": 1,
    "price": 1,
    "servings": 1,
    "nutrients": 1
  },
  "best_coverage": {
    "pills": 1,
    "products": 1,
    "price": 1,
    "servings": 1,
    "nutrients": 2
  },
  "fewest_pills": {
    "pills": 2,
    "products": 1.5,
    "price": 1,
    "servings": 2,
    "nutrients": 1
  },
  "lowest_cost": {
    "pills": 1,
    "products": 1,
    "price": 2,
    "servings": 1,
    "nutrients": 1
  }
}

Copyable templates:

### create-provisional-targets

plan

```json
{
  "idempotencyKey": "example-create-key-0001",
  "locale": "en",
  "destinationCountry": "TH",
  "targets": [
    {
      "name": "Vitamin D3",
      "amount": 2000,
      "unit": "IU",
      "basis": "supplemental"
    }
  ]
}
```

### partial-request

plan

```json
{
  "idempotencyKey": "example-partial-key-0001",
  "locale": "en",
  "destinationCountry": "TH",
  "targets": [
    {
      "name": "D3",
      "amount": 1000,
      "unit": "IU"
    },
    {
      "name": "Unlisted example ingredient",
      "amount": 50,
      "unit": "mg"
    }
  ]
}
```

### read-or-poll

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle"
}
```

### fewer-pills

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "requirements": {
    "maxDailyPills": 3
  },
  "scoring": {
    "weights": {
      "pills": 2
    }
  }
}
```

### prioritise-lower-cost

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "scoring": {
    "weights": {
      "price": 2
    }
  }
}
```

### minimise-incidental-ingredient

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "targets": [
    {
      "ingredientId": "sup_replace_with_returned_selenium",
      "amount": 0,
      "unit": "mcg"
    }
  ],
  "scoring": {
    "weights": {
      "nutrients": {
        "sup_replace_with_returned_selenium": 1
      }
    }
  }
}
```

### pill-count-matters-a-little

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "scoring": {
    "weights": {
      "pills": 0.543
    }
  }
}
```

### pill-count-does-not-matter

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "scoring": {
    "weights": {
      "pills": 0
    }
  }
}
```

### exclude-selenium

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "requirements": {
    "excludeSupplementIds": [
      "sup_replace_with_returned_selenium"
    ]
  }
}
```

### raise-target-importance

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "scoring": {
    "weights": {
      "nutrients": {
        "sup_replace_with_returned_selenium": 2
      }
    }
  }
}
```

### change-agreed-dose

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "targets": [
    {
      "ingredientId": "sup_replace_with_returned_selenium",
      "amount": 120
    }
  ]
}
```

### exclude-a-product

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "requirements": {
    "excludeProductIds": [
      "prd_replace_with_returned_product"
    ]
  }
}
```

### clear-preference

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "requirements": {
    "maxDailyPills": null
  }
}
```

### reset-preset

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "scoring": {
    "profile": "best_match"
  }
}
```

### reset-one-weight

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "scoring": {
    "weights": {
      "pills": null
    }
  }
}
```

### recover-failed-or-stale-work

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "scoring": {}
}
```

### answer-current-question

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "answers": [
    {
      "questionId": "returned_question",
      "choice": "returned_choice"
    }
  ]
}
```

### create-checkout

execute

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-checkout-key-0001"
}
```

### service-feedback-after-consent

feedback

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-feedback-key-0001",
  "consentConfirmed": true,
  "points": [
    "Agent observation: the returned recovery action was clear."
  ]
}
```

### recover-or-track-order

order

```json
{
  "orderHandle": "cap_replace_with_returned_order_handle"
}
```