# Discovery expectation changes — 9 September 2026

Baseline: 41ed9fd07e8b9c8814d361eab33d72b27ac7c157, contract 7.2.4.

- All 29 DISC IDs remain. Metadata gaps were observed RED before implementation; existing invariants are regression locks, not fabricated RED results. DISC-DET-05 initially exposed a test inventory regex omitting I18N IDs; its corrected regex counts all 29.
- COPY-RED, A-UNIT, S4, 82-VAL, SCORE and LIVE-TRUST IDs retain product and wellness checks. The approved info sentence is exact; stock/pharmacy context is checked on initialization, and responsibility is checked as a structured version field. The old prose-only requirements and word budget must not override the new approved copy. Historical v3 scorer goldens remain unchanged and supported alongside the current proposition.
- M721-HOST-03 reads operational host guidance from the generated instructions field. Short connector positioning no longer repeats the full instructions. AG72-CARD-01 expects the approved purpose sentence followed by the unchanged operational card, with the existing size limits.
- PAY-SCHEMA-01 had already exceeded its historical 65% byte target before this package: 7.2.4 intentionally inlined callable input schemas for schema-only hosts. The immutable baseline-tools fixture preserves that served publication. Replacement: input/output schemas equal that baseline, complete seven-tool inventory, and at most 2,000 additional bytes for titles/purpose copy. No schema or fixture price is changed.
- LIVE-TRUST discovery checks the valid POST-only transport (GET 405), then checks tools/list against the served contract with seven tools. Six-tool and GET-discovery historical results remain untouched.
- Full regression uses the existing complete MCP/matcher inventory once for the DEV release cycle and once after UAT promotion, in isolated databases. No full application or unrelated browser suite is claimed.
- Local adapter parity and native endpoint probes are not installed-host proof. A missing owner refresh/export remains an open integration requirement.

- Complete-suite preflight exposed unclassified AX refinement/service-efficiency suites and the HTTP test adapter reporting a content-hash prefix instead of the compiled git identity. The inventory now includes those consumers; qualification builds once before running the adapter and passes the actual commit. Production identity checks remain unchanged.


## Maintained MCP pack repair (user-authorized 9 September)

The user requires the complete maintained pack to pass before deployment. The
interrupted `acceptance-4` run is failed/incomplete, not a qualification. Its
original TAP and event files are preserved outside the checkout. An independent
41ed9fd0 control reproduced the AE2, v4 and catalogue-observation failures.

- Completed-journey clients explicitly request `full` and run the admitted durable
  operation through the external test executor. Raw dispatcher, status and
  ownership tests still assert conversation defaults and zero HTTP execution.
  Every actual admission and replay remains in the evidence transcript.
- AE2/AE3–AE8 keep their case IDs and behavioural checks. Progressive overview
  has one create template plus guide/schema pointers. The existing 4 KiB
  capability and 8 KiB documentation limits remain; explicit guide/schema tests
  verify all five operations. Environment warnings are permitted prose, not
  diagnostic fields. Published output-schema `$defs` are valid; validator dumps
  remain forbidden in errors and metadata.
- v4 resource assertions now require all 20 preserved/current guide-schema
  resources. Version assertions follow 7.2.4. Historical resource files are
  unchanged. The processing projection case uses raw admission.
- A missing saved contract version still means the historical 3.0.0 provenance
  and requires refresh. The new nonlocking reader had omitted that fallback;
  the existing v4 recovery case caught it and now verifies its repair.
- Catalogue observation comparisons explicitly retain/check the refreshed
  availability timestamp while comparing every other semantic value exactly.
- Historical-plan immutability captures the actual persisted row before refresh,
  including its derived projection, rather than a pre-persistence draft.
- Quantity-recovery clients use the status view's committed revision and failed
  operation state before refinement; they do not read a revision from an error.
- Build identity tests require injected identities to agree, and explicitly reject
  conflicts. No production identity guard is weakened.

No fixture prices, physical doses, health advice, purchase constraints, case IDs,
or historical result files were changed to obtain these passes.

