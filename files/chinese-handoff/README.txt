Chinese optimised localisation handoff
======================================

Source package: files/chinese.zip
Extracted: Chinese_optimised_localisation_conversion/

Files
-----
1) mattanutra-zh-CN market optimised for conversion_DS.rtf
   - Public marketing / landing / glossary conversion copy
   - Reconciled by: content/i18n/reconciliation/zh-CN-rtf.json
   - Audit: npm run i18n:rtf-audit -- --locale=zh-CN --file="files/chinese-handoff/Chinese_optimised_localisation_conversion/mattanutra-zh-CN market optimised for conversion_DS.rtf"
   - Runtime: content/i18n/locales/zh-CN.json via customer.landing.*, titleBar, footer, SEO

2) Questionaire Page.rtf
   - Questionnaire field/UI copy + HealthScore page conversion samples
   - Structured extract: questionnaire-rtf-plain.txt, questionnaire-rtf-pairs.json
   - Runtime questionnaire fields: components/assessment-flow-copy-zh-cn.ts
   - Runtime questionnaire chrome: content/i18n catalog namespace customer.assessmentUi.*
     (wired through components/assessment-flow-copy.ts)
   - HealthScore page shell: components/nutrition-flow/healthscore-panel-copy.ts + customer.healthScore.*

Tooling
-------
- scripts/extract-zh-cn-handoff.mjs  — re-extract RTF rows/plain text
- scripts/zh-cn-handoff-gap.mjs      — rough gap report → GAP_MATRIX.json
- scripts/audit-rtf-translation.ts  — market RTF matrix audit (table-shaped)

Rules
-----
- Option value codes stay English (scoring / APIs). Only labels translate.
- Do not ship Grok rewrites of native handoff strings via product_copy_translation.
- Glossary: content/i18n/glossary.json (知量 / 知量方案 / 动态健康方案 / 健康评分 / MattaNutra).
