# Design Tokens — HealthScore v7

All values below are **extracted verbatim** from `reference/Profile2_v7.html`. The file is the source of truth; this document is the inventory of what to lift. Where a token has no clean Tailwind equivalent, the note column explains how to handle it.

---

## 1. Colors

The page uses 18 named colors as CSS custom properties on `:root`. Every visible color on the page is one of these — there are no inline hex values used elsewhere except inside `linear-gradient(...)` strings.

| Token | Hex | Role | Tailwind extension name (suggested) |
|---|---|---|---|
| `--ink` | `#0A2540` | Primary text on light, headlines, scorenum | `ink` |
| `--ink-soft` | `#1E3A5F` | Body text, secondary labels | `ink-soft` |
| `--teal` | `#2D8F72` | Brand accent, dashed borders, focus states | `teal` |
| `--teal-deep` | `#1F6E58` | Buttons, eyebrows, methodology numerals | `teal-deep` |
| `--teal-light` | `#4DB497` | Mint check icons, soft accents | `teal-light` |
| `--teal-glow` | `#B8E0CF` | Spectrum bar gradient stop | `teal-glow` |
| `--gold` | `#B8943D` | Limited-time badge | `gold` |
| `--gold-soft` | `#D4B871` | Top scorecard rim accent | `gold-soft` |
| `--gold-tint` | `#F6EBC7` | Gold badge background | `gold-tint` |
| `--cream` | `#FAF6EC` | **Page background** (body) | `cream` |
| `--cream-deep` | `#F2EBD8` | Decision frame, mint backgrounds | `cream-deep` |
| `--mint` | `#EAF3EC` | Trust-check pill backgrounds, mint accents | `mint` |
| `--mint-deep` | `#DCE9DE` | Card hover/active states | `mint-deep` |
| `--paper` | `#FEFCF7` | Scorecard, card surfaces (lighter than --cream) | `paper` |
| `--ash` | `#6B7280` | Disabled / muted text | `ash` |
| `--ash-soft` | `#9CA3AF` | Step indicators (inactive) | `ash-soft` |
| `--line` | `#E5E1D4` | Dividers, card borders | `line` |
| `--sand` | `#E8DCC1` | Warm accent (rarely used) | `sand` |

