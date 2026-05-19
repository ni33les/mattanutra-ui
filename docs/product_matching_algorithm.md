# Product Matching Algorithm

## Purpose

The active product matcher is `v2-exact-shortlist`. It turns a finalised nutrition plan into a small, honest set of recommended products. It is not a marketplace search engine. It matches the client's supplement needs against our approved product catalogue, then explains how much of the client's needs are covered, what remains uncovered, and why products were selected or rejected.

The current implementation lives mainly in:

- `lib/product-recommendations.ts`
- `lib/task-execution.ts`
- `lib/task-result-applier.ts`
- `lib/task-work-items.ts`

The older greedy matcher is kept as `recommendProductStackLegacy` for rollback and regression comparison. Product recommendation tasks call `recommendProductStackV2`.

## The Matching Problem

The core problem is not simply "find a product with the same name." A real supplement plan and a real product catalogue differ in several difficult ways.

### 1. The plan uses canonical needs

The nutrition plan may ask for things such as:

- Ashwagandha
- Curcumin
- Probiotic blend
- Magnesium glycinate
- L-Theanine
- L-Glutamine
- Vitamin D3

Those needs come from formulation guidance and can have priority, dose, safety state, and review status.

### 2. Products use messy commercial label data

Product labels may contain:

- spelling variants, such as `Ashwaganda`
- compound names, such as `Magnesium bisglycinate`
- marketing names, such as `Probiotics+ Daily Health`
- chemistry/source forms, such as `Curcuma longa extract dry conc`
- potency artefacts, such as `Vitamin D3 100000 IU/g`
- Thai and English names
- incomplete or inconsistent serving information

The matcher must not treat dirty label text as trustworthy matchable data. Only validated canonical product facts should be used for scoring.

### 3. Products can cover several needs at once

A multivitamin or multi-supplement may cover many needs, but it may also include extras outside the client's profile. Extras are allowed when safe, because a loose-fit multi can be a better customer experience than six tiny products.

The matcher must balance:

- coverage
- safety
- dose fit
- product count
- useful extras
- duplicate overlap
- confidence
- budget
- sex/audience fit
- affiliate availability as a tie-breaker only

### 4. Coverage must be capped

Two products covering the same need cannot double-count. If product A covers 80 percent of magnesium and product B covers 60 percent of magnesium, the stack covers magnesium at 80 percent, not 140 percent.

This is why the algorithm tracks coverage per need and applies each product's marginal contribution to the current stack.

### 5. Missing matches must be explainable

When a product is not selected, we need to know why:

- product is not approved
- brand is not approved
- label facts are missing
- validation failed
- audience mismatch
- product does not cover current needs
- product was a near miss but another stack contributed more

This is essential for admin debugging and for improving catalogue quality.

## Data Preconditions

The matcher should only consider products that meet all of these conditions:

| Check | Rule |
| --- | --- |
| Product status | `approved` |
| Brand status | `approved` |
| Label status | `parsed` |
| Validation | `pass` |
| Product facts | at least one canonical matchable fact |
| Safety | automated safety checks passed |
| Audience | `both`, or matching client sex |
| Expiry | product cache not expired |

Products that fail these checks are recorded as exclusions and may appear in diagnostics, but they are not recommended.

## Canonicalisation

The matcher uses canonical keys and aliases before scoring. This lets product facts and plan needs match even when their display names differ.

Examples:

| Plan Need | Product Label Variants |
| --- | --- |
| Ashwagandha | `Ashwaganda`, `Withania somnifera`, `Ashwagandha root extract` |
| Curcumin | `Curacumin`, `Curcuminoids`, `Turmeric extract`, `Curcuma longa` |
| Multi-strain probiotics | `Probiotic`, `Probiotics`, `Probiotic blend` |
| L-Glutamine | `Glutamine` |
| Magnesium | `Magnesium glycinate`, `Magnesium bisglycinate`, `Magnesium glyconate` |
| Theanine | `L-Theanine`, `AlphaWave L-Theanine` |

The matching function checks:

1. direct canonical key equality
2. known alias groups
3. explicit alias keys from catalogue data
4. bounded fuzzy token matching

The bounded fuzzy step is intentionally conservative. It helps with spelling problems, but should not allow unrelated minerals, compounds, or botanicals to cross-match.

