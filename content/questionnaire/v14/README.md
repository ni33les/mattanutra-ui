# Questionnaire v14 (immutable frontend)

**Source of truth:** `V14_Questionnaire_v3_EN_TH_Final_v1.html` (from business package `files/qv14.zip`).

## Rules

- Do **not** regenerate, rewrite, retranslate, or re-port this HTML via an LLM.
- Do **not** rename question keys or option values.
- Thai and English strings in this file are the approved production copy.

## Integration (IT only)

At serve time (`lib/questionnaire/v14/serve.ts`) we inject only:

- `MN_CONFIG.endpoint` → `/api/questionnaire/v14/submit`
- `MN_CONFIG.trackEndpoint` → `/api/questionnaire/v14/track`
- Logo placeholder → `/v15/logo.png` **only if** the package still contains the placeholder string

EN/TH quiz URLs rewrite to this document (`next.config.ts` beforeFiles).

## Integrity

```bash
sha256sum V14_Questionnaire_v3_EN_TH_Final_v1.html
# must match V14_Questionnaire_v3_EN_TH_Final_v1.html.sha256
```

## Verify after deploy

In browser console on `/en/nutrition/quiz` or `/th/nutrition/quiz`:

```js
MattaNutraProductionReadiness()
// both endpoints should be true
```
