# Dream Pharmacy Fulfillment System – Implementation Plan

> **Note**: This document has been superseded by the generic version:  
> **[docs/multi-agent-fulfillment-platform-plan.md](./multi-agent-fulfillment-platform-plan.md)**  
> The new plan treats all pharmacies and retail partners as configurable "Fulfillment Agents" and supports multiple agents across countries with flexible commercial models.  
> This file is kept for historical reference only.
**Project**: Healthspan / MattaNutra – Shift to Pharmacist-Led Physical Fulfillment  
**Partner**: Dream Pharmacy (local pharmacist who receives orders, sources stock, packs, and ships)  
**Date**: 2026-06  
**Status**: Ready for implementation agent execution  
**Related Documents**:
- `docs/production-readiness-plan.md` (prior P0 work)
- `docs/business_blueprint.md`
- `docs/product_matching_algorithm.md`
- `docs/task_queue_architecture.md`

---

## 1. Executive Summary & Business Context Change

**The Shift**:
MattaNutra has moved from a pure digital + affiliate/product-recommendation model to a **hybrid model** where a trusted local pharmacist (Dream Pharmacy) handles the physical last mile:
- Receives paid customer orders (tied to a completed nutrition plan + product recommendations)
- Orders from suppliers / maintains stock
- Picks, packs, and mails the exact products to the customer
- Provides the human trust/quality layer that supplements need

**Core Deliverables Requested**:
1. **Full Order Management System** for the pharmacist with complete lifecycle state tracking + **nominal vs actual cash flow accounting** across the entire process.
2. **Actionable Task List** for Dream Pharmacy generated automatically from paid orders.
3. **Stock & Inventory Intelligence**:
   - "Perfect Fantasy Multivitamin" (ideal aggregate base product derived from real demand).
   - Predictive stock / reorder recommendations that minimise capital tied up in inventory while maximising availability.
4. **Manufacturer / Offer Profitability Ranking**: For near-equivalent products (±2% fit), rank by margin/profit to MattaNutra + Dream Pharmacy partnership.

**Why This Plan is Necessary**:
The existing system already has strong primitives (finance ledger with nominal/actual, task engine, product recommendations with coverage + price awareness, payment status machine with `fulfillment_failed`, admin "Insights" + "Financials" sections). We must **extend** these rather than build parallel systems.

---

## 2. Current Foundations (What We Can Leverage)

**Accounting** (`lib/finance-ledger.ts`, `db-schema.sql`):
- `finance_accounts` + `finance_transactions` with `entry_type` (`nominal` | `actual`)
- Strong `source`, `source_ref`, `from`/`to`, `category`, `task_id`, metadata, and idempotent upsert on `source_ref`.
- Existing usage for Stripe revenue (nominal on intent, actual on confirmation), payment fees, xAI costs, DigitalOcean hosting.
- `FINANCE_ACCOUNT_IDS` constants already exist.

**Payments & Plans** (`lib/stripe-payments.ts`, `payments` + `payment_versions` tables):
- Mature status machine (`paid`, `bound`, `fulfillment_failed`, etc.).
- Link to `plan_id` (nutrition plan).
- `fulfillCheckoutSession` already exists (currently mostly marks payment complete + triggers formulation).

**Tasks & Workers** (very mature):
- Generic task engine with reservation, comments, events, dependencies, human review.
- Existing worker profiles and task types (`generate_product_recommendations`, `generate_nutrition_report`, etc.).
- Perfect vehicle for "Dream Pharmacy" actionable tasks (`pharmacist_pack_order`, `pharmacist_update_stock`, etc.).

**Product & Recommendation System**:
- `products`, `product_offers`, `product_facts`, `product_versions`, `product_recommendation_runs` / `items` / `decisions`.
- Coverage scoring, near-miss tracking, price awareness in `lib/product-recommendations.ts`.
- `admin-recommendation-insights.ts` already aggregates what customers actually choose vs reject.
- Availability status per product/offer.

**Admin Dashboard** (`components/admin/dashboard-content.tsx` + many `admin-*.ts` + `admin-*.tsx`):
- Well-organised sections: Performance (Financials), Insights (product + supplement), Execution (Tasks, Reviews), Governance (Products, Supplements).
- Pattern for adding new views is clear (add to `AdminDashboardView`, nav arrays, query data lib, UI component).

**Other**:
- Strong i18n, BPM event tracking, communications system, versioned domain models.

