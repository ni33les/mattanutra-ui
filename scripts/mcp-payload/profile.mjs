import assert from "node:assert/strict";
import { main } from "./run-tests.mjs";
import { payloadReport } from "./report.mjs";
const args = process.argv.slice(2);
assert.ok(args.length === 4 && args[0] === "--corpus" && args[1] === "ax-six-and-anna" && args[2] === "--output" && args[3].startsWith("/"));
const result = await main(["--slice", "journeys", "--output", args[3]]);
assert.equal(result.passed, true); payloadReport(args[3], args[3]);
