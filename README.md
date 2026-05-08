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

## Admin Content API

Blog and testimonial management endpoints are server-to-server APIs for admin systems and require `ADMIN_TOKEN`.

Send either header:

```txt
Authorization: Bearer <ADMIN_TOKEN>
x-admin-token: <ADMIN_TOKEN>
```

Endpoints:

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