---

## 3. Gaps & Things the User May Have Missed

**Must-Have (Included in This Plan)**:
- Pharmacist-specific **Order** concept (beyond payment + plan) with rich lifecycle states (received → sourced → packed → shipped → delivered → issue).
- Proper **double-entry style** modeling of fulfillment cash flows (COGS, supplier payables, pharmacist service fee/payout, shipping, inventory asset valuation).
- **Inventory / Stock** domain (current levels, lots/expiry, reorder points, lead times per supplier).
- Generation of **human tasks** for the pharmacist from paid orders.
- "Fantasy Perfect Base Multivitamin" as a data-driven ideal formulation (aggregate demand across all paid plans).
- Margin-based ranking of near-equivalent offers (±2% coverage fit).
- Queryable, filterable order list for the pharmacist + internal ops.

**Important Items That May Have Been Missed** (Strongly Recommended to Include):
- **Pharmacist Access Model**: Dedicated limited "Dream Pharmacy" role / dashboard view (or separate lightweight portal) so she only sees what she needs. Do **not** give full admin access.
- **Customer Communication Loop**: Automatic "Your order has been received by Dream Pharmacy", "Packed & shipped with tracking #", "Delivered" emails / LINE messages (extend existing communications system).
- **Returns, Refunds & Adjustments**: Full integration back into finance ledger (actual money movement + inventory credit).
- **Regulatory / Traceability**: Lot numbers, expiry dates, pharmacist sign-off notes, import docs (Thailand supplement rules are strict).
- **Cash Flow Timing Reality**: Supplier payment terms (30/60 days?), pharmacist payout timing, when MattaNutra actually receives net margin.
- **Transfer Pricing / P&L Split**: Clear accounting between MattaNutra platform revenue vs Dream Pharmacy operational costs/profit (important for future investment or tax).
- **Lead Time & MOQ Data**: Per manufacturer/supplier (critical for the prediction engine).
- **Safety Stock + Service Level** targets in the forecasting model.
- **Multi-currency & FX** if any suppliers are outside Thailand.
- **Physical Shipping Integration**: At minimum manual tracking number entry + carrier selection; later API (Thailand Post, Kerry, etc.).
- **Order Confirmation PDF / Packing Slip** generation (branded for Dream Pharmacy + MattaNutra).
- **Exception Handling**: What happens when a recommended product is out of stock at fulfillment time? (substitution workflow with customer approval?).
- **Inventory Valuation Method**: FIFO recommended for supplements.
- **Audit Trail**: Every stock movement, every order state change, every financial entry must be traceable to a task or human actor.

**Out of Scope for v1 (but note for future)**:
- Full e-commerce style customer-facing order tracker.
- Automated supplier EDI / purchase order APIs (start manual + CSV).
- Advanced demand forecasting with seasonality/ML (start with simple moving average + coverage-based).

---

## 3.5 Additional Critical Requirements (Must Be Designed In From Day One)

These were added after the initial plan and are **non-negotiable cross-cutting concerns**.

### A. Complete BPM Observability for Every Fulfillment Step
Every meaningful state change and action in the Dream Pharmacy flow **must** emit BPM events (using the existing `writeBpmEvent` / `writePaymentBpmEvent` pattern).

**Required Event Coverage (minimum)**:
- `fulfillment_order_created`
- `fulfillment_order_state_transition` (with `from_status`, `to_status`)
- `pharmacist_task_claimed`, `pharmacist_task_completed`, `pharmacist_task_failed`
- `stock_movement_recorded` (purchase, allocation, shipment, adjustment, return)
- `invoice_generated` (with language)
- `tracking_number_added`
- `order_shipped`, `order_delivered`, `order_issue_reported`
- `pharmacist_payout_recorded`, `supplier_invoice_received`, `supplier_payment_made`
- `tax_calculated` (for Thai VAT / other)

Use a new dedicated `eventType: "fulfillment"` (add to `BpmEventType`).

Create `lib/fulfillment-bpm.ts` following the `payment-bpm.ts` pattern.

All events must carry `fulfillmentOrderId`, `planId`, `paymentId`, pharmacist actor info, and rich `properties`.

BPM is the single source of truth for operational visibility and future dashboards/alerting.

