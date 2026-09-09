import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

test("LOCK-REG-01 all 39 audited mechanisms name their disposition, invariant, boundaries and affected tests", () => {
  const register = JSON.parse(readFileSync("test/service-efficiency/lock-register.json", "utf8"));
  const inventory = JSON.parse(readFileSync("test/service-efficiency/impact.json", "utf8"));
  assert.deepEqual(register.mechanisms.map((row: {number: number}) => row.number), Array.from({length:39},(_,i)=>i+1));
  for (const row of register.mechanisms) {
    assert.ok(["remove", "narrow", "retain"].includes(row.disposition), String(row.number));
    for (const field of ["resource", "invariant", "acquisition", "permittedWork", "release"]) assert.ok(row[field]?.length > 10, `${row.number}: ${field}`);
    assert.ok(row.callers.length && row.tests.length, String(row.number));
    for (const file of row.tests) assert.ok(inventory.files.some((entry: {file: string})=>entry.file===file), `${row.number}: ${file} missing from scoped inventory`);
  }
});

test("LOCK-REG-02 production SQL locking sites require explicit registered justification", async () => {
  const { scanLockSites, verifyLockSites } = await import("../../scripts/service-efficiency/lock-register.mjs");
  const register = JSON.parse(readFileSync("test/service-efficiency/lock-register.json", "utf8"));
  const sites = scanLockSites(process.cwd());
  assert.ok(sites.length > 15, "Empty or truncated lock discovery is not evidence");
  assert.deepEqual(verifyLockSites(sites, register), []);
  assert.ok(verifyLockSites([...sites,{file:"lib/agentic/unregistered.ts",key:"new-lock",owner:"ordinaryRead",statement:"select id from tasks for update"}], register).length > 0);
});
