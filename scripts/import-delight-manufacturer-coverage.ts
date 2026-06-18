import {
  DEFAULT_DELIGHT_ORGANISATION_NAME,
  runDelightManufacturerCoverageImport
} from "@/lib/delight-manufacturer-coverage";

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

const sheetPath = argValue("sheet");

if (!sheetPath) {
  throw new Error("--sheet=<Delight workbook.xlsx> is required");
}

const report = await runDelightManufacturerCoverageImport({
  applyDelight: hasArg("apply-delight"),
  applyMaster: hasArg("apply-master"),
  delayMs: positiveInt(argValue("delay-ms"), 200),
  delightOrganisationName: argValue("organisation") ?? DEFAULT_DELIGHT_ORGANISATION_NAME,
  includeExistingSupported: hasArg("include-existing-supported"),
  limitPerBrand: argValue("limit-per-brand")
    ? positiveInt(argValue("limit-per-brand"), 100)
    : undefined,
  outputPath: argValue("out"),
  sheetPath
});

console.log(JSON.stringify({
  appliedDelight: report.appliedDelight,
  appliedMaster: report.appliedMaster,
  candidates: report.candidates,
  matches: {
    ambiguous: report.matches.ambiguous,
    matched: report.matches.matched,
    missing: report.matches.missing
  },
  plannedMasterCoverage: {
    ambiguous: report.plannedMasterCoverage.ambiguous,
    matched: report.plannedMasterCoverage.matched,
    missing: report.plannedMasterCoverage.missing
  },
  retail: report.retail,
  sheet: report.sheet,
  sourceFailures: report.sources.failures.length,
  unmatchedSheetProducts: report.unmatchedSheetProducts
}, null, 2));
