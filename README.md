# Healthspan

Blank Healthspan canvas built with Next.js, TypeScript, and Tailwind CSS.

## Languages

The app uses lightweight locale-prefixed routes:

```txt
/en
/es
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
