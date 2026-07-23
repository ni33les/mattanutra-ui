# Gotchas — Landmines We Hit, Documented So You Don't

This document is the consolidated list of specific traps encountered during the HealthScore build. Each one cost real iteration time. Read this before you port the CSS, before you wire up the spectrum, and before you enable Stage 6.

Ordered by how much pain they'll save you.

---

## 1. The `.wrap` specificity rule (highest-impact gotcha)

**Symptom**: After porting, all sections look crammed against each other. You bump section padding from 80px to 100px to 128px to 160px — no visual change. You suspect the CSS isn't being applied.

**Cause**: The `.wrap` class is `{ padding: 0 28px }` for horizontal centering, applied as `<section class="wrap">`. A naive `section { padding: 160px 0 }` rule **does not apply** because `.wrap` (CSS specificity 0,0,1,0) beats `section` (0,0,0,1). The browser silently uses `.wrap`'s value, zeroing vertical padding.

**Fix**: Use a selector with class+element specificity:

```css
section.wrap { padding: 160px 28px; }                /* desktop: 0,0,1,1 */
@media (max-width: 740px) {
  section.wrap { padding: 96px 18px; }               /* mobile */
}
```

This took multiple iterations to find — every bump to the section-only rule looked like it should work but silently didn't. **If section spacing looks wrong after porting, this is the first place to check.**

The same gotcha lurks anywhere you have a utility class with a property that also has an element-level rule. Tailwind's `.p-X` utilities are class-specificity and will override an `element { padding }` rule for exactly the same reason.

---

## 2. Reveal-on-scroll can trap content invisible on mobile

**Symptom**: Page renders fine on desktop. On mobile, sections below the fold are blank — content is present in DOM but `opacity: 0` and never animates in.

**Cause**: The `.reveal` class is `{ opacity: 0; transform: translateY(20px) }` so elements start hidden. A scroll listener adds `.in` which animates them visible. On mobile, certain scroll behaviors (page-load scroll restoration, hash anchors, fast scrolls) can fire before the listener attaches OR can skip past sections so their viewport-check never fires, leaving them hidden permanently.

**Fix — three-layer defense, all of which v7 has and must be preserved**:

1. **Progressive enhancement**: The base CSS rule is `.reveal { opacity: 1 }` (visible by default). The opacity-0 rule is gated behind `html.js .reveal { opacity: 0 }`. The script adds the `js` class to `<html>` before doing anything else. If JS fails to run at all, content stays visible.

2. **Direct scroll handler**: Each `.reveal` is checked on `scroll` and `resize` events; when its `getBoundingClientRect().top < window.innerHeight * 0.92`, the script adds `.in` immediately. No `IntersectionObserver` polyfill needed for older mobile browsers.

3. **Safety timeout**: 1.8 seconds after page load, `showAll()` runs unconditionally — every remaining `.reveal` gets `.in`. This catches the rare case where the scroll handler misses something. The timeout is invisible because most reveals are already in by then.

**When porting to React/Vue/Headless UI**: Translate the scroll handler to `useEffect` with an `IntersectionObserver`, but **keep all three layers**:
- SSR/static render must include the visible base CSS so the first paint is correct
- The `js` class on `<html>` (or a `Reveal` provider component) must be added before any opacity-0 rule activates
- A timeout fallback must still exist for the failure case

Without all three, you will get blank-page bugs in production that don't reproduce locally.

---

## 3. Spectrum marker DOM order flips by relativity mode

**Symptom**: Below-median customers (gap-mode, Marcus) see the median caption colliding with the "YOU" caption, overlapping in an unreadable way. Above-median customers (rank-mode, Priya) look fine.

**Cause**: The spectrum bar has two markers: `.marker.you` (caption above the bar via `.cap.top`) and `.marker.med` (caption below via `.cap.bot`). Both are absolutely positioned by `style="left: X%"`. When the markers are CLOSE in position (e.g., Marcus at 27.4%, median at 48.4% — only 21pp apart), the later-rendered marker's caption can overlap the earlier one because of stacking order.

**Fix**: Render the marker that's leftward of the other one FIRST in DOM order. Specifically:

```html
{% if relativity.mode == 'gap' %}
  {# score < median: YOU is on the left, render first #}
  <div class="marker you" style="left:{{ you_pct }}%"><span class="cap top">YOU · {{ score }}</span></div>
  <div class="marker med" style="left:{{ med_pct }}%"><span class="cap bot">Typical finisher · {{ median }}</span></div>
{% else %}
  {# score >= median: MED is on the left, render first #}
  <div class="marker med" style="left:{{ med_pct }}%"><span class="cap bot">Typical finisher · {{ median }}</span></div>
  <div class="marker you" style="left:{{ you_pct }}%"><span class="cap top">YOU · {{ score }}</span></div>
{% endif %}
```

The template in this package does this correctly. Don't simplify it to a single fixed order during the port.

