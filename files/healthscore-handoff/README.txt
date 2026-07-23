HealthScore handoff (Proton package) — MattaNutra platform
==========================================================

Source zip: HEALTH_SCORE_STUFF_PROTON.zip (also files/HEALTH SCORE STUFF PROTON.zip)

Authoritative runtime reference
-------------------------------
FINAL/   = FINAL Healthscore/Richard Hand-off FINAL Healthscore/

  00_HANDOFF.md               Port doctrine (port, do not re-derive)
  01_DESIGN_TOKENS.md         Color / type / spacing
  02_COMPONENT_INVENTORY.md   Static vs engine vs interactive
  03_ENGINE_CONTRACT.md       locked / copy / meta schema
  04_ENGINE_DEPLOYMENT.md     Python engine notes (reference only)
  05_TEMPLATE.html            Production slots
  06_GOTCHAS.md               CSS / spectrum landmines
  07_PERSONALIZATION_LAYER.md Stage 6 AI polish rules
  Profile1_Marcus_v7.html     Visual ground truth (low score)
  Profile2_Priya_v7.html      Visual ground truth (high score)
  healthscore.css             Bespoke CSS

Content layer reference (data for catalog sync)
-----------------------------------------------
CONTENT_LAYER/   = HealthScore Library files (healthscore_library.py, etc.)

  FINDINGS / GOAL_PHRASE / RELATIVITY / BAND_LINE / FORBIDDEN
  are the EN source of truth for customer.healthScore.* default messages.

Platform mapping
----------------
- Scoring: TypeScript lib/health-score (v4). Python engine in this package is
  reference + parity probe; not required as a live microservice for V1.
- Content phrases: content/i18n customer.healthScore.* via lib/health-score/v4-copy.ts
- Page chrome: components/nutrition-flow/healthscore-panel-copy.ts (en/th/zh-CN)
- UI: components/nutrition-flow/healthscore-panel.tsx (mn-healthscore-v7)
- Stage 6 polish: task analyze_healthscore → HealthScore Engine agent
  with lib/health-score/ai-response-validator.ts (locked immutability)

Translations
------------
The Proton package is English. Thai and zh-CN live in:
  - content/i18n/locales/th.json + zh-CN.json (customer.healthScore.*)
  - healthscore-panel-copy.ts locale blocks

Do not invent clinical Thai; keep catalog key parity across locales.

GAP_MATRIX.json
---------------
Machine-generated inventory of slots / findings / catalog coverage / UI markers.
