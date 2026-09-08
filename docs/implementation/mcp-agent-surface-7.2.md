# MCP agent surface 7.2

Scope: the five plan operations default to conversation; seven native tools,
short discovery, aligned schemas and a one-release presentation compatibility
window. Matching, clinical references, prices, payment rules and order defaults
are unchanged. Deploy this release to DEV only.

## Intentional expectation changes

| Historical assertion | Current replacement | Maintained evidence |
| --- | --- | --- |
| Six native tools; evidence internal | Seven tools, including capability-scoped read-only evidence | AG72-CARD-01, AG72-EVIDENCE-01, PAY-SCHEMA-01 |
| Omitted plan view returns full | All five operations return conversation; explicit full preserves complete business results | AG72-VIEW-01–02, AG72-GOLDEN-01 |
| Legacy omission indefinite | `X-MattaNutra-Contract-Version: 7.1.0` preserves full only during 7.2; explicit views win; malformed/future pins fail | AG72-COMPAT-01 |
| Never prefix names | Native names are unprefixed; call the host-listed wrapper | AG72-CARD-01 |
| Long server instructions and overview | Short service card; TH finite catalogue, honest readiness and interaction limits; detailed fields in the tools-only guide | AG72-CARD-01, AXR-SPEC-02 |
| Guide says omission retains full | Current guide agrees with the new default and documents its temporary exception | AG72-DOC-01 |
| Concise pending revision must exist as a result row | Read committed state plus admitted operation while the next result is pending | PAY-HANDOFF-01 |
| Deployment proof fixed to 7.1 | Proof binds the version and schema in the actual published source | PAY-AX-02 |

Historical v4–v7.1 resources, baseline prices, captured results, case IDs and
matching assertions remain preserved. Complete-trace tests request full
explicitly; documented conversational journeys omit the plan view to exercise
the new default. Existing order and payment assertions remain in place.

## TDD and release evidence

The reviewed inventory is `test/mcp-payload/impact.json`. It maps each selected
file to its affected behavior and expected case count. The scoped runner rejects
missing, focused, skipped, todo, cancelled and incomplete cases. Final scoped
acceptance repeats the maintained payload package from independent isolated
database state, compares 18 multilingual semantic journeys, and includes
typecheck, release-diff lint and a production build. It is not a full application
or full MCP acceptance claim.

RED/GREEN logs, paired results and deployment evidence are stored outside the
checkout under the dated `mcp-agent-surface-7-2` evidence directory. The UAT
handoff reproduction and 7.1 correction have separate promotion evidence.

Native discovery, checked-in artifacts and provider projections are generated
from the same contract. Installed host connectors are a separate integration:
an endpoint test does not prove their cached tool definitions refreshed. Record
actual exposed tools and schemas, or report that verification as outstanding.

Rollback retains additive data and frozen checkouts. No new catalogue or
reference-data migration belongs to this release.
