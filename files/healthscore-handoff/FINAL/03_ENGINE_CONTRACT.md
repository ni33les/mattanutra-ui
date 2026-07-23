# Engine Contract — `build_page_content` Output

The engine produces a single JSON object per customer (the **content package**). This document defines the schema. It is the firewall between the scoring engine and the page renderer: as long as the contract holds, either side can be refactored without breaking the other.

Worked example throughout: **Marcus** (statin user, score 47, "Building foundation"). His full content package is in `reference/Profile1_Marcus_content.json` — read alongside this document.

---

## ⚠️ Important: V1 content-layer gap

The contract below is the **target schema** that the page template expects to consume. The current V1 implementation of `build_page_content` in `engine/healthscore_content.py` produces **most but not all** of these fields. Specifically, the following fields currently need to be added to the content layer (or supplied by Stage 6, or hand-supplied at template-render time):

- `copy.hero_sub` — currently the demo pages have this hand-written per persona
- `copy.band_pill`, `copy.opp_pill` — currently derived in the template from a small lookup table on `locked.band`
- `copy.what_eyebrow` — currently composed in the template as `"What " + locked.score + " actually means"`
- `copy.pillars_headline`, `copy.findings_headline`, `copy.findings_intro` — currently hand-assembled
- `copy.subtraction_paragraph` — currently hand-assembled; only `copy.subtraction` (a `{evaluated, set_aside, chosen}` dict) is produced by the engine
- `copy.method_steps` — currently hand-assembled per persona

**Recommended action**: V1 ship can either (a) extend the content layer to produce these fields (cleanest), or (b) implement them in the template's data-prep step using simple deterministic logic (lookup tables, string composition). Either path is fine for V1 — but commit to one and document where each field originates so V2's Stage 6 polish layer knows what it is and isn't allowed to touch.

Fields that ARE currently produced by `build_page_content`:

- `locked.*` (all)
- `copy.first_name`, `copy.goal_mirror`, `copy.band_line`
- `copy.relativity.*` (mode, gap/percentile, headline, sub, spectrum positions, legend captions)
- `copy.gap_trio[]`
- `copy.highest_leverage`
- `copy.strength_note`
- `copy.findings[]`, `copy.findings_mode`
- `copy.cta_line`
- `copy.subtraction.{evaluated, set_aside, chosen}`
- `meta.*`

The snapshot tests in `engine/test_engine.py` lock down the current V1 output. Marcus and Priya snapshots are committed in `engine/fixtures/` and verified to pass against the engine code in this package.

---

## Top-level structure

```json
{
  "locked": { ... },     // immutable numeric/structural truth — never modified by AI polish
  "copy":   { ... },     // rendered copy — may be lightly rewritten by Stage 6 AI polish (within rules)
  "meta":   { ... }      // diagnostic only — engine version, finding count, mode
}
```

### Why this split exists

The `locked` object contains the **engine's authoritative numeric outputs**: the score, the band, the percentile, the pillar values, the flag codes, the nutrient count. These values are determined by the deterministic 5-layer scoring model and **cannot be changed by anything downstream**, including Stage 6 AI polish or template-level overrides. If you see code that mutates `locked.*`, that's a bug.

The `copy` object contains **the rendered text** that fills the page's engine-driven slots. These strings are produced by `build_page_content` from `locked` + the questionnaire answers. They are eligible for Stage 6 AI polish (voice/cadence rewriting) **subject to the validation rules in `07_PERSONALIZATION_LAYER.md`** — most importantly, that any literal number, band name, or pillar name in the rewritten text must match `locked`.

The `meta` object exists for debugging and analytics. The page does not render from it.

---

## `locked` — immutable engine output

```json
{
  "score": 47,
  "band": "Building foundation",
  "percentile": 4,
  "median": 60,
  "pillars": [
    { "label": "Health Habits",      "value": 90, "goal_linked": false, "tag": null,            "fill_class": "hi", "is_hero": false },
    { "label": "Sleep & Recovery",   "value": 67, "goal_linked": true,  "tag": "energy",        "fill_class": "hi", "is_hero": false },
    { "label": "Nutrition & Diet",   "value": 67, "goal_linked": true,  "tag": "heart",         "fill_class": "hi", "is_hero": false },
    { "label": "Activity & Fitness", "value": 43, "goal_linked": true,  "tag": "all 3 goals",   "fill_class": "lo", "is_hero": true  },
    { "label": "Stress & Balance",   "value": 38, "goal_linked": false, "tag": null,            "fill_class": "lo", "is_hero": false }
  ],
  "flag_codes": ["STATIN_COQ10", "VITD_ROUTINE"],
  "nutrients_chosen": 8,
  "nutrients_evaluated": 120
}
```

