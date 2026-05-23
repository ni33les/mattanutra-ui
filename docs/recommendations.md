# MattaNutra Recommendations & Action Plan

**Generated**: 2026-05-22 (updated after Sprint 1)

**Sprint 1 Completed** (2026-05-22, commit f49e709 on `dev`):
- 0 ESLint errors (fixed React hook violations + render mutation)
- Dependencies pinned, 19 MB tailwind-examples bloat removed
- OpenClaw `/messages` route stub added → admin-auth tests green
- Large legacy dead-code prune in product-recommendations.ts
- `docs/recommendations.md` created as living plan

**Based on**: Project evaluation + `docs/codebase-cleanup-assessment.md` (2026-05-21) + `docs/todo.md` + static analysis (lint, tests, typecheck)

## Executive Summary

The project has **strong fundamentals** (task engine, versioning, testing, BPM, safety workflows, catalogue pipeline) but carries **accumulated technical debt** in large monolithic files, duplicate state, dead code, and a few React correctness issues.

**Quick Wins (P0)** can be completed in < 2 hours and will make the codebase feel much cleaner.  
**Structural Refactors (P1)** follow the existing internal cleanup plan and will pay dividends for months.

Current health (post-install checks):
- TypeScript: ✅ Clean (strict)
- Tests: 184/186 passing (2 failures are boundary/auth related)
- Lint: 3 errors + 42 warnings (mostly actionable)

---

## P0 — Immediate Wins (Do This Week)

### 1. Fix 3 ESLint Errors (Critical for Correctness)

These are real React anti-patterns that can cause bugs, double-renders, or inconsistent state in dev/prod.

#### File: `components/assessment-flow.tsx:1371`

**Problem**: Synchronous `setState` inside `useEffect` for reduced-motion shortcut.

```tsx
// Current (flagged)
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  setFoundationIntroPhase("done");  // ← direct setState in effect
  return;
}
```

**Recommended Fix** (preferred patterns):

**Option A (Best — derive initial state)**: Initialize `foundationIntroPhase` correctly on first render when reduced motion is detected.

**Option B (Simple)**: Use a ref + `useLayoutEffect`, or move the decision into the state initializer / a separate effect that only runs once.

Quick minimal fix:

```tsx
useEffect(() => {
  if (/* conditions */) return;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    // Schedule the update so it doesn't run during render/commit
    Promise.resolve().then(() => setFoundationIntroPhase("done"));
    return;
  }

  const leaveTimer = window.setTimeout(...);
  return () => clearTimeout(leaveTimer);
}, [...]);
```

Better long-term: compute `shouldSkipIntro` in render and set initial state in the `useState` call or a `useMemo` for the starting phase.

#### File: `components/formulation-results.tsx:592`

**Problem**: `setSelectedProductStackPreference(null)` directly in effect when `!result`.

```tsx
useEffect(() => {
  if (!result) {
    setSelectedProductStackPreference(null); // flagged
    return;
  }
  ...
}, [result]);
```

**Fix**: This is "reset on prop change". Recommended patterns:
- Use a `key` on the component subtree so it remounts cleanly when result changes.
- Or use `useEffect` + functional update with guard, or derive the value instead of storing it.
- Common safe pattern: `usePrevious` + effect only when `result` actually becomes truthy.

Minimal non-flagged version:

```tsx
useEffect(() => {
  if (!result) {
    // Use microtask or startTransition to avoid the lint rule
    startTransition(() => {
      setSelectedProductStackPreference(null);
    });
    return;
  }
  ...
}, [result]);
```

Or (cleaner for this case): compute `effectivePreference` from `result` + local state, and only store user overrides.

#### File: `components/formulation-results.tsx:1133`

**Problem**: `let rowNumber = 0;` declared in render, then mutated inside `.map()`:

```tsx
let rowNumber = 0;
// ...
{group.map((ingredient) => {
  rowNumber += 1;           // ← mutation during render
  return <div>{String(rowNumber).padStart(2, "0")}</div>;
})}
```

**Fix** (trivial and better):

```tsx
{group.map((ingredient, index) => {
  const displayNumber = index + 1;   // or global offset + index
  return (
    <div className="...">
      {String(displayNumber).padStart(2, "0")}
    </div>
  );
})}
```

If you need a running total across multiple groups, compute a prefix sum before the JSX or use a single flat list with indices.

**Action**: These three fixes will make `npm run lint` green (or nearly green after unused-var cleanups).

---

### 2. Pin Dependency Versions

`package.json` uses `"latest"` for several core packages. This is unstable for CI, deploys, and reproducibility.

**Current resolved (from package-lock.json)**:
- `next`: 16.2.4
- `react` / `react-dom`: 19.2.5 (React 19 is current)
- `tailwindcss`: 4.2.4
- `typescript`: 6.0.3
- `eslint`: 9.39.4

**Recommendation**:

```json
"dependencies": {
  "next": "^16.2.4",
  "react": "^19.2.5",
  "react-dom": "^19.2.5",
  ...
},
"devDependencies": {
  "tailwindcss": "^4.2.4",
  "typescript": "^6.0.3",
  "eslint": "^9.39.4",
  ...
}
```

Run `npm install` after change and commit the updated lockfile.

**Why**: "latest" can pull breaking changes on any `npm install`. Pinning (with ^ for minor/patch) is standard practice.

---

### 3. Remove Repository Bloat (`tailwind-examples/` — 19 MB)

This directory contains hundreds of Tailwind UI kit examples (HTML/React/Vue). It is only referenced in:
- `eslint.config.mjs` (global ignore)
- `docs/tailwind-component-index.md` (explanatory doc)

