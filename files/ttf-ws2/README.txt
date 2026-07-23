Workstream 2 — Thai Questionnaire hand-off
==========================================
Source: files/ttf.zip nested MattaNutra_TH_Questionnaire_Handoff_2026-07-19.zip
Extracted fixtures: files/ttf-ws2/MattaNutra_TH_Questionnaire_Handoff_2026-07-19/

Deployed surfaces:
- Assessment copy: components/assessment-flow-copy-th.ts (labels only; values unchanged)
- UI chrome: components/assessment-flow-copy.ts assessmentUiCopy.th (privacy gate, precision marks)
- SEO: content/i18n/locales/th.json seo.routes.nutritionQuiz.*
- OG image: public/assets/og/mattanutra-questionnaire-th.jpg
- OG/Twitter image alt (th): MattaNutra — รู้ปริมาณที่พอดี

Rules: never retype Thai; option values stay English codes; copy-paste from hand-off HTML.

Explicitly accepted product deltas (not ship blockers)
------------------------------------------------------
Documented in RECONCILIATION_RAW.json accepted_deltas. Intentional:

1. avoidNote free-text "อาหารที่ต้องหลีกเลี่ยงหรือไม่ชอบ"
   Hand-off food step includes an avoidance textarea. React assessment schema
   has no avoidNote field; not rendered. Product decision — do not invent schema.

2. Food-step disclosure confirmation UI
   Hand-off shows a food-step disclosure checkbox. Product privacy gate
   (assessmentUiCopy.th.privacyGate) is the consent surface; food-step
   disclosure is not duplicated.

Other accepted deltas (codes/markets/CTA chrome) remain in RECONCILIATION_RAW.json.
