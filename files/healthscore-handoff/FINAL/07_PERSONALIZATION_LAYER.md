# Stage 6 — AI Polish Layer

This document specifies the **Stage 6 AI polish layer** that sits between `build_page_content` and the template renderer. Its job is to lightly rewrite the engine's rendered copy for voice and cadence, while being prohibited from changing any locked value.

**Build it as an interface in V1; enable it in V2.** Detail below.

---

## 1. Why this layer exists

The engine's content layer (`healthscore_content.py`) produces production-quality text using a fixed set of rules and templates. It is deterministic, fast, and correct. But because it's template-driven, the output occasionally reads slightly mechanical — the same phrase structure recurring across many customers, the same connective tissue between clauses, the same rhythm in the closing sentences.

Stage 6's role is **voice polish, not content change**. It can:
- Smooth a stiff sentence
- Vary connective phrasing ("and which is why" → "which is exactly why")
- Adjust tone for a specific reader without altering the message
- Rewrite a clunky phrase into something more natural

It cannot:
- Change any number (score, percentile, gap size, pillar value, nutrient count)
- Rename a pillar
- Switch the relativity framing (rank → gap or vice versa)
- Introduce new claims not in the engine output
- Reword forbidden substrings into the text
- Remove the embedded `<em>` emphasis markers without preserving their semantic weight

Stage 6 is best thought of as a **proofreading copy editor with strict house rules**, not a content writer.

---

## 2. Why it's deferred to V2, not V1

**V1 ships without Stage 6.** Four reasons:

1. **Cost.** Each polish call adds ~1-2 seconds of latency and ~$0.005-0.01 of API spend per customer. At launch volume this is trivial; at scale you'll want it justified by measured improvement.
2. **Determinism.** Engine output is reproducible (same answers → same JSON). Stage 6 introduces non-determinism (same answers → similar-but-not-identical JSON). For debugging customer support tickets, V1's determinism is genuinely valuable.
3. **Validation cost.** Stage 6 needs a strict validator to catch numeric drift. The validator is build-able but takes effort.
4. **Voice baseline.** The engine output is already good. Until you've seen V1 in production for a few weeks and have customer feedback on which sentences read flat, you don't know which parts Stage 6 should focus on.

**V2 enables Stage 6** once V1 is stable and you've identified specific copy patterns that benefit from voice polish.

**But build the V1 interface for it now**: the renderer should call a `polish(content_package) -> content_package` function in both versions. In V1, this function is a no-op (`return content_package`). In V2, it calls the LLM and validates. **Wiring this scaffolding in V1 means V2 is a single function swap, not a refactor.**

---

## 3. What Stage 6 may rewrite — the allowlist

Stage 6 receives the full content package and may modify only these fields. Anything else is forbidden territory.

### Rewritable fields

| Field | Rule | Numeric literals to preserve |
|---|---|---|
| `copy.goal_mirror` | Preserve `<em>` tags around each goal noun; preserve goal count and goal nouns themselves | None typically |
| `copy.hero_sub` | Preserve the list of "what we read" items (order can shift, items cannot be dropped or added) | None typically |
| `copy.band_line` | Preserve the score literal (e.g., "An 80" must remain "An 80") | `score` |
| `copy.relativity.headline` | Preserve median (60), gap (in gap-mode), percentile (in rank-mode) | `median`, `gap` (gap-mode) or `percentile` (rank-mode) |
| `copy.relativity.sub` | Preserve gap literal in gap-mode | `gap` (gap-mode) |
| `copy.gap_trio[].headline` | No constraints beyond general rules | None typically |
| `copy.gap_trio[].body` | Preserve any numeric mention (e.g., the pillar percentage) | Sometimes the pillar value (e.g., "38%") |
| `copy.pillars_headline` | Preserve goal-link count literal ("Three of your five", "Four of your five") | The goal-link count word |
| `copy.highest_leverage.text` | Preserve pillar name and pillar value | The pillar value (e.g., "43%") |
| `copy.strength_note` | Preserve pillar name and pillar value | The pillar value |
| `copy.findings_headline` | Preserve finding count word ("One finding…", "Three things…") | The count word |
| `copy.findings_intro` | No constraints beyond general | None |
| `copy.findings[].headline` | No constraints beyond general | None |
| `copy.findings[].body` | Preserve any numeric and any pillar/medication mention | Variable per finding |
| `copy.subtraction_paragraph` | Preserve nutrient count literal | `nutrients_chosen` (spelled out, e.g., "Eight") |
| `copy.method_steps[].title` | No constraints beyond general | None |
| `copy.method_steps[].body` | Preserve goal-link count if mentioned | Variable per step |

