import assert from "node:assert/strict";
import postgres from "postgres";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedValidationEnvironment } from "./run-dev-advisory-validation.mjs";

const fields = ["products", "productFacts", "supplements", "retailListings", "safetyReferences"];
export function validateMatcherFixtureCounts(counts) {
  for (const field of fields) assert.ok(Number.isSafeInteger(counts[field]) && counts[field] > 0,
    `Missing or invalid maintained MCP fixture prerequisite: ${field}`);
  return Object.fromEntries(fields.map(field => [field, counts[field]]));
}

export async function checkMatcherFixtureDatabase(env) {
  isolatedValidationEnvironment(env);
  const sql = postgres(env.TEST_DB_URL, { max: 1, prepare: false });
  try {
    const [row] = await sql`select
      (select count(*)::integer from public.products) as products,
      (select count(*)::integer from public.product_facts) as "productFacts",
      (select count(*)::integer from public.supplements) as supplements,
      (select count(*)::integer from public.retail_sellable_products) as "retailListings",
      (select count(*)::integer from public.supplement_safety_limits) as "safetyReferences"`;
    return { version: 1, passed: true, counts: validateMatcherFixtureCounts(row) };
  } finally { await sql.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkMatcherFixtureDatabase(process.env);
    assert.ok(process.argv[2], "An immutable prerequisite evidence path is required");
    writeFileSync(resolve(process.argv[2]), JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