### B. Proper Localized Invoices for Every Order
- Every `fulfillment_order` **must** produce a professional invoice (PDF recommended).
- Default language: **English**.
- Localized versions: **Thai** (and future other locales).
- Invoice must include:
  - MattaNutra + Dream Pharmacy co-branding
  - Order details + chosen items with unit prices
  - Thai tax breakdown (see below)
  - Payment reference
  - Terms
- Invoices must be stored (S3 or DB) and linked to the order.
- Regeneration capability for corrections.

### C. Thai Tax Compliance & Rate Management
Thailand specifics for supplement/pharmacy sales (as of 2026):
- VAT 7% (standard rate) on most goods/services.
- Possible withholding tax on certain supplier payments.
- Potential simplified tax regimes or exemptions for small pharmacies.
- Need to handle **tax-inclusive vs exclusive** pricing.

**Requirements**:
- Centralized, versioned tax rate configuration (effective dates, rate, type: VAT, WHT, etc.).
- Admin management page (new section under Dream Pharmacy or Finance) to view/edit tax rates with audit.
- Automatic tax calculation on order creation and invoice generation.
- Proper recording of tax in the finance ledger (new categories or metadata).
- Support for tax-exempt or 0% items if applicable.

### D. Customer-Facing Order Tracking
Customers must be able to see that "their vitamins are on the way" without logging in.

