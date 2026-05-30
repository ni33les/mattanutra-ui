import {
  allTestFiles,
  changedFiles,
  existingFiles,
  isBroadChange,
  isDocsOnly,
  printList,
  run
} from "./dev-cycle-utils.mjs";

const TEST_ARGS = [
  "--test",
  "--experimental-strip-types",
  "--import",
  "./scripts/register-ts-path-loader.mjs"
];

const adminTests = [
  "test/admin-access-rbac.test.ts",
  "test/admin-auth.test.ts",
  "test/admin-invites-static.test.ts",
  "test/admin-localization-static.test.ts",
  "test/admin-localized-display.test.ts",
  "test/admin-product-search.test.ts",
  "test/admin-product-title.test.ts",
  "test/admin-session-cookie.test.ts"
];

const localeTests = [
  "test/i18n-seo.test.ts",
  "test/zh-cn-localization-static.test.ts",
  "test/example-email.test.ts",
  "test/health-score.test.ts",
  "test/health-score-panel-static.test.ts",
  "test/nutrition-report-reveal-copy.test.ts",
  "test/plan-reveal-v3.test.ts",
  "test/admin-localization-static.test.ts"
];

const productTests = [
  "test/admin-product-search.test.ts",
  "test/admin-product-title.test.ts",
  "test/dose-conversion.test.ts",
  "test/food-gap-support.test.ts",
  "test/food-guidance-safety.test.ts",
  "test/food-nutrients.test.ts",
  "test/food-tags.test.ts",
  "test/formulation-preview.test.ts",
  "test/formulation-safety.test.ts",
  "test/product-countries.test.ts",
  "test/product-recommendations.test.ts",
  "test/product-validation.test.ts",
  "test/recommendation-selection-projections.test.ts"
];

const workerTests = [
  "test/communications.test.ts",
  "test/finance-ledger.test.ts",
  "test/stripe-payments.test.ts",
  "test/system-agents.test.ts",
  "test/task-only-schema.test.ts",
  "test/task-sequence.test.ts",
  "test/task-service-utils.test.ts",
  "test/transaction-boundary.test.ts",
  "test/worker-boundary.test.ts"
];

const assessmentTests = [
  "test/assessment-first-name.test.ts",
  "test/assessment-store-product-coverage.test.ts",
  "test/assessment-store.test.ts",
  "test/formulation-preview.test.ts",
  "test/formulation-safety.test.ts",
  "test/health-score-analysis.test.ts",
  "test/health-score.test.ts",
  "test/plan-feedback.test.ts",
  "test/plan-guidance-adjustments.test.ts",
  "test/plan-reveal-v3.test.ts",
  "test/questionnaire-v4.test.ts",
  "test/vo2-estimate.test.ts"
];

const directTestByFile = new Map(allTestFiles().map((file) => [file, file]));

function addAll(target, tests) {
  for (const test of tests) {
    target.add(test);
  }
}

function selectChangedTests(files) {
  const tests = new Set();
  const meaningfulFiles = files.filter((file) => !isDocsOnly(file));

  if (meaningfulFiles.length === 0) {
    return { full: false, tests: [] };
  }

  if (meaningfulFiles.some(isBroadChange)) {
    return { full: true, tests: allTestFiles() };
  }

  for (const file of meaningfulFiles) {
    if (directTestByFile.has(file)) {
      tests.add(file);
      continue;
    }

    if (
      file.startsWith("components/admin/") ||
      file.startsWith("app/api/admin/") ||
      file.startsWith("app/[locale]/admin/") ||
      file.startsWith("lib/admin-") ||
      file.startsWith("scripts/admin-")
    ) {
      addAll(tests, adminTests);
      continue;
    }

    if (
      file.includes("locale") ||
      file.includes("i18n") ||
      file.includes("zh") ||
      file.includes("copy") ||
      file.includes("content") ||
      file.startsWith("components/assessment-flow-copy") ||
      file.startsWith("components/formulation-") ||
      file.startsWith("components/nutrition-flow/") ||
      file.startsWith("lib/legal-content") ||
      file.startsWith("lib/example-email") ||
      file.startsWith("app/sitemap")
    ) {
      addAll(tests, localeTests);
      continue;
    }

    if (
      file.includes("product") ||
      file.includes("supplement") ||
      file.includes("food") ||
      file.includes("recommendation") ||
      file.includes("dose") ||
      file.includes("catalogue") ||
      file.includes("dhc") ||
      file.includes("megawecare") ||
      file.includes("swisse") ||
      file.includes("vistra")
    ) {
      addAll(tests, productTests);
      continue;
    }

    if (
      file.includes("worker") ||
      file.includes("task") ||
      file.includes("stripe") ||
      file.includes("payment") ||
      file.includes("finance") ||
      file.includes("communication") ||
      file.includes("agent")
    ) {
      addAll(tests, workerTests);
      continue;
    }

    if (
      file.includes("assessment") ||
      file.includes("formulation") ||
      file.includes("health-score") ||
      file.includes("healthscore") ||
      file.includes("plan-") ||
      file.includes("questionnaire") ||
      file.includes("vo2")
    ) {
      addAll(tests, assessmentTests);
      continue;
    }

    return { full: true, tests: allTestFiles() };
  }

  return { full: false, tests: [...tests].sort() };
}

async function runTests(files) {
  const existing = existingFiles(files);

  if (existing.length === 0) {
    console.log("[test] No tests selected.");
    return;
  }

  await run("node", [...TEST_ARGS, ...existing]);
}

async function main() {
  const [, , mode = "all", ...rawArgs] = process.argv;
  const dryRun = rawArgs.includes("--dry-run");
  const args = rawArgs.filter((arg) => arg !== "--dry-run");

  if (mode === "all") {
    const tests = allTestFiles();
    if (dryRun) {
      printList("[test] Selected full suite", tests);
      return;
    }
    await runTests(tests);
    return;
  }

  if (mode === "one") {
    if (args.length === 0) {
      throw new Error("Usage: npm run test:one -- test/example.test.ts");
    }

    const tests = args.map((file) => file.replace(/^\.\//, ""));
    const invalid = tests.filter((file) => !directTestByFile.has(file));

    if (invalid.length > 0) {
      throw new Error(`Unknown test file(s): ${invalid.join(", ")}`);
    }

    if (dryRun) {
      printList("[test] Selected tests", tests);
      return;
    }
    await runTests(tests);
    return;
  }

  if (mode === "changed") {
    const files = await changedFiles();
    const selection = selectChangedTests(files);

    printList("[test] Changed files", files);
    if (selection.full) {
      console.log("[test] Broad or unknown change detected; using full suite.");
    }
    printList("[test] Selected tests", selection.tests);

    if (dryRun) {
      return;
    }

    await runTests(selection.tests);
    return;
  }

  throw new Error(`Unknown test mode: ${mode}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
