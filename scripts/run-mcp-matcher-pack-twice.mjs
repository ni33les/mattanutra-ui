import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
const strip = "--experimental-strip-types";
const loader = "--import";
const loaderPath = "./scripts/register-ts-path-loader.mjs";

if (!process.execArgv.includes(strip)) {
  const child = spawn(
    process.execPath,
    [strip, loader, loaderPath, here, ...process.argv.slice(2)],
    { stdio: "inherit" }
  );
  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
} else {
  const { existsSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { resolve, join } = await import("node:path");
  const { sourceManifest } = await import("./run-full-test-suite.mjs");
  const evidence = resolve(process.env.MCP_ACCEPTANCE_EVIDENCE_DIR ?? `/tmp/mattanutra-mcp-acceptance-${Date.now()}`);
  mkdirSync(evidence, { recursive: true });
  const before = sourceManifest();
  writeFileSync(join(evidence, "source-before.json"), JSON.stringify(before, null, 2), { flag: "wx" });
  const {
    BASELINE_PATH,
    canonicalPack,
    printTable,
    runPackOnce,
    writeBaseline
  } = await import("./mcp-matcher-pack-report.mjs");

  const inputs = {};
  const a = await runPackOnce(inputs);
  const frozenInputs = JSON.stringify(inputs, null, 2);
  writeFileSync(join(evidence, "frozen-inputs.json"), frozenInputs, { flag: "wx" });
  writeFileSync(join(evidence, "run-a.json"), JSON.stringify(a, null, 2), { flag: "wx" });
  const b = await runPackOnce(inputs);
  const unchangedInputs = frozenInputs === JSON.stringify(inputs, null, 2);
  writeFileSync(join(evidence, "run-b.json"), JSON.stringify(b, null, 2), { flag: "wx" });
  const left = canonicalPack(a);
  const right = canonicalPack(b);

  writeFileSync(join(evidence, "canonical-a.json"), left, { flag: "wx" });
  writeFileSync(join(evidence, "canonical-b.json"), right, { flag: "wx" });
  const unchangedSource = before.sha256 === sourceManifest().sha256;
  if (left !== right || !unchangedSource || !unchangedInputs) {
    writeFileSync(join(evidence, "results.json"), JSON.stringify({ passed: false, identicalNonLatency: left === right, unchangedSource, unchangedInputs }), { flag: "wx" });
    console.error("FAIL drift");
    console.error(
      JSON.stringify(
        {
          a: {
            contract: a.contract.passedCases,
            commercial: a.commercial.passedCases,
            valueRemediation: a.valueRemediation.passedCases,
            valueR4: a.valueR4.passedCases,
            matcher: a.matcher.scores
          },
          b: {
            contract: b.contract.passedCases,
            commercial: b.commercial.passedCases,
            valueRemediation: b.valueRemediation.passedCases,
            valueR4: b.valueR4.passedCases,
            matcher: b.matcher.scores
          }
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const totals = printTable(a);
  if (totals.packPass && !existsSync(BASELINE_PATH) && process.env.WRITE_MATCHER_BASELINE === "1") {
    writeBaseline(a);
    console.log(`Baseline: wrote ${BASELINE_PATH}`);
  } else if (!existsSync(BASELINE_PATH)) {
    console.log("Baseline: not written");
  }

  writeFileSync(join(evidence, "results.json"), JSON.stringify({ passed: totals.packPass, identicalNonLatency: true, unchangedSource, unchangedInputs, sourceSha256: before.sha256, totals }, null, 2), { flag: "wx" });
  process.exit(totals.packPass ? 0 : 1);
}
