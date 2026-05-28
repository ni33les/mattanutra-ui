# Production Readiness Implementation Plan
**Project**: Healthspan / MattaNutra (Next.js 16 + React 19)  
**Date**: 2026-06 (based on current `dev` branch)  
**Source**: Comprehensive codebase audit (quality, technical debt, security, performance, SEO)  
**Audience**: Implementation agent (human or AI). Follow phases strictly in order. Report status after each phase.

---

## Executive Summary & Goals

**Current State (as of audit)**:
- Build is **broken** (`npm run build` and `typecheck` fail).
- 7 failing tests in core areas.
- Public web pages (landing, assessment quiz, formulation results, blog, payments) are **not production-ready** for performance or SEO due to two catastrophic config choices + incomplete metadata.
- Security has good primitives but missing rate limiting and active HTTPS enforcement.
- Significant structural technical debt (monolithic files >2.5k LOC) inherited from earlier development velocity.

**Target State (Definition of Done)**:
- `npm run build`, `typecheck`, and `npm test` all green.
- Marketing + blog pages are statically renderable or properly revalidated with good caching headers.
- All images go through Next.js optimization pipeline.
- Full SEO surface (robots, OG images + Twitter cards, structured data, complete metadata, sitemap, noindex on funnels).
- Rate limiting + HTTPS redirect active at the app layer.
- No regressions in existing functionality or auth.

**Phasing**:
- **Phase 1 (P0 Blockers)**: Make build green + eliminate the two biggest perf/SEO killers. **Stop here until green and verified.**
- **Phase 2 (Hardening)**: Security + basic observability.
- **Phase 3 (Polish)**: Remaining SEO/perf wins + DX improvements.
- **Phase 4 (Debt Reduction)**: Begin splitting the largest modules (aligns with `docs/codebase-cleanup-assessment.md`).

**How to Use This Plan**:
1. Implement tasks **in topological order** within each phase.
2. After every task, run the **Verification Commands** and confirm **all Acceptance Criteria** are met before moving on.
3. If any AC fails, stop, diagnose, fix, and re-verify.
4. Create atomic commits per task (or per phase for tiny tasks).
5. At end of Phase 1 and Phase 4, produce a short "Phase N Summary" PR description.

---

## Phase 1: P0 – Build Green + Critical Perf/SEO Blockers

**Goal**: The app must build and the two largest production risks (universal dynamic rendering + unoptimized images) must be eliminated.  
**Exit Criteria**: `npm run build` succeeds cleanly; Lighthouse (or manual audit) shows major LCP/TTFB improvement signals on marketing pages; sitemap + robots correct.

### Task 1.1: Fix TypeScript Compilation Errors
**Files**:
- `lib/nutrition-plan-advisor-analysis.ts` (primary)
- `lib/formulation-types.ts` (type definition)

**Steps**:
1. Read the `validateRevealPageCopy` function and the `RevealPageCopy` type.
2. The root cause is `const copy: Partial<RevealPageCopy> = {}` where `RevealPageCopy` uses `Readonly<Record<...>>`. Assignment to `copy[slot]` is illegal.
3. Preferred fix: Introduce a mutable builder type or cast only the final return. Avoid `as any`.
   - Recommended: Add `type MutableRevealPageCopy = Record<RevealPageCopySlot, Record<"en"|"th", string>>;` and use `Partial<MutableRevealPageCopy>` for the builder, then cast at the end (or use a helper).
4. Alternatively, use `Object.assign` or spread to build the object.
5. Run `npm run typecheck` after edit.

**Acceptance Criteria**:
- `npm run typecheck` exits 0 with no errors.
- `npm run build` proceeds past the TypeScript step (may still fail later for other reasons).
- No new `any` casts introduced.
- The function still correctly validates and returns the expected shape for valid/invalid inputs (existing tests or manual verification).

**Verification Commands**:
```bash
npm run typecheck
```

