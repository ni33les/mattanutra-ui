# Public plan tool card — Item 1 only

Control: DEV 7.2.3, fab0e5a0. No matcher, quantity, advice, selection, checkout,
clinical reference or catalogue changes.

Evidence is outside the checkout at
`/root/.codex/visualizations/2026/09/08/mcp-tool-card`.

DEV already advertised create.responseView. Get and revise fields existed only
inside nested variants; the direct operation-field test failed. The exact
requested eight-line overview check also failed. A separate build
case failed because normal production builds did not regenerate publication.
These observations are retained; already-passing schemas are not claimed as RED.
The initial config-loader import failure is a harness error, not product evidence.

The plan card now shares OVERVIEW_CARD with info. The generator uses the actual
runtime toolList(), and production builds regenerate its published artifacts.
All five published operation schemas are the exact current info JSON. Get and
revise expose their existing fields at operation level; their original anyOf
variants remain intact, preserving accepted and rejected request combinations. Contract 7.2.4 identifies the new publication; 7.2.3 resources
and the existing presentation compatibility window remain available.

`impact.json` selects 13 directly affected cases only. The DEV work-package proof
binds this inventory, source, historical schema inputs and compiled build.

The live client compiles only tools/list, then creates a standard D3 plan, polls
status and reads the omitted conversation view. Only after that client completes
does the publication audit call info to compare the five exact schemas.

Direct endpoint JSON and installed connector caches are separate evidence.
The old descriptor-only MCP_HOSTED_DECLARATIONS checks are not used for this
package: a missing field in metadata is not a test of a complete tools/list JSON.