## Dose Coverage

For each product fact and client need, the matcher calculates a coverage ratio where possible:

```text
ratio = product comparable amount / target comparable amount
```

The current dose scoring policy is:

| Ratio | Meaning | Score Behaviour |
| --- | --- | --- |
| `< 70%` | under target | partial credit, discounted |
| `70-130%` | preferred range | strong credit |
| `130-150%` | modest overage | allowed but penalised |
| `> 150%` | high overage | heavily penalised unless safety still allows |
| unsafe | above safety limit | blocked before matching |

If no comparable dose exists, but the fact clearly matches the need, the matcher can give partial coverage based on confidence. This is useful for some label facts, but approved product facts should normally have usable doses.

Concentration-only facts are not usable as serving doses. For example:

```text
Vitamin D3 100000 IU/g
```

This is evidence about ingredient potency, not the customer's per-serving dose. It must not be used directly as matchable dose coverage.

## Product Coverage

Each product is scored against all product-matchable needs.

For each need:

1. Find the best matching fact on the product.
2. Calculate fact-to-need coverage between `0` and `1`.
3. Cap coverage for that need at `1`.

The product's standalone coverage percentage is then:

```text
sum(need weight * product coverage for need) / sum(all need weights)
```

This answers:

```text
How much of the client's product-matchable supplement needs does this product cover on its own?
```

## Stack Coverage

The stack tracks a map:

```text
need id -> current best coverage
```

When a product is selected, the stack updates each covered need with:

```text
max(existing need coverage, product need coverage)
```

This prevents double-counting overlap.

The product's stack contribution is now order-independent. For each need, the achieved coverage is shared across products in proportion to each product's contribution to that need. This means displayed product contributions sum back to the same capped stack coverage used for the need bars.

```text
product share for need =
  product need coverage / sum(product coverages for that need)

product stack contribution =
  sum(product share for each need * capped achieved coverage * need weight)
```

This answers:

```text
How much did this product add to the selected stack?
```

## Active Selection Algorithm

The active matcher uses deterministic shortlisting plus exact combination scoring. It does not call AI, query the database, or perform side effects during recommendation scoring.

Default product count settings:

| Setting | Value |
| --- | ---: |
| Hard maximum | `6` |
| Shortlist cap | `32` |
| Per-need shortlist candidates | `4` |
| Top overall shortlist candidates | `16` |
| Top broad/multi candidates | `8` |
| Top affiliate candidates | `8` |

### Step 1. Build needs

The matcher builds needs from:

- visible supplement guidance
- food guidance, for diagnostics and total plan coverage

Product selection currently scores primarily against supplement needs. Food guidance is kept separate so product coverage does not look artificially weak because food needs are included in the denominator.

### Step 2. Exclude invalid products

Every candidate is checked for approval, validation, safety, label facts, audience, and expiry.

Rejected products are stored with reasons for diagnostics.

### Step 3. Build the deterministic shortlist

The shortlist is built from eligible products only:

- top candidates per need
- strong broad multi-products
- top overall coverage products
- active affiliate products that are otherwise nutritionally competitive

Shortlist ordering is deterministic: utility, coverage, confidence, price, title, then product id.

### Step 4. Score every possible stack in the shortlist

The matcher exhaustively scores every stack of size `1..6` from the shortlist. Exactness is guaranteed inside the deterministic shortlist.

The v2 utility score is a normalized weighted sum:

```text
utility =
  coverage weight * clipped weighted coverage
  + dose weight * weighted dose precision
  + simplicity weight * product-count simplicity
  + cost weight * affordability-adjusted coverage
  + extras weight * safe useful extras
  + confidence weight * match confidence
  - penalties
```

Every component is normalized to `0..1` before scoring. This keeps price, confidence, extras, and product count from accidentally overpowering coverage.

### Step 5. Apply deterministic context weights

The default weights are:

| Component | Default |
| --- | ---: |
| Coverage | `0.45` |
| Dose precision | `0.20` |
| Simplicity | `0.15` |
| Cost | `0.10` |
| Extras | `0.05` |
| Confidence | `0.05` |

Weights are modulated by current known context:

- budget preference
- pill/capsule limit
- medication and condition flags
- lifestage such as pregnancy/nursing
- active plan feedback such as budget, capsule-limit, and safety disclosures

