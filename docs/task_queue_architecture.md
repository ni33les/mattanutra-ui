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
| Ray | BPM/session correlation trace used for marketing source, campaign, funnel, and anonymous journey analysis. |
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

Use `goals.id` as the operational identifier for a business outcome or milestone.

Keep BPM `ray` as a separate trace attribute. A goal may store that trace in `goals.ray` when the work came from a web journey, campaign, funnel event, plan, or OpenClaw handoff.

Tasks point to `goal_id`. They do not use `ray_id` as their parent. This keeps cause-and-effect clear: Goals group work; rays explain where the journey came from.

When no BPM ray exists, a goal can still be created and traced by `goals.id`. The optional `goals.ray` can later be populated if source context becomes available.

Goals do not need to know every task upfront. They start with the next known task, and humans or agents may spawn more tasks into the same goal as the work becomes clearer.

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

Tasks and goals use a simple `1` to `6` priority scale.

Goal priority is the primary business scheduling signal. It answers: which outcome matters most right now?

Task priority is secondary. It answers: within that goal, which piece of work should happen next?

Workers should reserve eligible tasks by:

1. goal priority, highest first
2. task priority, highest first
3. scheduled time, oldest due work first
4. creation time, oldest first

New tasks should normally inherit the parent goal priority unless a workflow has a specific reason to lower or raise that task inside the goal.

| Priority | Meaning | Use |
| --- | --- | --- |
| `6` | Do now | User-blocking, paid customer waiting, urgent safety or contact task. |
| `5` | Urgent | High-value or time-sensitive work. |
| `4` | High | Customer-facing work that should move quickly. |
| `3` | Normal | Default operational work. |
| `2` | Low | Background enrichment or non-urgent admin. |
| `1` | When you can | Housekeeping, informational, or nice-to-have work. |

## Current Status

Phases 1, 2, 3, 4, 5, 6, and 7 are implemented.

The following tables now exist in the schema:

- `agents`
- `goals`
- `tasks`
- `task_dependencies`
- `task_comments`
- `task_events`
- `task_reservations`
- `task_approvals`

The existing `jobs` table remains in place as the compatibility execution record. New formulation, free example, email, and reassessment jobs now also create Goals and Tasks, and the internal worker reserves task-backed jobs first.

The internal service layer lives in:

- `lib/task-service.ts`
- `lib/task-service-utils.ts`
- `lib/openclaw-api.ts`

## Phase 1: Core Data Model

Status: complete.

What was added:

- A task agent registry for humans, AI agents, deterministic workers, external workers, and system workers.
- A goals table to group tasks under one business outcome or customer journey.
- A central task table with priority, status, capabilities, actor type, reasoning effort, payload, result payload, idempotency key, lease fields, and legacy job link.
- A priority scale of `1` to `6`, defaulting to `3`.
- Dependency support for ordered workflows.
- Comments for collaborative working notes.
- Append-only task events for audit.
- Lease-based reservations.
- Approval records for normal human approval tasks where a workflow needs them.

Acceptance criteria:

- Schema can be reapplied cleanly.
- Every task belongs to a goal.
- Existing BPM rays are stored on goals where available.
- Agents and tasks are separate.
- Tasks can require capabilities without naming a specific agent.
- Task and goal priority is constrained to `1..6`.
- Events are append-only.
- Existing `jobs` flow is unchanged.

## Phase 2: Task Service Layer

Status: complete.

Internal helpers added:

- `createGoal`
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
- Idempotent task creation by `(goal_id, idempotency_key)`.
- Task reservation by goal priority first, then task priority, oldest eligible scheduled work.
- Dependency checks before reservation.
- Lease expiry handling, including requeue or fail-after-max-attempts.
- Completion and failure helpers.
- Child task spawning under the same goal.
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
- `GET /api/goals/:goalId/tasks`

Authentication:

- preferred: `Authorization: Bearer <ADMIN_CLAW_TOKEN>`
- supported fallback: `x-admin-claw-token: <ADMIN_CLAW_TOKEN>`

What was added:

