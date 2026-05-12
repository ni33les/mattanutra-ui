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
npm run start
```

The optional app spec example lives at `.do/app.yaml.example`; copy it to `.do/app.yaml` and replace the placeholder GitHub repo before using it directly.

## Admin Machine APIs

OpenClaw, external agents, and remote workers use protected server-to-server APIs. They require `ADMIN_CLAW_TOKEN`.

Send either header:

```txt
Authorization: Bearer <ADMIN_CLAW_TOKEN>
x-admin-claw-token: <ADMIN_CLAW_TOKEN>
```

Dashboard URL tokens are only for browser dashboard access and are not accepted by machine APIs.

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
