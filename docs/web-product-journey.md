# Free web product journey

Public web assessments use the server-owned `journey_version = 'web-products-v1'`. Customers receive their formula and product matches without buying a reveal. The existing product delivery, Stripe, payment verification and fulfillment paths remain responsible for purchases. Pharmacy and MCP retain their channel adapters.

## Access and generation

Capture assigns the journey identity and persists first acquisition attribution. Explicit recovery enrolls eligible historical web assessments without changing their answers, input revision, selected plan or payment records. An existing enrollment survives a pause in new enrollment. Full-plan access and confirmed plan payment are separate fields.

The reveal reads current formula details with `products=0` while matching is pending, then loads products when server readiness permits. HealthScore and food generation continue independently. Formula details remain available when matching fails. A customer can resume with their existing private assessment URL; result reads do not create new tasks. Retry reuses valid results and active work under the existing generation fences.

The web and pharmacy reveal share the same presentation shell, five input tiles, Nong animation, ingredient grid, product checkbox cards, basket styling and detailed-plan invitation. The web adapter uses online prices and continues to the existing delivery and Stripe checkout. Saved-answer cards rotate every six seconds, pause during interaction and in hidden tabs, and respect reduced motion. Formula explanations remain expandable while matching runs; available results do not wait for animation. Optional HealthScore and detailed-plan views are free; the latter shares the pharmacy detailed presentation through a web adapter.

## Basket and payments

A basket must be a nonempty, unique subset of one current recommendation option. It retains the assessment, selection, catalogue, recommendation and idempotency checks. Removing/restoring products does not rematch or alter the original dose. New options store a versioned contribution snapshot; coverage is recomputed from those frozen contributions. Older options use a qualitative change message when numerical evidence is unavailable. Full-plan guidance is distinguished from the chosen basket.

Checkout resolves current availability and online pricing and uses the existing delivery form and Stripe flow. Acquisition is frozen into payment/order metadata and retained in internal commerce events. UTM labels remain internal. Confirmed product payments continue through existing accounting, order creation, notifications and tracking.

The reveal-payment creation endpoint returns `410 reveal_offer_retired` while the journey is enabled. Historical receipts, paid reservations, processing payments and callback recovery remain supported. `npm run web-products:retire-reveal-checkouts` previews open unpaid reveal sessions; `-- --apply` reconciles provider state before retiring them and preserves paid/processing races. Run it with the target environment's matching Stripe credentials only after launch validation.

## Measurement

| Customer milestone | Meta event |
| --- | --- |
| Page opened | PageView |
| First answer / questionnaire checkpoints | QuizStart / QuizProgress (25, 50, 75) |
| Assessment captured | Server Lead |
| Formula cards visible | ViewContent, formula |
| Product cards visible | ViewContent, products |
| Basket explicitly confirmed | AddToCart |
| Usable persisted checkout session | InitiateCheckout |
| Verified product payment | Purchase, products |

Preselection and checkbox changes never send AddToCart. Views require visible content in an active tab, and the server validates assessment revision, formula version and product run. Basket confirmations use a stable selected-subset identity. Browser and CAPI copies share the server event ID. Consent, environment separation, payload restrictions and internal-test exclusions remain in effect. Formula details, questionnaire answers, diagnoses and product ingredient names are not advertising payloads.

Internal reporting follows entry, started, captured, reveal opened, formula displayed, products displayed, basket confirmed, checkout created, payment confirmed, shipped and delivered. Generation lifecycle/error/retry counts and completion median/p90 are separate operational measures. Product revenue is reconciled from durable live payment/order records against observed payment events. Meta acceptance/pending/failure remains delivery information, not evidence of a sale. Historical paid-plan meanings are retained separately.

## Release sequence

1. Apply `npm run web-products:schema:apply` with the appropriate schema-owner connection before starting new application code. This additive migration adds journey/acquisition columns and updates the HealthScore-skip projection; it does not rewrite payment or order history.
2. Run the focused unit, PostgreSQL and browser suites. Relevant new suites: `web-selection-coverage`, `web-product-journey.integration`, `meta-web-product-milestone`, `meta-web-product-milestone.integration`, `admin-web-product-report.integration`, and `e2e/free-web-product-journey.spec`. Legacy reveal-payment suites explicitly use the historical enrollment setting.
3. Deploy the same reviewed commit to DEV and UAT; verify the serving build, generation progression, basket, checkout, payment recovery, fulfillment and tracking receipts before production.
4. Deploy to production only after those checks pass. `WEB_PRODUCT_JOURNEY_ENABLED` defaults on for all web visitors. Verify live serving revision, schema, worker capability and receipts before resuming campaign traffic.
5. Preview and retire remaining unpaid reveal sessions. Do not cancel processing payments or manufacture payment evidence for free access.

A code rollback may leave the additive columns in place. Setting `WEB_PRODUCT_JOURNEY_ENABLED=0` pauses new enrollment/offer retirement while existing free access remains; it is not a complete customer-copy rollback. Production schema changes require an owner connection; the normal production runtime role is insufficient. Campaign activation is a separate operation and must wait for verified tracking and commerce.
