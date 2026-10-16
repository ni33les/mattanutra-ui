# HealthScore while the formula is prepared — 16 October 2026

Web customers can open their complete HealthScore explanation and checkout as
soon as current-revision, current-language advice is ready. Formula generation
already starts at questionnaire capture, in parallel with that advice. It keeps
running while the customer reads the report, leaves the page or purchases.

The page initially shows a short preparation message where the nutrient
shortlist belongs. Its read-only observer replaces that message with the actual
current formula count when available. Unknown counts remain unknown; a real
zero-count result ends preparation without inventing a shortlist. Formula
failure does not hide an otherwise complete HealthScore. Existing plan recovery
continues to handle failed work downstream.

Payment reuses the capture task and its generation identity. Paying before the
formula finishes does not restart it, bypass fulfillment, or expose a completed
plan before formula and product readiness. Pharmacy continues to bypass the web
HealthScore screen and requires its formula and matched products for ordering.

Both initial score reads and later count updates are bound to the assessment
revision and language. A changed revision causes a fresh page read rather than
combining a newer shortlist or explanation with older answers.

The shared [visible-copy contract](healthscore-visible-copy-performance.md)
reduces unused AI output while preserving all three pharmacy method cards and
historical results. Formula decision-making and its reasoning settings are
unchanged. The substantial expected reduction in time to the web HealthScore
comes from removing the formula prerequisite, not from a claim that formula
generation itself became faster.

Validation covers copy-first readiness, stale revisions and locales, true and
zero nutrient counts, formula and product failures, early mock checkout and
fulfillment reuse, browser transitions without reload, all three display
languages, and pharmacy ordering and detailed explanations.