### Task 1.2: Restore Passing Test Suite
**Files**: Primarily the three failing test files + any code they exercise:
- `test/core-versioned-model.test.ts`
- `test/task-only-schema.test.ts`
- `test/transaction-boundary.test.ts`
- Related lib files that may have drifted (`lib/task-service.ts`, `lib/task-result-applier.ts`, versioned model helpers, etc.)

**Steps**:
1. Run the full test suite and capture exact failure messages + stack traces.
2. For each failure, determine if it is a **test expectation drift** (update test) or **real regression** (fix code).
3. Prioritize core invariants around append-only versions and transaction boundaries — do not weaken them.
4. After fixes, ensure all 241 tests pass.

**Acceptance Criteria**:
- `npm test` reports exactly: `1..241` / `# pass 241` / `# fail 0`.
- No new skips or `todo` tests added to hide failures.
- Core properties (version append-only behavior, reservation constraints, transaction atomicity) remain enforced.

**Verification Commands**:
```bash
npm test 2>&1 | tail -20
```

### Task 1.3: Eliminate Blanket `force-dynamic` + Relax No-Store Headers
**Files**:
- `app/[locale]/layout.tsx` (remove or scope the export)
- `next.config.ts` (headers section)
- All pages that currently export `dynamic = "force-dynamic"`:
  - `app/[locale]/page.tsx`
  - `app/[locale]/blog/[slug]/page.tsx`
  - `app/[locale]/nutrition/quiz/page.tsx` (evaluate carefully)
  - `app/[locale]/nutrition/healthscore/page.tsx`
  - `app/[locale]/nutrition/refine/page.tsx`
  - Payment checkout/return pages (keep dynamic where needed)
  - Admin pages (keep dynamic)

**Steps**:
1. Remove `export const dynamic = "force-dynamic"` from the root `[locale]/layout.tsx`.
2. In `next.config.ts`, change the blanket no-store rules for `/:locale(en|th)` and `/:locale/*` to apply **only** to truly dynamic segments (`/assessment`, `/nutrition/quiz`, `/refine`, `/healthscore`, payment routes, `/admin`).
3. Add `export const revalidate = 300` (or appropriate value) or `force-static` where pages can be static/revalidated (home, blog article, terms, privacy).
4. For pages that still need fresh data, keep per-route `dynamic = "force-dynamic"` **only** on those specific route segments.
5. Update any `generateStaticParams` + dynamic combination that is now contradictory.
6. Verify that marketing pages now emit cacheable responses (or at least not `no-store`).

**Acceptance Criteria**:
- `app/[locale]/layout.tsx` no longer contains `force-dynamic`.
- `next.config.ts` no longer applies universal `no-store` to all locale routes.
- Home page (`/`), blog articles, terms, and privacy are no longer forced dynamic (confirmed by reading the files + build output comments if any).
- Payment/checkout, assessment results, refine, and admin routes may remain dynamic — this is documented in a comment.
- `npm run build` succeeds.
- Manual verification (or dev server + curl -I) shows `Cache-Control` that is not `no-store` on `/en` and `/en/blog/some-slug`.

**Verification Commands**:
```bash
npm run build
grep -r "force-dynamic" app/[locale] --include="*.tsx" | grep -v "nutrition/payment\|admin\|assessment/results\|refine\|healthscore"
grep -A 20 'source: "/:locale' next.config.ts
```

### Task 1.4: Enable Next.js Image Optimization + Remove Raw `<img>` Elements
**Files**:
- `next.config.ts`
- `components/formulation-results.tsx` (multiple occurrences)
- `components/blog-article.tsx`
- Any other files using raw `<img>` (admin views can be lower priority)
- `components/landing-page.tsx` (verify it already uses `<Image>` correctly)

**Steps**:
1. In `next.config.ts`, set `images: { unoptimized: false }`.
2. Add `remotePatterns` for any external image hosts used by product catalogue / blog CMS (inspect current `<img src>` values).
3. Replace all raw `<img>` in customer-facing components with `next/image` `<Image>`. Provide proper `width`, `height`, `alt`, and `sizes` where possible. For truly external untrusted images, you may keep `unoptimized` on a per-image basis as a last resort.
4. Remove or satisfy the 4 `@next/next/no-img-element` eslint warnings.
5. For product images coming from affiliate/marketplace sources, decide on a strategy (proxy, or accept some unoptimized with explicit alt + dimensions).

