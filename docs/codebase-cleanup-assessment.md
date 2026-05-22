# MattaNutra DB-Up Codebase Cleanup Assessment

Last assessed: 2026-05-21 on local `dev`.

## Executive Summary

The project is now broad enough that cleanup must start from the database and domain boundaries, not from individual files. The active business core is:

- assessment capture and plan lifecycle
- task orchestration
- supplement catalogue
- product catalogue, imports, validation, countries, offers, and matching
- safety/admin review
- customer refine/delivery surfaces

Food, content, communications, finance, campaigns, and BPM exist and should not be deleted, but food should remain dormant in the active recommendation chain until the supplement/product system is clean.

The immediate cleanup risk is not missing code; it is having too many overlapping state systems: mutable projections plus append-only version tables, `status` plus validation cache, `list_status` plus `is_active`, import evidence plus `source_snapshot`, product stack variants plus legacy matcher paths, and old marketplace naming inside catalogue-first code.

## Live DB Inventory

Current local table counts:

| Domain | Tables | Current rows | Decision |
| --- | ---: | ---: | --- |
| Assessment | `assessments`, `assessment_versions`, `nutrition_plan_versions`, `assessment_example_requests` | 46 | Simplify around append-only versions plus projection |
| Task runtime | `tasks`, agents, worker sessions, comments, events, reservations, approvals, dependencies | 4,713 | Keep; isolate generic engine from domain orchestration |
| Product catalogue | product brands, countries, products, facts, versions, offers, imports, recommendation runs/items, admin audit | 9,169 | Highest priority cleanup |
| Supplement catalogue | supplements, aliases, safety limits, versions, admin audit | 782 | High priority cleanup |
| Food infrastructure | foods, aliases, safety, servings, nutrients, nutrient profiles, food guidance, audit | 317 | Preserve dormant |
| Plan refinement | chat messages, feedback, guidance adjustments, nutrition reports | 7 | Keep; simplify after core flow |
| Communications | identities, channels, messages, plan identities | 6 | Later |
| Content | blog posts, testimonials | 12 | Later |
| Finance | accounts, transactions | 52 | Later |
| Operations/analytics | BPM, cron, alert acknowledgements, conversion targets, AI cache | 568 | Later, except cache policy |

Product catalogue detail:

| Brand | Approved | Pending review | Ignored |
| --- | ---: | ---: | ---: |
| Blackmores | 127 | 28 | 0 |
| DHC | 252 | 76 | 1 |
| Mega We Care | 34 | 11 | 0 |
| Swisse | 17 | 7 | 0 |
| Vistra | 32 | 5 | 0 |

Supplement catalogue detail:

- 142 supplements
- 160 aliases
- 160 safety limit rows
- 142 supplement version baselines
- aliases are included in supplement version snapshots

Append-only version detail:

- `assessment_versions`: baseline plus lifecycle versions
- `nutrition_plan_versions`: baseline plus plan/formulation versions
- `product_versions`: 1,427
- `product_recommendation_runs`: 99
- `supplement_versions`: 142

## Foreign-Key Shape

The central dependency hubs are:

- `assessments`: referenced by tasks, BPM, cron, recommendations, formulations, food guidance, product recommendation runs, chat, communications, feedback, reports.
- `tasks`: referenced by task comments/events/reservations/dependencies/approvals, imports, communications, plan feedback, recommendation runs.
- `products`: referenced by countries, facts, versions, offers, imports, recommendation items, product audit.
- `supplements`: referenced by aliases, safety limits, product facts, supplement audit.
- `product_brands`: referenced by products, brand countries, product audit.
- `foods`: referenced by aliases, safety rules, serving sizes, nutrient profiles, product facts.

Cleanup must therefore avoid deleting hub records casually. Dev reset is allowed only through a curated snapshot/reload path.

## Current Source-of-Truth Policy

Keep:

