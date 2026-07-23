# Healthspan

Blank Healthspan canvas built with Next.js, TypeScript, and Tailwind CSS.

## Languages

The app uses lightweight locale-prefixed routes:

```txt
/en
/th
```

Add a new language in `lib/i18n.ts` by adding the locale code to `locales`, `localeLabels`, and `dictionaries`. The root URL redirects to the saved `NEXT_LOCALE` cookie, the browser language, or English.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production Build

```bash
npm run build
npm run start
```

## DigitalOcean App Platform

DigitalOcean App Platform can deploy this as a Node.js app from GitHub. Keep `package-lock.json` committed after installing dependencies.

Expected commands:

```bash
npm run build
npm run start:platform
```

The optional app spec example lives at `.do/app.yaml.example`; copy it to `.do/app.yaml` and replace the placeholder GitHub repo before using it directly.

`npm run start:platform` starts Next.js and then starts `npm run worker:all` as a sibling process in the same App Platform service container. The worker talks to the app through `WORKER_API_BASE_URL`, which defaults to the local service port, so no separate paid Worker component is required. If you later want independent worker capacity, deploy `npm run worker:all` as a separate App Platform Worker component instead.

## Scheduled Work

Configure the DigitalOcean scheduler to call the app every 15 minutes:

```txt
POST /api/cron
Authorization: Bearer <REMOTE_AGENT_API_KEY>
```

The cron endpoint accepts a DB-managed agent credential with task scheduling permission. During rollout, legacy admin-claw auth is still accepted only when `MATTANUTRA_LEGACY_TOKEN_AUTH=allow`; dashboard URL tokens are never valid here. The endpoint scans due cron actions and queues task-backed work only. It does not execute worker tasks. Scheduled content publishing runs through the normal `content_status_change` task queue once its `scheduled_for` time is due.

A worker process must be running with DB-managed agent API keys. `npm run worker:all` requires profile-specific keys such as `WORKER_HEALTHSCORE_AGENT_API_KEY`, `WORKER_FORMULATION_AGENT_API_KEY`, `WORKER_PRODUCTS_AGENT_API_KEY`, and `WORKER_ANALYTICS_AGENT_API_KEY`; each key resolves to the matching agent membership and organisation scope. Run `npm run worker:analytics` on a separate CPU box for admin catalogue optimisation work. Workers register with `/api/workers/register`, heartbeat with `/api/workers/heartbeat`, long-poll `/api/tasks/reserve`, and complete/fail/progress tasks through the task API. In DigitalOcean App Platform, `npm run start:platform` is the no-extra-component deployment mode: the web service owns a colocated worker process, but task execution still goes through the protected worker API rather than web-app internals.

UI-blocking work such as HealthScore analysis and paid formulation uses the interactive reserve path, so online workers check for newly queued work quickly while long-polling. Free example formulation is lower-value background work because it does not block the assessment UX. `WORKER_CONCURRENCY` starts multiple independent sessions per agent profile, and profile-specific overrides such as `WORKER_HEALTHSCORE_CONCURRENCY=2` and `WORKER_FORMULATION_CONCURRENCY=2` let you keep extra capacity for those user-facing tasks without speeding up background jobs. Default worker leases are short and renewed while work is active, so crashed workers release reserved tasks quickly.

The same tick queues a `sync_digitalocean_billing` worker task when `DIGITALOCEAN_ACCESS_TOKEN` and `DIGITALOCEAN_PROJECT_NAME` are configured. The external hosting worker calls `/v2/customers/my/invoices/preview`, returns invoice items to the platform, and the platform writes nominal `hosting` ledger rows with deterministic `source_ref` values so repeated 15-minute runs update existing rows.

