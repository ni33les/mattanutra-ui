# Web journey browser batches

The default application journey is `web-products-v1`. Run
`free-web-product-journey.spec.ts` against a local server with
`WEB_PRODUCT_JOURNEY_ENABLED=1` (or unset).

Historical paid-reveal and HealthScore regression tests exercise the retired
offer deliberately. They need a separate local server started with
`WEB_PRODUCT_JOURNEY_ENABLED=0`, and the same value in the test process so fixture
subprocesses create legacy assessments. Setting the value only in Playwright
does not change a running application server.

With a prepared production build and an isolated fixture database in
`TEST_DB_URL`, start the legacy server in a separate terminal:

```sh
DB_URL="$TEST_DB_URL" MATTANUTRA_ENV=dev STRIPE_PAYMENT_MODE=mock \
  WEB_PRODUCT_JOURNEY_ENABLED=0 \
  node --import ./test/helpers/offline-network.mjs \
  node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3101
```

Then run the historical batch:

```sh
DB_URL="$TEST_DB_URL" MATTANUTRA_ENV=dev STRIPE_PAYMENT_MODE=mock \
  WEB_PRODUCT_JOURNEY_ENABLED=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 \
  npx playwright test --workers=1 \
  test/e2e/payment-checkout-loading.spec.ts \
  test/e2e/payment-checkout-recovery.spec.ts \
  test/e2e/post-payment-reveal.spec.ts \
  test/e2e/web-funnel-recovery.spec.ts \
  test/e2e/healthscore-parallel.spec.ts \
  test/e2e/healthscore-wait.spec.ts \
  test/e2e/web-journey-counts.spec.ts \
  test/e2e/funnel-report.spec.ts
```

Keep this flag scoped to the legacy server and batch. Do not change
`playwright.config.ts`, the default journey, or the free-product browser batch
to make historical checkout assertions pass. Existing paid callbacks and saved
free access also have PostgreSQL regression coverage in
`test/web-product-journey.integration.test.ts` with the new journey enabled.
