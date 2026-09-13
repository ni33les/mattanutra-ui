# Pharmacy reveal and progress

Baseline: c3651f350ef5c511a0b7fcd574124972067736a2.

- PHARM-BROWSER keeps its existing locale, unpaid-order, reload and deep-dive assertions. Its simplified nutrient-card assertion is replaced by the shared reveal formula coverage assertion; online checkout links must be absent.
- PHARM-PROGRESS adds capture, pending, readiness, reload and explicit recovery checks. The previous build failed the standard-reveal/progress checks; its separate food-arrival case still passed. RED execution is preserved at /root/pharmacy-reveal-evidence/red.
- The landing regression continues verifying the exact original assets, visual reference and site chrome. The obsolete whole-route-file hash is replaced by exact standard header/footer and landing-call assertions because this change intentionally extends the same route with progress. Historical reference hashes remain recorded.
- Existing web reveal and HealthScore waiting behaviour remain covered by their maintained scoped tests. Frozen pharmacy receipts disable current-result polling; prices, orders, safety and matcher arithmetic are unchanged.

No automatic retries, excluded failures or unrelated full-suite claims.

## Full pharmacy deep dive

- PHARM-BROWSER now opens the linked deep dive before and after ordering, checks all seven chapters, saved nutrient reasoning/decision/cautions, original desktop dimensions, receipt prices and the explicit LINE share action. The original simplified-page expectation failed against DEV build 4d111887; evidence is preserved at /root/pharmacy-deep-dive-evidence/red.
- The ordered-products heading is now the supplied chapter heading, with the existing localized label in its eyebrow. The ownership, unpaid-receipt, food-arrival and price assertions remain intact.
- The controlled fixture gains explanation and caution text only; its nutrient amount, product, price and matching inputs are unchanged. Late food arrival also verifies completed saved analysis. Sample customer health details, blanket clear-check claims, and automatic LINE delivery claims from the handoff are not presented as real customer data.
- Thai/Chinese checks use authored saved copy in those languages. English-only fixture prose was correctly suppressed by the existing locale guard; the failed run is preserved under acceptance-final. The saved explanation, dose-decision and caution assertions remain mandatory in each language.
- The full-plan action is now also at the top of the pharmacy reveal. PHARM-BROWSER requires its correct destination and initial-viewport visibility on desktop and mobile, then navigates through it; the existing order-panel link still proves receipt preservation. The previous build fails this requirement; evidence is preserved at /root/pharmacy-deep-dive-link-evidence/red.
- The user's subsequent placement correction supersedes the opening-viewport expectation: the button belongs directly beneath Order Summary, in the same column. PHARM-BROWSER now verifies that position and alignment on desktop/mobile, retaining pre-order navigation and receipt checks. The top button and duplicate link in the sharing row are removed; RED evidence is preserved at /root/pharmacy-summary-link-evidence/red.