**Why not solve this with z-index?** Z-index alone doesn't help because the issue is the captions visually overlapping in screen space, not stacking order of opaque elements. The captions are positioned above/below the bar respectively, so they wouldn't even overlap *vertically* — but the leftward marker's caption (cap top, sticking up) appears in the visual scan path before the rightward marker's. Render order maps to visual scan order, which is what we want.

---

## 4. First-name injection MUST use `textContent`, never `innerHTML`

**Symptom**: A customer named `O'Brien` or `<script>` shows up oddly, OR worse, an attacker controlling the first-name field can inject HTML.

**Cause**: HTML interpretation of user-supplied data is an XSS vector. If first_name is server-rendered into an HTML attribute or `<span>`, escape rules must be perfect on the server side.

**Fix**: v7 uses client-side `textContent` injection:

```js
var FIRST_NAME = {{ first_name|tojson|safe }};   // tojson produces a JSON-encoded string literal
var heroSlot = document.getElementById('heroName');
if (FIRST_NAME) heroSlot.textContent = FIRST_NAME + ', ';  // textContent auto-escapes
```

`textContent` setter HTML-escapes automatically: a name like `<script>alert(1)</script>` becomes literal characters in the page, not executed code. Even `O'Brien` renders correctly without escaping concerns.

**The `tojson|safe` Jinja pattern**: produces a properly-quoted JS string literal in the template output (`var FIRST_NAME = "O'Brien";`). The `|safe` tells Jinja "don't double-encode this, it's already a valid string literal." Without `|tojson`, a customer name with embedded quotes would break the JS syntax.

The engine also sanitizes first names at the boundary (see `healthscore_content.py:_clean_name`) — strips control characters, limits length, title-cases — before they ever reach the renderer. **Both defenses run; don't remove either.**

---

## 5. Embedded base64 image in production wastes bytes

**Symptom**: HealthScore HTML is 218KB — most of it is one giant `data:image/jpeg;base64,...` blob for the box photograph. Page download takes 200-500ms even on broadband.

**Cause**: The demo files embed the box image directly so the HTML works standalone (no separate asset hosting required). Convenient for sharing, terrible for production.

**Fix**: In production, host the image on your CDN and replace:

```html
<img id="boxImg" src="{{ box_image_url }}" alt="...">
```

The template (`05_TEMPLATE.html`) already has `{{ box_image_url }}` as a slot — pass the CDN URL from your renderer. Recommended file: WebP format at ~50KB (was 140KB embedded as base64-encoded JPEG; converting to WebP saves another 30%).

**Cache headers**: `Cache-Control: public, max-age=31536000, immutable` on the box image is fine — the file URL should incorporate a hash or version (e.g., `/box-v7.webp`) so cache invalidation works on the rare occasion you swap it.

---

## 6. The "Eight nutrients" count is engine-driven, not template-baked

**Symptom**: Customer whose formula came back with 6 nutrients sees the subtraction beat say "Eight nutrients. That's your right amount." in the closing prose — but only "120 → 112 → 6" in the numbers above. Visible contradiction.

**Cause**: The subtraction beat has TWO references to the count: the animated number (`#n8`) and the literal in the closing paragraph. v6 of the demo file had both hardcoded to `8`; the template now uses `{{ nutrients_chosen }}` for the number and gets the paragraph from `copy.subtraction_paragraph` which the content layer builds with the right number embedded.

**Fix**: Use the slot for the number, and source the paragraph from `copy.subtraction_paragraph`. Do not template-bake the paragraph with a `{{ nutrients_chosen }}` slot at the end — let the engine produce the full paragraph because the phrasing depends on the count grammatically ("Six nutrients" vs "Eight nutrients" vs "Twelve nutrients" — and very low counts like "Four" may warrant a different lead-in).

**The same principle elsewhere**: don't try to template-compose engine copy by interpolating values into a fixed sentence skeleton. The content layer composes whole sentences and you render them as-is. This protects against grammatical mismatches at edge cases.

---

## 7. Drop-shadow on box image was deliberately removed

**Symptom**: Someone adds `filter: drop-shadow(...)` to `.boxFigure img` because "it looks more polished."

**Cause**: It does NOT look more polished. The shadow makes the box read as a card on top of the page (a UI element). Without the shadow, it reads as a photograph integrated into the page (an editorial element). The latter is what we want — the box is the product, the page is the surface.

This was iterated multiple times in v6/v7. The final answer is `filter: none`.

**Don't restore the drop-shadow** even if it tests slightly higher in an isolated A/B — the broader design language of the page treats the photo as content, and the shadow breaks that language.

---

## 8. `cream` vs `paper` are close but not interchangeable

**Symptom**: Cards look like they're floating on the same surface they sit on. Or worse: they look like solid blocks of the same color with a faint outline.

