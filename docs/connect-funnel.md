# Connection funnel operations

The 15 English, Thai and Simplified Chinese pages use the existing locale redirect, visual shell and public MCP interface. Product coverage is Thailand. No MCP input/output schema or tool version changes are required.

## Rollout and recovery

1. Apply `scripts/connect-funnel-schema.sql` after the existing Meta tracking schema, using `scripts/apply-connect-funnel-schema.ts`. It only adds tables and indexes.
2. Deploy DEV, validate owner-restricted polling, a real MCP `info` call and the existing Meta outbox, then repeat on UAT.
3. Complete the provider account checklist below before publishing the guides to PRD. Deploy PRD only after that evidence is recorded. Verify both apex and www routes, production event names and actual Meta acceptance.
4. `CONNECT_VERIFICATION_ENABLED=false` disables attempt creation and MCP confirmation without disabling the guides or ordinary MCP calls. Invalid or expired query tokens are ignored by MCP.
5. Optional `CONNECT_SIGNING_SECRET` overrides the purpose-separated HMAC key derived from the existing `AGENTIC_CAPABILITY_KEY` / `MCP_V2_ORDER_HANDLE_SECRET`. A signing-key change invalidates tracking links but never MCP access. Keep secrets out of logs and evidence.
6. Confirmation and its funnel event commit atomically. Meta enqueue is separate and idempotent. Authenticated `/api/cron`, returning visitors and repeated test calls recover pending enqueues; `scripts/reconcile-connect-events.ts` is also available for recovery in batches of 25. Existing Meta workers handle delivery/retries. Opt-outs are checked again at delivery.

## Native provider acceptance — pending

Official documentation was reviewed on 2026-10-03. No signed-in provider browser was available in this execution environment. Real provider screenshots and native connection tests must not be represented as completed.

For each of Claude, Perplexity, ChatGPT and Grok:

1. Open the corresponding DEV/UAT guide in the browser that will retain its owner cookie. Copy the generated URL.
2. Sign in to the provider, follow the guide, and record the exact available subscription and menu labels. Check the administrator variation where an appropriate organization account is available.
3. Capture the relevant setup panels from the real account, excluding identity, conversations and the private setup URL/token. Use an empty or ordinary public server URL for a public screenshot. Provide localized captions and alt text in `lib/connect-evidence.ts`.
4. Save the full test URL, enable the connector and send the localized test prompt. Confirm that the provider preserves the query token and that the originating browser shows the matching server-recorded confirmation.
5. Retain only the attempt UUID, environment, provider, locale, server timestamp and safe screenshots as evidence. Never copy tokens, cookies or conversations into a public artifact. Set `connectionVerifiedAt` only with that evidence.
6. Have a fluent reviewer check the Thai and Simplified Chinese instructions against the real screens. English menu labels are intentionally retained so users can recognize the provider UI.

## Measurement boundaries

`connect_funnel_events` records visits and successful setup actions. Distinct browser sessions are counted for browser stages; successful setup attempts are counted for verification. These are different units and must not be presented as a conversion rate without defining the denominator.

`McpConnectionVerified` requires a successful correlated `info` response. Discovery, clicks, initialization and browser-submitted success are insufficient. This proves a tool call, not a plan, purchase or independent proof of which AI application originated the HTTP request.

Only allowlisted provider, language, stage, environment and opaque campaign identifiers enter custom Meta data. Connection tokens, prompt contents, health and supplement details are excluded. Original visitor matching context is used instead of the AI server's network identity. Native Pixel remains disabled on every connection page.

Marketing → Campaigns reports this funnel independently of the healthscore funnel. Its connection summary explicitly covers all campaigns in the selected date range. Verified calls, Meta delivery acknowledgements and ad attribution have separate meanings.