### Field-by-field

| Field | Type | Range | Determined by | Used in |
|---|---|---|---|---|
| `score` | integer | 30–92 (calibration clamps) | Layer 1 (self-report) + Layer 2 (verification unlock) × Layer 3 (symptom multiplier), goal-weighted (Layer 4), safety-flagged (Layer 5), clamped | Scorecard bignum, animation target, scoreline literal |
| `band` | enum string | 5 values: `"Excellent"`, `"Strong, with headroom"`, `"Good, with a clear gap"`, `"Building foundation"`, `"Needs attention"` | Lookup from `score` | Pill text, downstream framing |
| `percentile` | integer | 1–96 (capped at 96 to avoid 99th-percentile boasting) | Lookup from `score` in `pctile.json` | Relativity headline (rank mode) |
| `median` | integer | Always 60 (calibration constant) | Engine constant | Spectrum visual, relativity copy |
| `pillars` | array | Exactly 5 items, **pre-sorted by `value` descending** | Layer 1 scoring per domain | Pillars section, leverbox identification |
| `pillars[].label` | enum string | 5 values: `"Health Habits"`, `"Sleep & Recovery"`, `"Nutrition & Diet"`, `"Activity & Fitness"`, `"Stress & Balance"` | Fixed pillar set | Pillar row label |
| `pillars[].value` | integer | 0–100 | Per-pillar scoring | Pillar bar `data-w`, percentage display |
| `pillars[].goal_linked` | boolean | — | Compared against user goals | Renders the "Goal-linked · {tag}" suffix |
| `pillars[].tag` | string \| null | Free text (e.g., `"energy"`, `"all 3 goals"`) | Engine identifies which goal(s) the pillar serves | Suffix text |
| `pillars[].fill_class` | string | `"hi"` (≥50) or `"lo"` (<50) | Derived from value | CSS class on `.pfill` |
| `pillars[].is_hero` | boolean | exactly one pillar is `true`, or none if no goal-linked pillar exists | Engine picks the **lowest-value goal-linked pillar** as hero | Renders `.prow.hero` (green-tint row) |
| `flag_codes` | array of string | stable identifiers | Layer 5 + content layer salience | Drives `copy.findings[]` selection |
| `nutrients_chosen` | integer | typical range 4–12 | Formula engine (separate from HealthScore engine) | Subtraction beat (`{{ chosen }}`) |
| `nutrients_evaluated` | integer | 120 (engine constant, increments only when catalog grows) | Engine constant | Subtraction beat (`{{ evaluated }}`) |

### Pillar ordering invariant

`locked.pillars[]` is **always 5 items, sorted descending by `value`**. The template trusts this — `{% for p in pillars %}` renders them in array order. If the engine returns them in any other order, the page will look wrong (highest-value pillar should be at the top).

### `is_hero` exactly-one-or-zero invariant

At most one pillar has `is_hero: true`. If the customer has zero goal-linked pillars (rare), no pillar is hero and the template renders no `.prow.hero` class. The engine guarantees this; do not normalize or fallback in the template.

### Score floor and cap

`score` is `clamp(round((selfreport + verification) * symptom_multiplier), 30, 92)`. The 30 floor protects against the page rendering shock-value extreme low scores; the 92 cap prevents customers from feeling they've maxed out before the actual ceiling. **These are calibration constants. Do not adjust without re-running the Monte Carlo simulation.**

---

## `copy` — rendered text (eligible for Stage 6 polish)