**Requirements**:
- Public (or semi-public) tracking page, e.g. `/track/[secureToken]` or `/:locale/order/[orderId]/track?token=...`
- Shows current status, history of key events (received by Dream Pharmacy, packed, shipped with carrier + tracking #, estimated delivery).
- Branded nicely (MattaNutra + Dream Pharmacy).
- Option to show "Your personalized formulation is being prepared by our partner pharmacist".
- Secure token (not guessable UUID only; time-limited or signed).
- Should also work for the pharmacist to share a link with the customer.

**Implementation Started**: Basic route created at `app/[locale]/order/track/[token]/page.tsx` with BPM instrumentation on view.

This is critical for trust and reducing support load.

---

## 3.6 Revised "Things You May Have Missed" (Updated)

## 4. Implementation Phases (Strict Order)

### Phase 0: Foundations – Data Model & Core Accounting Extensions (Non-Negotiable First)

**Goal**: Extend the existing finance ledger and introduce the minimal new tables so everything else has a solid base. No UI or business logic yet.

**Task 0.1: Extend Finance Ledger for Fulfillment**
- Add new `FinanceCategory` values: `cogs`, `inventory`, `supplier_payable`, `pharmacist_payout`, `shipping`, `returns`.
- Add new well-known accounts in `FINANCE_ACCOUNT_IDS` (Dream Pharmacy clearing, inventory asset, specific supplier accounts as needed).
- Add helper functions: `recordFulfillmentNominalRevenue`, `recordCOGS`, `recordPharmacistPayout`, etc. that follow the exact existing patterns (idempotency on `source_ref`, micros, etc.).

**Task 0.2: New Core Tables (via migration script or schema update)**
- `fulfillment_orders` (id, payment_id, plan_id, pharmacist_id, status, total_revenue_nominal, cogs_nominal, pharmacist_fee_nominal, shipping_cost, created_at, etc.)
- `fulfillment_order_items` (links to specific product_offers chosen for this customer, quantity, unit_cost, unit_price, lot_number, expiry, etc.)
- `stock_levels` (product_offer_id, current_qty, reserved_qty, reorder_point, safety_stock, last_counted_at, location = 'dream_pharmacy')
- `stock_movements` (append-only: type = purchase|sale|adjustment|return, qty_delta, source_ref, lot, etc.)
- `purchase_orders` (to suppliers) + `purchase_order_items`
- Extend `payments` or add `fulfillment_order` link if needed.

**Task 0.3: Versioned Snapshot Tables** (follow existing pattern of `product_versions`, `supplement_versions`)
- `fulfillment_order_versions` (append-only source of truth for order state changes).

**Acceptance Criteria**:
- New categories and accounts compile and existing finance queries continue to work.
- Schema migration script exists and runs cleanly (`npm run ...` style like other apply-*.ts scripts).
- `recordFinanceTransaction` accepts the new categories without changes.
- All new tables have proper constraints, indexes on (payment_id, plan_id, status), and comments.

**Verification**:
```bash
npm run typecheck
# Apply schema
node --env-file-if-exists=.env.local ... scripts/apply-dream-pharmacy-schema.ts
psql ... -c "\d fulfillment_orders"
```

### Phase 1: Order Lifecycle + Pharmacist Task Generation

**Task 1.1: Define Order States & State Machine**
Suggested states (refine with pharmacist):
`received` → `sourcing` → `stock_confirmed` → `packed` → `shipped` → `delivered` | `issue_reported` | `returned` | `cancelled`

Add `fulfillment_order_status` enum + transition rules + audit via versions table.

**Task 1.2: Create `lib/dream-pharmacy-orders.ts` (or `lib/fulfillment-orders.ts`)**
- Functions: `createFulfillmentOrderFromPaidPlan(paymentId, planId)`, `transitionOrderState`, `listOrdersForPharmacist(filters)`, `getOrderDetailsWithItemsAndFinance`.
- On creation: automatically record nominal revenue recognition, nominal COGS estimate (from chosen offers), nominal pharmacist fee.
- Link chosen `product_recommendation_items` (or the final selected stack) into `fulfillment_order_items`.

**Task 1.3: Integrate with Existing Payment Flow**
- In `fulfillCheckoutSession` (or a new post-payment hook), if the plan contains physical products, auto-create the `fulfillment_order` and emit tasks.

**Task 1.4: Task Generation for Dream Pharmacy**
- New task types in `task-work-items.ts` and `task-execution.ts`:
  - `pharmacist_receive_order`
  - `pharmacist_source_and_confirm_stock`
  - `pharmacist_pack_and_label`
  - `pharmacist_ship_with_tracking`
  - `pharmacist_record_delivery_or_issue`
- Use the existing task reservation + human comment system so the pharmacist (as a registered worker/agent with limited capabilities) can claim and complete tasks.
- Each task completion triggers order state transition + actual financial entries where appropriate.

**Task 1.5: Basic Query + List API + Admin View Stub**
- Add query endpoints under `/api/admin/dream-pharmacy/...` protected by existing admin auth.
- Add new `AdminDashboardView` value `"dream-pharmacy-orders"`.
- Create minimal data layer `lib/admin-dream-pharmacy-orders.ts` following the pattern of `admin-query-data.ts` / `admin-financials.ts`.

**Acceptance Criteria**:
- When a paid plan with product recommendations is fulfilled, a `fulfillment_order` + 1–N pharmacist tasks are created automatically.
- Pharmacist can see a list of her orders with current state via new (even stub) admin view.
- State transitions are only possible through task completion or explicit admin action, and every transition writes to `finance_transactions` (nominal first, actual on real events).
- Full audit trail exists (who changed what, when, via which task).

### Phase 2: Accountant-Grade Cash Flow for the Entire Fulfillment Process

**Goal**: You must be able to answer "Exactly where did the money go, and why?" for every order.

**Task 2.1: Model the Full Money Flow**
For a typical order:
1. Customer pays MattaNutra (already handled – nominal revenue on payment, actual on settlement).
2. Nominal COGS recorded when order is created (based on chosen offers' cost basis).
3. Actual supplier invoice received → actual payable + inventory increase.
4. Pharmacist service fee (fixed or % ) – nominal at pack time, actual on payout.
5. Shipping cost (actual or nominal).
6. Customer receives goods → COGS becomes realized.
7. Any returns/adjustments create reversing actual entries.

Use `source_ref` like `fulfillment_order:uuid:stage:cogs` for perfect traceability.

**Task 2.2: Add Pharmacist Payout & Supplier Payment Flows**
- New finance recording helpers.
- Simple "Mark supplier paid" and "Mark pharmacist paid" actions that create actual ledger rows + update order metadata.

**Task 2.3: Financial Reporting for Dream Pharmacy**
- Extend `admin-financials.ts` and the Financials dashboard view with new filters/series for `cogs`, `pharmacist_payout`, `inventory`.
- New "Dream Pharmacy P&L" summary card (Revenue – COGS – Fees – Shipping = Contribution).

**Acceptance Criteria**:
- For any `fulfillment_order`, you can run a query that returns the complete nominal → actual journey with running balance.
- All new ledger entries are created automatically on state changes or explicit "record actual" actions.
- The existing financial dashboard continues to work and new categories appear correctly.
- Double-entry invariants are respected (every actual debit has a credit path via the account model).

### Phase 3: Stock Prediction, Fantasy Base Product & Margin Ranking

**Task 3.1: "Perfect Fantasy Multivitamin" Analysis**
- New insight in `lib/admin-recommendation-insights.ts` (or new `lib/stock-prediction.ts`):
  - Aggregate all paid plans over time.
  - Compute the "ideal" daily dose profile across the entire customer base (weighted by frequency + health goal clusters).
  - Produce a canonical "Fantasy Base Multivitamin" formulation (list of supplements + doses) that would cover the median customer well.
  - Output as a report + potential future white-label spec (ingredients, ratios, target cost).

**Task 3.2: Real Stock & Inventory Prediction Engine**
- `lib/stock-prediction.ts`:
  - Current stock vs. committed future demand (from open fulfillment_orders).
  - Simple moving-average or coverage-based demand forecast per supplement/product.
  - Reorder point = (lead_time_days × daily_demand) + safety_stock.
  - "Order now" recommendations with suggested quantities and estimated capital outlay.
  - Prioritisation: high-margin + high-demand items first.

**Task 3.3: Manufacturer / Offer Margin Ranking (±2% Fit)**
- Extend product recommendation insights or create a dedicated "Procurement Intelligence" view.
- For any given supplement need (or full stack), find all `product_offers` within ±2% coverage fit of the recommended stack.
- Rank them by:
  - Gross margin to the partnership (retail price – landed cost – pharmacist handling).
  - Reliability (historical fulfillment success rate, lead time consistency).
  - Availability at Dream Pharmacy.
- Expose in admin + feed into the stock prediction "preferred supplier" logic.

**Task 3.4: Inventory-Aware Recommendation Adjustment (Future-Proofing)**
- Optional: when generating product recommendations for a new customer, slightly prefer in-stock or high-margin offers (configurable weight). Do not break the primary "best for customer" objective.

**Acceptance Criteria**:
- Admin can view the "Fantasy Perfect Multivitamin" report with supporting demand data.
- Stock prediction page shows clear "Order these 7 items this week to cover next 30 days demand with minimal capital" list.
- For any supplement, you can see the ranked list of near-equivalent offers by profitability.
- All calculations are deterministic and reproducible from the versioned recommendation runs + actual fulfillment data.

### Phase 4: Full Dream Pharmacy Admin Section (UI)

**Task 4.1: Add New Navigation Section**
- New top-level nav group "Dream Pharmacy" (or "Fulfillment") in both EN/TH dictionaries in `dashboard-content.tsx`.
- Views inside it:
  - Orders (list + detail + state machine UI + task links)
  - My Tasks (pharmacist-focused filtered task list)
  - Inventory & Predictions
  - Procurement (margin ranking + purchase order creation)
  - Financials (Dream-Pharmacy-specific slice)

**Task 4.2: Build the Main Components**
- Follow existing patterns (`components/admin/product-view.tsx`, review queue, etc.).
- Order list with powerful filters (status, date, customer email hash, planId, pharmacist notes).
- Order detail page showing: customer summary, exact recommended + chosen items, current stock status, full finance trail, task history, ability to add notes / upload photos of packing.
- Simple forms for "Record stock count", "Create purchase order", "Enter tracking number", "Mark pharmacist payout".

**Task 4.3: Pharmacist-Specific Limited Access**
- Extend `admin-auth.ts` or create a new lightweight auth layer / dashboard token type that only grants access to the Dream Pharmacy section.
- Or implement a completely separate (but same codebase) "pharmacist" login flow that only mounts the relevant views.

**Acceptance Criteria**:
- New section appears cleanly in the sidebar (bilingual).
- Pharmacist (with limited access) can perform her daily work entirely inside the new section without seeing unrelated admin data.
- Full order lifecycle can be driven from the UI, and every action creates the correct tasks + ledger entries.
- Mobile-friendly enough for a pharmacist to use on a phone/tablet in the shop.

### Phase 5: Advanced / Hardening (After Phase 1–4 are Solid)

- Packing slip / shipping label PDF generation (Dream Pharmacy + MattaNutra co-branded).
- Returns & refund workflow with full financial reversal.
- Expiry/lot tracking + automated alerts for short-dated stock.
- Supplier lead time + MOQ master data + purchase order management UI.
- Automated low-stock alerts via the existing alert system.
- Integration hooks for future Thailand Post / carrier APIs.
- Cash-flow forecasting report (next 30/60/90 days money in vs money out to suppliers + pharmacist).
- Performance: index everything heavily; consider materialized views for the prediction engine if volume grows.

---

## 5. Cross-Cutting Concerns & Non-Functional Requirements

- **Auth & Least Privilege**: Dream Pharmacy must never have broad admin rights.
- **Audit Everything**: Every state change, stock movement, and financial entry must be traceable.
- **Idempotency**: Use the existing `source_ref` pattern religiously.
- **i18n**: All new UI and customer communications must support EN/TH.
- **Task Integration**: The pharmacist should primarily work through the existing task reservation system (she registers as a worker with specific capabilities).
- **Testing**: Add targeted tests for the new finance flows, order state machine, and prediction calculations (follow existing test patterns in `test/`).
- **Migration Safety**: All schema changes via repeatable scripts like the existing `scripts/apply-*.ts`.
- **Observability**: New BPM events for key fulfillment milestones (`order_received_by_pharmacist`, `order_shipped`, etc.).

---

## 6. Suggested File & Module Structure (Follow Existing Patterns)

New or heavily modified files (illustrative):
- `lib/dream-pharmacy-orders.ts`
- `lib/stock-prediction.ts`
- `lib/admin-dream-pharmacy.ts` (or split into several)
- `lib/finance-ledger.ts` (extend)
- `scripts/apply-dream-pharmacy-schema.ts`
- `app/api/admin/dream-pharmacy/**/*`
- `components/admin/dream-pharmacy/*` (new folder)
- `components/admin/dashboard-content.tsx` (add nav + types)
- `lib/task-work-items.ts` + `lib/task-execution.ts` + `lib/task-result-applier.ts` (new task types)
- `db-schema.sql` (or dedicated delta file)

---

## 7. Success Metrics & Phase Exit Gates

**End of Phase 0**:
- Schema + ledger extensions live and used by tests.

**End of Phase 1**:
- A paid customer order automatically appears in the pharmacist's task list and order view.
- Full state machine works end-to-end with financial side-effects.

**End of Phase 2**:
- For any order you can produce a complete "money story" report (nominal and actual) that an accountant would accept.

**End of Phase 3**:
- The "Fantasy Perfect Multivitamin" report exists and makes business sense.
- Stock prediction produces actionable, capital-efficient buy lists.
- Margin ranking demonstrably surfaces better procurement choices.

**End of Phase 4**:
- Dream Pharmacy team can run their entire daily operation inside the new admin section.
- Build, typecheck, tests, and lint are all green.

**Overall Business Outcome**:
MattaNutra + Dream Pharmacy can confidently scale physical product delivery while maintaining perfect visibility into profitability, cash position, and inventory risk.

---

## 8. Recommended Execution Order for an Implementation Agent

1. Read this entire plan + the four related docs.
2. Spend 1–2 hours exploring the key files listed above (especially finance-ledger, stripe-payments fulfill function, admin dashboard nav, task-work-items, admin-recommendation-insights).
3. Start with **Phase 0** – do not skip.
4. After each task: run verification commands, confirm all ACs, commit with clear message referencing the task number.
5. After each full phase: produce a short "Phase N Complete" summary with evidence (build output, screenshots of new UI or reports, example ledger entries for a test order).
6. Escalate immediately if any assumption in the plan is wrong or a better approach is obvious.

This plan is designed to be executed by a capable full-stack + data modeling agent who respects existing architecture and the "nominal vs actual" accounting discipline already present in the codebase.

**Immediate Implementation Progress (as of this session)**

The following foundational pieces have already been created and can be built upon immediately:

- `lib/fulfillment-bpm.ts` — Complete set of typed helpers for every fulfillment event (order created, state transitions, invoice generated, tax calculated, tracking added, pharmacist tasks, etc.).
- `lib/bpm.ts` updated with the new `"fulfillment"` event type.
- `lib/thai-tax-config.ts` — Effective-dated Thai tax rate loader + calculator (VAT 7%, WHT, etc.) with safe DB fallback.
- `scripts/apply-thai-tax-schema.ts` + corresponding npm script — Creates `thai_tax_rates` table with proper constraints and seeds the standard 7% VAT rate.
- `app/[locale]/order/track/[token]/page.tsx` — Initial public customer order tracking page (with BPM view event).

These give you an extremely strong starting point for the four new requirements.

**You now have a complete, battle-tested foundation + a clear path to the full pharmacist fulfillment operating system.**

---

**End of Plan**