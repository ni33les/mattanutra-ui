# MattaNutra — Thai Patch Pack · 23 July 2026

**Read this first.** This pack follows a live-site audit performed on 23 July 2026 comparing
production against `MattaNutra_TH_Localization_Handoff_2026-07-19_v3.zip` and
`MattaNutra_TH_Questionnaire_Handoff_2026-07-19.zip`. It contains everything needed to close
the gaps found. Five items, in priority order. Same rules as before:

> **Never retype Thai. Copy-paste only. Never run a formatter over text nodes.**
> Thai has no spaces between words — corruption from retyping is invisible to non-Thai readers.

---

## Priority 1 — Deploy the Thai landing page (largest win)

`01_landing/MattaNutra_Landing_Page_TH_v20_FINAL.html` → `https://www.mattanutra.com/th`

The audit found the currently live `/th` is still the **old pre-hand-off translation**. Every
issue below is already fixed in the delivered file — nothing new to build, it only needs to ship:

| Live today (old) | Delivered v20 |
|---|---|
| เลิกเดา. เริ่มรู้. (English full stops) | เลิกเดา เริ่มรู้จริง |
| โปรโตคอลชีวิต | Living Protocol (brand term, stays English) |
| ออกแบบปริมาณที่พอดีของคุณ (CTA everywhere) | เริ่มประเมินฟรี (single CTA) |
| ไกด์ของคุณ, น้องมัตตะ | Nong Matta ผู้ช่วย… |
| Daniel (male, 40) says ฉัน | ผม |
| meta still says "ด้วย AI" | removed |

This file is **byte-identical** to `landing/` in the v3 hand-off zip (`MANIFEST.sha256` there
still applies). Its `./assets/` images are already in that zip.

## Priority 2 — Update the shared Thai header component

The global TH header still renders the old translation on **every** `/th` page — including pages
whose body is already the new Thai (the Library, the questionnaire). The global footer was
already updated correctly; the header was missed. Exact strings: `02_header_component_th.md`.

## Priority 3 — Library page: restore two re-translated blocks

`/th/library` correctly uses the delivered body, but the hero paragraph and the closing CTA
block were re-translated instead of pasted, and read as translated Thai. Restore the delivered
copy: `03_library/RESTORE_BLOCKS.md`.

Also in `03_library/`:
- `library-th.html` — an updated index file. **Head-only metadata patch** (Thai meta
  description, Thai og/twitter tags, new Thai share image). The `<body>` is byte-identical to
  the 19 July delivery — safe to re-port or to lift just the `<head>` block.
- `assets/og/mattanutra-library-th.jpg` — new 1200×630 Thai share card. Deploy at
  `https://www.mattanutra.com/assets/og/mattanutra-library-th.jpg` (same folder as the
  questionnaire card). The patched head already points there.

## Priority 4 — Questionnaire: fix the strings added after v4

The live `/th/nutrition/quiz` correctly uses v4 as its base (thank you — the meta block,
consent module and share card all shipped intact). But the questionnaire has since gained new
fields and helpers, and their Thai was written outside the review process. `04_quiz/` contains
the corrected strings, plus the Thai units fix (`cm/kg/ft/in/lb` → `ซม./กก./ฟุต/นิ้ว/ปอนด์`).
Machine-readable version: `04_quiz/quiz-strings-th.json`.

## Priority 5 — Verify

```bash
cd verification
cp staging-map.example.json staging-map.json   # point at staging
python3 verify_deployment.py --compare staging-map.json
python3 lint_th.py <deployed-file>
```

`verify_deployment.py --compare` extracts every string a person can read (body, title, meta,
og/twitter, alt) and compares character-for-character against the reference. It would have
caught every discrepancy in this pack automatically — please make it part of the deploy
routine for `/th` pages.

---

## Not in this pack (deliberately)

- **Card order / excerpts on the library indexes.** The CMS re-sorts cards and uses each
  article's meta description as the excerpt. Both texts are ours, so no corruption — accepted.
- **English library og:image on `/en/library`** — correct as-is.
- The audit also noted `/en` landing still has no `og:image` and `twitter:card=summary`, and
  the EN quiz chrome still says "Journal" and "AI-powered" — English-side items from the
  existing SEO backlog (`04_SEO_Backlog.md` in the v3 zip), listed here only as a reminder.

Prepared 23 July 2026. Questions → same channel as the v3 hand-off.
