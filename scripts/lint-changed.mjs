import {
  changedFiles,
  existingFiles,
  hasLintableExtension,
  isBroadChange,
  isDocsOnly,
  printList,
  run
} from "./dev-cycle-utils.mjs";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const files = await changedFiles();
  const meaningfulFiles = files.filter((file) => !isDocsOnly(file));
  const full = meaningfulFiles.some(isBroadChange);
  const lintTargets = full
    ? ["."]
    : existingFiles(meaningfulFiles.filter(hasLintableExtension));

  printList("[lint] Changed files", files);

  if (full) {
    console.log("[lint] Broad change detected; using full cached lint.");
  }

  printList("[lint] Selected targets", lintTargets);

  if (dryRun) {
    return;
  }

  if (lintTargets.length === 0) {
    console.log("[lint] No lintable changed files.");
    return;
  }

  await run("eslint", [
    ...lintTargets,
    "--cache",
    "--cache-location",
    ".next/cache/eslint"
  ]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
