# Multi-Agent Fulfillment Platform – Implementation Plan

**Project**: Healthspan / MattaNutra – Scalable Physical Fulfillment via Multiple Retail / Pharmacy Partners  
**Date**: 2026-06  
**Status**: Architecture-first plan – ready for implementation  
**Related Documents**:
- `docs/dream-pharmacy-fulfillment-plan.md` (previous Dream Pharmacy-specific version)
- `docs/production-readiness-plan.md`
- `docs/business_blueprint.md`

---

## 1. Executive Summary & Strategic Direction

MattaNutra is moving from a purely digital recommendation model to a **hybrid model** where trusted local **Fulfillment Agents** (pharmacies, compounding labs, health retailers, or similar partners) handle the physical last mile of supplement and nutrition product delivery.

**Critical Architectural Requirement**:
The system must be designed **from day one** to support **multiple Fulfillment Agents**, potentially operating in **different countries**, with different commercial terms, tax regimes, and operational models. Hard-coding any single partner (e.g. one specific pharmacy) is not acceptable.

**Core Capabilities Required**:

1. **Full Order & Fulfillment Management** across any number of agents, with complete lifecycle state tracking and nominal vs actual accounting.
2. **Platform Fee Model (the only supported commercial model)**:
   - The **Fulfillment Agent** (pharmacy or retail partner) is the legal retailer.
   - The customer pays the Fulfillment Agent directly for the products.
   - The Fulfillment Agent pays MattaNutra a **recurring platform fee** (typically a percentage of revenue generated from platform-referred customers) for the privilege of receiving qualified leads and using MattaNutra’s recommendation engine, branding, and customer acquisition.
   - MattaNutra is **not** the merchant of record for the physical products.

   The old model (MattaNutra collecting payment from the customer and acting as the retailer) is **explicitly out of scope**. The architecture must be built exclusively around the Fulfillment Agent being the retailer.
3. **Agent Lifecycle Management**: MattaNutra must be able to add, configure, block, suspend, and remove Fulfillment Agents through the admin system without code changes.
4. **Per-Agent Configuration**:
   - Platform fee rates (percentage or fixed, versioned with effective dates)
   - Settlement frequency and terms
   - Country / jurisdiction
   - Tax handling rules
   - Branding (invoices, tracking pages, communications)
   - Capabilities (what product categories they can fulfill)
5. **Actionable Workflows** for each agent (via the existing task system).
6. **Stock & Procurement Intelligence** that can operate at both global and per-agent level.
7. **Multi-country support** (currency, tax, regulation, language, shipping) from the beginning.

**Design Principle**:
- MattaNutra is a **technology and customer acquisition platform**, **not** a retailer.
- Fulfillment Agents are independent legal entities that act as the merchant of record.
- The **only** revenue mechanism for MattaNutra from these partners is a **platform access / lead fee** charged to the Fulfillment Agent.
- The old model where MattaNutra acts as the retailer is deliberately **not supported** and must not be accommodated in the architecture.
- Treat Fulfillment Agents as first-class, configurable entities in the domain model — similar to how we already treat Supplements, Products, and Plans.

---

## 2. Current Foundations (Leverage, Do Not Duplicate)

The existing platform already provides excellent building blocks:

- **Finance Ledger** (`lib/finance-ledger.ts`): Nominal vs Actual entries, `source_ref` traceability, account model. This is the single most important asset for supporting multiple settlement models.
- **Task & Worker Engine**: Mature system for assigning work to humans or external partners.
- **Payments & Plans**: Strong linkage between payments and nutrition plans.
- **Product & Recommendation System**: Already has pricing, coverage, and near-miss logic.
- **Admin Dashboard Patterns**: Proven structure for adding new management sections.
- **BPM Observability**: Central event system that must be extended for agent-aware events.
- **i18n & Localization**: Already supports multiple languages.

We will **extend** these rather than create parallel systems.

---

## 3. Core Domain Model (Must Be Generic)

The following new primary concepts must be introduced:

### 3.1 FulfillmentAgent (Core Entity)
- `id`, `name`, `legal_name`, `country_code`, `status` (`active`, `onboarding`, `suspended`, `blocked`, `terminated`)
- Contact, banking, and operational details
- `commercial_model` — currently only `agent_direct_platform_fee` is supported (the model where the Agent is the retailer and pays MattaNutra a platform fee)
- `default_currency`
- Capabilities and constraints (JSON or relational)