**Acceptance Criteria**:
- `next.config.ts` has `unoptimized: false` (or the key is absent, which defaults to optimized).
- `grep -r "<img" components/formulation-results.tsx components/blog-article.tsx app/[locale]` returns only false positives or images inside markdown renderers that have been wrapped.
- `npm run lint` reports 0 `@next/next/no-img-element` warnings.
- `npm run build` succeeds (image imports / remote patterns are valid).
- Landing page hero and key visuals continue to use `priority` + proper props.

**Verification Commands**:
```bash
npm run lint
grep -rn "<img" components/ app/[locale]/ --include="*.tsx" | grep -v "node_modules" | grep -v "markdown"
```

### Task 1.5: Add robots.txt + Complete Metadata + Explicit Noindex on Funnels
**Files**:
- `app/robots.ts` (new file)
- `lib/seo.ts` (extend `localizedMetadata` helper)
- Pages missing metadata:
  - `app/[locale]/nutrition/quiz/page.tsx`
  - `app/[locale]/nutrition/refine/page.tsx`
  - `app/[locale]/nutrition/healthscore/page.tsx`
  - `app/[locale]/nutrition/payment/checkout/page.tsx`
  - `app/[locale]/nutrition/payment/return/page.tsx`
  - `app/[locale]/assessment/page.tsx`
  - `app/[locale]/assessment/results/page.tsx`
- `app/[locale]/blog/[slug]/page.tsx` and others (ensure they set `indexable: false` where appropriate)

**Steps**:
1. Create `app/robots.ts` that:
   - Allows `/` and `/blog/*`
   - Disallows `/admin`, `/api`, `/*?*` (personalized params), assessment results, refine, checkout, etc.
   - References the dynamic sitemap.
2. Extend `localizedMetadata` in `lib/seo.ts` to accept optional `openGraphImages` and `twitter` config.
3. Add proper `generateMetadata` (using the helper) to all listed pages. For funnel/personalized pages, set `robots: { index: false, follow: false }`.
4. Ensure blog articles continue to generate good per-post metadata + translated alternates.
5. Add `metadataBase` to the root layout for clean relative image URLs.

**Acceptance Criteria**:
- `app/robots.ts` exists and is valid (Next.js recognizes it at build time).
- `curl -s http://localhost:3000/robots.txt` (after `npm run dev`) contains `Disallow: /admin` and `Sitemap:` entry.
- All public pages now export `generateMetadata` (or static `metadata`).
- Funnel pages (quiz, refine, results, healthscore, checkout, return, assessment) explicitly return `robots: {index:false, follow:false}` or equivalent via the helper.
- `npm run build` succeeds and the generated sitemap + robots are consistent.

**Verification Commands**:
```bash
npm run build
# After starting dev server in background if needed
curl -sI http://localhost:3000/robots.txt | cat
```

### Task 1.6: Add Open Graph Images + Twitter Cards + Rich Structured Data
**Files**:
- `lib/seo.ts`
- `app/[locale]/page.tsx` (home JSON-LD)
- `app/[locale]/blog/[slug]/page.tsx` + `components/blog-article.tsx`
- `components/formulation-results.tsx` (for Product/Offer markup on results — lower priority if time-constrained)
- Add 1–2 high-quality OG images to `public/` (or reference existing hero images) — e.g. `public/og-default.jpg`, `public/og-blog.jpg`.

**Steps**:
1. Update `localizedMetadata` to support and emit `openGraph.images` and `twitter: { card, images, ... }`.
2. Provide default OG images for home and generic pages.
3. For blog posts, prefer post-specific images when available; fall back to defaults.
4. Enhance the existing JSON-LD on home and add `BlogPosting` structured data on blog article pages (use the post data already loaded).
5. (Stretch) Add minimal Product + AggregateOffer markup on formulation results if product data is available in the render.