**Critical pair**: `--cream` (#FAF6EC) is the page background; `--paper` (#FEFCF7) is the slightly-lighter card surface. They are *not* interchangeable — every card on the page is `--paper` on top of `--cream`. The contrast is intentional and small. Codex will often collapse near-equal colors to one value; **do not**.

---

## 2. Typography

Three families, loaded from Google Fonts via a single `<link>`. The full URL is:

```
https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500;600&display=swap
```

| Family | Token | Stack | Used for |
|---|---|---|---|
| **Fraunces** | `--font-display` | `"Fraunces", Georgia, serif` | All h1, h2, h3, scorenum, decision-frame copy. Variable optical-size axis 9..144. |
| **DM Sans** | `--font-body` | `"DM Sans", -apple-system, sans-serif` | All body text, paragraphs, buttons, captions. |
| **JetBrains Mono** | `--font-mono` | `"JetBrains Mono", ui-monospace, Menlo, monospace` | Eyebrows, percentile labels, badge text, spectrum endpoint markers. |

**Weights actually used in v7**:
- Fraunces: 300, 400, 500, 600 (italic 400, 500)
- DM Sans: 400, 500, 600, 700
- JetBrains Mono: 400, 500, 600

If you tree-shake the font loads, those are the weights to keep. Dropping any of them changes the visual rhythm.

**Optical-size note (Fraunces)**: Fraunces is a variable font with an optical-size axis. The `9..144` in the URL is the range of sizes Fraunces optimizes for. The browser picks the right optical-size automatically based on rendered font-size. This is why hero h1 looks different from body h3 — they are different optical sizes of the same family. **Do not substitute Fraunces with a fixed-size serif.** The optical-size axis is part of the polish.

### Type scale

The hero h1 uses `clamp()` for fluid sizing:

```css
h1.goalmirror { font-size: clamp(36px, 5.2vw, 64px); }
```

Other headings are fixed:

| Selector | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|
| `h1.goalmirror` | clamp(36px, 5.2vw, 64px) | 400 | 1.08 | -0.02em |
| `h2` (section) | clamp(32px, 3.4vw, 46px) | 400 | 1.12 | -0.02em |
| `h3` (cards, findings) | 22px | 500 | 1.25 | -0.01em |
| Body `<p>` | 16-17px | 400 | 1.55-1.6 | normal |
| `.eyebrow` | 12px | 500 | 1 | 0.18em (uppercase) |
| `.bignum` (scorenum) | clamp(110px, 14vw, 168px) | 300 | 0.95 | -0.04em |
| `.pTitle` (promise) | 11px | 700 | 1 | 0.16em (uppercase) |

The `clamp()` values are tuned to the page's container width (1080px) and viewport breakpoints (mobile breakpoint at 740px, decisive layout shift at 880px). **Do not replace `clamp()` with media queries** — the fluid scaling is what makes the hero feel right across screen sizes.

---

## 3. Layout

| Token | Value | Used for |
|---|---|---|
| `--container` | `1080px` | Max page width (`.wrap`) |
| Section padding (desktop) | `160px 28px` | `section.wrap{padding:160px 28px}` ← see Gotcha #1 |
| Section padding (mobile <740px) | `96px 18px` | `section.wrap{padding:96px 18px}` |
| Hero padding (desktop) | `74px 0 30px` | `.hero` |
| Hero padding (mobile) | `48px 0 24px` | `.hero` |
| Grid gap (priceHero) | `48px` desktop / `36px` mobile | text-column to image-column |
| Mobile breakpoint | `740px` and `880px` | Two breakpoints used: 880 for priceHero grid collapse, 740 for general mobile rules |

### The `section.wrap` specificity rule — critical

The `.wrap` class has `padding: 0 28px` for horizontal centering. A naive `section { padding: 160px 0; }` rule appears in the file but **does not apply** because `.wrap` (specificity 0,0,1,0) beats `section` (0,0,0,1). The working rule is:

```css
section.wrap { padding: 160px 28px; }       /* desktop — specificity 0,0,1,1 */
@media (max-width: 740px) {
  section.wrap { padding: 96px 18px; }      /* mobile — same specificity */
}
```

Without this fix, every section's vertical padding silently zeroes out. See `06_GOTCHAS.md` for the full story.

---

## 4. Shadows

| Token | Value | Used for |
|---|---|---|
| `--shadow` | `0 32px 80px -54px rgba(10, 37, 64, .55)` | Scorecard, pricing cards, decision frame |
| `--shadow-sm` | `0 12px 32px -22px rgba(10, 37, 64, .5)` | Gap cards, finding cards, lever box |

Both shadows use **negative spread radius** (`-54px`, `-22px`) to keep the shadow tight under the element rather than bleeding outward. This is a deliberate choice — flat shadows with positive spread look cheaper. **Do not normalize these values to `0 8px 24px rgba(0,0,0,0.1)` or similar Bootstrap-default shapes.**

The box image (`.boxFigure img`) has `filter: none` — **no shadow on the photograph**. This is deliberate: in v7 we removed the drop-shadow so the box reads as "on the page" rather than "as a card on the page." Don't add a shadow back to the image.

---

## 5. Border radius

| Token | Value | Used for |
|---|---|---|
| `--radius` | `24px` | Cards, scorecard, decision frame |
| `--pill` | `999px` | Pills, badges, mint checks, promise icons |

The scorecard uses `border-radius: 36px` (one-off, larger than `--radius`) because it's the primary element and needs visible weight. This is hardcoded, not tokenized.

---

## 6. Animation

No `@keyframes` defined in v7 — all animation is JS-driven, not CSS. The pieces are:

| Animation | Duration | Easing | Driven by |
|---|---|---|---|
| Score count-up (0 → score) | 1100ms | cubic ease-out: `1 - (1-p)^3` | JS in `<script>` block at end of file |
| Pillar bar fills | individual per-row | linear (CSS transition) | JS sets `style.width` from `data-w` attribute |
| Spectrum bar fill | 350ms delay, then width transition | linear (CSS transition: width 1.6s ease-out) | JS sets `style.width` from `data-w` |
| Subtraction counters (120→112→8) | 900ms / 1100ms / 1300ms | cubic ease-out | JS, triggers when `.subtract` enters viewport |
| Reveal-on-scroll | opacity + transform | 1s ease, optional `d1/d2/d3` delay classes | JS adds `.in` class when element scrolls into view |

**Reveal mechanics**: elements with `.reveal` start at `opacity: 0` only if `<html>` has the `js` class (set by the script at boot). On scroll, each element gets the `.in` class, which animates to `opacity: 1` and `transform: translateY(0)`. A 1.8s safety timeout calls `showAll()` regardless of scroll, so if JS fails, the page is still visible. **Preserve this safety timeout** when porting — without it, mobile scroll-reveal will trap content invisible.

---

## 7. Bespoke (non-tokenizable) CSS

These pieces don't translate to Tailwind utilities. Lift them verbatim into `healthscore.css`.

### 7a. Trust card gradient

```css
.trustcard {
  background:
    radial-gradient(circle at 20% 0%, rgba(77,180,151,.18), transparent 55%),
    linear-gradient(135deg, var(--teal-deep) 0%, #155847 100%);
  color: white;
  border-radius: var(--radius);
  padding: 38px 40px 34px;
  box-shadow: var(--shadow);
}
```

The radial-on-linear layering gives the card a soft top-left highlight. A flat `bg-teal-deep` does not look the same.

### 7b. Scorecard "rim" effect

The scorecard has a thin gold gradient at the top edge:

```css
.scorecard::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 5px;
  background: linear-gradient(90deg, var(--teal), var(--gold-soft), var(--teal));
  border-radius: var(--radius) var(--radius) 0 0;
}
```

### 7c. Spectrum bar geometry

The spectrum bar consists of four absolutely-positioned children:

- `.spec-bar` — full-width track (the gray base)
- `.spec-gap` — the dashed-border "recoverable gap" rectangle (positioned by inline `style="left:X%;width:Y%"`)
- `.spec-fill` — the teal "where you are" fill (positioned by `data-w` attribute, animated)
- `.marker.you`, `.marker.med` — vertical markers with captions

**Marker layering order matters.** When score < median (gap-framed, Marcus), `.marker.you` must render *before* `.marker.med` in DOM order so the captions don't collide. When score ≥ median (rank-framed, Priya), they render in the opposite order. The template enforces this via a conditional block.

The spec-fill width is set by JS reading `data-w` to allow the animation. Do not set it in CSS.

### 7d. Pillar bar fills (`.pfill.hi` vs `.pfill.lo`)

```css
.pfill.hi { background: linear-gradient(90deg, var(--teal-light), var(--teal-deep)); }
.pfill.lo { background: linear-gradient(90deg, var(--gold-soft), var(--gold)); }
```

The split is by value: `hi` = ≥50%, `lo` = <50%. The engine decides which class to use; the template renders `class="pfill {{ pillar.fill_class }}"`.

### 7e. Mobile pillar row restructure

At <740px, the pillar row layout changes from three columns to two areas:

```css
@media (max-width: 740px) {
  .prow {
    grid-template-columns: 1fr 44px;
    grid-template-areas: "name val" "track track";
    gap: 6px 10px;
    padding: 14px 0;
  }
  .pname { grid-area: name; }
  .pval  { grid-area: val; }
  .ptrack { grid-area: track; }
}
```

This puts the name and value on one row, the full-width bar below. Without it the bar gets crushed on mobile.

### 7f. Four-promise icon strokes

```css
.promise svg {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  stroke-width: 1.6;        /* ← important, not 2 */
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

`stroke-width: 1.6` is deliberate. `2` looks childish, `1` looks fragile.

---

## 8. Suggested `tailwind.config.js` extension

If you want to absorb the token set into your Tailwind config (recommended), this is the shape:

```js
// tailwind.config.js — extend section
theme: {
  extend: {
    colors: {
      ink: '#0A2540',
      'ink-soft': '#1E3A5F',
      teal: '#2D8F72',
      'teal-deep': '#1F6E58',
      'teal-light': '#4DB497',
      'teal-glow': '#B8E0CF',
      gold: '#B8943D',
      'gold-soft': '#D4B871',
      'gold-tint': '#F6EBC7',
      cream: '#FAF6EC',
      'cream-deep': '#F2EBD8',
      mint: '#EAF3EC',
      'mint-deep': '#DCE9DE',
      paper: '#FEFCF7',
      ash: '#6B7280',
      'ash-soft': '#9CA3AF',
      line: '#E5E1D4',
      sand: '#E8DCC1',
    },
    fontFamily: {
      display: ['Fraunces', 'Georgia', 'serif'],
      body: ['DM Sans', '-apple-system', 'sans-serif'],
      mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'monospace'],
    },
    borderRadius: {
      DEFAULT: '24px',
      pill: '999px',
    },
    boxShadow: {
      DEFAULT: '0 32px 80px -54px rgba(10,37,64,.55)',
      sm: '0 12px 32px -22px rgba(10,37,64,.5)',
    },
    maxWidth: {
      container: '1080px',
    },
  },
},
```

After this extension, utility classes like `bg-teal-deep`, `text-ink`, `shadow`, `max-w-container`, `font-display` work directly. The pieces this **doesn't** cover — gradients, scorecard rim, spectrum geometry, pillar gradients, mobile pillar restructure, promise icon strokes — live in `healthscore.css` alongside the rest of your CSS.
