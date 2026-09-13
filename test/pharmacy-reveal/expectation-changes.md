# Pharmacy reveal and progress

Baseline: c3651f350ef5c511a0b7fcd574124972067736a2.

- PHARM-BROWSER keeps its existing locale, unpaid-order, reload and deep-dive assertions. Its simplified nutrient-card assertion is replaced by the shared reveal formula coverage assertion; online checkout links must be absent.
- PHARM-PROGRESS adds capture, pending, readiness, reload and explicit recovery checks. The previous build failed the standard-reveal/progress checks; its separate food-arrival case still passed. RED execution is preserved at /root/pharmacy-reveal-evidence/red.
- The landing regression continues verifying the exact original assets, visual reference and site chrome. The obsolete whole-route-file hash is replaced by exact standard header/footer and landing-call assertions because this change intentionally extends the same route with progress. Historical reference hashes remain recorded.
- Existing web reveal and HealthScore waiting behaviour remain covered by their maintained scoped tests. Frozen pharmacy receipts disable current-result polling; prices, orders, safety and matcher arithmetic are unchanged.

No automatic retries, excluded failures or unrelated full-suite claims.
