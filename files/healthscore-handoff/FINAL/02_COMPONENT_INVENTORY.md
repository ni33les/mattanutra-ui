# Component Inventory — HealthScore v7

Every block on the HealthScore page tagged as **STATIC**, **ENGINE-DRIVEN**, or **INTERACTIVE**, in DOM order top-to-bottom. For each engine-driven block, the data shape it needs is documented; full field-by-field details are in `03_ENGINE_CONTRACT.md`.

**Legend**:
- 🟫 **STATIC** — content is the same for every customer. No data binding required.
- 🟦 **ENGINE-DRIVEN** — content varies per customer. Comes from `build_page_content` output.
- 🟩 **INTERACTIVE** — has client-side behavior (animation, scroll, toggle) that must survive the framework port.

---

## Page-level

### Site header + progress nav — 🟫 STATIC

- Logo, brand name, "Knowing the right amount" tagline
- Progress: Questionnaire (done) → HealthScore (current) → Your Plan (next)

The "current step" highlighting is hardcoded to HealthScore. In production, the progress component is shared across pages — pass `current_step="healthscore"` from your router.

---

## 1. Hero — `<header class="hero wrap">`

### 1a. Eyebrow — 🟫 STATIC
- Text: `"Your assessment is complete"`

### 1b. Goal-mirror h1 — 🟦 ENGINE-DRIVEN
- Slot: `{{ goal_mirror_html }}` (note: contains `<em>` tags around each goal noun — render as HTML, not escaped text)
- First-name prefix: `<span id="heroName">{{ first_name_prefix }}</span>` where the prefix is either empty (no-name path) or `"Marcus, "` / `"Priya, "` (sanitized first name + comma-space). When the prefix is set, the "Y" in "You came here" becomes lowercase "y" so the sentence reads naturally.
- Source: `copy.goal_mirror` (no name) or `copy.goal_mirror_named` (with name)

### 1c. Hero sub-paragraph — 🟦 ENGINE-DRIVEN
- Slot: `{{ hero_sub }}`
- Personalized list of "what we read" — different for every persona (e.g., Priya: "your training, your vegan diet, your sleep, even the lab work you entered"; Marcus: "your goals, your sleep, your stress, your statin, the way you actually live in Singapore")
- Source: `copy.hero_sub`

### 1d. Scorecard — `<div class="scorecard">`

#### 1d.i. Band pill — 🟦 ENGINE-DRIVEN
- Slot: `{{ band_pill }}` → e.g., `"Strong, with headroom"` / `"Building foundation"`
- Source: derived from `locked.band`
- Five possible values: `"Excellent"`, `"Strong, with headroom"`, `"Good, with a clear gap"`, `"Building foundation"`, `"Needs attention"`

#### 1d.ii. Opportunity pill — 🟦 ENGINE-DRIVEN
- Slot: `{{ opp_pill }}` → e.g., `"Top tier"` / `"High opportunity"`
- Source: derived from `locked.band` (paired with band_pill)

#### 1d.iii. Score number — 🟦 ENGINE-DRIVEN + 🟩 INTERACTIVE
- Initial DOM value: `<span id="scoreNum">{{ score }}</span>` — important so SEO/no-JS sees the number
- Animation: count up from 0 to `score` over 1100ms, cubic ease-out. **Replace `var t=80,st=null;` in JS with `var t={{ score }},st=null;`** OR read `data-target` attribute. Animation is in the inline `<script>` block at the bottom of the file.

#### 1d.iv. Scoreline (band-line) — 🟦 ENGINE-DRIVEN
- Slot: `{{ band_line_html }}` (may contain `<em>` — render as HTML)
- Source: `copy.band_line`
- Contains the score literal (e.g., "An 80 is strong…" or "A 47 isn't a verdict…"). **Do not template the number separately** — the engine writes the line with the number already inside, with correct article ("An 80" vs "A 47") and tone for the band.

#### 1d.v. Spectrum — 🟦 ENGINE-DRIVEN + 🟩 INTERACTIVE

The spectrum bar has four absolutely-positioned children. **Layout flips by mode**:

**When `copy.relativity.mode == "rank"`** (score ≥ median, e.g., Priya):
- `.spec-gap` is on the right side of the bar (median → score). Its `style="left:{med_pct}%; width:{gap_pct}%"` where `med_pct` = median's position on the 30-92 scale, `gap_pct` = score's position − median's position.
- `.spec-fill data-w="{score_pct}"` fills left → score position
- Marker order in DOM: `.marker.med` first (cap on bottom), then `.marker.you` (cap on top)
- Legend captions: "Where you are" / "How far ahead you sit" / "Headroom to 92"