- Shared OpenClaw API helper with no-store responses and a consistent bearer challenge.
- Task reservation endpoint returning task, goal, comments, dependencies, agent, and reservation id.
- Task inspection endpoint.
- Task comment endpoint.
- Task complete/fail endpoints.
- Task lease renewal endpoint.
- Child task spawn endpoint.
- Goal task listing endpoint.
- Tests covering missing, wrong, bearer, and header token auth.

Acceptance criteria:

- Untokened requests return `401`.
- Wrong token returns `401`.
- Bearer token with `ADMIN_CLAW_TOKEN` succeeds.
- `x-admin-claw-token` with `ADMIN_CLAW_TOKEN` succeeds.
- Agents can reserve only tasks matching their capabilities.
- Reservation response includes payload, comments, dependencies, and goal context.

## Phase 4: Goal Layer And Admin GUI

Status: complete.

Built the goal-first admin view over the operational task system.

Views added or updated:

- Goals
- Goal Detail / Timeline
- All Tasks
- Human Review
- Agents
- Technical Alerts

What was added:

- Admin Goals menu item.
- Server-side goal data loader over `goals`, `tasks`, `task_events`, comments, dependencies, reservations, and approvals.
- Derived goal status: processing, needs review, blocked, stuck, succeeded, failed, or cancelled.
- Goal summary cards.
- Goal list with status, priority, source, task progress, and last activity.
- Goal detail panel with task list, timeline, dependencies, reservations, and approvals.
- Stable `goal=<goal_id>` dashboard query parameter for selected goal detail.

Acceptance criteria:

- Admin can see goals in a list with name, status, priority, source, plan/email context, age, and last activity.
- Goal status is derived from task state: processing, needs review, blocked, stuck, succeeded, failed, or cancelled.
- Goal detail shows tasks, comments, events, dependencies, reservations, and approvals in one explainable timeline.
- Admin can see queued, reserved, running, blocked, failed, completed, and cancelled tasks.
- Human tasks are separated from system and AI tasks.
- A goal timeline explains cause and effect without reading logs.
- Stuck or failed work is visible.

## Phase 5: First Migration Slice

Status: complete.

Supplement review is the first migrated slice. New safety review work still creates the legacy `supplement_review` job so the existing admin queue remains stable, but it now also creates a Goal and a Task:

Candidate task types:

- `classify_supplement`
- `review_supplement_for_plan`
- `dose_reduction_notice`
- `client_safety_followup`

Current behaviour:

- Unknown supplements create a stable global goal keyed by the normalised supplement name.
- Plan-specific safety flags create a plan safety goal.
- Review tasks point back to the legacy job through `legacy_job_id`.
- `safety_reviews` may carry `goal_id` and `task_id` so the operational decision can be traced from plan to job to task.
- The Human Review queue reads task-backed rows first and falls back to legacy jobs when needed.
- Completing, dismissing, approving, or resolving a review completes the related task and writes task comments/events.
- Goals are marked completed when their review tasks are complete and no active task remains.

Acceptance criteria:

- Unknown supplements create one useful human task instead of noisy duplicates. Done.
- Completing a review updates the downstream state. Done for the Human Review queue bridge.
- Review completion removes the user-facing review box where appropriate. Done for plan-specific approve/disapprove; remaining client follow-up is tracked separately.
- Every admin action writes task events and comments. Done for dismiss, resolve, approve, and disapprove.

## Phase 6: Goal-First Scheduling

Status: complete.

The queue now reserves tasks by business goal priority first.

Reservation order:

- eligible tasks only
- goal priority, highest first
- task priority, highest first
- scheduled time, oldest due work first
- creation time, oldest first

Acceptance criteria:

- A task in a priority `6` goal outranks a priority `6` task in a priority `3` goal. Done.
- Task priority still controls ordering inside the same goal. Done.
- New tasks inherit goal priority unless explicitly overridden. Done.
- The admin UI makes goal priority more prominent than task priority. Done through the Goals view.
- Task events explain any explicit priority override. Done through `task_created` and `task_priority_overridden` events.

## Phase 7: Worker Migration

Status: complete as a migration bridge.

