# MattaNutra — Thai Questionnaire Hand-off

**Read this first.** This package takes the Thai questionnaire live at
`/th/nutrition/quiz`. One page, one image, two commands to verify.

Prepared 19 July 2026. Companion to `MattaNutra_TH_Localization_Handoff_2026-07-19_v3.zip`
(landing page + 35 Library articles) — same conventions, same tooling, same rules.

---

## The one principle that matters

Identical to the Library hand-off: **this is finished production markup to port, not a
mockup to reinterpret.** Lift the config, keep the class names, wire the data.

**Thai has no spaces between words.** If markup is regenerated, retyped, or run through a
formatter that touches text nodes, characters can merge or drop in ways that are
*completely invisible to every non-Thai reader on the team*. It will pass review and be
wrong on the page.

**Never retype Thai. Copy-paste only. Never run a formatter over text nodes.**

This page matters more than most: it is the conversion path. A customer who loses
confidence in the Thai here never reaches the Health Score or the pay page.

---

## Deploy — three steps

**1. The page**

```
questionnaire/MattaNutra_Questionnaire_TH_v4_FINAL.html
  →  https://www.mattanutra.com/th/nutrition/quiz
```

**2. The social image**

```
assets/og/mattanutra-questionnaire-th.jpg   (1200×630, 70 KB)
  →  https://www.mattanutra.com/assets/og/mattanutra-questionnaire-th.jpg
```

The `og:image` and `twitter:image` tags already point there. Nothing to edit.

> **If you already uploaded the v3 image, delete it.** It was a `.png` at the same
> path, and it was the wrong card — see §"What changed in v4" below. Nothing references
> it any more, but leaving it invites someone to point at it again later.

**3. Verify** — see §Verification.

There are **no placeholder links in this file.** Every route resolves:
`/th/nutrition/quiz`, `/en/nutrition/quiz`, `/th/`, `/th/privacy`.

---

## What's in this package

```
MattaNutra_TH_Questionnaire_Handoff_2026-07-19/
├── 00_START_HERE.md                                ← this file
├── questionnaire/
│   ├── MattaNutra_Questionnaire_TH_v4_FINAL.html   ← deploy this
│   └── reference_questionnaire_EN_v5.html          ← the English source, for diffing
├── assets/og/
│   └── mattanutra-questionnaire-th.jpg             ← deploy this
└── verification/
    ├── verify_deployment.py                        ← checksum + Thai-integrity checker
    ├── lint_th.py                                  ← Thai style-guide + route linter
    ├── staging-map.example.json
    └── MANIFEST.sha256
```

---

## What changed in v4

**Only the social share card.** No copy, markup, logic or structure was touched. The
v3 → v4 diff is **5 lines, all in `<head>`.**

The v3 package shipped an image named `mattanutra-questionnaire-th.png` that was in fact
the **English MattaNutra Library banner**. It read:

> THE MATTANUTRA LIBRARY — *Learn the right amount.*
> Evidence-aware answers to the supplement questions people actually ask.

Three problems at once: entirely in English, advertising the **Library** rather than the
questionnaire, and already in use elsewhere in the brand.

That card is what renders when someone shares this link on LINE or Facebook — the most
likely way this page spreads in Thailand. A Thai reader would have seen English copy
about a different product as their first impression of a Thai page. The filename said
Thai questionnaire; the pixels said English Library.

The replacement is a Thai questionnaire card in the same house style as the 35 Thai
Library share cards:

| | |
|---|---|
| headline | เลิกเดา เริ่มรู้จริง / แบบประเมินสูตรปริมาณที่พอดี |
| subhead | ตอบคำถามสั้น ๆ 6 ขั้นตอน แล้วรับ Health Score ฟรี |
| chips | ใช้เวลาไม่นาน · ไม่มีค่าใช้จ่าย · ตรวจสอบความปลอดภัย |
| CTA | เริ่มประเมินฟรี |
| character | Nong Matta, measuring pose |

The headline reuses the campaign line from the Thai landing page, and the CTA matches the
button a user sees on arrival — so the share card, the landing page and the destination
all say the same thing.

---

## Verification

Two commands. Please run both.

**Confirm you received what we sent:**

```bash
cd verification
python3 verify_deployment.py --check MANIFEST.sha256
```

**After deploying to staging, confirm the Thai survived the port:**

```bash
cp staging-map.example.json staging-map.json   # edit the URL to your staging host
python3 verify_deployment.py --compare staging-map.json
```

This extracts every string a person can read — body text, `<title>`, meta description,
Open Graph and Twitter copy, and every `alt` attribute — and compares them character for
character against the reference file. It ignores markup, classes, indentation and
whitespace, so you are free to restructure templates, swap components or change
framework. Only the words a Thai customer reads are compared.

`PASS` means the Thai is intact. A difference does not automatically mean corruption — a
deliberate copy change looks the same — but confirm each one with a Thai reader before
accepting it.

**Optional, for the Thai copy itself:**

```bash
python3 lint_th.py ../questionnaire/MattaNutra_Questionnaire_TH_v4_FINAL.html
```

Checks the locked glossary, route validity, Thai punctuation and structural integrity.
Should exit `0 errors`.

---

## Verification already performed on this exact file

| Check | Result |
|---|---|
| Thai lint | **0 errors** |
| Structural parity vs the English source | **exact** — 42 fields, 170 option buttons, 24 grid buttons, 22 options, 16 inputs, 6 steps; per-field option counts identical on all 42 |
| JavaScript | parses (`node --check`) |
| JSON-LD | 3 blocks, all valid — Organization, WebSite, WebPage |
| Duplicate element IDs | none |
| Skip link | present, `#main` target resolves |
| Internal routes | all valid, no placeholders |
| Social image | 1200×630, Thai copy, correct subject |
| Locked glossary (Style Guide v4) | **0 violations** |

---

## Editorial history — for context, not action

The Thai went through three review rounds before this build:

- **v1** — a functional bug plus nine copy and technical items. All ten country options
  in the selector read `เลือกประเทศ…` (the placeholder had overwritten every country
  name), so a user could not select a country at all. Also: a stray full stop after a
  `<span>`, untranslated `Crohn's / colitis`, missing skip link, a dead `/privacy` route,
  no metadata, `กัมมี` for `กัมมี่`, English `cm/kg` units, and `สูตรคุณ` vs `สูตรของคุณ`
  inconsistency.
- **v2** — all ten resolved. Three optional refinements raised: an ambiguous sentence
  boundary in Step 2, `Health Score` vs `HealthScore` inconsistency, and administrative
  wording on the completion screen.
- **v3** — all three applied.
- **v4** — social card corrected.

**Two notes worth carrying into the English page.** `HealthScore` (one word) is used in
the English source, but `Health Score` (two words) is used across all 35 Thai Library
pages, the Thai landing page and this questionnaire — 37 files. The Thai is internally
consistent; the **English** is the outlier and should be aligned to match.

---

## Outstanding — not ours to close

**Thai pharmacist review of the health and safety copy.** Required by Style Guide v4 §9
and §11. Not yet performed.

This page should be **first in that review queue**, ahead of the Library articles. It
asks directly about prescription medications, kidney and liver function, pregnancy and
breastfeeding, imminent surgery, and recent antibiotics — and it feeds a formulation. It
carries more clinical weight than any Library page does.

A pharmacist review pack covering the landing page and all 35 Library articles already
exists (`MattaNutra_Thai_Pharmacist_Review_2026-07-19.zip`). This questionnaire should be
added to it.