The final weights and deltas are stored in diagnostics.

### Step 6. Pick the best stack and keep alternatives

The selected customer stack is the highest-utility valid stack. The next three stacks are stored as alternatives in diagnostics for debugging and agent review, but they are not shown as separate customer choices yet.

### Step 7. Affiliate tie-break only

Affiliate links do not override materially better nutrition.

Affiliate preference is used only when final stack utility is effectively tied. The ordering is:

1. higher utility
2. higher supplement-product coverage
3. active affiliate present
4. fewer products
5. lower price
6. deterministic product id order

## Legacy Greedy Matcher

The previous greedy matcher remains available as `recommendProductStackLegacy`.

Once the stack already had three products, it sorted all remaining candidates and looked only at the top candidate. If that top candidate was a weak top-up that did not meet the stricter post-target threshold, the algorithm stopped immediately.

That meant it could miss lower-ranked candidates that covered completely unmet needs.

Example failure:

1. The stack already had a base product, omega-3, and CoQ10.
2. A weak vitamin/mineral top-up ranked above Ashwagandha.
3. The weak top-up added less than the post-target threshold.
4. The matcher stopped.
5. Ashwagandha was never considered, even though it covered an unmet need.

The fix is to filter eligible post-target candidates before choosing the best one:

```text
if selected count >= target count:
  eligible candidates =
    candidates with meaningful marginal coverage
    OR candidates that cover a currently unmatched need
else:
  eligible candidates = all ranked candidates

select best eligible candidate
```

The legacy matcher was patched to filter eligible post-target candidates before choosing the best one. The active v2 matcher avoids the class of bug entirely by scoring complete stacks rather than relying on insertion order.

## Diagnostics

Each recommendation run records diagnostic information:

| Diagnostic | Meaning |
| --- | --- |
| `productsConsidered` | total candidate products supplied to matcher |
| `matchedNeeds` | needs with non-zero stack coverage |
| `unmatchedNeeds` | needs still uncovered after selection |
| `blockedProducts` | products excluded for approval, validation, safety, audience, or cache reasons |
| `factIssues` | exclusions linked to validation, labels, facts, safety, or approval |
| `nearMisses` | valid products with coverage that lost to selected products |
| coverage split | supplement-product, food, and total plan coverage |

This should support a "why no hit?" admin view for a plan.

## Customer-Facing Outputs

Each selected product should show:

- product image
- product title
- marketplace/import source
- price, if available
- direct or affiliate URL
- "meets X% of your needs" from standalone product coverage
- "adds X% to this stack" from marginal contribution
- covered needs
- short "why this matches" copy

The stack should show:

- supplement-product coverage
- food coverage separately
- total plan coverage
- remaining gaps

## Safety Guarantees

The matcher should never recommend:

- ignored products
- ignored brands
- unapproved products
- products with missing parsed facts
- products whose validation failed
- products above safety limits
- products with audience mismatch
- concentration-only facts as per-serving dose matches

If a product looks promising but cannot pass validation, it belongs in review, not in customer recommendations.

## Regression Coverage

The test suite now includes matcher cases for:

- nutritional score beating affiliate-only products
- affiliate links winning only among equivalent safe options
- sex/audience filtering
- stack size cap and duplicate coverage capping
- continuing past the target count for unmet needs
- skipping weak post-target top-ups in favour of unmet needs
- unapproved and ignored products being excluded
- validation failures being excluded
- supplement, food, and total coverage split
- potency artefacts being stripped from matchable names
- alias matching for Ashwagandha, Curcumin, Probiotics, Theanine, L-Glutamine, and Magnesium variants
- expected-hit regression products

## Practical Operating Rule

When a known product does not match a known need, debug in this order:

1. Is the product approved?
2. Is the brand approved?
3. Did validation pass?
4. Does the product have at least one canonical matchable fact?
5. Does the fact alias resolve to the plan need?
6. Is the dose usable and comparable?
7. Is the product blocked by audience or safety?
8. Was the product a near miss with low marginal contribution?
9. Did another product already cover the same need?
10. Does the run diagnostics show the best rejected candidate?

This keeps the problem tractable: either the catalogue data is not matchable, or the algorithm can explain the selection.
