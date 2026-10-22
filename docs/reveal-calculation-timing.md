# Calculation timing before reveal

Server and worker stdout emit JSON with `scope: "assessment.reveal_timing"`.
`reveal_stage` records a monotonic `durationMs`, `stage`, and `outcome`
(`completed` or `failed`). Filter by `planId`, then join by `taskId`.
Hydration and result records include the input `revision`, reservation `attempt`,
and `retryAttempt`; worker execution joins these through `taskId`.
Only validated IDs, task types, numeric timings, and boolean reuse/supersession
flags are emitted. Answers, clinical results, tokens, exception text and stacks
are never supplied to this logger.
Durations are elapsed wall time: external AI stages include network/provider
waiting as well as local processing. They are not CPU measurements.

| Stage | Work included |
| --- | --- |
| `capture` | Validation, deterministic scoring, persistence and job enqueue; `resultReused` marks idempotent replay |
| `healthscore_compute` | Deterministic scoring at capture or work-item hydration |
| `work_item` | Revision checks, input hydration and catalogue/candidate loading |
| `healthscore_advice` | HealthScore advice generation; `resultReused` marks existing advice |
| `formulation` | Formulation analysis |
| `food_guidance`, `food_gap_guidance` | Food analysis and deterministic gap support |
| `product_matching_dispatch` | Safety-reference preparation, thread/CPU admission, calculation and reply |
| `product_matching` | Actual calculation inside the matcher thread, across variants/retailers |
| `result_preparation` | Safety review and result projection/serialization before the completion transaction |
| `result_application` | Result application within the completion transaction; success alone does not imply commit |
| `failure_application` | Failure-result handling within its transaction |

After a terminal task transaction returns, `reveal_task_terminal` records:

- `taskAgeMs`: creation to terminal state for this task record, including
  dependencies and repeated reservations. Automatically scheduled retry tasks
  have new IDs/creation times; this is not the entire retry lineage's duration.
- `firstReservationToTerminalMs`: first retained reservation to completion,
  including hydration, calculation, transport and publication. This is **not**
  per-attempt execution time: the existing `started_at` can survive retries.
- On first attempts with valid timestamps, `scheduledDelayMs` and
  `queueAndDependencyWaitMs` separate deliberate scheduling from the remaining
  wait for dependencies and worker capacity. Queue and dependency time cannot
  be separated further using the existing timestamps.

`terminalAt` uses `completedAt` for completed tasks. Failure finalization leaves
that column empty, so it uses the returned task's `updatedAt` instead; the
`terminalTimestampSource` field identifies the source explicitly.

Use stage durations to identify slow calculations and `taskAgeMs` to identify
waiting. For the pre-reveal critical path, correlate the non-replayed capture
and terminal records for the same plan/revision and inspect the last required
successful result; parallel task durations must not be summed. These records
measure backend work, not browser polling/paint latency. Repeated HTTP delivery
can repeat terminal records: deduplicate by task ID/status/attempt when querying.

The existing service metrics aggregate fixed `reveal.<stage>_ms` names with
count/total/max, plus task-age/wait durations and `reveal.stage_failed`.
Matcher-thread metrics are drained once per reply into the existing worker
reporter. Under `npm run start:platform`, the server and worker write their stage
records to the normal platform service log; the worker's existing
`[service-efficiency:worker]` report includes its process aggregates every 60
seconds. API-process stage records remain separate from that worker aggregate.
Existing `match.*` and `worker.*` measurements remain unchanged.
Spans are inclusive and overlap: do not add capture to scoring, hydration to
scoring, or dispatch to matcher execution. Existing worker queue/thread/CPU
metrics provide further admission detail without creating duplicate counters.

Set `REVEAL_TIMING_ENABLED=false` (or `0`) to disable these new logs and metrics.
Telemetry failures do not fail or replace the calculation's result/error.
