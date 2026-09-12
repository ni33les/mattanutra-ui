import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { relative } from "node:path";
import postgres from "postgres";
import { payloadHash } from "../mcp-payload/proof.mjs";

export function verifiedRestore(file, uri, expectedHash) {
  assert.ok(file && relative(process.cwd(), realpathSync(file)).startsWith(".."), "Private restore proof must be outside the checkout");
  const receipt = JSON.parse(readFileSync(file));
  assert.equal(receipt.passed, true); assert.equal(receipt.uri, uri);
  assert.equal(receipt.backupSha256, expectedHash);
  assert.equal(payloadHash(readFileSync(receipt.backupFile)), expectedHash, "Encrypted backup changed");
  assert.equal(receipt.protectedTables, 128); assert.equal(receipt.protectedRows, 27979);
  const db = new URL(uri);
  assert.equal(db.hostname, "127.0.0.1"); assert.match(db.pathname, /^\/mattanutra_lock_review_ax_/);
  assert.ok(db.port && db.port !== "5432");
  return { passed: true, backupSha256: expectedHash, restoreReceiptSha256: payloadHash(readFileSync(file)), protectedTables: receipt.protectedTables, protectedRows: receipt.protectedRows };
}

const quote = value => '"' + value.replaceAll('"', '""') + '"';
// Hash original row contents, including frozen orders. Never export private row bodies.
// Synthetic tests may add their own rows; every original row must remain identical.
export async function paymentPreservationSnapshot(uri, columns) {
  const sql = postgres(uri, { max: 1, onnotice: () => {} });
  try {
    assert.match((await sql`select version()`)[0].version, /PostgreSQL 18/);
    return await sql.begin("read only", async tx => {
      if (!columns) {
        columns = {};
        const rows = await tx`select c.table_name,c.column_name from information_schema.columns c
          join information_schema.tables t using(table_schema,table_name)
          where c.table_schema='public' and t.table_type='BASE TABLE' order by c.table_name,c.ordinal_position`;
        for (const row of rows) (columns[row.table_name] ??= []).push(row.column_name);
      }
      const tables = {};
      for (const [name, fields] of Object.entries(columns)) {
        const hashes = [];
        for await (const batch of tx.unsafe(`select row_to_json(original_row)::text as content from (select ${fields.map(quote).join(",")} from public.${quote(name)}) original_row`).cursor(500)) {
          for (const row of batch) hashes.push(payloadHash(row.content));
        }
        tables[name] = hashes.sort();
      }
      return { columns, tables };
    });
  } finally { await sql.end(); }
}

export function verifyOriginalPayments(before, after) {
  assert.ok(Object.keys(before.tables).length >= 128, "Incomplete restored corpus");
  assert.deepEqual(after.columns, before.columns);
  const tables = [];
  for (const [name, hashes] of Object.entries(before.tables)) {
    const remaining = new Map();
    for (const hash of after.tables[name]) remaining.set(hash, (remaining.get(hash) ?? 0) + 1);
    for (const hash of hashes) {
      assert.ok(remaining.get(hash) > 0, `Original ${name} row changed or disappeared`);
      remaining.set(hash, remaining.get(hash) - 1);
    }
    tables.push({ name, originalRows: hashes.length, sha256: payloadHash(JSON.stringify(hashes)) });
  }
  return { passed: true, tables, originalRows: tables.reduce((n, row) => n + row.originalRows, 0), originalSha256: payloadHash(JSON.stringify(tables)) };
}