### 3.2 AgentRateSchedule (Versioned)
- Per-agent fee structures that can change over time.
- Focused on platform fee models (percentage of attributed revenue, fixed fees, tiered, monthly rent, etc.).
- The old "platform collected" model (where MattaNutra is the retailer) is out of scope and should not be modeled.

### 3.3 FulfillmentOrder
- Belongs to one `fulfillment_agent_id`
- Linked to `payment_id` and `plan_id`
- Rich state machine (independent of who the agent is)
- Stores which commercial model and rate schedule was active at creation time (for auditability)

### 3.4 AgentSettlement & AgentPayout
- Separate from customer payments.
- Supports both "MattaNutra pays Agent" and "Agent pays MattaNutra" flows.

### 3.5 AgentStockLocation
- Inventory can be owned and managed per agent (or in some models, MattaNutra owns it and the agent only fulfills).

### 3.6 Platform Fee Revenue Model (Primary)

Because MattaNutra is **not** the retailer:

- Customer payment for products goes to the Fulfillment Agent (directly or via the agent’s own payment processor).
- MattaNutra’s revenue is a **platform fee** charged to the agent, typically calculated as a percentage of the gross revenue the agent generates from customers acquired through MattaNutra.
- This fee must be tracked, calculated, invoiced, and settled on a regular basis (e.g. monthly).
- The system must be able to:
  - Attribute orders/revenue to specific Fulfillment Agents over time.
  - Apply the correct rate schedule version that was active during the period.
  - Generate agent-facing invoices/statements for the platform fee.
  - Record these as receivables in the finance ledger (Agent owes MattaNutra).

**Implementation Started**:
- `lib/agent-commercial-models.ts` — Core types for commercial models and platform fees.
- `lib/agent-platform-fees.ts` — Service for calculating attributed revenue and recording platform fee receivables.

This is fundamentally different from traditional affiliate or dropship models and must be first-class in the data model and financial flows.

---

## 4. Key Business & Technical Requirements

### 4.1 Agent Management (Admin)
MattaNutra operations must be able to:
- Onboard new Fulfillment Agents (with approval workflow)
- Edit rates and commercial terms (with versioning + effective dates)
- Block / suspend an agent instantly (existing orders must be handled gracefully)
- Terminate an agent with proper data export and transition plans
- View performance, financials, and compliance status per agent

### 4.2 Primary Settlement Model: Platform Fee (Agent is the Retailer)

**Default / Intended Model**:
- The Fulfillment Agent is the legal retailer and merchant of record.
- The customer pays the Fulfillment Agent directly for the products and services.
- MattaNutra charges the Fulfillment Agent a **platform fee** (percentage of attributed revenue, or other agreed structure).
- The agent settles this fee with MattaNutra on a scheduled basis (e.g. monthly).

This model keeps MattaNutra out of the retail transaction, which has significant regulatory, tax, and liability advantages.

The old model (where MattaNutra receives customer payment and acts as the retailer) is **not supported** and must not be built into the system.

All order, financial, invoicing, and reporting logic must be built exclusively around the "Fulfillment Agent is the Retailer + Platform Fee to MattaNutra" model.

### 4.3 Multi-Country Considerations
- Per-country tax configuration (extend the Thai tax work already started)
- Different regulatory requirements per agent/country
- Currency handling and FX
- Local shipping carriers and tracking
- Local language on invoices, tracking pages, and communications

### 4.4 Observability (BPM)
Every significant action involving a Fulfillment Agent must emit clear BPM events, including:
- Agent onboarding / status changes
- Order assignment to agent
- Rate schedule changes
- Settlements in either direction
- Blocking / suspension events

---

## 5. Revised Implementation Phases (Generic)

### Phase 0: Data Model & Core Abstractions (Highest Priority)

**Goal**: Make the entire fulfillment domain generic and multi-agent from the first migration.

**Key Deliverables**:
- `fulfillment_agents` table + supporting tables (`agent_rate_schedules`, `agent_rate_schedule_versions`, `agent_capabilities`, etc.)
- `fulfillment_orders` must reference `fulfillment_agent_id` (not a hard-coded pharmacy)
- Extend finance ledger categories and helpers to support agent settlements in both directions
- Schema migration script (following existing patterns)
- TypeScript types and basic CRUD services for agents and rate schedules