**When `copy.relativity.mode == "gap"`** (score < median, e.g., Marcus):
- `.spec-gap` is on the left side of the bar (score → median). Its `style="left:{score_pct}%; width:{gap_pct}%"`
- `.spec-fill data-w="{score_pct}"` fills left → score position
- Marker order in DOM: `.marker.you` first (cap on top), then `.marker.med` (cap on bottom) — **important, prevents caption collision**
- Legend captions: "Where you are" / "Recoverable gap" / "Room to grow to 92"

Position math (engine provides these): `score_pct = (score - 30) / 62 * 100`, `med_pct = (60 - 30) / 62 * 100 = 48.4`. The 30 and 92 are the engine's `clamp` floor and cap.

#### 1d.vi. Spectrum endpoint labels — 🟫 STATIC
- Left: `"30"` (engine's score floor)
- Right: `"92"` (engine's score cap)

These never change; the engine's calibration is fixed at 30 floor / 92 cap.

---

## 2. "What {score} actually means" section

### 2a. Eyebrow — 🟦 ENGINE-DRIVEN
- Slot: `{{ what_eyebrow }}` → `"What 80 actually means"` / `"What 47 actually means"`
- Source: `f"What {locked.score} actually means"`

### 2b. h2 — 🟦 ENGINE-DRIVEN
- Slot: `{{ relativity_headline_html }}`
- Source: `copy.relativity.headline`
- Different per relativity mode — rank-framed for high scorers, gap-framed for low/mid scorers

### 2c. Sub-paragraph — 🟦 ENGINE-DRIVEN
- Slot: `{{ relativity_sub }}`
- Source: `copy.relativity.sub`

### 2d. Three gap/refinement cards — 🟦 ENGINE-DRIVEN (array)
- Source: `copy.gap_trio[]` — array of 3 cards
- Each card has: `tag` (e.g., `"GAP 01 · STRESS & BALANCE"` / `"REFINEMENT 01 · NUTRITION & DIET"` / `"STRENGTH · ACTIVITY & SLEEP"`), `value` (e.g., `"38%"`, `"61%"`, `"100%"`, or a count like `"3"`), `headline` (h3), `body` (p)
- Template renders the 3 in a 3-column grid: `{% for card in gap_trio %}<div class="gapcard reveal d{{ loop.index }}">…</div>{% endfor %}`
- The 3rd card may be a strength (for high scorers) or a third gap (for low scorers). The engine decides, the template doesn't.

---

## 3. Pillars section

### 3a. Eyebrow — 🟫 STATIC
- Text: `"Your pattern, pillar by pillar"`

### 3b. h2 — 🟦 ENGINE-DRIVEN
- Slot: `{{ pillars_headline_html }}`
- Source: `copy.pillars_headline` — varies by goal-link count (e.g., "Three of your five pillars are goal-linked…" / "Four of your five pillars are goal-linked…")

### 3c. Pillar list — 🟦 ENGINE-DRIVEN (array of 5) + 🟩 INTERACTIVE

- Source: `locked.pillars[]` — exactly 5 pillars, **already sorted by value descending** by the engine. The template renders them in array order.
- Each pillar: `label`, `value` (0-100), `goal_linked` (bool), `tag` (string or null, e.g., `"energy"`, `"all 3 goals"`)
- Bar fill class derived: `"pfill hi"` if `value ≥ 50` else `"pfill lo"`. **Provided by the engine as `fill_class`** so the template doesn't recompute.
- The "hero" pillar (gets the green-tint background row `.prow.hero`) is the **lowest goal-linked pillar** — also flagged by engine as `is_hero` on the relevant pillar object.

```html
{% for p in pillars %}
<div class="prow{% if p.is_hero %} hero{% endif %}">
  <div class="pname">
    {{ p.label }}
    {% if p.goal_linked %}<span class="gtag">Goal-linked · {{ p.tag }}</span>{% endif %}
  </div>
  <div class="ptrack"><div class="pfill {{ p.fill_class }}" data-w="{{ p.value }}"></div></div>
  <div class="pval">{{ p.value }}%</div>
</div>
{% endfor %}
```

JS reads `data-w` and animates the width. Mobile breakpoint restructures the row layout — see Design Tokens §7e.

### 3d. Leverbox — 🟦 ENGINE-DRIVEN
- Slot: `{{ leverbox_html }}` — full HTML including the `<b>` prefix
- Source: `copy.highest_leverage.text`
- The engine writes the full sentence; do not split into a generic template + value injection.

### 3e. Strength notebox — 🟦 ENGINE-DRIVEN (optional)
- Slot: `{{ strength_note }}` (string, may be empty)
- Source: `copy.strength_note`
- Render only if non-empty. For lowest-band users the engine may suppress this; for high-scorers it almost always renders.

---

## 4. "What we caught" section

### 4a. Eyebrow — 🟫 STATIC
- Text: `"What we caught"`

### 4b. h2 — 🟦 ENGINE-DRIVEN
- Slot: `{{ findings_headline }}`
- Source: `copy.findings_headline` — varies by finding count and mode (e.g., "One finding a generic vitamin quiz would have missed entirely…" / "Three things a generic vitamin quiz would have walked straight past.")

### 4c. Sub-paragraph — 🟫 STATIC (small variation)
- Either: `"Laid out in full, nothing held back."` (high-scorer affirmation mode) or `"These are the specific signals in your answers that shape your formula — laid out in full, nothing held back."` (caught mode)
- Engine determines via `copy.findings_intro` field

### 4d. Findings list — 🟦 ENGINE-DRIVEN (array, 1-3 items)
- Source: `copy.findings[]`
- Each finding: `code` (stable identifier, e.g., `"STATIN_COQ10"`), `icon` (Unicode glyph, e.g., `"✦"`), `headline` (h3), `body` (p, may contain `<em>` tags)
- **Layout depends on count**:
  - 1 finding: full-width card (`style="grid-column: 1 / -1"` on the card)
  - 2-3 findings: grid columns at default width
- Reveal delays: `d1`, `d2`, `d3` for cards 1, 2, 3

---

## 5. Subtraction beat

### 5a. Eyebrow — 🟫 STATIC
- Text: `"How your formula was built"`

### 5b. Three counting numbers — 🟦 ENGINE-DRIVEN + 🟩 INTERACTIVE
- Slots:
  - `{{ nutrients_evaluated }}` — typically `120` (engine constant; could drift if catalog grows)
  - `{{ nutrients_set_aside }}` — derived `evaluated - chosen`
  - `{{ nutrients_chosen }}` — **per-customer**, varies (4-12 in observed range)
- Source: `locked.nutrients_evaluated`, `locked.nutrients_chosen`
- All three numbers animate from 0 to target with cubic ease-out, durations 900/1100/1300ms. Animation triggers when `.subtract` enters viewport. **Update the JS triple to read from the rendered DOM values, not hardcoded.**

### 5c. Concluding paragraph — 🟦 ENGINE-DRIVEN
- Slot: `{{ subtraction_paragraph_html }}`
- Source: `copy.subtraction_paragraph`
- Persona-specific list of "what fits": (Priya) "your training, your vegan pattern, and your own lab readings"; (Marcus) "your score, your three goals, and your statin"
- Always ends with `"{n} nutrients. That's your right amount."`

---

## 6. Methodology card

### 6a. Eyebrow — 🟫 STATIC
- Text: `"How MattaNutra thinks"`

### 6b. h2 — 🟫 STATIC
- Text: `"A fixed scoring model across five domains — not a guess, and not an average of strangers."`

### 6c. Three method steps — 🟦 ENGINE-DRIVEN (with static fallbacks)
- Source: `copy.method_steps[]` — array of 3 `{number, title, body}`
- The steps are persona-specific:
  - Step 1 always describes goals
  - Step 2 describes data/routine/labs depending on what the customer provided
  - Step 3 describes diet, safety profile, or whatever the engine identified as the third anchoring lens
- Reveal delays: d1, d2, d3

### 6d. Trustline — 🟫 STATIC
- Text: `"Your number is computed by the same rules every time — fully traceable, point by point. This is wellness guidance, not a diagnosis, and it's built to be shared with your doctor."`

---

## 7. Trust card — 🟫 STATIC

Three columns: founders, education, dispensing. Identical to landing page's trust card v15. Content does not change per customer.

---

## 8. PriceHero section

### 8a. CTA eyebrow — 🟦 ENGINE-DRIVEN (first name only)
- DOM: `<span class="eyebrow" id="ctaEyebrow">Choose your next step</span>`
- JS sets `textContent = first_name + " — choose your next step"` at boot
- If no name, falls back to the static "Choose your next step"
- **Do not** server-render the name into innerHTML; use `textContent` injection to keep XSS-safe

### 8b. Headline (h2) — 🟫 STATIC
- Text: `"Your personalised Right Amount Formula is ready to unlock."`
- This is **deliberately persona-agnostic in v7** — the specific nutrient count lives in §5 (subtraction beat). Don't reintroduce per-customer counts here.

### 8c. Body paragraph — 🟫 STATIC
- Text: `"THB 690 unlocks them — the exact supplements and brands, doses, and timing, with a safety review built around your profile. Your plan, ready to use every day on your quest for better health."`

### 8d. Two trust checks — 🟫 STATIC
- "Built around your goals, diet, and labs"
- "Safety-checked against your medications"

### 8e. Service sentence — 🟫 STATIC
- "From there, MattaNutra takes care of the rest — sourcing each product through our pharmacy partner and sending it to your door."

### 8f. Price-clarify callout — 🟫 STATIC
- The italic green-bordered note about supplements being a separate basket

### 8g. Box image — 🟫 STATIC
- Currently embedded as base64 in the demo file (138KB). **Replace with a CDN-hosted img src** in production — embedding base64 is acceptable for the demo but wasteful for live traffic.
- alt text: `"An open MattaNutra box containing matched supplement bottles and a thank-you card"`

### 8h. Image caption (figcaption) — 🟫 STATIC
- Text: `"Above image is an example box only. Unlock your formula to discover what supplements will be in YOUR personalised box."`
- The word "YOUR" is wrapped in `<b>` for emphasis.

---

## 9. Four-promise brand strip — 🟫 STATIC

Four columns, each with a 32px SVG icon (stroke-width 1.6) + caps eyebrow + sub-caption:
- CLARITY · from Confusion (blue magnifying glass)
- GUIDANCE · You Can Trust (green leaf)
- PERSONALISED · Just for You (green person silhouette)
- CONFIDENCE · in Every Choice (green heart)

Icon stroke color: CLARITY uses `#1F4E8C` (navy); the other three use `var(--teal-deep)`. Vertical dividers between columns (1px `var(--line)`) at >760px viewport.

---

## 10. Decision frame — 🟫 STATIC

Two prose comparisons (no price anchors after v7's revision). Persona-agnostic.

---

## 11. Pricing cards — 🟫 STATIC

Two plans, identical to v7 final wording:
- Right Amount Formula — THB 690 one-time, "Limited time offer" gold badge, 6 feature checks, Clarity Guarantee
- Living Protocol — THB 1,590 / 90 days, dark green card, "Most popular" badge, includes RAF + 2 feature blocks + 4 feature checks, 7-Day Satisfaction Guarantee

Persona-agnostic. The Living Protocol mentions "your medications and labs" generically — fine for all customers.

---

## 12. Footer — 🟫 STATIC

Standard regulatory note, tagline ("Know the right amount."), copyright.

---

## 13. JavaScript — 🟩 INTERACTIVE (port carefully)

All in a single inline `<script>` block at the end of `<body>`. Five behaviors:

1. **First-name personalization** — reads `FIRST_NAME` constant, populates `#heroName` and `#ctaEyebrow`, lowercases the "Y" in "You came here". XSS-safe via `textContent`.
2. **Reveal-on-scroll** — adds `js` class to `<html>`, observes `.reveal` elements, adds `.in` class when in viewport. **1.8s safety timeout** calls `showAll()` regardless — preserve this.
3. **Score count-up** — animates `#scoreNum` from 0 to target, cubic ease-out over 1100ms.
4. **Bar fills** — sets `style.width` on `.pfill` and `#specFill` from `data-w` attribute, when in viewport.
5. **Subtraction counters** — animates the three subtraction numbers when `.subtract` enters viewport.

For Headless UI / React port: the reveal logic translates to `IntersectionObserver` in `useEffect`. **Initialize `style.opacity: 1` on SSR/static render** so non-JS / SEO sees content; opacity drops to 0 only via JS-added class. This is the progressive-enhancement pattern that survives JS failure.

---

## Summary table

| Section | Static blocks | Engine-driven slots | Interactive |
|---|---|---|---|
| Hero | 1 (eyebrow) | 7 (heroName, h1, sub, band-pill, opp-pill, scoreNum, scoreline) | Score count-up |
| Spectrum | 2 (endpoints) | 4-6 (gap/fill positions, marker positions/labels, legend captions) | Width animation, layout flip by mode |
| What X means | 0 | 4 (eyebrow, h2, p, 3 cards) | Reveal-on-scroll only |
| Pillars | 1 (eyebrow) | 2 + 5 pillars (h2, 5 rows, leverbox, optional notebox) | Bar fill animation |
| Findings | 1 (eyebrow) | 2-4 (h2, optional intro, 1-3 findings) | Reveal-on-scroll only |
| Subtraction | 1 (eyebrow) | 4 (3 numbers, paragraph) | Counter animation, viewport trigger |
| Method | 3 (eyebrow, h2, trustline) | 3 (steps) | Reveal-on-scroll only |
| Trust card | All | 0 | None |
| PriceHero | All except CTA eyebrow | 1 (first-name eyebrow injection) | None |
| Promise strip, decision frame, pricing, footer | All | 0 | None |

**Bottom line**: roughly 25 distinct engine-driven values + 5 array fields, on a page that has substantial static commerce furniture. Most of the page does not depend on the engine; the dependency surface is concentrated in the top half (hero through findings) and the subtraction beat.
