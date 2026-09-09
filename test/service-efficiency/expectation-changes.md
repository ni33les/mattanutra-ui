# Scoped expectation and instrumentation changes

Historical evidence and prices are unchanged.

- `AXR-REL-03` recovery: inject the lost checkpoint at `patchClaimedOperation`, the new atomic database boundary. Preserve the 24,000 acknowledged + 4,000 reserved assertions, revision fencing, 64,000-attempt terminal result and exact idempotency replay.
- That case predates conversation-by-default. Its replay comparison now explicitly requests `responseView: full`, matching the internal executor result it has always compared. The first candidate run demonstrated the stale full-versus-conversation assertion; no product result assertions were removed.
- HTTP admission now leaves execution to durable task workers. Consumer harnesses must explicitly dispatch admitted tasks rather than rely on an HTTP-owned executor.

- Worker completion telemetry distinguishes a deferred reservation from completed work. The boundary guard now requires the conditional `task_completed`/`task_deferred` event mapping; its original case ID and all other worker-boundary assertions remain.