- Durable-operation counters replace HTTP follower/watcher expectations. UAT-NL
  requires one cold miss and zero artificial follower hits; exact committed
  accounting, event sequences and replay invariants remain. Worker cancellation
  is exercised with the worker's signal, independently of the admitted request.
- Test barriers yield to I/O instead of starving the event loop with a microtask
  loop. A held matcher latch is registered against its durable operation identity.
  Restart tests kill that owner and recover its expired lease without extending
  the operation deadline. Recovery never runs matching from GET.
- Canonical catalogue identity is now retained as the documented `catalogId`
  through JSON receipts. The local nonenumerable `snapshotId` compatibility alias
  is not a wire field. MCP-CLIENT-05 preserves the original failing round trip.
- V5-OPTION-04 exposed an unquantified product incorrectly winning the dedicated
  single-product tie-break over an empty basket. A dedicated candidate must have
  measured requested coverage. Existing dose arithmetic is unchanged; matcher
  identity advances to flexible-dose-fit-9 to invalidate affected cached results.
- M-20, V5-REPAIR-01 and AXR-SRCH-02 follow the previously approved equal-dose
  routine ordering (known pills, product count, then price). Historical control
  prices/results remain unchanged. Explicit physically valid quantity proposals
  still demonstrate the exact cheaper 20-pill and incidental-C purchase choices.
- Conversation cards contain no basket lines or per-option purchaseEligible.
  Detailed clients explicitly request full or products/coverage/advice sections;
  default-view tests still omit responseView. The highlighted ID is checked
  against both its conversation card and the eligible detailed option.
- Current/full versus current/conversation journeys use identical frozen inputs,
  requests and prices. Historical full transcripts remain separate immutable
  evidence because ranking changed before this work package. Transitions use
  the public primary nextActions value across status and full views.
- Accepted medication/condition vocabulary does not promise a fired rule.
  Each code must be explicitly assessed with a matching interaction finding or
  explicitly unassessed. No reference, medication rule or severity is altered.
- CV reference rows load before the first frozen run, not during a later financial
  fixture. Paired runs compare complete non-latency evidence. The runner rejects
  empty product, fact, nutrient, retail and safety-reference prerequisites.
- Binary checkpoint regressions compare exact archive bytes and unchanged
  metadata while retaining old inline-base64 reader cases. The comparison avoids
  constructing multi-megabyte assertion diffs; it does not truncate the archive.
- Publication tests regenerate a temporary workspace. They cannot overwrite the
  source manifest or race another test's inspection of the real artifact.
- PostgreSQL fixtures use the common isolation guard, establish their own declared
  data prerequisites and roll back catalogue-epoch changes. No fixed database name
  may exclude the full maintained runner's isolated database.

- The newly added five-minute Node file/container timeout interrupted the 18-case
  payload file after individually passing journeys; it was not a service timeout.
  The file envelope is ten minutes. Existing per-case 15s, 90s, 120s and 180s
  functional limits remain unchanged. Interrupted evidence remains incomplete.

- MCP-INFRA-01–02: stop the pack-wide HTTP worker before database concurrency fixtures take ownership of task execution; each HTTP integration owns its own worker lifecycle. Paired batches start independent HTTP workers and preserve failures.
- AX2–AX6 diagnostic-key checks: allow only the documented `canonical.catalogId` provenance field restored by the durable-serialization regression. Other catalogue diagnostic keys and paths remain forbidden. The acceptance-5 failures are retained, and that source-changing run cannot qualify deployment.

- MCP-TRANSCRIPT-07: completed clients now use the recording completion adapter. The guard follows that adapter while preserving actual request/response recording and the independent raw-dispatcher regressions.
- MCP-INFRA-03 / LIVE-DUR-01 / LIVE-CON-01 / LIVE-CAN-01: independent HTTP test processes model different clients in the isolated reverse-proxy adapter. One client's request allowance remains enforced; another file cannot consume it. No request limits or deployed proxy configuration change. The duration, price, cash, quantity and coverage assertions remain intact.
