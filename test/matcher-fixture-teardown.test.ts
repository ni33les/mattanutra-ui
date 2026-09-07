import assert from "node:assert/strict";
import { it } from "node:test";
import { fixtureDatabaseUrl } from "./helpers/fixture-teardown.ts";

it("V5-HYGIENE-01 fixture database guards accept disposable suffixes and reject unsafe targets", () => {
  const database = "postgresql://nobody@127.0.0.1:55123/mattanutra_lock_review_fixture";
  const env = { DB_URL: database, TEST_DB_URL: database, DB_WORKER_URL: database };
  assert.equal(fixtureDatabaseUrl(env).href, database);
  for (const target of ["postgresql://127.0.0.1:5432/mattanutra_lock_review", "postgresql://127.0.0.1:3000/mattanutra_lock_review", "postgresql://localhost:55436/mattanutra_lock_review", "postgresql://database.example.test:55436/mattanutra_lock_review", "postgresql://127.0.0.1:55436/mattanutra_dev", `${database}?host=remote.example.test`, "https://127.0.0.1:55436/mattanutra_lock_review"]) {
    assert.throws(() => fixtureDatabaseUrl({ DB_URL: target, TEST_DB_URL: target, DB_WORKER_URL: target }), /isolated/);
  }
  assert.throws(() => fixtureDatabaseUrl({ ...env, DB_URL: "postgresql://127.0.0.1:55123/other" }), /DB_URL/);
  assert.throws(() => fixtureDatabaseUrl({ ...env, DB_WORKER_URL: "postgresql://127.0.0.1:55123/other" }), /DB_WORKER_URL/);
});