The legacy job worker now reserves task-backed work before falling back to direct legacy job claims. The legacy `jobs` rows remain because existing formulation, email, cron, and status code still uses them as the execution payload.

Migrated task-backed job types:

- `generate_formulation`
- `generate_example_formulation`
- `analyze_healthscore`
- `send_example_email`
- `send_reassessment_email`

Current behaviour:

- Enqueuing a supported legacy job creates a Goal and Task with `legacy_job_id`.
- Free example formulation and email jobs share the same Free example goal.
- HealthScore sales copy and overview analysis creates a task-backed HealthScore goal.
- Paid formulation jobs create task-backed nutrition-plan goals.
- Reassessment email jobs create task-backed reassessment goals.
- The internal worker reserves eligible tasks by capability, claims the linked legacy job, processes the existing worker function, then completes or fails the task.
- The internal worker only reserves tasks that explicitly require the `legacy_job_worker` capability and match migrated legacy job task types.
- If the linked legacy job is already running, the task is released and retried later without consuming a task attempt. Stale running jobs can be reclaimed after the worker lease window.
- If task creation is unavailable, the legacy job path still works.

Acceptance criteria:

- Slow formulation and email work is task-backed. Done.
- Only atomic validation remains synchronous for the customer journey. Done for HealthScore analysis, paid formulation, Free formulation, Free email, and reassessment email.
- Workers can restart without losing task state. Done through task leases and legacy job compatibility.
- Duplicate processing is prevented by leases, idempotency, task-type scoping, and stale-running guards. Done for task-backed job creation and reservation.

## Phase 8: Task Sequence Helpers

Status: complete.

Task sequences can now be created with one service-layer helper. A sequence is made of stages: tasks inside a stage can run in parallel, and the next stage waits for the previous stage unless explicitly disabled.

Implemented helpers:

- `createTaskSequence`
- `buildTaskSequenceDependencyPlan`

Current behaviour:

- Each sequence belongs to one goal.
- A `sequenceKey` can make generated task idempotency keys stable.
- Tasks in the next stage automatically depend on all tasks in the previous stage.
- A stage can require previous tasks to be `complete`, `successful`, or `approved`.
- Individual tasks can also depend on earlier tasks by sequence key or on existing task IDs.
- Creating a sequence writes a `task_sequence_created` event to the goal timeline.
- Human approval remains a normal human task plus an `approved` dependency, not a separate subsystem.

Acceptance criteria:

- Common workflows can create task sequences with one helper call. Done.
- Human approval tasks are regular tasks with clear titles, comments, payloads, and dependencies. Done.
- Downstream tasks stay ineligible until prerequisite tasks are complete or approved. Done through `task_dependencies`.
- Rejected work can spawn correction tasks inside the same goal. Done through `spawnChildTask`.
- Approval history is visible on the goal timeline through comments and events. Done through normal task comments, task events, and approval dependency records.

## Phase 9: Move Customer-Facing Slow AI Onto Tasks

Status: complete for the HealthScore gate.

The HealthScore formula remains synchronous because it is deterministic and fast. The AI-generated overview and sales copy now runs through the task-backed worker path as `healthscore_analysis`.

Current behaviour:

- Assessment capture stores the deterministic HealthScore immediately.
- A `healthscore_analysis` job is queued and bridged into a Goal and Task.
- The progress page honestly displays `Preparing your HealthScore` followed by `Analyzing HealthScore`.
- The frontend polls `mode=score` until the AI analysis is written back to the assessment.
- If the analysis job fails or is unavailable, the user can still proceed with the deterministic HealthScore instead of being stuck.
- Completed analysis is written to `assessments.health_score.advice`, audited in `job_audit_events`, and logged as BPM.

Acceptance criteria:

- HealthScore calculation does not wait for Grok. Done.
- Personalised score overview and plan-gate sales copy are produced by worker task. Done.
- The spinner starts from the correct step and completes only after the relevant job is done or safely bypassed. Done.
- Existing formulation, Free email, and reassessment workers still run through task-backed compatibility. Done.

## Phase 10: Deprecate Old Jobs

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

Phase 10: Deprecate old jobs. Stop creating legacy jobs once migrated paths are proven and remove old branches safely.

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