**Cause**: `--cream` (#FAF6EC) is the page background. `--paper` (#FEFCF7) is the card surface. The contrast is intentional but small (~4 points across each channel). Codex / autoformatters often "deduplicate" near-equal colors into one variable.

**Fix**: Treat them as semantically distinct. `--cream` is the page; `--paper` is anything on the page that's a card-like surface. If you merge them, the scorecard, the gap cards, the finding cards, and the pricing cards all visually melt into the background.

---

## 9. `section.wrap{padding}` mobile rule needs the same specificity fix

**Symptom**: Desktop spacing looks right after applying gotcha #1's fix. Mobile spacing is still cramped.

**Cause**: The mobile override needs the same `section.wrap` selector, not just `section`. Easy to forget when bumping the desktop rule.

**Fix**:

```css
@media (max-width: 740px) {
  section.wrap { padding: 96px 18px; }     /* mobile — NOT section { padding: 96px 0 } */
}
```

---

## 10. Stage 6 (AI polish) can silently change numeric literals

**Symptom**: After enabling Stage 6, an occasional customer sees their score as `47` in the bignum but the band line reads "An 48 isn't a verdict on your health" — the LLM transposed a digit and the validator missed it.

**Cause**: AI polish is allowed to rewrite copy for voice. If the LLM is unconstrained or the validator is regex-based and brittle, it can change literal numbers in the rewritten text.

**Fix**: Strict validation, fully spec'd in `07_PERSONALIZATION_LAYER.md`:
1. After every polish, parse the rewritten text and extract all integer literals.
2. Compare against the set of integers that appeared in the engine's pre-polish version.
3. If any integer appears in the polished version that wasn't in the engine version, **discard the polish and use the engine output**.
4. Log the rejection with the customer ID and both versions for review.

Better to occasionally render un-polished engine copy than to render a polished but wrong copy.

---

## 11. Mobile pillar bars need restructured layout, not just narrower columns

**Symptom**: On mobile, pillar bars get crushed to ~30px wide with the pillar name and value squeezed alongside.

**Cause**: The default 3-column grid (`170px 1fr 54px`) doesn't shrink gracefully. On a 390px viewport with 18px padding each side, the middle column has ~70px for the bar.

**Fix**: At <740px viewport, the row restructures to two grid areas:

```css
@media (max-width: 740px) {
  .prow {
    grid-template-columns: 1fr 44px;
    grid-template-areas: "name val" "track track";
    gap: 6px 10px;
  }
  .pname { grid-area: name; }
  .pval  { grid-area: val; }
  .ptrack { grid-area: track; }
}
```

Now the bar gets the full row width below the name/value. **Preserve this** when porting.

---

## 12. The Excel workbook is documentation, not source of truth

**Symptom**: An engineer reads `HealthScore_Engine_v2.xlsx`, ports a formula into TypeScript, and is now maintaining two divergent implementations.

**Cause**: The workbook was built so non-technical stakeholders can inspect the formula structure. It's a visualization of `engine.py`, not the spec.

**Fix**: Don't read formulas out of the workbook for implementation. Read them out of `engine.py`. The workbook can drift; the Python is authoritative.

---

## 13. Don't regenerate `pctile.json` casually

**Symptom**: A diff against `pctile.json` shows hundreds of changed bytes, the percentiles for every score have shifted by 1-3 points.

**Cause**: Someone ran `run_sim.py` again and overwrote the file. The Monte Carlo simulation uses random sampling; running it twice with different seeds produces different distributions even with identical population assumptions.

**Fix**: Treat `pctile.json` as **committed calibration data**, not a generated artifact. To regenerate intentionally:

1. Run `run_sim.py` with a fixed seed and the documented population assumptions
2. Inspect the diff against the previous version
3. If the diff is non-trivial (more than ±1 point on any score), document why and version-bump the engine
4. Commit with a message explaining the calibration change

Casual regeneration silently shifts every customer's percentile, which has commercial impact.

---

## 14. The four-promise icon `stroke-width: 1.6` is deliberate

**Symptom**: Icons look childish (Material-style, too thick) or fragile (hairline-thin).

**Cause**: Defaulting to `stroke-width: 2` (the SVG default for many sources) is too heavy; `1` is too light. `1.6` is the sweet spot for 32px icons in this design system.

**Fix**: Preserve the exact value. Same for `stroke-linecap: round` and `stroke-linejoin: round` — without these, the icon corners look pointy and clinical.

---

## 15. Cleanup checklist before deploying

Before pushing to production, verify:

- [ ] `section.wrap{padding}` rules use the class+element selector, not just `section`
- [ ] The `js` class is added to `<html>` before any opacity-0 rule activates
- [ ] The 1.8s safety timeout for `showAll()` is present
- [ ] Box image is hosted on CDN, not embedded base64
- [ ] First-name injection uses `textContent`, not `innerHTML`
- [ ] Stage 6 validator (if enabled) rejects polished text containing integer literals not present in the engine output
- [ ] Spectrum markers render in the correct DOM order based on `relativity.mode`
- [ ] All pillar `data-w` values are read from the engine output, not hardcoded
- [ ] The subtraction-beat numbers (120/{set_aside}/{chosen}) match the closing paragraph's literal count
- [ ] Snapshot tests (`engine/test_engine.py`) pass against Priya and Marcus fixtures
- [ ] CSS variable contrast: `--cream` and `--paper` are NOT merged into one value
- [ ] Drop-shadow on `.boxFigure img` is `filter: none`
