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

export function validateMatcherFixtureRelations(relations) {
  const required = ["retail_checkout_payments", "retail_customer_orders"];
  for (const name of required) assert.equal(relations[name], true, `Missing maintained MCP commerce prerequisite: ${name}`);
  return Object.fromEntries(required.map(name => [name, true]));
}

export function validateMatcherPaymentPrerequisites(row) {
  for (const locale of ["en", "th", "zh-CN"])
    assert.ok(typeof row.paymentLocaleConstraint === "string" && row.paymentLocaleConstraint.includes(`'${locale}'`),
      `Missing maintained MCP payment locale prerequisite: ${locale}`);
  assert.equal(row.accountCount, 3, "Missing maintained MCP Stripe, clearing or revenue account prerequisite");
  return row;
}

export async function checkMatcherFixtureDatabase(env) {
  isolatedValidationEnvironment(env);
  const sql = postgres(env.TEST_DB_URL, { max: 1, prepare: false });
  try {
    const [relations] = await sql`select
      to_regclass('public.retail_checkout_payments') is not null as retail_checkout_payments,
      to_regclass('public.retail_customer_orders') is not null as retail_customer_orders`;
    validateMatcherFixtureRelations(relations);
    const [payments] = await sql`select
      (select pg_get_constraintdef(oid) from pg_constraint
        where conrelid='public.payments'::regclass and conname='payments_locale_check') as "paymentLocaleConstraint",
      (select count(*)::int from public.finance_accounts where id in
        ('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',
         '55555555-5555-4555-8555-555555555555')) as "accountCount"`;
    validateMatcherPaymentPrerequisites(payments);
    const [row] = await sql`select
      (select count(*)::integer from public.products) as products,
      (select count(*)::integer from public.product_facts) as "productFacts",
      (select count(*)::integer from public.supplements) as supplements,
      (select count(*)::integer from public.retail_sellable_products) as "retailListings",
      (select count(*)::integer from public.supplement_safety_limits) as "safetyReferences"`;
    return { version: 1, passed: true, counts: validateMatcherFixtureCounts(row), relations, payments };
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