```json
{
  "first_name": "Marcus",
  "first_name_prefix": "Marcus, ",
  "goal_mirror": "you came here for <em>energy</em>, a stronger <em>heart</em>, and a real way back to <em>fitness</em>.",
  "hero_sub": "We read every answer you gave — your goals, your sleep, your stress, your statin, the way you actually live in Singapore — and turned them into one number, and the pattern underneath it.",
  "band_pill": "Building foundation",
  "opp_pill": "High opportunity",
  "band_line": "A 47 isn't a verdict on your health. It's a starting line — and the rare thing is, we can see <em>exactly</em> where the line sits, and what stands between you and the next 20 points.",
  "what_eyebrow": "What 47 actually means",
  "relativity": {
    "mode": "gap",
    "gap": 13,
    "headline": "The average person who finishes this scores about 60. Your gap is 13 points — and none of them are about age.",
    "sub": "Those 13 points aren't genetics, and they aren't willpower. They're three specific, recoverable things — and the two biggest are exactly the goals you told us mattered most.",
    "spectrum_you": 47,
    "spectrum_median": 60,
    "spectrum_you_pct": 27.4,
    "spectrum_median_pct": 48.4,
    "spectrum_gap_left_pct": 27.4,
    "spectrum_gap_width_pct": 21.0,
    "legend_captions": ["Where you are", "Recoverable gap", "Room to grow to 92"]
  },
  "gap_trio": [
    {
      "tag": "GAP 01 · STRESS & BALANCE",
      "value": "38%",
      "headline": "Your lowest pillar by far",
      "body": "High stress is quietly taxing the very energy you came here to fix. It's the single biggest drag on your score right now."
    },
    {
      "tag": "GAP 02 · ACTIVITY & FITNESS",
      "value": "43%",
      "headline": "The pillar all three goals point to",
      "body": "Energy, heart, fitness — every goal you chose runs through this one pillar. That makes it your highest-leverage move, not a side quest."
    },
    {
      "tag": "GAP 03 · HOW YOU FEEL",
      "value": "3",
      "headline": "The symptoms dragging on everything",
      "body": "Fatigue, bloating, and restless sleep pull down your whole score at once — and they're the felt signals your plan is built to address first."
    }
  ],
  "pillars_headline": "Three of your five pillars are <em>goal-linked</em> — they're the ones your own answers told us to weigh most.",
  "highest_leverage": {
    "pillar": "Activity & Fitness",
    "value": 43,
    "text": "<b>Your highest-leverage move:</b> Activity & Fitness sits at 43% — and every one of your three goals routes through it. Lift this one pillar and energy, heart, and fitness all move together. That's not a coincidence in your results; it's the shape of your answers."
  },
  "strength_note": "A note worth hearing: your Health Habits score is 90%. Whatever you've been telling yourself, this was never a discipline problem. You have a strong foundation — it's pointed in slightly the wrong direction.",
  "findings_headline": "Three things a generic vitamin quiz would have walked straight past.",
  "findings_intro": "These are the specific signals in your answers that shape your formula — laid out in full, nothing held back.",
  "findings": [
    {
      "code": "STATIN_COQ10",
      "icon": "✦",
      "headline": "Your statin answer changed the entire review.",
      "body": "Because you reported a statin <em>and</em> low energy, your plan does not get a generic \"men's health\" stack. It specifically reviews CoQ10 — which statins are known to deplete — alongside heart-aware nutrient choices. This is the kind of interaction a one-size quiz never checks, and it is why your formula will look different from your friend's."
    },
    {
      "code": "ENERGY_UPSTREAM",
      "icon": "◎",
      "headline": "Your energy problem isn't a caffeine problem.",
      "body": "Your low energy lines up with high stress and light activity — not a missing stimulant. So your plan works the actual sequence: steady the stress load, support deeper sleep, and ease movement back in, with nutrients chosen to support that chain. More caffeine would only paper over it."
    },
    {
      "code": "VITD_ROUTINE",
      "icon": "☼",
      "headline": "Your daily routine shapes your formula.",
      "body": "Daily sunscreen, limited time in the sun, and low oily-fish intake all point the same way — so your plan leans into vitamin D and omega-3 support rather than guessing. Your formula is built around how you actually live, not just your age and sex."
    }
  ],
  "findings_mode": "caught",
  "subtraction_paragraph": "A good plan isn't built by adding everything that <em>might</em> help. It's built by removing everything that doesn't — until only what fits your score, your three goals, and your statin remains. Eight nutrients. That's your right amount.",
  "method_steps": [
    {
      "number": 1,
      "title": "Your goals set the direction",
      "body": "Energy, heart, and fitness become the lens every other answer is read through — which is why three of your five pillars are weighted as goal-linked."
    },
    {
      "number": 2,
      "title": "Your routine adds the context",
      "body": "Sleep, stress, movement, diet, sunscreen and fish intake all shift what belongs in your formula — and what gets ruled out."
    },
    {
      "number": 3,
      "title": "Your safety profile draws the lines",
      "body": "Your statin and health history set hard boundaries the plan won't cross. Safety isn't a footnote here; it's a filter applied first."
    }
  ]
}
```

### Field-by-field for `copy`