**Acceptance Criteria**:
- You can create, update, activate, suspend, and block a Fulfillment Agent entirely through data + admin functions (no code changes).
- Different agents can have completely different commercial models and rate schedules active at the same time.
- All financial entries are traceable to a specific agent + rate schedule version.

### Phase 1: Agent Management & Lifecycle in Admin

- New Admin section: **"Fulfillment Agents"** (or "Retail Partners")
- Full CRUD + status management UI
- Rate schedule management with effective dating and versioning
- Ability to view all orders, financial summary, and performance per agent
- Blocking/suspension workflow that prevents new orders and surfaces existing ones for reassignment

### Phase 2: Order & Fulfillment Engine (Agent-Aware)

- Order creation logic that selects (or allows override of) the appropriate Fulfillment Agent based on rules (location, capabilities, load, margin, etc.)
- Task generation routed to the correct agent’s workers / human users
- State machine that works identically regardless of which agent is fulfilling
- Support for both commercial models at order creation time

### Phase 3: Flexible Financial Settlement Engine

- Proper modeling and automation for:
  - Model A: Platform collects → creates payable to agent
  - Model B: Agent collects → creates receivable from agent (monthly rent / commission)
- Agent-level financial reporting and settlement runs
- Integration with existing nominal/actual ledger

### Phase 4: Invoices, Tax & Customer Experience (Per-Agent)

**Customer Invoices**:
- The Fulfillment Agent (not MattaNutra) is the issuer of the customer invoice for products.
- Invoices should be co-branded (Agent prominent as seller + MattaNutra as the recommendation/platform provider).
- Localized per agent country + language.

**Platform Fee Invoices**:
- MattaNutra issues invoices/statements to the Fulfillment Agent for the platform fee (this is MattaNutra’s revenue).

- Public customer tracking pages branded for the specific agent.
- Per-country tax configuration (building on the Thai tax foundation started earlier).

### Phase 5: Stock, Procurement & Intelligence (Multi-Agent)

- Stock levels, movements, and predictions **per agent location**
- Global + per-agent "Fantasy Base Product" analysis
- Procurement recommendations that consider multiple agents’ inventory and margins
- Agent-specific margin ranking of equivalent products

### Phase 6: Advanced Operations & Multi-Country Hardening

- Agent onboarding workflow (with documents, compliance checks)
- Regulatory event tracking per country/agent
- Returns handling across agents
- Performance dashboards and alerting per agent
- Tools for migrating orders when an agent is terminated

---

## 6. Architectural Guardrails (Must Follow)

- **Never hard-code** a specific pharmacy or partner name anywhere in code, configuration, or UI copy (except as example data).
- Every financial movement, task, and BPM event must be traceable to a `fulfillment_agent_id`.
- Rate and commercial model decisions must be captured at the time of order creation (for audit and dispute resolution).
- The admin must be able to manage agents and rates without developer involvement.
- The system must support agents in different countries with different currencies and tax rules without major architectural changes.
- Blocking an agent must be a first-class, auditable action with clear downstream effects.

---

## 7. Open Questions & Recommendations

1. **What is the primary entity name we will use in the UI and code?**
   - Recommendation: **Fulfillment Agent** (neutral and scalable). "Retail Partner" or "Fulfillment Partner" are also acceptable.

2. **How should we handle inventory ownership?**
   - Option A: Agent owns and manages their own stock.
   - Option B: MattaNutra owns stock and places it on consignment with agents.
   - The data model should support both.

3. **Monthly rent / platform fee collection (Model B)**
   - Should this be automated via tasks + invoices, or manual settlement runs?

4. **Agent user access model**
   - Should agents get a limited, white-labeled version of the admin, or work purely through tasks + a lightweight portal?

---

## 8. Immediate Next Steps (Recommended)

1. Rename and generalize the plan (this document).
2. Run a short architecture workshop to agree on core entity names (`FulfillmentAgent`, etc.).
3. Begin Phase 0 with the data model design (this is the highest leverage work).
4. Extend the existing Thai tax work into a generic per-country tax configuration system.

---

This revised plan ensures that MattaNutra can start with one agent (e.g. in Thailand) while building a platform that can gracefully scale to many agents across multiple countries with different commercial arrangements — without requiring major rewrites later.

**End of Plan**