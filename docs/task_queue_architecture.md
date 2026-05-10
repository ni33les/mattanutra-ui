# Prioritised Goal And Task Architecture

## Purpose

MattaNutra now uses a central, auditable Goals/Tasks engine for slow or operational work.

The goal is to make the operational core work like a prioritised team queue. Humans, AI agents, deterministic workers, and external systems such as OpenClaw can all reserve suitable work, process it, comment on it, and leave a clear audit trail.

The guiding rule is:

> Tasks describe what needs doing. Agents describe who or what can do it.

Tasks and agents remain separate. A task requires capabilities; it is not hard-wired to a named worker.

## Core Concepts

| Concept | Meaning |
| --- | --- |
| Goal | Business-facing outcome the system is trying to achieve. A goal may need one task or many tasks discovered over time. |
| Ray | BPM/session correlation trace for campaign, affiliate, funnel, and anonymous journey analysis. |
| Task | Atomic unit of work that can be prioritised, reserved, completed, failed, blocked, or skipped. |
| Agent | Human, AI agent, deterministic worker, system worker, or external worker. |
| Capability | Skill an agent has and a task may require. |
| Dependency | Rule that one task must complete, succeed, or be approved before another can run. |
| Comment | Working context for humans and agents. |
| Event | Append-only audit record of what happened. |
| Reservation | Lease showing that an agent is currently working on a task. |
| Approval | Normal task/dependency pattern for human or specialist sign-off when a workflow needs it. |

## Current Status

The database has been reset to a clean task-native state.

Operational work is now represented by:

- `goals`
- `tasks`
- `task_dependencies`
- `task_comments`
- `task_events`
- `task_reservations`
- `task_approvals`
- `agents`

Communication work is represented by:

- `communication_identities`
- `plan_communication_identities`
- `communication_channels`
- `communication_messages`

The internal service layer lives in:

- `lib/task-service.ts`
- `lib/task-service-utils.ts`
- `lib/task-worker.ts`
- `lib/openclaw-api.ts`

## Goal And Ray Policy

Use **Goal** in the admin UI, docs, and business language.

Use `goals.id` as the operational identifier for a business outcome or milestone.

Keep BPM `ray` as a separate trace attribute. A goal may store that trace in `goals.ray` when the work came from a web journey, campaign, funnel event, plan, or OpenClaw handoff.

Tasks point to `goal_id`. They do not use a ray as their parent. This keeps cause-and-effect clear: goals group work; rays explain where the journey came from.

When no BPM ray exists, a goal can still be created and traced by `goals.id`.

Goals do not need to know every task upfront. They start with the next known task, and humans or agents may spawn more tasks into the same goal as work becomes clearer.

## Priority Scale

Goals and tasks use a simple `1` to `6` priority scale.

Goal priority is the primary business scheduling signal. It answers: which outcome matters most right now?

Task priority is secondary. It answers: within that goal, which piece of work should happen next?

Workers reserve eligible tasks by:

1. goal priority, highest first
2. task priority, highest first
3. scheduled time, oldest due work first
4. creation time, oldest first

| Priority | Meaning | Use |
| --- | --- | --- |
| `6` | Do now | User-blocking, paid customer waiting, urgent safety or contact task. |
| `5` | Urgent | High-value or time-sensitive work. |
| `4` | High | Customer-facing work that should move quickly. |
| `3` | Normal | Default operational work. |
| `2` | Low | Background enrichment or non-urgent admin. |
| `1` | When you can | Housekeeping, informational, or nice-to-have work. |

## Implemented Flows

Current task-backed flows:

1. HealthScore analysis.
2. Paid nutrition-plan formulation.
3. Free example formulation.
4. Free email send.
5. Reassessment email scheduling and send.
6. Supplement safety classification.
7. Plan-specific supplement safety review.
8. Dose-reduction notices.
9. Client safety follow-up through communication channels.

Human Review decisions are append-only where they affect the formulation: a reviewed formulation version is written rather than updating the old one in place.

## Admin Views

The dashboard now separates business and operational views:

| View | Purpose |
| --- | --- |
| KPI | Free, Precision, and Pro conversion performance. |
| Conversions | Funnel movement and stage loss. |
| Goals | Outcome-level operational tracking, with tasks, comments, events, dependencies, reservations, and approvals. |
| Human Review | Admin-facing safety and supplement decisions. |
| Alerts | Failed/stuck tasks, failed cron work, high-severity task events, and BPM errors. |
| Communications | Channel-aware outbound messages and contact state. |
| Supplements | Whitelist, blacklist, inactive/review status, max dose, units, confidence, safety flags, and notes. |

## Worker Rules

Workers should:

- reserve tasks only through the task service
- use capability matching
- obey goal priority before task priority
- write comments when useful context is needed by the next actor
- write task events for status changes, failures, and important observations
- fail tasks with clear error messages rather than hiding errors in logs
- spawn child tasks under the same goal when follow-up work is needed

Only small atomic work should be synchronous. Slow AI calls, messages, safety reviews, and follow-ups should be task-backed.

## API Rules

Machine APIs are protected by `ADMIN_CLAW_TOKEN`.

Dashboard URLs use `ADMIN_DASHBOARD_TOKEN` and must not be accepted for machine APIs.

OpenClaw and external workers should use:

```http
Authorization: Bearer <ADMIN_CLAW_TOKEN>
```

Tokens must not be passed in query strings, client bundles, BPM payloads, or logs.

## Acceptance Criteria

- Schema can be rebuilt from `db-schema.sql`.
- Every task belongs to a goal.
- Agents and tasks remain separate.
- Tasks can require capabilities without naming a specific agent.
- Goal priority is the first reservation ordering signal.
- Events and comments preserve cause-and-effect.
- Human review completion closes the review task and queues any needed client follow-up.
- Technical alerts are task-based.
- OpenClaw can integrate through protected task and communications APIs.
