# HealthScore Page — Handoff to MattaNutra IT

**Package version**: v7 · **Date prepared**: 2026-06-11 · **Read this first.**

---

## What this package is

This folder contains everything needed to take the HealthScore page from a designed-and-built prototype into production at mattanutra.com. It is deliberately **fuller than the landing-page handoff** because the HealthScore page is not just markup — it is a personalized render driven by a deterministic scoring engine, and the polish lives in dozens of specific decisions that don't survive a "mimic the look and feel" pass.

The reference Priya and Marcus pages in `reference/` are what production should look like at the pixel level. The template, tokens, contract, engine code, and deployment guide in this package are the means to get there *without re-deriving anything*.

## The reframe — please read this first

The instinct on the v15 landing-page handoff was "ask Codex to interpret and mimic as close as possible." That approach lost polish because re-derivation is lossy: dozens of specific decisions get rounded to the nearest familiar default and the page comes back close-but-flat.

**This is a different kind of task.** The HealthScore work is three jobs, not one:

1. **Port the markup** into your component structure, preserving class names and bespoke CSS verbatim. Do NOT re-derive the styling.
2. **Deploy the engine** as a backend service. It is Python, deterministic, and ships with a Dockerfile and FastAPI wrapper.
3. **Bind the contract**: every personalized value on the page maps to a specific field in the engine's output JSON. Wire the template to those fields.

If Codex is involved, the instruction is: **"port this template into our component structure, preserving the class names and lifting the design tokens. Then bind these slots to the engine's JSON output."** Not "make it look like this."

## Read order

1. **`00_HANDOFF.md`** ← you are here
2. **`01_DESIGN_TOKENS.md`** — color, type, spacing, shadow, radius. Lift verbatim.
3. **`02_COMPONENT_INVENTORY.md`** — every block on the page tagged static / engine-driven / interactive, with data shapes
4. **`03_ENGINE_CONTRACT.md`** — the JSON schema produced by the engine; the firewall between view and computation
5. **`04_ENGINE_DEPLOYMENT.md`** — how to host the Python engine (Docker, FastAPI, the endpoint contract)
6. **`05_TEMPLATE.html`** — production HTML with `{{ }}` slots tied to contract fields
7. **`06_GOTCHAS.md`** — landmines we hit during the build. Read this before you port the CSS.
8. **`07_PERSONALIZATION_LAYER.md`** — Stage 6 AI polish spec (optional voice/cadence pass on engine output)

Two engineers can work in parallel after they've read 00–02: one on the markup-and-template (files 05, 06) and one on the engine deployment (files 03, 04). They re-converge at the contract.

## What's in `reference/`

- **`Profile2_v7.html`** — Priya, score 80, "Strong with headroom." Rank-framed relativity (`ahead of ~96%`), one finding, plant-forward strength note.
- **`Profile1_v7.html`** — Marcus, score 47, "Building foundation." Gap-framed relativity (`13 points below`), three findings led by a statin-CoQ10 interaction.
- **`Profile1_content.json`** — Marcus's engine output. This is the worked example for the JSON contract; every value on his page traces back to a field here.
- **`healthscore.css`** — the bespoke CSS extracted from v7, ready to drop into your app alongside Tailwind.

The two demo pages **are not the production template**. They have engine values baked into the markup. The production template (`05_TEMPLATE.html`) replaces those bakes with `{{ }}` slots. Use the demo pages as the visual ground truth; use the template as the file you actually port.

## What's in `engine/`

- **`engine.py`** — the deterministic 5-layer scoring model. Same answers in → same JSON out, every time.
- **`healthscore_library.py`** — content library: goal phrases, band lines, forbidden substrings, symptom mappings.
- **`healthscore_content.py`** — `build_page_content(answers, result, percentile, ...)`: produces the JSON the template renders.
- **`pctile.json`** — score → percentile lookup from a 20K-profile Monte Carlo simulation. **Do not regenerate this casually**; the engine's calibration depends on it.
- **`server.py`** — FastAPI wrapper exposing `POST /score`. The HTTP contract is documented in `04_ENGINE_DEPLOYMENT.md`.
- **`Dockerfile`**, **`requirements.txt`** — for self-hosted deployment.
- **`test_engine.py`** — snapshot tests against Priya and Marcus. Run these before and after any change; if the outputs drift, the change broke something.

