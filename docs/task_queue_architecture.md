# Task Queue Architecture

## Purpose

MattaNutra uses a task-only execution queue for slow or operational work. The web app owns durable state and APIs. External agents reserve and execute work through the worker API.

The guiding rule is:

> Tasks describe what needs doing. Agents describe who or what can do it.

## Core Concepts

| Concept | Meaning |
| --- | --- |
| Task | Atomic execution unit with business value, status, retry state, context, audit trail, and grouping metadata. |
| Task group | Default visual and operational chain. A root task groups with spawned child and retry tasks through `task_group_id`. |
| Ray | Optional BPM/session correlation id for funnel, campaign, and anonymous journey analysis. |
| Plan | Optional assessment plan id for customer context and filtering. |
| Agent | Human, AI, deterministic, system, or external worker identity that can reserve work by capability. |
| Capability | Skill an agent has and a task may require. |
| Dependency | Rule that one task must complete, succeed, or be approved before another can run. |
| Comment | Working context for humans and agents. |
| Event | Append-only audit record of what happened. |
| Reservation | Short lease showing that an agent is currently working on a task. |
| Approval | Optional sign-off record used by dependency checks and human review flows. |

## Tables

Operational work is represented by:

- `tasks`
- `task_dependencies`
- `task_comments`
- `task_events`
- `task_reservations`
- `task_approvals`
- `agents`
- `worker_sessions`

There is no operational `goals` table. User health goals inside assessment answers are separate product data and are not part of the execution queue.

## Business Value

Tasks use `business_value` instead of priority. Higher values reserve first. Aging is computed at reservation time and is not persisted by cron:

- base `business_value`
- `+10` every 15 minutes after a 5 minute grace period
- capped at `+200`
- ties sort by `scheduled_for asc`, then `created_at asc`

Default values:

| Work | Value |
| --- | ---: |
| HealthScore analysis | `500` |
| Formulation | `450` |
| Human review | `400` |
| Client notification, email, communications | `350` |
| Content publish | `250` |
| Reassessment | `200` |
| Free example formulation | `150` |
| Hosting/billing sync | `100` |
| Default | `200` |

## Grouping

`task_group_id` is the default grouping key:

- root tasks set `task_group_id = id`
- spawned child tasks inherit the parent task group
- retry tasks inherit the failed task group
- task sequences use the first root task group unless explicitly overridden
- unrelated manually-created tasks get their own group

`ray_id` and `plan_id` remain searchable metadata, but they are not the default visual grouping key.

## Retry

Retry state lives on tasks:

- `retry_of_task_id`
- `retry_root_task_id`
- `retry_attempt`
- `max_retries`
- `retry_policy`

Retries create new tasks and leave the failed attempt visible. There is no goal-level retry state.

## Worker Rules

Workers are external-only. The web app queues work and applies durable state changes; worker processes execute work through HTTP APIs:

1. `POST /api/workers/register`
2. `POST /api/workers/heartbeat`
3. `POST /api/tasks/reserve`
4. Execute the returned work item.
5. `POST /api/tasks/[id]/complete` or `POST /api/tasks/[id]/fail`
6. Use `/comment`, `/spawn`, and `/renew` as needed.

Workers should:

- reserve tasks through the protected worker API
- use capability matching
- keep leases short and renew only while actively working
- write useful comments and failure messages
- spawn child tasks into the same task group when follow-up work is needed
- never connect directly to the platform database

There is no internal task worker fallback. Local demos and cloud deployments must run at least one worker process, such as `npm run worker:all`.

## Admin Views

The dashboard promotes the task queue as the operational view:

| View | Purpose |
| --- | --- |
| Execution / Visibility | Live task queue grouped by task group, with ray and plan as contextual ids. |
| Execution / Agents | Agent roster, sessions, current work, capabilities, and success/failure rate. |
| Human Review | Admin-facing safety and supplement decisions. |
| Alerts | Failed/stuck tasks, failed cron work, high-severity task events, and BPM errors. |
| Communications | Channel-aware outbound messages and contact state. |

Task groups with one task are uncolored. Multi-task groups receive a stable subtle tint derived from `task_group_id`.

## API Rules

Human admin APIs use signed passkey sessions plus CSRF/origin checks and route-specific RBAC permissions.

Machine APIs use DB-managed agent credentials:

```http
Authorization: Bearer <AGENT_API_KEY>
```

or:

```http
x-agent-api-key: <AGENT_API_KEY>
```

OpenClaw, admin query, communications, cron, and worker execution callers must resolve to scoped `platform_agent` or `retail_agent` principals with the required organisation, role, permission, and capability set. Legacy `ADMIN_CLAW_TOKEN` and `WORKER_API_TOKEN` are audited break-glass paths only when `MATTANUTRA_LEGACY_TOKEN_AUTH=allow`.

Dashboard URLs can use `ADMIN_DASHBOARD_TOKEN` only for browser bootstrap/login compatibility. Dashboard tokens must not be accepted for worker APIs, OpenClaw APIs, admin query APIs, communications APIs, or cron.

External workers need:

- profile-specific DB-managed keys such as `WORKER_HEALTHSCORE_AGENT_API_KEY`, `WORKER_FORMULATION_AGENT_API_KEY`, and `WORKER_PRODUCTS_AGENT_API_KEY`
- `WORKER_API_BASE_URL` or `MATTANUTRA_API_BASE_URL`
- provider secrets for their own capability only
- optional `WORKER_CONCURRENCY`, profile-specific overrides such as `WORKER_HEALTHSCORE_CONCURRENCY` and `WORKER_FORMULATION_CONCURRENCY`, `WORKER_LEASE_SECONDS`, and `WORKER_POLL_WAIT_SECONDS`

`WORKER_CONCURRENCY` launches independent agent sessions for each registered profile. For example, `WORKER_FORMULATION_CONCURRENCY=2` gives formulation two reserve loops, so one slow Grok call does not stop the next formulation task from being picked up. Interactive task types such as `analyze_healthscore`, `generate_formulation`, and `send_example_email` use a shorter reserve check interval while long-polling. `generate_example_formulation` is low-value background work because it does not block the assessment UX. Default worker leases are short and renewed while work is active, so a crashed worker does not hold a reserved UI-facing task for long.

External agents can query admin/business state without DB access through `/api/admin/query/*`. Available views are `glance`, `conversions`, `campaigns`, `leads`, `content`, `reviews`, `supplements`, `communications`, `alerts`, `tasks`, and `agents`.
