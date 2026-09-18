# Pharmacy LINE plan delivery

Base: de6aab700acd4bc022ba357911b39666a411dac8.

The pharmacy's generic LINE share picker is intentionally replaced by a QR prepared before interaction and a link opening the MattaNutra official-account chat. The existing PHARM-BROWSER locale cases now assert that direct link and the local PNG; their order, saved-plan, price, and layout assertions are preserved. Unrelated food, matching and animation tests remain unchanged.

The user taps Send on LINE's prefilled `MN PLAN` message. A verified one-to-one event binds that specific saved plan and queues a deterministic localized hello with its private deep-dive link. The displayed language and optional frozen order are preserved. The ordinary website's `MN` flow stays unchanged.

No claim of delivery is made when a QR is created. Provider acknowledgement controls sent state. Token consumption and delivery/task creation are atomic; duplicate webhook events reuse that message. Existing bounded task retries use the original LINE retry key and recipient, including accepted-request 409 responses.

RED evidence: /root/.codex/deploy/pharmacy-line-20260918/red-complete.log (7 failed, one compatibility control passed), and red-browser (both UI cases failed before UI implementation). The initial module-resolution failure is preserved separately and is not behavioural RED evidence.

Mobile visual review exposed the coffee illustration selector shrinking the QR. `red-layout` preserves the failing 176px assertion. The image selector now targets only the illustration, and LINE instructions inherit the containing panel's contrasting text colour.

LINE protocol references:
- https://developers.line.biz/en/docs/messaging-api/using-line-url-scheme/#opening-a-chat-screen-with-a-line-official-account
- https://developers.line.biz/en/docs/messaging-api/retrying-api-request/
