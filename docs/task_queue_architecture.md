# Prioritised Task Architecture

## Purpose

MattaNutra is moving from a small set of specific job workers to a central, auditable task system.

The goal is to make the operational core work like a prioritised team queue. Humans, AI agents, deterministic workers, and external systems such as OpenClaw should all be able to reserve suitable work, process it, comment on it, and leave a clear audit trail.

The guiding rule is:

> Tasks describe what needs doing. Agents describe who or what can do it.

Tasks and agents must remain completely separate. A task should require capabilities; it should not be hard-wired to a named worker.

## Core Concepts

| Concept | Meaning |
| --- | --- |
| Ray | One goal or journey of work, tying related tasks together. |
| Task | An atomic unit of work that can be prioritised, reserved, completed, failed, or blocked. |
| Agent | A human, AI agent, deterministic worker, system worker, or external worker. |
| Capability | A skill an agent has and a task may require. |
| Dependency | A rule that one task must complete, succeed, or be approved before another can run. |
| Comment | Working context for humans and agents. |
| Event | Append-only audit record of what happened. |
| Reservation | A lease showing that an agent is currently working on a task. |
| Approval | Four-eyes or specialist review before work is allowed to proceed. |

## Ray Policy

Use the existing BPM `ray` whenever one is available. This gives traceability from traffic source, campaign, funnel events, and plan activity into the operational task history.

When no BPM ray exists, create a new ray for the operational goal. The ray can later be linked to a plan, email hash, source, or parent context if that information becomes available.

## Priority Scale

Tasks and rays use a simple `1` to `6` priority scale.

| Priority | Meaning | Use |
| --- | --- | --- |
| `6` | Do now | User-blocking, paid customer waiting, urgent safety or contact task. |
| `5` | Urgent | High-value or time-sensitive work. |
| `4` | High | Customer-facing work that should move quickly. |
| `3` | Normal | Default operational work. |
| `2` | Low | Background enrichment or non-urgent admin. |
| `1` | When you can | Housekeeping, informational, or nice-to-have work. |

## Current Status

Phase 1 is implemented in `db-schema.sql`.

The following tables now exist in the schema:

- `agents`
- `rays`
- `tasks`
- `task_dependencies`
- `task_comments`
- `task_events`
- `task_reservations`
- `task_approvals`

The existing `jobs` table remains in place. Nothing has been migrated away from it yet.

## Phase 1: Core Data Model

Status: complete.

What was added:

- A task agent registry for humans, AI agents, deterministic workers, external workers, and system workers.
- A ray table to group tasks under one business goal or customer journey.
- A central task table with priority, status, capabilities, actor type, reasoning effort, payload, result payload, idempotency key, lease fields, and legacy job link.
- A priority scale of `1` to `6`, defaulting to `3`.
- Dependency support for ordered workflows.
- Comments for collaborative working notes.
- Append-only task events for audit.
- Lease-based reservations.
- Approval records for four-eyes review.

Acceptance criteria:

- Schema can be reapplied cleanly.
- Every task belongs to a ray.
- Existing BPM rays are reused where available.
- Agents and tasks are separate.
- Tasks can require capabilities without naming a specific agent.
- Task and ray priority is constrained to `1..6`.
- Events are append-only.
- Existing `jobs` flow is unchanged.

## Phase 2: Task Service Layer

Build internal helpers:

- `createRay`
- `createTask`
- `addTaskComment`
- `addTaskEvent`
- `reserveNextTask`
- `completeTask`
- `failTask`
- `releaseExpiredReservations`
- `spawnChildTask`

Acceptance criteria:

- Creating a task writes a `task_created` event.
- Reserving a task writes a reservation and a `task_reserved` event.
- Completing or failing a task writes a result event.
- Duplicate idempotency keys do not create duplicate active tasks.
- Expired leases become claimable again.

## Phase 3: Protected Worker API

Create machine APIs protected by `ADMIN_CLAW_TOKEN`.

Likely endpoints:

- `POST /api/tasks/reserve`
- `POST /api/tasks/:id/comment`
- `POST /api/tasks/:id/complete`
- `POST /api/tasks/:id/fail`
- `POST /api/tasks/:id/spawn`
- `POST /api/tasks/:id/renew`
- `GET /api/tasks/:id`
- `GET /api/rays/:rayId/tasks`

Acceptance criteria:

- Untokened requests return `401`.
- Wrong token returns `401`.
- Bearer token with `ADMIN_CLAW_TOKEN` succeeds.
- Agents can reserve only tasks matching their capabilities.
- Reservation response includes payload, comments, dependencies, and ray context.

## Phase 4: Admin GUI

Views needed:

- All Tasks
- Human Review
- Ray Timeline
- Agents
- Technical Alerts

Acceptance criteria:

- Admin can see queued, reserved, running, blocked, failed, completed, and cancelled tasks.
- Human tasks are separated from system and AI tasks.
- A ray timeline explains cause and effect without reading logs.
- Stuck or failed work is visible.

## Phase 5: First Migration Slice

Migrate supplement review first.

Candidate task types:

- `classify_supplement`
- `review_supplement_for_plan`
- `dose_reduction_notice`
- `client_safety_followup`

Acceptance criteria:

- Unknown supplements create one useful human task instead of noisy duplicates.
- Completing a review updates the downstream state.
- Review completion removes the user-facing review box where appropriate.
- Every admin action writes task events and comments.

## Phase 6: Worker Migration

Move deterministic workers first:

- safety scan
- dose normalisation
- email delivery
- cron scheduling

Then move AI workers:

- formulation
- HealthScore copy
- marketing copy
- dose suggestion

Acceptance criteria:

- Slow work is task-based.
- Only atomic validation remains synchronous.
- Workers can restart without losing task state.
- Duplicate processing is prevented by leases and idempotency.

## Phase 7: Four-Eyes Approval

Add approval rules by task type, agent type, risk level, and capability.

Acceptance criteria:

- High-risk AI work can finish but remain pending approval.
- Approved tasks unblock downstream dependencies.
- Rejected work can spawn correction tasks.
- Approval history is visible on the ray timeline.

## Phase 8: Deprecate Old Jobs

Only after task flows are proven:

- stop creating new legacy jobs for migrated paths.
- map or migrate old jobs where useful.
- keep old history inspectable.
- remove old branches once no production path depends on them.

Acceptance criteria:

- No production path depends on legacy `jobs`.
- Admin task queue replaces the old jobs page.
- Historical jobs remain understandable.

## Definition Of Done

The system is ready when the admin UI can answer:

- What goal is this work part of?
- What tasks were created?
- Who or what worked on each task?
- What comments or decisions were made?
- What spawned what?
- What is blocked and why?
- What failed and why?
- What still needs a human?
- Which agent touched it?
- Can the same task safely retry?