**Acceptance Criteria**:
- `lib/seo.ts` `localizedMetadata` now accepts and emits OG images + Twitter cards.
- Home page and at least one blog article include `<meta property="og:image">` and Twitter equivalents in the rendered HTML (inspect build output or dev tools).
- JSON-LD for blog articles exists and is valid (at minimum `BlogPosting` with headline, author, datePublished).
- Social preview tools (or `npm run build` + static HTML inspection) would show images.
- No regression in existing alternates/canonical logic.

**Verification Commands**:
```bash
npm run build
# Inspect .next/server/app/[locale]/page.html or use grep on build artifacts for og:image
grep -o 'og:image[^"]*' .next/**/*.html | head -5 || echo "Check build output manually"
```

**Phase 1 Exit Gate**:
- All of 1.1–1.6 completed.
- `npm run build && npm run typecheck && npm test` all exit 0.
- Manual smoke test of `/en`, `/en/blog/...`, `/en/nutrition/quiz` (no obvious breakage).
- Agent produces a short "Phase 1 Complete" summary with before/after evidence (e.g. screenshot of headers, build log snippet).

---

## Phase 2: Security & Observability Hardening

### Task 2.1: Add Rate Limiting
**Files**: New or `middleware.ts` + a small `lib/rate-limit.ts` (or use a lightweight package if approved).

**Steps**:
1. Decide on implementation (simple in-memory for start, or Upstash/Redis for prod).
2. Protect at minimum: assessment submission, payment checkout session creation, blog/testimonial public APIs if any, and all unauthenticated POST/PATCH routes.
3. Apply sensible limits (e.g. 10 submissions per IP per 5 min for assessment).
4. Return proper 429 responses.

**Acceptance Criteria**:
- Rate limiting middleware or per-route protection exists and is active on public mutation endpoints.
- Exceeding the limit returns 429 with `Retry-After`.
- Legitimate low-volume usage is unaffected.
- Added tests (or integration test) for the limiter.

### Task 2.2: Add Next.js Middleware for HTTPS Redirect + Security Headers (if not fully covered)
**Files**: `middleware.ts` (new or extend)

**Steps**:
1. Create (or activate) `middleware.ts` that:
   - Performs the HTTPS redirect logic currently in the unused `proxy.ts` for production.
   - Can also inject additional security headers if next.config is insufficient.
2. Ensure it runs for all relevant routes and does not break locale detection or static assets.
3. Delete or clearly mark `proxy.ts` as deprecated if it remains unused.

**Acceptance Criteria**:
- `middleware.ts` exists and exports a `middleware` function.
- In a production-like environment (or with `x-forwarded-proto: http`), requests are redirected to HTTPS (308).
- Locale routing and public files continue to work.
- `proxy.ts` is either deleted or has a large deprecation comment.

### Task 2.3: Structured Logging + Reduce Console Noise
**Files**: `lib/logger.ts` (new simple wrapper), then migrate high-volume API routes.

**Steps**:
1. Create a tiny structured logger (JSON lines in prod, pretty in dev) that redacts sensitive fields.
2. Replace `console.error` / `console.warn` calls in API routes with the new logger (start with the highest traffic or most sensitive ones).
3. Keep a small allowlist of legitimate console usage if any.

**Acceptance Criteria**:
- New logger module exists and is used in ≥50% of the previous `console.*` call sites in `app/api/`.
- Logs contain `level`, `message`, `timestamp`, and relevant context without dumping full error objects containing tokens or PII.
- `npm run lint` and build still clean.

---

## Phase 3: SEO & Performance Polish

### Task 3.1: Code-Split Heavy Client Components + Add Streaming
**Files**:
- `components/assessment-flow.tsx`
- `components/formulation-results.tsx`
- `app/[locale]/assessment/results/page.tsx`
- `app/[locale]/nutrition/refine/page.tsx`
- Root layout or page-level `loading.tsx` where helpful