- Append-only version tables are source truth: `assessment_versions`, `nutrition_plan_versions`, `product_versions`, `product_recommendation_runs/items`, `supplement_versions`, `supplement_safety_limits`.
- Current projection tables remain fast read models: `assessments`, `products`, `product_facts`, `supplements`, `supplement_aliases`.

Simplify:

- Product eligibility must be recomputed from observable data and latest safety limits, not trusted from stale `validation_status`.
- `source_snapshot` and import rows are evidence, not live business truth.
- `supplements.is_active` should become compatibility only; `supplements.list_status` should be the visible business state until a later migration removes the duplicate.

Quarantine:

- Runtime task rows, old worker sessions, BPM events, stale review tasks, and historical recommendation attempts can be cleared in dev reset, but not product/supplement catalogue data.

Later:

- Finance, content, communications, marketing, and food active guidance cleanup can wait until the product/supplement core is stable.

## Code Inventory

The repo has about 263 TypeScript/JavaScript source files and roughly 90k lines.

Largest cleanup targets:

| File | Lines | Issue |
| --- | ---: | --- |
| `components/admin/safety-views.tsx` | 5,667 | Multiple admin products/supplements/reviews flows in one UI file |
| `lib/admin-products.ts` | 4,394 | Product read model, writes, validation, imports, countries, offers, reviews, audit mixed together |
| `scripts/scrape-manufacturer-products.ts` | 3,839 | Shared importer plus brand behavior plus AI enrichment plus apply logic in one script |
| `lib/product-recommendations.ts` | 3,699 | Legacy/default/v2/full-beam matcher paths and diagnostics in one file |
| `lib/task-service.ts` | 2,958 | Generic task engine is large but should remain isolated |
| `components/assessment-flow.tsx` | 4,366 | Customer assessment UI is large and should be split only after core cleanup |
| `lib/task-result-applier.ts` | 2,203 | Domain result persistence mixed across healthscore, food, products, communications, examples |
| `lib/task-worker.ts` / `lib/task-work-items.ts` | 3,000+ combined | Task orchestration and domain work-item construction need clearer boundaries |

Direct write hotspots:

- `lib/task-service.ts`: task engine writes
- `lib/admin-products.ts`: product/catalogue writes
- `lib/task-result-applier.ts`: result writes across many domains
- `lib/admin-review-queue.ts`: review writes and supplement resolution
- `lib/communications.ts`: communication writes and safety review status updates
- `lib/admin-foods.ts`: food writes
- `scripts/scrape-manufacturer-products.ts`: importer apply writes

## Cleanup Decisions By Domain

### Assessment

Decision: simplify.

- Keep `assessments` as projection.
- Keep `assessment_versions` and `nutrition_plan_versions` as source truth.
- Route every future assessment status, healthscore, selected-plan, and lifecycle write through a single assessment projection service.
- Remove direct assessment updates from task files after service exists.

### Tasks

Decision: keep and isolate.

- Keep the generic task engine and append-only `task_events`.
- Do not fold product/assessment business rules into `task-service.ts`.
- Move domain-specific queueing and completion effects behind orchestration services.
- Preserve tests that prevent long transaction boundaries.

### Products

Decision: highest priority simplify.

- Split `lib/admin-products.ts` into product read model, write service, country service, offer service, validation service, import-review service, and candidate loading.
- Product status remains exactly `pending_review`, `approved`, `ignored`.
- Validation fields are cache/projection only.
- Product facts remain matchable canonical facts only.
- Product countries and brand countries are the matcher truth for availability.
- Legacy marketplace wording should become compatibility aliases only.

### Supplements

Decision: simplify.

- Keep visible state to `active` / `blocked`.
- Keep aliases as the canonicalization source for import, admin edit, plan canonicalization, and matching.
- Keep safety limits append-only.
- Hide or remove dependence on `is_active` after compatibility path is replaced.

### Imports

Decision: standardize.

- Every brand importer must use the same replayable flow:
  `discover -> evidence snapshot -> deterministic parse -> AI enrichment -> validation -> apply`