AI cost accounting is written when Grok calls return usage metadata. Task-backed Grok calls also store the originating task id on the cost entry. The default chat model is `grok-4.5` (`DEFAULT_GROK_MODEL` / `GROK_MODEL`). Token prices can be overridden with `XAI_INPUT_USD_PER_MILLION_TOKENS`, `XAI_OUTPUT_USD_PER_MILLION_TOKENS`, and `XAI_CACHED_INPUT_USD_PER_MILLION_TOKENS`. Per-task reasoning defaults live in `lib/grok-task-config.ts` and can be overridden with `*_REASONING_EFFORT` env vars.

Financial rows default to `nominal`, which is used for fine-grained cost accruals and estimates. Use `actual` rows only for real money flows such as monthly provider invoice payments.

## Admin Machine APIs

OpenClaw, admin query, communications, cron, and worker execution APIs use DB-managed agent keys. Legacy `ADMIN_CLAW_TOKEN` and `WORKER_API_TOKEN` are audited break-glass paths only when `MATTANUTRA_LEGACY_TOKEN_AUTH=allow`.

Preferred headers:

```txt
Authorization: Bearer <AGENT_API_KEY>
x-agent-api-key: <AGENT_API_KEY>
```

OpenClaw and future remote agents must authenticate as scoped `platform_agent` or `retail_agent` principals with the required organisation, role, permission, and capability set. Dashboard URL tokens are only for browser bootstrap/login compatibility and are not accepted by machine APIs.

`BPM_HASH_SALT` is not an auth token. It is the stable salt used when hashing
email/IP values before they are written to BPM analytics. Keep it stable across
deploys so historical and future hashes continue to match.

OpenClaw concierge plan APIs:

```txt
GET /api/openclaw/plans/:planId/context
POST /api/openclaw/plans/:planId/messages
POST /api/openclaw/plans/:planId/refine
```

OpenClaw should use these APIs to read the current plan, store GUI or channel chat turns, submit structured feedback, and trigger the MattaNutra refinement loop. MattaNutra remains the system of record and queues external worker tasks for regenerated food guidance, supplement guidance, and the final report.

Worker endpoints:

```txt
POST /api/workers/register
POST /api/workers/heartbeat
POST /api/tasks/reserve
POST /api/tasks/:id/renew
POST /api/tasks/:id/comment
POST /api/tasks/:id/spawn
POST /api/tasks/:id/complete
POST /api/tasks/:id/fail
```

Content endpoints:

```txt
GET    /api/blog/posts
POST   /api/blog/posts
GET    /api/blog/posts/:idOrSlug
PATCH  /api/blog/posts/:idOrSlug
DELETE /api/blog/posts/:idOrSlug

GET    /api/blog/testimonials
POST   /api/blog/testimonials
GET    /api/blog/testimonials/:id
PATCH  /api/blog/testimonials/:id
DELETE /api/blog/testimonials/:id

GET    /api/testimonials
POST   /api/testimonials
GET    /api/testimonials/:id
PATCH  /api/testimonials/:id
DELETE /api/testimonials/:id

GET    /api/attestations
POST   /api/attestations
GET    /api/attestations/:id
PATCH  /api/attestations/:id
DELETE /api/attestations/:id
```

The public website renders published blog and testimonial content server-side; these API routes are not public read endpoints.
Blog posts are stored as one locale-specific row per translation, linked by `translationGroupId`. To add a translation, create or update a post with the existing article's `translationGroupId` or pass `translatedFromPostId`; the public language switcher uses the linked sibling post when it exists.

Admin query endpoints for external agents:

```txt
GET /api/admin/query/glance
GET /api/admin/query/conversions
GET /api/admin/query/campaigns
GET /api/admin/query/leads
GET /api/admin/query/content
GET /api/admin/query/reviews
GET /api/admin/query/supplements
GET /api/admin/query/communications
GET /api/admin/query/alerts
GET /api/admin/query/goals
GET /api/admin/query/tasks
GET /api/admin/query/agents
```

Shared query parameters include `range`, `locale`, `device`, `source`, `campaign`, `affiliate`, `planId`, `ray`, `emailHash`, `status`, `limit`, and `cursor`.
