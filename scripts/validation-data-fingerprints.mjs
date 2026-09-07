#!/usr/bin/env node
/** Read-only identity of the isolated schema and catalogue; never dumps customer rows. */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { isolatedValidationEnvironment } from "./run-dev-advisory-validation.mjs";

export const VALIDATION_CATALOGUE_TABLES = Object.freeze(["site_locales", "product_brands", "nutrients", "foods", "supplements", "supplement_aliases", "supplement_country_availability", "supplement_safety_limits", "supplement_translations", "products", "product_facts", "retail_sellable_products", "retail_product_stock"]);
const sha = input => createHash("sha256").update(JSON.stringify(input)).digest("hex");
export function canonicalFingerprintRows(rows) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return rows.map(canonical).map(row => JSON.stringify(row)).sort();
}
export function schemaFingerprint(schema) {
  return sha(Object.fromEntries(["columns", "constraints", "indexes", "triggers", "functions"].map(key => [key, canonicalFingerprintRows(schema[key])])));
}
async function main() {
  isolatedValidationEnvironment(process.env);
  if (process.argv.length !== 3) throw new Error("Usage: validation-data-fingerprints.mjs output.json");
  const sql = postgres(process.env.TEST_DB_URL, { max: 1, prepare: false });
  try {
    const result = await sql.begin("read only isolation level repeatable read", async tx => {
      const columns = await tx`select table_name, column_name, ordinal_position, data_type, udt_name, is_nullable, column_default from information_schema.columns where table_schema='public' order by table_name, ordinal_position`;
      const constraints = await tx`select cls.relname as table_name, c.conname as name, pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_class cls on cls.oid=c.conrelid join pg_namespace n on n.oid=cls.relnamespace where n.nspname='public' order by cls.relname,c.conname`;
      const indexes = await tx`select tablename as table_name,indexname as name,indexdef as definition from pg_indexes where schemaname='public' order by tablename,indexname`;
      const triggers = await tx`select cls.relname as table_name,t.tgname as name,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class cls on cls.oid=t.tgrelid join pg_namespace n on n.oid=cls.relnamespace where n.nspname='public' and not t.tgisinternal order by cls.relname,t.tgname`;
      const functions = await tx`select p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p') order by p.proname,arguments`;
      const schemaSha256 = schemaFingerprint({ columns, constraints, indexes, triggers, functions });
      const tables = [];
      for (const table of VALIDATION_CATALOGUE_TABLES) {
        const [exists] = await tx`select to_regclass(${`public.${table}`}) as relation`;
        if (!exists?.relation) throw new Error(`Isolated catalogue table missing: ${table}`);
        // Housekeeping row clocks are not catalogue facts. Nested provenance and
        // verification timestamps remain hashed, along with every dose and price.
        const data = await tx`select to_jsonb(t) - 'created_at' - 'updated_at' as value from ${tx(`public.${table}`)} t`;
        const rows = canonicalFingerprintRows(data.map(row => row.value));
        tables.push({ table, rows: rows.length, sha256: sha(rows) });
      }
      const organisations = await tx`select id,slug,name,organisation_type,status,default_locale,country_code,currency,metadata->'customerPriceMarginPercent' as customer_price_margin_percent from public.organisations where organisation_type in ('tenant','platform') order by id`;
      tables.push({ table: "organisations:commercial-fields", rows: organisations.length, sha256: sha(canonicalFingerprintRows(organisations)) });
      if (!tables.find(row => row.table === "products")?.rows || !tables.find(row => row.table === "product_facts")?.rows) throw new Error("Isolated acceptance catalogue must contain real fixture products and facts");
      return { version: 1, schemaSha256, catalogueSha256: sha(tables), tables,
        normalization: "Stable row/key order; only top-level created_at and updated_at housekeeping clocks omitted. All nutrient quantities, availability, prices, metadata and nested provenance retained." };
    });
    writeFileSync(resolve(process.argv[2]), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ output: resolve(process.argv[2]), schemaSha256: result.schemaSha256, catalogueSha256: result.catalogueSha256 }));
  } finally { await sql.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