### Forbidden territory

Anything in `locked.*`. Anything in `meta.*`. Anything in `copy.relativity.spectrum_*` (positions, percentages — those drive the SVG). The `tag` and `value` fields in `gap_trio` cards. The `code` and `icon` fields in findings. The `first_name`, `first_name_prefix`, `band_pill`, `opp_pill` fields (these come from fixed lookup tables). The `findings_mode` enum.

**If Stage 6 modifies any forbidden field, reject the entire polished package and use the engine output as-is.**

---

## 4. Validator — what to check after each polish

Run these checks against every polished package. Any failure → discard the polish, log the rejection, return the engine output unchanged.

### 4a. Forbidden-field invariance
For every field NOT in the allowlist above, assert `polished[field] == engine[field]` byte-for-byte. The polish must not have touched it.

### 4b. Numeric-literal preservation
For each rewritable field, extract all integer literals (via regex `\b\d+\b`). The polished text may not introduce any integer literal that wasn't in the engine version. (It may drop an integer literal — i.e., a polish that removes a number is acceptable, though usually undesired — but never add one.)

```python
import re
def extract_ints(s: str) -> set[int]:
    return {int(x) for x in re.findall(r'\b\d+\b', s)}

engine_ints  = extract_ints(engine_copy['band_line'])
polished_ints = extract_ints(polished_copy['band_line'])
if not polished_ints.issubset(engine_ints):
    reject_polish('band_line', reason='introduced new integer literal')
```

This catches the highest-risk failure mode (LLM hallucinating a slightly different score) deterministically.

### 4c. Forbidden-substring check
Run the engine's existing `FORBIDDEN` substring list (from `healthscore_library.py`) against every polished string. If any of `bloodwork`, `cap`, `locked`, `deficien`, etc. appear, reject.

```python
from healthscore_library import FORBIDDEN
for field, polished_text in polished_copy.items():
    if isinstance(polished_text, str):
        for forbidden in FORBIDDEN:
            if forbidden.lower() in polished_text.lower():
                reject_polish(field, reason=f'contains forbidden: {forbidden}')
```

### 4d. HTML safety
The engine includes `<em>` tags in several fields. Stage 6 may preserve, repositon, or remove them — but must not introduce any other HTML tag. Specifically:
- No new `<script>`, `<style>`, `<iframe>`, `<a href>`, or anything that could be an XSS vector
- No `data-*` attributes
- No inline event handlers (`onclick`, etc.)

Parse the polished string for tags and confirm the only tags present are `<em>` and `</em>`.

### 4e. Length sanity
Polished text should be roughly the same length as the engine text — within 0.5x to 1.5x. A polish that doubles or halves the length is almost certainly a hallucination or an over-aggressive rewrite. Reject.

### 4f. Structural preservation for arrays
For `gap_trio` and `findings` and `method_steps`:
- Same array length
- Each item's `tag`/`code`/`number` is byte-identical to the engine version
- Each item's rewritable fields pass the per-field rules above

---

## 5. Prompt structure — the system prompt

The Stage 6 LLM call uses a fixed system prompt and a user message containing the engine output. Below is the recommended system prompt, written for a frontier model (Claude Sonnet, GPT-4, etc.).

