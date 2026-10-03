# Meta campaign tracking

The browser and server send only consented acquisition milestones. `Purchase` comes from verified payment confirmation, with the saved total and currency; receipt pages and arbitrary BPM events cannot create it. Retail webhooks confirm basket payments even when the browser closes. Retail/MCP projections share the Stripe session conversion identity.

| Environment | Event names | Required parameter |
| --- | --- | --- |
| DEV | `DEV_PageView`, `DEV_Purchase`, etc. | `mn_env=dev` |
| UAT | `UAT_PageView`, `UAT_Purchase`, etc. | `mn_env=uat` |
| PRD | `PageView`, `Purchase`, etc. | `mn_env=prd` |

Set `MATTANUTRA_ENV`, `META_TRACKING_ENABLED=true`, `FACEBOOK_PIXEL_ID_DEV/UAT/PRD` and `FACEBOOK_CAPI_ACCESS_TOKEN_DEV/UAT/PRD` in the corresponding runtime. Environment-specific credentials take precedence over generic credentials. Pixel IDs may be different; prefixes also isolate non-production events when sharing a dataset. Do not configure production campaigns/custom conversions to include prefixed test events. Optional `FACEBOOK_CAPI_TEST_EVENT_CODE_DEV/UAT` directs diagnostics to Meta Test Events. Tokens remain server-only. Runtime public configuration is fetched so static builds cannot embed another environment's enabled state.

Before enabling a runtime, apply `npm run marketing:schema:apply` using its schema role and grant its runtime role SELECT/INSERT/UPDATE/DELETE on the three `meta_*` tables. The additive migration never changes existing assessment, product, payment or financial records. Deploy the web application and workers from the same revision; the hosting worker must advertise `send_meta_event`. Disabling the flag stops new capture and delivery; use existing task retry controls when deliberately resuming failed delivery tasks.

The allowed events are PageView, ViewContent, QuizStart, QuizProgress (25/50/75%), QuizSubmitted, Lead, EmailCapture, Contact, SelectOffer, AddToCart, InitiateCheckout and Purchase. A quiz view is not a start; Lead means the first usable HealthScore; checkout is counted after a usable attempt exists. Suggested products do not automatically raise AddToCart. Business events such as worker completion, accounting and administrative notices remain internal.

The export policy reconstructs every payload. Permitted fields are environment/schema, locale/channel/stage, opaque plan and numeric campaign IDs, offer, coarse progress and appropriate amounts/currency. Matching uses normalized SHA-256 contact hashes, a hashed plan ID, original browser/ad-click identifiers, browser IP and user agent. Raw contacts, names, addresses, answers, scores, conditions, supplement/product identities, contents and capability URLs are excluded. URLs retain recognized generic paths and valid plan IDs; other parameters and fragments are removed. Raw fields are never copied from BPM or payment-provider request headers.

Marketing permission is separate from assessment consent. Declining leaves the application usable; withdrawing suppresses pending deliveries and clears matching data. Contexts expire after 90 days. Native Pixel runs only on public home/legal pages with safe URLs/referrers and automatic configuration disabled. Personalized pages use the server export boundary. Browser/CAPI copies use the same event name and ID.

An outbox row and delivery task commit with payment confirmation. Provider HTTP runs outside database transactions. An expiring claim prevents concurrent dispatch; retries retain ID/time, stop after nine provider attempts, and do not export events older than six days. Acknowledgement requires both HTTP success and `events_received=1`. No historical backfill is performed.

Marketing → Campaigns shows environment/destination, delivery status totals and purchase reconciliation for the date range (all campaigns). Acceptance is not proof of attribution or campaign eligibility. Verify Events Manager diagnostics, dataset category/restrictions, event match quality, production conversion selection and applicable consent settings in the Meta account. A CAPI token may send events while lacking permission to read pixel settings. Never relabel health events to evade Meta restrictions.

Validation covers payload allowlisting, URLs/referrers, server environment authority, real payment/outbox transactions and rollback, duplicate confirmations, retail/MCP deduplication, bounded retries, consent withdrawal and browser gating. Production smoke tests must not manufacture purchases.
