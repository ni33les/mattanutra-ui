import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { measureCall } from "./measure.mjs";
export function payloadReport(directory, output) {
  const files = readdirSync(directory).filter(file => /^journey-.*\.json$/.test(file)).sort();
  assert.equal(files.length, 18, "All six cases and all three locales require evidence");
  const rows = files.map(file => {
    const { outcomes: [before, after] } = JSON.parse(readFileSync(resolve(directory, file), "utf8"));
    const totals = value => value.measurement.requestBytes + value.measurement.responseBytes;
    const beforePlan = before.calls.filter(row => row.request.params.name === "plan").map(measureCall);
    const afterPlan = after.calls.filter(row => row.request.params.name === "plan").map(measureCall);
    const row = { case: file.replace(/^journey-|\.json$/g, ""), baselineSource: before.source,
      beforeBytes: totals(before), afterBytes: totals(after), responseReduction: 1 - after.measurement.responseBytes / before.measurement.responseBytes,
      wholeReduction: 1 - totals(after) / totals(before), beforeCalls: before.measurement.calls, afterCalls: after.measurement.calls,
      beforePlanBytes: beforePlan.reduce((sum, row) => sum + row.responseBytes, 0), afterPlanBytes: afterPlan.reduce((sum, row) => sum + row.responseBytes, 0) };
    assert.ok(row.responseReduction >= .6 && row.wholeReduction >= .6, `Whole-journey target missed: ${row.case}`);
    return row;
  });
  const sorted = rows.map(row => row.afterBytes).sort((a, b) => a - b);
  const report = { scope: "mcp_payload_and_direct_readers", fullSuiteClaim: false, measurement: "Uncompressed UTF-8 JSON including text and structured duplication, all requests, discovery, explicit details and recovery calls. No token estimates.",
    normalization: "No normalization applied to byte measurements.", rows, medianBytes: sorted[Math.floor(sorted.length / 2)], p95Bytes: sorted[Math.ceil(sorted.length * .95) - 1], largestBytes: sorted.at(-1),
    aggregateReduction: 1 - rows.reduce((s, r) => s + r.afterBytes, 0) / rows.reduce((s, r) => s + r.beforeBytes, 0) };
  writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2), { flag: "wx" });
  writeFileSync(resolve(output, "report.csv"), [Object.keys(rows[0]).join(","), ...rows.map(row => Object.values(row).join(","))].join("\n"), { flag: "wx" });
  writeFileSync(resolve(output, "report.html"), `<!doctype html><meta charset="utf-8"><title>MCP payload comparison</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto}td,th{text-align:right;padding:8px;border-bottom:1px solid #ddd}td:first-child,th:first-child{text-align:left}</style><h1>MCP payload comparison</h1><p>Aggregate reduction: ${(report.aggregateReduction * 100).toFixed(1)}%. Full application and MCP suites were outside scope. Runtime keeps the compatible full view when responseView is omitted.</p><p>${report.measurement}</p><table><tr><th>Case</th><th>Before bytes</th><th>After bytes</th><th>Reduction</th><th>Calls before / after</th></tr>${rows.map(row => `<tr><td>${row.case}</td><td>${row.beforeBytes}</td><td>${row.afterBytes}</td><td>${(row.wholeReduction * 100).toFixed(1)}%</td><td>${row.beforeCalls} / ${row.afterCalls}</td></tr>`).join("")}</table><p>Selected products, doses, prices, option order, coverage and material advice are independently checked against frozen pre-change results. Evidence includes all raw calls. Compatibility text duplication remains intentional. Installed connector verification is a separate deployment requirement.</p>`, { flag: "wx" });
  return report;
}
