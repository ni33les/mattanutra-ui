MattaNutra Thai Patch Pack · 2026-07-23
=======================================

Source zip: files/MattaNutra_TH_Patch_2026-07-23.zip
Guide: 00_START_HERE.md

Applied on platform (paste-only, do not retype Thai):
- Shared header: content/i18n/locales/th.json customer.titleBar.*
- Library blocks + Thai OG: customer.libraryIndex.* + public/assets/og/mattanutra-library-th.jpg
- Quiz post-v4 chrome: customer.assessmentUi.* + components/assessment-flow-copy-th.ts trust strip
- Units: assessment-flow locale-aware ซม./กก./ฟุต/นิ้ว/ปอนด์
- og:locale: th htmlLang th-TH → th_TH

Verification: test/ttf-th-patch-2026-07-23-static.test.ts
Pack tools: verification/lint_th.py, verify_deployment.py