**Steps**:
1. Split the largest client components into smaller dynamic imports (`next/dynamic` or React `lazy` + Suspense).
2. Add `loading.tsx` at key route segments (assessment, nutrition, results).
3. Wrap expensive sections (product grids, heavy forms) in `<Suspense>`.
4. Ensure BPM tracking and non-critical UI can load after initial paint.

**Acceptance Criteria**:
- Initial JS bundle for the home + quiz entry pages is measurably smaller (compare `next build` output or `.next/static/chunks` before/after).
- Pages that previously shipped 200k+ of client JS on first load now show progressive hydration.
- No visual regressions or broken interactivity on the flows.

### Task 3.2: Add Missing Structured Data & Improve Metadata Coverage
(Continue from 1.6 — expand to results pages, add FAQ/HowTo where appropriate on marketing content.)

### Task 3.3: Performance Budget & Monitoring Hooks (Optional but Recommended)
- Add a simple bundle size check in CI (or a script).
- Document current LCP/TTFB targets.

---

## Phase 4: Technical Debt Reduction (Start of May 2026 Roadmap)

**Goal**: Begin carving up the largest files identified in the audit and `docs/codebase-cleanup-assessment.md`.

**High-Value First Slices** (pick 2–3 in this phase):
- Split `lib/admin-products.ts` into focused services (read model, writes, validation, offers, countries).
- Split `lib/product-recommendations.ts` — keep only the active "full beam" path in the main export.
- Break `components/admin/safety-views.tsx` + related admin views into smaller focused components.
- Standardize the import scripts (extract shared apply logic).

**Acceptance Criteria per Slice**:
- The original file is reduced by ≥40% in LOC.
- All public exports and behavior are preserved (tests + build still green).
- New modules have clear single-responsibility names and JSDoc.
- No behavior change for customers or admin users.

**Longer-Term Note**: Full execution of the May cleanup assessment is out of scope for this plan but should be referenced.

---

## Cross-Cutting Rules for the Implementation Agent

1. **Never weaken security or correctness invariants** to make perf/SEO changes.
2. **Prefer incremental, testable changes**. Big bang refactors are forbidden in Phase 1–2.
3. **Update or add tests** when behavior could be affected.
4. **Document** any deliberate trade-offs in comments or the plan itself.
5. **Run the full verification suite** (`build + typecheck + test + lint`) before declaring any phase complete.
6. **Preserve the existing bilingual (en/th) behavior** and admin token auth flows exactly.
7. If a task reveals a larger problem than expected, **pause and escalate** with a clear description + proposed adjustment to the plan.

## Success Metrics (End of Phase 3)

- Build & test suite: 100% green.
- Public marketing pages: cacheable or properly revalidated; images optimized; full SEO metadata + robots + OG images.
- No raw `<img>` in customer components.
- Rate limiting active.
- HTTPS redirect enforced at middleware level.
- Measurable improvement in potential Core Web Vitals signals (documented via build output or manual audit).
- Agent can hand off a clean, production-ready surface for the public website while the deeper catalogue/admin debt continues in parallel tracks.

## Out of Scope for This Plan

- Full May 2026 catalogue + supplement service boundary split (Phase 4 only starts it).
- Major new features (LINE webhook production config, new payment providers, etc.).
- Comprehensive E2E test suite or visual regression.
- Migration to a full structured logger / APM solution.
- Database schema or data migration work.

---

## How to Report Progress

After each task:
- State: Task X.Y — **COMPLETE** (or BLOCKED)
- Evidence: command outputs + key file diffs (or commit hash)
- Any deviations from the plan + rationale

After each full phase:
- Phase N Summary + updated "Definition of Done" checklist.

This plan is designed to be executed by a capable implementation agent (AI or human) with full access to the repo, build tools, and tests. Follow it sequentially and the project will move from "cannot build" to "public web pages are production-ready on the critical dimensions" with controlled debt reduction.

**End of Plan**
