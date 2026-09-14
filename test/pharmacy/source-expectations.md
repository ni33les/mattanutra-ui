# Pharmacy source attribution — approved expectation changes

- Public pharmacy entry links carry `source=in_store|business_card` and the existing session identifier. Untagged new entries default to in-store; historical records remain unknown. Landing geometry and all fixture prices are unchanged.
- Existing landing/quiz browser assertions now inspect the destination path and required query values rather than assuming an empty or fixed-order query string.
- PHARM-SRC-01–02 and PHARM-SRC-PG-01–02 failed against 88b3a235. Six PHARM-SOURCE browser cases also failed against that compiled build because the source query disappeared. The earlier browser attempt used a pharmacy absent from the isolated fixture; it was stopped, preserved as invalid prerequisite evidence, and is not a behavioural RED claim.
- Scoring inputs exclude only the new acquisition metadata. Ownership/pricing pharmacy context remains included. Stored orders are not rewritten.
- This inventory is scoped source/capture/order/funnel evidence, not a full application or MCP suite.
