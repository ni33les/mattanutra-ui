import {
  checkProductValidationConsistency,
  repairProductValidationConsistency
} from "@/lib/admin-products";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
}

function positiveIntegerOrNull(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

const repair = process.argv.includes("--repair");
const productId = argValue("product-id");
const limit = positiveIntegerOrNull(argValue("limit"));

const report = repair
  ? await repairProductValidationConsistency({
      actor: "validation_consistency_cli",
      limit,
      productId
    })
  : await checkProductValidationConsistency({
      limit,
      productId
    });

console.log(JSON.stringify(report, null, 2));
