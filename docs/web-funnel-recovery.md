# Web funnel recovery

The capture, payment confirmation and task queues commit required work together. Workers perform AI, provider, FX and email calls outside those transactions. Results are current only when their assessment revision, locale and generator version match. Legacy results without that provenance require regeneration.

## DEV rollout

1. Check out the validated `dev` commit. Keep UAT unchanged.
2. Apply `npm run web-funnel:schema:apply` using the DEV schema owner connection, then run `npm run dev-runtime-schema:verify`. This migration is additive and repeatable. The runtime role needs read/write access to the new tables.
3. Run `npm run i18n:generate`. Validate TypeScript, changed-file lint, focused tests, the isolated PostgreSQL suite and the browser fixtures. Build with the same DEV public configuration as the running service. When TypeScript has passed separately, `NEXT_BUILD_SKIP_TYPECHECK=1 npm run build` avoids repeating that memory-intensive phase.
4. Run `npm run workers:doctor -- --repair --require-all` against DEV. The scheduler needs `fulfill_web_payment`; the email worker needs `send_healthscore_email`.
5. Set the service's `AGENTIC_BUILD_ID` to the deployed commit and restart `mattanutra-ui-dev.service`, which starts both application and workers. Verify the public MCP build header, fresh worker heartbeats and both checkout paths.
6. Run `npm run web-funnel:audit` and save the output. Use `npm run web-funnel:audit -- --repair` to queue only provider-verified repairs. It never creates a payment session or charge. Review unverified records individually; do not infer payment from assessment status.

Application rollback may retain all added schema and records. Pause new task types before rolling workers back; old workers do not implement their handlers. A rollback must not drop revision, delivery or payment-accounting data.

## Recovery and monitoring

- HealthScore retries reuse the saved assessment and the active current-generation task. They never bypass complete advice.
- Journey retry resumes payment fulfillment, advice or formulation generation. The formulation refresh command is explicit and idempotent; GET polling does not schedule work.
- `payments.fulfillment_status` tracks paid work independently of payment confirmation. `finance_transactions.source_ref` makes revenue replay idempotent.
- `healthscore_delivery_requests` records explicit requests. `sent` means provider acknowledgement, not an inbox delivery guarantee. `unknown` means SMTP acceptance is ambiguous: inspect provider evidence before deciding whether to send again. Never bulk resend unknown requests.
- The audit reports task backlog, delivery states and `funnel_poll_recovery` outcomes from the last 24 hours. Task errors, payment fulfillment errors and communication records retain diagnostic detail.

## Isolated behavioral validation

Use a disposable PostgreSQL database named `mattanutra_lock_review*` on `127.0.0.1`, seeded with the base schema, prerequisite migrations and fixture catalogue. Never point these fixtures at a deployed database. `TEST_DB_URL` is deliberately separate from runtime configuration.

```sh
node --experimental-strip-types --import ./scripts/register-ts-path-loader.mjs \
  --import ./test/helpers/offline-network.mjs --test --test-concurrency=1 \
  test/web-payment-transitions.integration.test.ts \
  test/assessment-revisions.integration.test.ts \
  test/assessment-capture.integration.test.ts \
  test/web-payment-fulfillment.integration.test.ts \
  test/web-payment-webhooks.integration.test.ts \
  test/healthscore-delivery.integration.test.ts \
  test/funnel-readiness.integration.test.ts
```

Start the production build on a separate localhost port with `DB_URL` set to that isolated database, DEV mock payments, and the offline network guard. Set `PLAYWRIGHT_BASE_URL` to that server and run `npx playwright test test/e2e/web-funnel-recovery.spec.ts`. Browser fixtures cover ordinary and prepaid checkout in English, Thai and Chinese, plus resume, unrelated drafts, capture interruption, reload, delivery persistence failure and both progress/reveal recovery controls. AI output and email acknowledgement are injected fixture results; separate DEV smoke checks exercise deployed workers.
