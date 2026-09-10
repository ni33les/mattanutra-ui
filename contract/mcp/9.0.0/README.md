# MattaNutra conversational client guide 9.0.0

MattaNutra builds and refines purchasable supplement baskets from real products available in Thailand. Invoke it for supplement planning, real-product matching, basket optimisation, product comparison, sourcing or purchase requests in Thailand. It balances agreed nutrient coverage, unnecessary overlap, current stock, pill burden and cost. Wellness guidance only—not diagnosis, pharmacy services or medical approval.

Development environment—not for real purchases.

Thailand (TH) only; prices in THB, delivery separate; finite catalogue, real gaps. Agree name/amount/unit/basis; unknown diet is never zero. total_daily includes diet and supplements; supplemental includes continued and new supplements, excluding diet.
Call plan with flat targets/context and idempotencyKey to create. Then send only planHandle to read/poll; wait pollAfterSeconds while processing and stop polling at a terminal result. No matching occurs in polls.
Refine changed fields with planHandle, expectedRevision and idempotencyKey. Targets upsert by ingredientId; amount changes dose, amount:null removes. Context merges; supplied arrays replace; [] clears exclusions/proposals; numeric null clears a preference.
profile means customer context. scoring.profile selects a preset; scoring.weights are effective values 0–2: 0 softly minimises new exposure/quantity, 1 standard, 2 stronger importance. Omission preserves; individual null resets; weights:null clears; preset changes reset overrides. A weight is not a dose or categorical exclusion.
Review each choice's summary, ingredients and products. recommendedOptionId is advice; selectedOptionId is null until selection. After customer choice send selectedOptionId with revision/key, read its advice, confirm, then execute. Selection, answers and refinements are separate calls.
Health findings and numeric preferences never veto purchase; exclusions, diet and physical quantities bind. Ready means checkout-ready, not targets met or medical approval. Medication/condition inputs without assessed findings remain unassessed. Ingredient advice remains visible at weight zero.
Retry a lost response with the same key/input. Read current revision after conflicts. scoring:{} with revision/new key recovers failed/stale work; unchanged successful input is a no-op. Finish naturally at no_purchase; order recovers/tracks payment and fulfilment.
Tools: info, plan, execute, order, support, feedback, evidence. Use host-listed names. info is optional; client_guide provides templates and plan_schema returns this same unified schema. Examples are protocol templates, not recommended regimens.

Illustrative amounts are protocol examples, not personal dose recommendations. Answer using the actual questionId and choice corresponding to the customer’s answer. Replace placeholder identifiers with returned values; each new mutation needs a new idempotencyKey and current expectedRevision. Retry a lost response with exactly the same key and input. Handle-only calls poll existing work at pollAfterSeconds; stop at a terminal result.

Use one flat plan call repeatedly. Omit unchanged fields. Selection, answers and refinements must be separate calls. profile is reported customer context; scoring.profile is a preset of effective weights. Nothing requires exact diet labels or demographics merely to explore.

Weights: 0 softly minimises new exposure or quantity; 1 is standard; 2 increases importance. Below one blends avoidance with fitting. Two fits the agreed amount more strongly; a higher dose requires an explicit target amount change. Missing effective weights equal one unless a preset or saved override supplies them. A weight never disables safety advice. Exclusions and dietary requirements remain binding.

Result delivery: clients that consume structuredContent receive one structured decision plus brief text. Verified text-only clients send X-MattaNutra-Result-Content: text to receive complete JSON text instead. X-MattaNutra-Result-Content: structured explicitly confirms structured support. Do not concatenate both representations.

Nested context merges. Supplied medication, condition and intake arrays replace only that array. Missing intake is unknown on create and preserved on refinement; clearing observations never reports known zero. Numeric max* preferences are advisory: omission preserves; null clears; zero is a real preference, never a purchase veto. Numerical overruns strictly above 20% receive prominent advice; any applicable safety excess remains visible. maxPriceMinor uses THB minor units for first-order goods; 50000 is THB500, delivery separate. Exclusion and productDoses arrays replace; [] clears. Physically supported productDoses are evaluated before selection, never bought directly.

Targets upsert by ingredientId. New rows require amount/unit and a name or published ingredient ID. Existing rows preserve omitted values; amount-only uses the saved unit, unit-only converts physical amount. amount:null removes that target and its explicit weight; targets:[] changes nothing. Removing all targets means no purchase is recommended. Unsupported requested targets keep IDs and gaps. Duplicate aliases resolving to one identity are invalid.

scoring.weights patches overrides; null clears all overrides; {} preserves. Individual null resets to the preset. scoring.profile resets old overrides then applies accompanying overrides. scoring:null and scoring.profile:null are invalid. Omitted searchEffort is standard on create and preserved on refinement. scoring:{} retries failed/stale work; for a fresh successful unchanged plan it is a no-op.

Explain summary, ingredients, products and relevant advice together. supplied is new-product contribution; requested:null marks an incidental ingredient. total_daily includes applicable diet and supplements; supplemental includes continued and new supplements only. Unknown diet remains unknown. All requested targets count in coverage, including unsupported or weight-zero targets. When pillCount is null, pillCountAtLeast is a verified lower bound: say “at least …; total unknown”. Unknown quantities and prices remain unknown; first-order savings are not recurring savings.

Choices are distinct product-and-dose baskets. roles may include best_match for current settings, closest_dose, lower_cost, simpler, fewer_concerns or purchase_fallback; one choice can carry several roles. recommendedOptionId is the recommended choice; selectedOptionId stays null until the customer chooses. Send a returned selectedOptionId with current revision. Selection advances revision without matching again; use the new revision and IDs. Confirm the selected routine and its ingredient advice with the customer before execute. plan never orders or charges. Finish naturally at no_purchase, or replenish_later when known. order reports verified payment and fulfilment state and recovery links. Narrow evidence calls use the returned plan, option and ingredient/product IDs; no automatic full-plan evidence dump.

Presets (effective assignments):

{
  "balanced": {
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
  ],
  "scoring": {
    "profile": "balanced"
  }
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
  "scoring": {
    "weights": {
      "pills": 2
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
  "scoring": {
    "weights": {
      "nutrients": {
        "sup_replace_with_returned_ingredient": 0
      }
    }
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
    "profile": "lowest_cost"
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

### select-returned-choice

plan

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001",
  "selectedOptionId": "opt_replace_with_returned_option"
}
```

### confirmed-checkout

execute

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "idempotencyKey": "example-change-key-0001"
}
```

### recover-or-track-order

order

```json
{
  "orderHandle": "cap_replace_with_returned_order_handle"
}
```

### ingredient-evidence

evidence

```json
{
  "planHandle": "cap_replace_with_returned_plan_handle",
  "expectedRevision": 1,
  "optionId": "opt_replace_with_returned_option",
  "ingredientId": "sup_replace_with_returned_ingredient"
}
```