```
You are the voice editor for MattaNutra's HealthScore page. You receive a
JSON content package produced by a deterministic scoring engine. Your job
is to lightly rewrite the prose fields in `copy.*` for natural voice and
cadence, while making zero changes to the underlying facts.

ABSOLUTE RULES — violations cause your entire output to be discarded:

1. You may only rewrite fields explicitly listed in REWRITABLE FIELDS below.
   Every other field must be returned byte-identical to the input.

2. You may not introduce any integer literal that does not already appear
   in the field you are rewriting. You may not change any integer to a
   different integer. Score, percentile, gap size, pillar values, nutrient
   counts — all must be preserved exactly.

3. You may not introduce any HTML tag. The only tags allowed in the output
   are <em></em> tags that were already present in the input.

4. You may not introduce any of these substrings (case-insensitive):
   "bloodwork", "blood panel", "cap", "capped", "ceiling", "locked",
   "deficien", "low normal", "out of range".

5. Each polished field must be between 50% and 150% of the original
   field's character length.

6. Preserve the meaning. The polish is about phrasing, rhythm, and word
   choice — not about adding warmth, adding metaphor, adding hedges, or
   changing the message. If a sentence is already good, return it unchanged.

REWRITABLE FIELDS:
- copy.goal_mirror
- copy.hero_sub
- copy.band_line
- copy.relativity.headline, copy.relativity.sub
- copy.gap_trio[].headline, copy.gap_trio[].body
- copy.pillars_headline
- copy.highest_leverage.text
- copy.strength_note
- copy.findings_headline, copy.findings_intro
- copy.findings[].headline, copy.findings[].body
- copy.subtraction_paragraph
- copy.method_steps[].title, copy.method_steps[].body

VOICE NOTES:

The MattaNutra voice is calm, honest, and direct. It treats the reader as
an intelligent adult capable of handling the truth about their health.
It does not catastrophize ("Your score is critically low") and it does not
flatter ("You're doing amazingly!"). It names things accurately and lets
the customer respond to that naming.

Specifically:
- Prefer plain words over jargon
- Prefer short sentences over compound ones, when both convey the same idea
- Prefer concrete to abstract
- Avoid words that imply moral judgment ("better," "worse," "good,"
  "bad" applied to the person)
- Avoid hedging filler ("kind of," "sort of," "fairly," "rather")
- Em-dashes are fine and characteristic of this voice
- First person plural ("we read every answer") and second person ("your
  plan") are the established voice — preserve them
- The reader should feel respected, not encouraged

OUTPUT FORMAT:

Return the FULL content package as JSON, with rewritable fields polished
and all other fields unchanged. The output must be valid JSON. Do not
include commentary, explanation, or markdown fences — just the JSON object.
```

---

## 6. The user message

The user message contains the full content package. Recommended structure:

```python
user_message = f"""Here is the content package to polish. Apply the rules in your
system prompt. Return the polished package as JSON.

{json.dumps(content_package, indent=2, ensure_ascii=False)}
"""
```

---

## 7. Model recommendation