- Brand adapters only discover URLs and parse source-specific evidence.
- Shared apply handles products, facts, countries, offers, imports, versions, review tasks, and audit.
- No importer should delete catalogue history.

### Matcher

Decision: simplify to one active path.

- Keep `recommendProductStackFullBeam` as the active implementation unless a future migration replaces it.
- Keep legacy only for comparison tests until those tests are rewritten.
- Enforce no duplicate product in one stack.
- Prefer safe multi-dose before overlapping extra products.
- Product matching must ignore food needs and food facts for now.
- Precompute compact/balanced/max coverage during product matching task so UI switching is instant.

### Admin UI

Decision: split by view and shared controls.

- Break `components/admin/safety-views.tsx` into Products, ProductModal, Supplements, SupplementModal, Reviews, shared filters/stat chips, shared form controls.
- Products show one state pill and one computed validation/issues area.
- Supplements show canonical identity, aliases, safety limits, and history.
- Reviews show review tasks only.
- Add history links once timelines are exposed.

### Food

Decision: preserve dormant.

- Keep schema, admin, tests, and code.
- Keep food out of active product matching and task chain.
- Do not invest cleanup effort here until supplement/product flow is stable.

### Content, Finance, Communications, BPM

Decision: later.

- Keep existing behavior.
- Avoid broad refactors until core cleanup is complete.
- Only touch if core refactors require service boundaries or tests.

## Reloadable Catalogue Snapshot

The curated snapshot is now the first guardrail before any dev reset. It must include:

- `supplements`
- `supplement_aliases`
- `supplement_safety_limits`
- `supplement_versions`
- `supplement_admin_audit`
- `product_brands`
- `product_brand_countries`
- `products`
- `product_countries`
- `product_facts`
- `product_versions`
- `product_offers`
- `product_import_runs`
- `product_imports`
- `product_admin_audit`

Use:

```bash
npm run catalogue:snapshot
```

This writes a JSON snapshot and also creates timestamped DB backup tables by default.

Dev reset with catalogue reload must use:

```bash
npm run db:reset:dev:clean -- --snapshot=/path/to/snapshot.json
```

Never use clean dev reset without a snapshot.

## Phased Implementation Roadmap

### Phase 1: Guardrails And Assessment

- Maintain this assessment document.
- Keep `catalogue:snapshot`, `catalogue:reload`, `db:reset:dev:clean`, and `audit:codebase` green.
- Add static tests that ensure snapshot scope covers all product/supplement tables.
- Add static tests that keep direct core writes visible.

### Phase 2: Product/Supplement Service Boundaries

- Split `lib/admin-products.ts`.
- Split `lib/admin-supplements.ts`.
- Move validation cache refresh and safety-limit revalidation into dedicated services.
- Add history/timeline read APIs for product and supplement modals.

### Phase 3: Importer Standardization

- Split `scripts/scrape-manufacturer-products.ts`.
- Keep one shared apply path.
- Keep brand adapters small.
- Ensure replay updates, adds, and ignores without duplicates.

### Phase 4: Matcher Consolidation

- Remove inactive matcher variants from customer path.
- Keep one legacy comparison test path only if still useful.
- Precompute all stack variants once per task.
- Make diagnostics first-class admin data.

### Phase 5: Admin UI Simplification

- Split `components/admin/safety-views.tsx`.
- Consolidate filters/stat chips.
- Add history links.
- Remove duplicate/derived status pills.

## Acceptance Criteria

- A dev reset cannot be presented as safe unless a catalogue snapshot exists and reload passes.
- Every product/supplement table is either in snapshot scope or explicitly marked runtime/derived.
- Product/supplement code writes through service boundaries.
- Active recommendation flow ignores dormant food.
- Stack switching uses persisted/cached alternatives, not slow recompute from UI clicks.
- Build, typecheck, and targeted cleanup tests pass after each phase.
