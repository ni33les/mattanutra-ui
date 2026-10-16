# HealthScore visible-copy contract — 16 October 2026

The version-2 HealthScore copy contract generates the copy displayed by the web
HealthScore and pharmacy detailed plan: six text fields, findings, and three
method cards. Six unused section headings/supporting lines and `gapTrio` no
longer require AI output. Pharmacy still displays the method cards, so those
remain required. All assessment facts, deterministic seeds and safety context
remain in the request.

The prompt and cache identity advance to `v10-visible-copy`. New provider and
cache responses must declare `pageCopy.version: 2`. Unversioned stored results
continue through the complete historical contract; partial historical results
do not become ready. Unknown versions are rejected. Visible fields retain the
same per-field numeric, length, forbidden-copy and requested-locale checks.
Scoring, formula generation, reasoning settings, provider timeout and retry
limits are unchanged by this copy change.

## Bounded provider evidence

One synthetic assessment in each display locale was submitted with the prior
and new contract, using Grok 4.5 and low reasoning. Application caching was
disabled, and no live assessment, payment, email or result was written. Every
response below passed the existing semantic checks on its first response and
included all three pharmacy method cards.

| Locale | Prior response time | New response time | Prior output tokens | New output tokens |
| --- | ---: | ---: | ---: | ---: |
| English | 10.78 s | 12.37 s | 834 | 592 |
| Thai | 12.12 s | 7.36 s | 884 | 597 |
| Chinese | 11.07 s | 12.91 s | 816 | 527 |

Output tokens fell by 29–35%, but these samples do **not** establish a consistent
latency improvement. Reasoning and service time varied. The initial English
candidate took 7.63 seconds before a final instruction clarified “text field”;
that evidence is retained separately and is not substituted for the final
candidate. There is no new-customer cache or end-to-end speed guarantee.

Evidence: `/root/.codex/deploy/healthscore-copy-20261016/`. The baseline source
was extracted from `0887e9ed01eb05a95f29c2295b64d725f68fcd75`; request bodies,
responses, validation outcomes and provider usage are preserved without
credentials. These are synthetic examples, not a clinical equivalence study.

## Verification

The copy-focused selection covers 32 tests: historical response compatibility,
three-locale completeness, pharmacy method cards, unknown-version rejection,
missing visible fields, numeric/length/forbidden-copy rules, request facts,
response schema, retries and unchanged reasoning defaults.

The broader 45-case performance inventory also covers formula compatibility.
Its existing `HS-PERF-01` fails because the September frozen fixture omits two
subsequently added null safety-context fields: `foodRestrictions.avoid` and
`supplementSensitivities.other`. The same failure was independently reproduced
from the exact release-base checkout. The historical fixture and formula code
are left intact; this is not claimed as a passing full performance suite.