For this task, the optimal model balances:
- Voice quality (good with English prose)
- Fidelity to constraints (won't drift from rules)
- Cost (millions of customer renders adds up)
- Latency (sits in the hot path before page render)

**Claude Haiku 4.5** or **Claude Sonnet 4.7** are good fits. Sonnet has slightly better voice; Haiku is ~5× cheaper and ~3× faster. Start with Sonnet, measure, downgrade to Haiku once you confirm output quality holds at the cheaper tier.

GPT-4o, Gemini 2.5 Flash, and other comparable-tier models also work. The constraint set is what matters more than the model brand.

---

## 8. Implementation sketch

```python
# stage6.py
import json, re, logging
from typing import Any, Optional
from anthropic import Anthropic
from healthscore_library import FORBIDDEN

log = logging.getLogger("stage6")
client = Anthropic()  # uses ANTHROPIC_API_KEY env var

REWRITABLE_PATHS = {
    'copy.goal_mirror',
    'copy.hero_sub',
    'copy.band_line',
    'copy.relativity.headline',
    'copy.relativity.sub',
    'copy.pillars_headline',
    'copy.highest_leverage.text',
    'copy.strength_note',
    'copy.findings_headline',
    'copy.findings_intro',
    'copy.subtraction_paragraph',
}
REWRITABLE_ARRAY_FIELDS = {
    ('copy.gap_trio', ['headline', 'body']),
    ('copy.findings', ['headline', 'body']),
    ('copy.method_steps', ['title', 'body']),
}

def polish(content_package: dict, *, model: str = "claude-sonnet-4-7") -> dict:
    """
    Apply Stage 6 voice polish. Returns polished package on success,
    unmodified engine package on any validation failure.
    """
    try:
        response = client.messages.create(
            model=model,
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _format_user_message(content_package)}],
        )
        polished_json = response.content[0].text.strip()
        # strip markdown fences if the model added them despite instruction
        polished_json = re.sub(r'^```(?:json)?\n?|\n?```$', '', polished_json)
        polished = json.loads(polished_json)

        if not _validate(content_package, polished):
            return content_package  # fall back to engine output

        polished.setdefault('meta', {})['stage_6_applied'] = True
        return polished

    except Exception as e:
        log.warning(f"Stage 6 polish failed: {e}")
        return content_package


def _validate(engine: dict, polished: dict) -> bool:
    """Run all validators. Return False on any failure (caller falls back)."""
    # 1. Forbidden-field invariance
    if not _check_locked_unchanged(engine, polished):
        log.info("Stage 6 rejected: locked field modified")
        return False
    # 2. Numeric-literal preservation per rewritable field
    if not _check_no_new_integers(engine, polished):
        log.info("Stage 6 rejected: new integer literal introduced")
        return False
    # 3. Forbidden substring check
    if not _check_no_forbidden(polished):
        log.info("Stage 6 rejected: forbidden substring present")
        return False
    # 4. HTML safety
    if not _check_html_safe(polished):
        log.info("Stage 6 rejected: disallowed HTML tag")
        return False
    # 5. Length sanity
    if not _check_length(engine, polished):
        log.info("Stage 6 rejected: field length out of range")
        return False
    # 6. Array structural preservation
    if not _check_arrays(engine, polished):
        log.info("Stage 6 rejected: array structure changed")
        return False
    return True


# helper functions _check_*  — implementation per the rules in section 4 above.
# See stage6_validators.py in your repo for the full implementation.
```

A complete implementation (with all validator helpers) is ~250 lines of Python. Budget half a day to write and test, plus a day of running against engine outputs to confirm the rejection rate is acceptably low (target: <2% of customers get the un-polished fallback).

---

## 9. Observability

For each Stage 6 call, log:

- Customer ID (hashed)
- Latency (ms)
- Token usage (input + output)
- Whether polish was applied or rejected (and if rejected, which rule)
- Which fields were changed by the polish (which fields differ between engine output and polished output, excluding fields rejected on validation)

Daily dashboard:
- Stage 6 rejection rate (target <2%)
- Distribution of rejection reasons
- Token spend
- p50, p95, p99 latency

If the rejection rate climbs above 5%, something has drifted (model behavior changed, prompt needs adjustment, or new content patterns have appeared that the validator doesn't handle). Investigate before the rejection rate becomes the norm.

---

## 10. Rollout plan

**V1 (launch):**
- Build the `polish(content_package)` interface as a no-op
- Wire it into the renderer between `build_page_content` and HTML rendering
- Ship

**V2.0 (post-launch, after 4-6 weeks of V1 data):**
- Identify which copy patterns customers find awkward (via support tickets, session recordings, A/B copy variants)
- Implement Stage 6 with a focused prompt that targets those specific patterns
- Enable Stage 6 for 10% of traffic; compare conversion vs V1
- If positive, ramp to 50%, then 100%
- Keep V1 path available as `polish_disabled = True` flag for debugging

**V2.1 and beyond:**
- Iterate on the system prompt based on observed polish quality
- Consider per-band-specific prompts if voice needs differ between high-scorers and low-scorers
- Consider caching: the same engine output (deterministic) called repeatedly should return the same polished output. A `polished_cache` keyed on the content hash would eliminate redundant API calls for the same customer reloading the page.

---

## 11. The interface in V1 — make it real, not aspirational

The single most important practical takeaway: **wire the `polish()` function into V1 even though it's a no-op.**

```python
# renderer.py — V1

from stage6 import polish

def render_healthscore(answers, first_name):
    result = compute_score(answers)
    pkg = build_page_content(answers, result, first_name=first_name)
    pkg = polish(pkg)        # ← no-op in V1, LLM-driven in V2
    return template.render(pkg)
```

Without this, V2 enablement is a refactor (find every renderer call site, inject the new layer). With this, V2 is a single-file change (replace `polish()` body).

This is the cheapest investment in V1 that protects V2's velocity. The other documents in this package go to detail because every layer is worth this kind of care.
