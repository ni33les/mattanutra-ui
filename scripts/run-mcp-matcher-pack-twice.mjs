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
  const { existsSync } = await import("node:fs");
  const {
    BASELINE_PATH,
    canonicalPack,
    printTable,
    runPackOnce,
    writeBaseline
  } = await import("./mcp-matcher-pack-report.mjs");

  const a = await runPackOnce();
  const b = await runPackOnce();
  const left = canonicalPack(a);
  const right = canonicalPack(b);

  if (left !== right) {
    console.error("FAIL drift");
    console.error(
      JSON.stringify(
        {
          a: {
            contract: a.contract.passedCases,
            honesty: a.honesty.passedCases,
            planning: a.planning.passedCases,
            explanations: a.explanations.passedCases,
            copy: a.copy.passedCases,
            state: a.state.passedCases,
            matcher: a.matcher.scores
          },
          b: {
            contract: b.contract.passedCases,
            honesty: b.honesty.passedCases,
            planning: b.planning.passedCases,
            explanations: b.explanations.passedCases,
            copy: b.copy.passedCases,
            state: b.state.passedCases,
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
  if (totals.packPass && !existsSync(BASELINE_PATH)) {
    writeBaseline(a);
    console.log(`Baseline: wrote ${BASELINE_PATH}`);
  } else if (!totals.packPass && !existsSync(BASELINE_PATH)) {
    console.log("Baseline: not written (pack not green)");
  }

  process.exit(totals.packPass ? 0 : 1);
}
