# Questionnaire v14 (reference asset)

**Approved package:** `V14_Questionnaire_v3_EN_TH_Final_v1.html` (from business package `files/qv14.zip`).

## Role in the codebase

This HTML is a **reference / content source of truth** for the approved EN/TH
questionnaire UX and copy. It is **not served** in production.

Production quiz routes (`/en/nutrition/quiz`, `/th/nutrition/quiz`) use the
React `ChatQuestionnaire` stack:

- Content: `content/questionnaire/v6/{en,th,welcome}.json`
- Engine: `lib/questionnaire/*`
- UI: `components/chat-questionnaire/*`
- Page: `app/[locale]/nutrition/quiz/page.tsx`

When business delivers an updated HTML package, port carefully into the React
content + components — do not reintroduce an HTML document route or Next rewrite.

## Port rules

- Preserve question keys (`k`) and option values (`v`).
- Prefer approved EN/TH strings from this package for copy parity.
- Product exception: sex question uses **“What is your sex?”** /
  **“เพศของคุณคือ”** (never “sex at birth” / “เพศกำเนิด”).
- Do not auto-click begin/start via regex; welcome CTA is explicit.
- Site `TitleBar` owns brand + language chrome (no double header in welcome).

## Integrity

```bash
sha256sum V14_Questionnaire_v3_EN_TH_Final_v1.html
# must match V14_Questionnaire_v3_EN_TH_Final_v1.html.sha256
```
