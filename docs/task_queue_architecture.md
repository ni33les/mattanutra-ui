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
| Goal | Business-facing outcome the system is trying to achieve. A goal may need one task or many tasks discovered over time. |
| Ray | Technical correlation ID behind a goal, tying related tasks, comments, events, plans, and BPM activity together. |
| Task | An atomic unit of work that can be prioritised, reserved, completed, failed, or blocked. |
| Agent | A human, AI agent, deterministic worker, system worker, or external worker. |
| Capability | A skill an agent has and a task may require. |
| Dependency | A rule that one task must complete, succeed, or be approved before another can run. |
| Comment | Working context for humans and agents. |
| Event | Append-only audit record of what happened. |
| Reservation | A lease showing that an agent is currently working on a task. |
| Approval | Four-eyes or specialist review before work is allowed to proceed. |

## Goal And Ray Policy

Use **Goal** in the admin UI, docs, and business language.

Keep `ray_id` as the technical identifier. A ray is the thread of evidence behind a goal.

Use the existing BPM `ray` whenever one is available. This gives traceability from traffic source, campaign, funnel events, and plan activity into the operational task history.

When no BPM ray exists, create a new ray for the operational goal. The ray can later be linked to a plan, email hash, source, or parent context if that information becomes available.

Goals do not need to know every task upfront. They start with the next known task, and humans or agents may spawn more tasks into the same ray as the work becomes clearer.

Goal status should be derived from its tasks unless explicitly cancelled:

| Goal status | Meaning |
| --- | --- |
| `processing` | Work is queued, reserved, or running. |
| `needs_review` | A human-facing task is waiting. |
| `blocked` | A required dependency or approval is preventing progress. |
| `stuck` | Work has failed, exhausted retries, or missed its service window. |
| `succeeded` | The goal's success condition is met and no blocking task remains. |
| `failed` | Required work failed and no retry or alternative is available. |
| `cancelled` | The goal was deliberately stopped. |

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

Phases 1, 2, and 3 are implemented.

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

The internal service layer lives in:

- `lib/task-service.ts`
- `lib/task-service-utils.ts`
- `lib/openclaw-api.ts`

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

Status: complete.

Internal helpers added:

- `createRay`
- `createTask`
- `addTaskComment`
- `addTaskEvent`
- `reserveNextTask`
- `completeTask`
- `failTask`
- `releaseExpiredReservations`
- `spawnChildTask`

What was added:

- Priority normalization for the `1..6` operating bands.
- Capability normalization and matching.
- Agent upsert/heartbeat support that keeps agents separate from tasks.
- Idempotent task creation by `(ray_id, idempotency_key)`.
- Task reservation by highest priority, oldest eligible scheduled work.
- Dependency checks before reservation.
- Lease expiry handling, including requeue or fail-after-max-attempts.
- Completion and failure helpers.
- Child task spawning under the same ray.
- Automatic task events for creation, reservation, completion, failure, comments, expired leases, and spawned child tasks.
- Unit tests for priority, capabilities, and lease boundaries.

Acceptance criteria:

- Creating a task writes a `task_created` event.
- Reserving a task writes a reservation and a `task_reserved` event.
- Completing or failing a task writes a result event.
- Duplicate idempotency keys do not create duplicate active tasks.
- Expired leases become claimable again.
- Agents reserve work by capability rather than by hard-coded worker name.

## Phase 3: Protected Worker API

Status: complete.

Machine APIs are protected by `ADMIN_CLAW_TOKEN`. Dashboard tokens are not accepted.

Implemented endpoints:

- `POST /api/tasks/reserve`
- `POST /api/tasks/:id/comment`
- `POST /api/tasks/:id/complete`
- `POST /api/tasks/:id/fail`
- `POST /api/tasks/:id/spawn`
- `POST /api/tasks/:id/renew`
- `GET /api/tasks/:id`
- `GET /api/rays/:rayId/tasks`

Authentication:

- preferred: `Authorization: Bearer <ADMIN_CLAW_TOKEN>`
- supported fallback: `x-admin-claw-token: <ADMIN_CLAW_TOKEN>`

What was added:

- Shared OpenClaw API helper with no-store responses and a consistent bearer challenge.
- Task reservation endpoint returning task, ray, comments, dependencies, agent, and reservation id.
- Task inspection endpoint.
- Task comment endpoint.
- Task complete/fail endpoints.
- Task lease renewal endpoint.
- Child task spawn endpoint.
- Ray task listing endpoint.
- Tests covering missing, wrong, bearer, and header token auth.

Acceptance criteria:

- Untokened requests return `401`.
- Wrong token returns `401`.
- Bearer token with `ADMIN_CLAW_TOKEN` succeeds.
- `x-admin-claw-token` with `ADMIN_CLAW_TOKEN` succeeds.
- Agents can reserve only tasks matching their capabilities.
- Reservation response includes payload, comments, dependencies, and ray context.

## Phase 4: Goal Layer And Admin GUI

Build the goal-first admin view over rays.

Views needed:

- Goals
- Goal Detail / Ray Timeline
- All Tasks
- Human Review
- Agents
- Technical Alerts

Acceptance criteria:

- Admin can see goals in a list with name, status, priority, source, plan/email context, age, and last activity.
- Goal status is derived from task state: processing, needs review, blocked, stuck, succeeded, failed, or cancelled.
- Goal detail shows tasks, comments, events, dependencies, reservations, and approvals in one explainable timeline.
- Admin can see queued, reserved, running, blocked, failed, completed, and cancelled tasks.
- Human tasks are separated from system and AI tasks.
- A goal timeline explains cause and effect without reading logs.
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

## Remaining Plan From Here

Phase 4: Goal layer and admin GUI. Make rays visible as named Goals, derive useful statuses, and give the admin team a goal timeline.

Phase 5: First migration slice. Move supplement review onto Goals/Tasks while leaving legacy jobs untouched elsewhere.

Phase 6: Worker migration. Move deterministic workers first, then AI workers, onto task reservation and completion.

Phase 7: Four-eyes approval. Add approval rules and unblock dependent tasks only after approval.

Phase 8: Deprecate old jobs. Stop creating legacy jobs once migrated paths are proven and remove old branches safely.

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
