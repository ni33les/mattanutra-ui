# MCP 11.0.0

Breaking change: the public `evidence` tool is removed. The six tools are `info`, `plan`, `execute`, `order`, `support`, and `feedback`. Tool cards, initialization, discovery, schemas, generated examples and connector projections use the same registry. A stale evidence call returns the ordinary JSON-RPC `-32601` unknown-tool response, without reading or mutating plan/order state.

Each completed plan product retains its recorded `imageUrl`, an absolute HTTPS URL, or explicit `null` when unavailable. Images remain associated with the returned product across refinement, selection and reads. Structured and JSON-text delivery carry identical plan values. No image fetch, guessed URL or image-specific question is required.

Internal provenance, fact lookup and validation remain. This release changes no matching objective, eligibility rule, product fact, source, price, stock interpretation or payment record. Existing v10 artifacts remain historical; unsupported version pins use normal contract validation.

The real DEV snapshot has no selectable listing with a missing image. IMG-02 real matching coverage is explicitly unavailable; the null serialization check is separately labelled presentation-only. UAT rollout and its own media verification are separately scheduled.
