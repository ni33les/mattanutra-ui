import { runDelightProductImageBackfill } from "@/lib/delight-product-image-backfill";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : null;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

const report = await runDelightProductImageBackfill({
  apply: hasArg("apply"),
  delayMs: positiveInt(argValue("delay-ms"), 350),
  limit: argValue("limit") ? positiveInt(argValue("limit"), 1) : undefined,
  outputPath: argValue("out")
});

console.log(JSON.stringify({
  applied: report.applied,
  missingAfter: report.missingAfter,
  missingBefore: report.missingBefore,
  sourced: report.sourced,
  sourceCounts: report.sourceCounts,
  updated: report.updated,
  unresolved: report.unresolved
}, null, 2));