## What's NOT in this package — and why

- **`HealthScore_Engine_v2.xlsx`** — calibration reference, not runtime. It exists so non-technical stakeholders can inspect the formula structure in Excel. The Python is the source of truth; the spreadsheet is documentation. **Do not port the Excel logic into TypeScript or anywhere else** — the Python implementation has been Monte-Carlo-calibrated and the lookup table reflects that calibration.
- **A TypeScript port of the engine.** Don't build one. The validation cost (matching outputs across thousands of test cases) significantly exceeds the savings (one fewer language). Run the Python engine as a microservice.
- **Stage 6 AI polish runtime code.** The spec in `07_PERSONALIZATION_LAYER.md` is complete; the implementation is V2 work and intentionally deferred.

## On `Stage 6` (AI polish) — what to plan for now

V1 should ship without AI polish: the engine's `copy.*` fields are already production-ready text. The page will render with deterministic copy from `build_page_content` and no LLM call in the hot path. This is the cheaper, faster, more reproducible path.

V2 enables Stage 6: between the engine and the template, an LLM lightly rewrites the rewritable `copy.*` fields for voice/cadence, while a validator confirms it didn't change any locked value. **Plan the interface for it now even if you don't enable it.** Concretely: the template renderer should call a `polish(content_package) -> content_package` function that is a no-op in V1 and an LLM call with validation in V2. See `07_PERSONALIZATION_LAYER.md`.

## Where the polish lives — the things that don't survive re-derivation

If anyone is tempted to rebuild rather than port, these are the specific places polish silently disappears:

- The scorecard's number-counting animation easing (`1 - (1-p)^3` over 1100ms — cubic ease-out, custom). Replacing with a CSS transition looks generic.
- The spectrum bar's marker layering order — Marcus (below-median) needs `.marker.you` rendered above `.marker.med`; Priya (above-median) needs them in the opposite order, otherwise captions collide.
- The trust card's gradient is a layered `radial-gradient` + `linear-gradient`, not a flat color. Codex will flatten it.
- The reveal-on-scroll choreography uses progressive enhancement so content stays visible if JS fails. A simple `IntersectionObserver` port will silently break mobile if `<html>` doesn't get the `js` class added.
- The `section.wrap` padding rule has a specificity nuance documented in `06_GOTCHAS.md`. If this is missed the page silently loses all section spacing.
- The four-promise strip's icon strokes are 1.6px with rounded caps and joins. Any other value reads as childish.

## Questions and next steps

Two of the engineer-facing questions that may come up early:

- **Tailwind config**: you can extend `tailwind.config.js` to absorb our color, font, radius, and shadow tokens (the values are extractable from `01_DESIGN_TOKENS.md`), and lift `healthscore.css` for the bespoke pieces that don't fit utility-class shapes. That hybrid is the recommended path. Pure Tailwind would require rewriting the bespoke gradients and the scorecard geometry as inline styles, which we'd advise against.
- **Templating syntax**: we used Jinja-style `{{ }}` and `{% for %}` / `{% endfor %}` in `05_TEMPLATE.html` because they're universally readable. If your landing-page implementation standardized on a different syntax (Nunjucks, Handlebars, Liquid, Pug), a single regex pass converts ours to yours — the slot *names* are the contract, not the delimiter syntax.

If anything in this package is unclear or pushes against constraints in your stack, please flag specifically which file and which section before improvising — the polish lives in specifics and we'd rather adapt the package than have you reverse-engineer it.

Thanks for the careful work.