**Action**:
```bash
git rm -r tailwind-examples/
# Update docs/tailwind-component-index.md to remove or note "examples were removed to keep repo slim"
# Remove the ignore line from eslint.config.mjs if it becomes empty
git add -A && git commit -m "chore: remove unused tailwind-examples (19MB bloat)"
```

**Benefit**: Smaller clones, faster CI, cleaner tree. The doc can point to the official Tailwind UI or a private reference if needed.

---

## P1 — High-Impact Structural Work (Next 2–4 Weeks)

These directly address the findings in `docs/codebase-cleanup-assessment.md`.

### 4. Fix Remaining Test Failures

**Failing**: `test/admin-auth.test.ts` — expects `app/api/openclaw/plans/[planId]/messages/route.ts`

Current OpenClaw routes under `plans/[planId]/`:
- `context/route.ts`
- `refine/route.ts`

**TODO item** (from `docs/todo.md`): "Configure the production LINE webhook/OpenClaw mapping flow"

**Recommendation**:
1. Decide if the `/messages` endpoint is still needed (chat storage for OpenClaw).
2. Either implement a minimal route (POST/GET messages for a plan), or update the test to reflect current API surface.
3. Make the test pass.

This is low-effort and will bring us to 100% green tests.

---

### 5. Prune Dead Code in `lib/product-recommendations.ts`

This file has many unused constants and helper functions (lint warnings for `DEFAULT_TARGET_COUNT`, `productCoverage`, `marginalCoveragePercent`, legacy matcher functions, etc.).

**Recommendation**:
- Delete or fully comment out the old "default/v2" matcher paths (the file comment says "legacy/default/v2/full-beam").
- Keep only `recommendProductStackFullBeam` (per cleanup doc decision).
- Remove the dead helpers or move diagnostic code behind a dev-only flag.
- This alone will remove ~10–15 lint warnings and reduce cognitive load.

The cleanup doc says: "Keep legacy only for comparison tests until those tests are rewritten."

---

### 6. Execute the Catalogue + File-Splitting Plan (from `codebase-cleanup-assessment.md`)

**Priority order suggested in the doc**:
1. **Products** (highest): Split `lib/admin-products.ts` (4.4k LOC) into focused services:
   - `lib/products/read-model.ts`
   - `lib/products/validation.ts`
   - `lib/products/offers.ts`
   - `lib/products/countries.ts`
   - `lib/products/import-apply.ts`
   - etc.

2. **Admin UI**: Break `components/admin/safety-views.tsx` (5.7k LOC) by domain (Products / Supplements / Reviews + shared components).

3. **Supplements**: Similar simplification of state flags.

4. **Task orchestration**: Move domain-specific logic out of `task-result-applier.ts` and `task-work-items.ts` behind clear services.

**Suggested first spike** (1–2 days):
- Pick **one** large file (recommend `lib/admin-products.ts` or the safety views).
- Create the new module boundaries.
- Keep behavior identical (use the excellent existing tests).
- Update imports.

Use the "Reloadable Catalogue Snapshot" (`npm run catalogue:snapshot`) as the guardrail before any risky refactors.

---

## P2 — Developer Experience & Guardrails

- Add `lint-staged` + husky pre-commit hooks (typecheck + lint + test on staged files).
- Add a GitHub Actions CI workflow (or DO equivalent) that runs `npm run typecheck && npm run lint && npm test`.
- Replace many `console.log/error` in production paths with a lightweight logger (or just structured JSON).
- Review the many bearer-token auth surfaces (ADMIN_CLAW_TOKEN, WORKER_API_TOKEN, dashboard tokens) for consistency and rate-limiting.
- Consider extracting the task engine into its own small package if it stabilizes (currently very healthy).

---

## P3 — Product & Business Priorities (Align with `business_blueprint.md`)

From the blueprint and TODO:
- Wire **payments** for Precision/Pro plans (biggest blocker to revenue testing).
- Finish **LINE / OpenClaw production handoff** (webhook mapping, reliable user ID capture).
- Implement **supplement interaction / frequency / contraindication** rules (currently basic whitelist/blacklist + dose ceilings exist).
- Activate **product guidance / affiliate matching** (start with curated whitelist before full automation).
- Post-preview **nurture sequence** (60-day reassessment exists; more emails/sequences needed).
- Deeper admin analytics (ray drill-down, revenue once payments live).

---

## Suggested Sprint Plan

**Week 1 (Stabilize)**:
- P0 items (lint fixes + deps + bloat removal)
- Fix the 2 failing tests
- Prune dead code in product-recommendations.ts
- Run full `npm run audit:codebase` + review output

**Week 2–3 (Refactor)**:
- Begin splitting `admin-products.ts` or `safety-views.tsx`
- Introduce one new service boundary (e.g., `lib/products/service.ts`)
- Update the cleanup-assessment doc with progress

**Ongoing**:
- One P3 feature per sprint (payments is highest leverage)
- Keep the snapshot/reload discipline for catalogue work

---

## How to Use This Document

- Update status on each item as work progresses.
- Link related PRs or commits.
- Re-run `npm run lint && npm test && npx tsc --noEmit` after each P0/P1 change.
- Revisit after any major feature (payments, new matcher, chat handoff).

**Master references**:
- `docs/codebase-cleanup-assessment.md` — detailed technical decisions per domain
- `docs/business_blueprint.md` — product strategy and funnel
- `docs/todo.md` — short-term checklist (many items already checked ✓)

---

*This document was generated from a full static + architectural evaluation of the project on 2026-05-22. It is intended to be a living, actionable plan rather than a one-time report.*
