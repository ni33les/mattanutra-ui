# MattaNutra HealthScore — Content Layer (Finding Library + Salience Ruleset)

This package turns the deterministic engine's output into the **ordered, page-ready
content** for a customer's HealthScore page — automatically, the same way every time,
with no AI deciding any number or which findings matter.

## Where this sits in the OpenClaw pipeline

```
questionnaire submit
   → normalize answers          (Stage 2 — your code; unit conversion, blanks→0, etc.)
   → engine.score(answers)      (Stage 3 — the number; deterministic)
   → pctile lookup              (Stage 4 — percentile from pctile.json)
   → build_page_content(...)    (Stage 5 — THIS PACKAGE: selects + orders the story)
   → AI polish                  (Stage 6 — rephrases COPY only; never touches LOCKED)
   → HTML template              (Stage 7 — renders the page)
```

## Files

| File | What it is | Who edits it |
|---|---|---|
| `engine.py` | The scoring engine (the spec). Now also emits `flag_codes`. | Engineering / clinical |
| `healthscore_library.py` | **DATA** — every customer-facing sentence, keyed by stable codes. | Marketing / clinical copy |
| `healthscore_content.py` | **LOGIC** — the salience ruleset + `build_page_content()`. | Engineering |
| `run_content.py` | Validation harness across diverse profiles. | Engineering (CI) |
| `pctile.json` | Score → percentile lookup (from 20k-profile simulation). | Regenerate if engine retuned |
| `example_profile1_content.json` | A full example output package. | — (generated) |

## The one rule that governs everything

The output is split into two blocks:

- **`locked`** — numbers and facts (score, band, pillar values, percentile, flag codes,
  nutrient counts). **The AI step must treat these as immutable.** They come from
  deterministic code and must appear unchanged on the page.
- **`copy`** — sentences the AI may *re-phrase for warmth/brand* but must not contradict.

A simple post-AI check (does the score/band/pillar numbers in the AI output still match
`locked`?) keeps Stage 6 honest.

## Calling it

```python
from engine import score
from healthscore_content import build_page_content
import json
pct = json.load(open('pctile.json'))

result = score(answers)                       # answers = normalized questionnaire dict
pkg = build_page_content(
        answers, result,
        percentile=pct[str(result['final'])],
        median=60,                            # population median (constant unless retuned)
        chosen_nutrients=8)                   # from the formula engine; defaults to 8
# pkg -> feed pkg['copy'] to the AI polish step, render with pkg['locked']
```

## What `build_page_content` returns

```
locked: { score, band, percentile, median, pillars[], flag_codes[],
          nutrients_chosen, nutrients_evaluated }
copy:   { goal_mirror, band_line, relativity{mode,headline,sub,spectrum_*},
          gap_trio[3], highest_leverage|null, strength_note|null,
          findings[<=3], findings_mode, subtraction{evaluated,set_aside,chosen} }
meta:   { engine_score, finding_count, relativity_mode }
```

Each page section maps to one field: hero→`goal_mirror`+`band_line`,
spectrum→`relativity`, "what N means"→`gap_trio`, pillar box→`locked.pillars`+
`highest_leverage`+`strength_note`, "what we caught"→`findings`(+`findings_mode`),
the 120→112→8 beat→`subtraction`.

## The salience rules (encoded in healthscore_content.py)

1. **Findings** are pooled from (a) engine safety-flag codes and (b) derived
   goal-pattern insights, ranked by `tier`, de-duplicated, and trimmed to **3 max**.
2. A **tier-1 medication-interaction flag** (statin, PPI, metformin, blood thinner)
   always **leads**. Safety-routing flags (pregnancy, kidney, liver — tier 4) are
   included but do not outrank a personal goal insight.
3. **Relativity** is rank-framed at/above the median ("ahead of X%"), and
   **gap-framed below it** ("the average is 60; your gap is N points"). This is the
   rule that stops a low scorer from seeing a demoralizing percentile.
4. **Highest-leverage** = the lowest-scoring goal-linked pillar (shown only if it's a
   real gap).
5. **Zero findings** (a strong, symptom-free profile) flips the section to
   `findings_mode:'strengths'`, populated from the top pillars.

## Editing copy without touching logic

All sentences live in `healthscore_library.py`. To change how the statin finding reads,
edit `FINDINGS['STATIN_COQ10']`. To add a new safety flag: add its code to
`engine.safety_flag_codes()`, then add a matching entry to `FINDINGS`. Nothing in the
ruleset needs to change.

## Guardrails (run in CI via `python3 run_content.py`)

The harness asserts, across diverse profiles, that: the package score equals the engine
score; no profile exceeds 3 findings; every profile yields at least one finding; a tier-1
flag leads when present; and **no banned substring** (`bloodwork`, `lab test`, `capped`,
`locked`, `deficien`, …) appears in any customer-facing string. Add new profiles here
when you add questionnaire paths.
```
```
