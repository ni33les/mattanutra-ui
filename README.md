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
Authorization: Bearer <ADMIN_CLAW_TOKEN>
```

The cron endpoint scans due cron actions and queues task-backed work only. It does not execute worker tasks. Scheduled content publishing runs through the normal `content_status_change` task queue once its `scheduled_for` time is due.

A worker process must be running with `WORKER_API_TOKEN`. Start all local worker capabilities with `npm run worker:all`, or run one of the narrower `worker:*` scripts. Workers register with `/api/workers/register`, heartbeat with `/api/workers/heartbeat`, long-poll `/api/tasks/reserve`, and complete/fail tasks through the task API. In DigitalOcean App Platform, `npm run start:platform` is the no-extra-component deployment mode: the web service owns a colocated worker process, but task execution still goes through the protected worker API rather than web-app internals.

UI-blocking work such as HealthScore analysis and paid formulation uses the interactive reserve path, so online workers check for newly queued work quickly while long-polling. Free example formulation is lower-value background work because it does not block the assessment UX. `WORKER_CONCURRENCY` starts multiple independent sessions per agent profile, and profile-specific overrides such as `WORKER_HEALTHSCORE_CONCURRENCY=2` and `WORKER_FORMULATION_CONCURRENCY=2` let you keep extra capacity for those user-facing tasks without speeding up background jobs. Default worker leases are short and renewed while work is active, so crashed workers release reserved tasks quickly.

The same tick queues a `sync_digitalocean_billing` worker task when `DIGITALOCEAN_ACCESS_TOKEN` and `DIGITALOCEAN_PROJECT_NAME` are configured. The external hosting worker calls `/v2/customers/my/invoices/preview`, returns invoice items to the platform, and the platform writes nominal `hosting` ledger rows with deterministic `source_ref` values so repeated 15-minute runs update existing rows.

AI cost accounting is written when Grok calls return usage metadata. Task-backed Grok calls also store the originating task id on the cost entry. Token prices default to the current `grok-4.3` rates and can be overridden with `XAI_INPUT_USD_PER_MILLION_TOKENS`, `XAI_OUTPUT_USD_PER_MILLION_TOKENS`, and `XAI_CACHED_INPUT_USD_PER_MILLION_TOKENS`.

Financial rows default to `nominal`, which is used for fine-grained cost accruals and estimates. Use `actual` rows only for real money flows such as monthly provider invoice payments.

## Admin Machine APIs

OpenClaw and admin machine APIs use `ADMIN_CLAW_TOKEN`. Worker execution APIs use `WORKER_API_TOKEN`.

Send either header:

```txt
Authorization: Bearer <ADMIN_CLAW_TOKEN>
x-admin-claw-token: <ADMIN_CLAW_TOKEN>
```

Dashboard URL tokens are only for browser dashboard access and are not accepted by machine APIs.

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
