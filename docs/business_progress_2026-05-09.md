# MattaNutra Business Progress Update - 2026-05-09

## Executive Summary

Today moved MattaNutra from a promising user-facing assessment into a more measurable and operationally manageable business platform.

The biggest progress was around the admin dashboard, sales funnel measurement, supplement governance, safety review, and operational monitoring. The business can now start seeing where users arrive, where they convert, where they drop out, and where human or technical attention is needed.

Payments are still intentionally deferred until the account setup is ready, but the surrounding measurement and operational foundations are now much stronger.

## What Was Completed Today

### 1. Business Measurement and BPM

We strengthened the BPM tracking model so it can support serious marketing and conversion analysis.

The platform now tracks:

- anonymous journey/session ID through `ray`
- source, medium, campaign, campaign ID, promo code, affiliate, and referral context
- device and locale
- assessment, HealthScore, plan selection, Free email, nutrition plan, chat, product, safety, and error events
- hashed email and hashed IP rather than raw personal details

Business impact:

This gives the business a way to understand which campaigns, channels, languages, devices, and affiliates are producing useful users rather than just traffic.

### 2. Admin Dashboard Foundation

The admin dashboard was expanded from a blank/admin shell into a working operational dashboard.

Current sections:

- KPI
- Conversions
- Supplements
- Human Review
- Technical Alerts
- Goals

The dashboard is protected by an admin dashboard token and supports English/Thai routing.

Business impact:

The team now has one place to monitor sales performance, funnel health, supplement safety work, and platform reliability.

### 3. KPI View

The KPI page now focuses on measurable business outcomes:

- Free conversions
- Precision conversions
- Pro conversions
- Free conversion rate
- paid conversion rate
- Precision conversion rate
- Pro conversion rate

Each KPI is shown over selectable time windows:

- hour
- day
- week
- month
- year
- all time

Business impact:

The business can now track whether the funnel is improving over time rather than relying on anecdotal testing.

### 4. Sales Conversions View

The old "Flow" concept was refined into a business-friendly **Conversions** view.

It shows the user journey through:

- landing
- assessment
- submitted assessment
- HealthScore
- Free email
- plan selection
- paid-plan path
- nutrition plan
- results
- chat
- marketplace/product clicks

Each stage shows visits and drop-offs, with visual health indicators.

Business impact:

This helps the team answer: "Which page or decision point is losing users?" That is the core question for improving conversion.

### 5. Marketing Filters

The dashboard now supports campaign-focused filtering.

Filters include:

- locale
- device
- source
- medium
- campaign
- campaign ID
- affiliate
- promo code
- selected plan
- plan ID
- ray
- email hash

Business impact:

The business can compare performance by language, mobile/desktop, campaign, affiliate, promo code, and individual anonymous journey.

### 6. Marketing Guide

The marketing guide was updated to explain how campaigns should be tagged and reviewed.

It covers:

- destination page choices
- Facebook ad URL examples
- affiliate link examples
- required UTM parameters
- MattaNutra-specific tracking parameters
- how to use the dashboard after a campaign launches

Business impact:

The business now has a practical guide for launching campaigns in a way that can actually be measured.

### 7. Supplement Whitelist and Blacklist

The supplement governance model was added and populated from the supplied supplement spreadsheets.

The admin dashboard now allows the team to view and edit supplements, including:

- whitelist status
- blacklist status
- review-required status
- inactive status
- maximum dose
- dose unit
- confidence level
- safety flags
- safety notes

Business impact:

This creates the foundation for safe, controlled formulation rather than allowing AI to recommend supplements without business-approved rules.

### 8. Supplement Safety Check

The formulation safety process was added into the flow.

Current safety behaviour:

- blacklisted items are removed
- doses above the allowed maximum are reduced and logged
- review-required items are hidden and sent to Human Review
- unknown supplements are hidden and sent to Human Review
- the user still receives a result rather than hitting a dead end

Business impact:

This reduces safety risk while keeping the customer journey moving.

### 9. Human Review Queue

The Human Review queue now exists for supplement-related decisions.

It currently supports:

- unknown supplement review
- review-required supplement review
- dose-reduction notices
- dismissing items that only need acknowledgement

Business impact:

The business has a place to handle edge cases that should not be decided automatically.

### 10. Technical Alerts and Goals

A new Technical section was added to the admin dashboard.

It contains Technical Alerts.

Technical Alerts show:

- failed tasks
- stuck running tasks
- failed scheduled tasks
- high/critical task events
- BPM error events

Goals show:

- customer and operational outcomes
- grouped task progress
- status across active, completed, failed, blocked, or cancelled work
- priority at goal and task level
- timing
- task comments and events

Business impact:

This gives the team visibility into operational failures such as email issues, AI processing failures, stalled workers, and queue problems.

## Current State at End of Day

MattaNutra now has:

- a working assessment and HealthScore journey
- AI-generated HealthScore overview and personalised sales copy
- Free email flow using the actual top three supplement suggestions
- blog and testimonial platform
- campaign and affiliate-aware BPM tracking
- admin KPI and conversion dashboard
- supplement whitelist/blacklist management
- formulation safety checks
- Human Review queue
- Technical Alerts and Goals monitoring
- updated business blueprint and marketing guide

## What Is Still Pending

The major remaining areas are:

1. Payments for Precision and Pro.
2. Full reviewer actions for supplement decisions: whitelist, blacklist, review-required, ignore, revise, and notify client.
3. Medication, condition, pregnancy, lab, frequency, and interaction rules.
4. Product matching and affiliate marketplace flow.
5. Campaign comparison tables.
6. Content management screens for blog/testimonials.
7. Safe retry/acknowledge actions for technical alerts and task failures.
8. Pro chat handoff, likely LINE first.
9. Free email nurture sequence.

## Recommended Next Step

The strongest next step is to finish the admin operational loop:

1. Make Human Review actions complete.
2. Add safe acknowledge/retry actions for Technical Alerts and task failures.
3. Add campaign comparison reporting.

That would give the business a platform it can operate daily, not just a product users can try.