| Field | Type | Used in | Stage-6 rewritable? |
|---|---|---|---|
| `first_name` | string (sanitized) | JS injection into `#heroName` and `#ctaEyebrow` | No |
| `first_name_prefix` | string | Server-rendered into hero h1 `<span id="heroName">` | No |
| `goal_mirror` | HTML string (contains `<em>`) | Hero h1 body | Yes (preserve `<em>` count and goal nouns) |
| `hero_sub` | string | Hero sub-paragraph | Yes (preserve list of "what we read") |
| `band_pill` | string | Band pill text | No (must match `locked.band` lookup) |
| `opp_pill` | string | Opportunity pill text | No (must match `locked.band` lookup) |
| `band_line` | HTML string | Scoreline under bignum | Yes (must contain the literal score number) |
| `what_eyebrow` | string | "What {score} actually means" | No (must contain literal score) |
| `relativity.mode` | enum: `"rank"` \| `"gap"` | Determines spectrum layout flip | No |
| `relativity.gap` | integer (gap mode) or null | Used in relativity copy | No (literal must match `60 - locked.score`) |
| `relativity.headline` | HTML string | h2 of "what X means" section | Yes |
| `relativity.sub` | string | p of "what X means" section | Yes |
| `relativity.spectrum_you` | integer | Marker label on spectrum | No (= `locked.score`) |
| `relativity.spectrum_median` | integer | Median marker | No (= `locked.median`) |
| `relativity.spectrum_you_pct` | float | Marker position % on bar | No (computed from score) |
| `relativity.spectrum_median_pct` | float | Median position % on bar | No (= 48.4) |
| `relativity.spectrum_gap_left_pct` | float | `.spec-gap` left% | No (computed) |
| `relativity.spectrum_gap_width_pct` | float | `.spec-gap` width% | No (computed) |
| `relativity.legend_captions` | array of 3 strings | Spectrum legend swatches | No |
| `gap_trio` | array of 3 cards | Three gap/refinement cards | `headline` and `body` yes; `tag` and `value` no |
| `pillars_headline` | HTML string | Pillars section h2 | Yes (preserve goal-link count literal) |
| `highest_leverage.text` | HTML string | Leverbox sentence | Yes (preserve pillar name and value literal) |
| `strength_note` | string \| empty | Notebox below pillars (optional) | Yes (preserve numeric literals) |
| `findings_headline` | string | "What we caught" h2 | Yes |
| `findings_intro` | string | Sub-paragraph | Yes |
| `findings` | array of 1–3 findings | Finding cards | `headline` and `body` yes; `code` and `icon` no |
| `findings_mode` | enum: `"caught"` \| `"affirmation"` \| `"minimal"` | Affects intro phrasing | No |
| `subtraction_paragraph` | HTML string | Subtraction beat closing prose | Yes (must contain literal `nutrients_chosen`) |
| `method_steps` | array of exactly 3 steps | Methodology 3-up | `title` and `body` yes; `number` no |

---

## `meta` — diagnostic only

```json
{
  "engine_version": "1.0.0",
  "engine_score": 47,
  "finding_count": 3,
  "relativity_mode": "gap",
  "stage_6_applied": false,
  "content_layer_version": "1.0.0"
}
```

**Don't render from this object.** It exists for logs, analytics, and debugging only.

---

## Validation rules — invariants the engine must hold

The renderer (and Stage 6) can rely on these:

1. `locked.pillars` has exactly 5 items, sorted descending by `value`.
2. At most one pillar has `is_hero: true`.
3. `copy.relativity.spectrum_you` equals `locked.score`.
4. `copy.relativity.spectrum_median` equals `locked.median` (60).
5. `copy.gap_trio` has exactly 3 items.
6. `copy.findings` has 1, 2, or 3 items.
7. `copy.method_steps` has exactly 3 items.
8. `copy.band_pill` and `copy.opp_pill` are from the fixed lookup table for `locked.band`.
9. Every literal score, gap, or percentile number that appears in `copy.*` HTML matches the corresponding `locked` value.
10. No string in `copy.*` contains substrings from the FORBIDDEN list in `healthscore_library.py` (`bloodwork`, `cap`, `locked`, `deficien`, etc.).

The engine's CI harness (`run_content.py`) enforces these via `check_forbidden(pkg)` and a structural assertion suite.

---

## Versioning

When the engine changes in a way that affects output:
- **Calibration change** (the score for a given questionnaire shifts): bump `meta.engine_version` minor (`1.0.0` → `1.1.0`). The renderer should log this and surface it in analytics.
- **Schema change** (a new field added to `locked` or `copy`): bump major (`1.0.0` → `2.0.0`). Maintain a translation layer for at least one major version.
- **Copy-only change** (`copy.*` wording adjusted, no `locked` impact): bump `content_layer_version` only.

Pin `engine_version` in your snapshot tests so they catch unintended drift.
