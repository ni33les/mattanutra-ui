import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type postgres from "postgres";
import { withDatabaseTransaction } from "../lib/db.ts";
import { increaseProductFactSafetyLimit } from "../lib/admin-product-writes.ts";
import { POST } from "../app/api/admin/products/[id]/safety-limit/route.ts";
import { ProductReferenceReview } from "../components/admin/product-reference-review.tsx";
import type { Locale } from "../lib/i18n.ts";

const productId = "00000000-0000-4000-8000-000000000001";
const factId = "00000000-0000-4000-8000-000000000002";

describe("retired SKU-driven reference limit increase", () => {
  it("ANNA-REF-ADMIN-01: the legacy service refuses the action before any database read or write", async () => {
    let queries = 0;
    const sql = Object.assign(() => { queries += 1; throw new Error("Unexpected database access"); }, {
      begin: async (work: (tx: unknown) => Promise<unknown>) => work(sql)
    }) as unknown as postgres.Sql;
    await withDatabaseTransaction(sql, async () => {
      await assert.rejects(increaseProductFactSafetyLimit({ productId, factId }), {
        code: "reference_review_required"
      });
    });
    assert.equal(queries, 0);
  });

  it("ANNA-REF-ADMIN-02: authenticated legacy HTTP calls return an actionable retirement response and retain access checks", async () => {
    const previous = { token: process.env.ADMIN_CLAW_TOKEN, mode: process.env.MATTANUTRA_LEGACY_TOKEN_AUTH };
    process.env.ADMIN_CLAW_TOKEN = "anna-reference-retirement-fixture";
    process.env.MATTANUTRA_LEGACY_TOKEN_AUTH = "allow";
    try {
      const call = (authorized: boolean) => POST(new Request(`https://example.test/api/admin/products/${productId}/safety-limit`, {
        method: "POST", body: JSON.stringify({ factId }), headers: {
          "Content-Type": "application/json", ...(authorized ? { "x-admin-claw-token": "anna-reference-retirement-fixture" } : {})
        }
      }), { params: Promise.resolve({ id: productId }) });
      const rejected = await call(false);
      assert.equal(rejected.status, 404);
      const retired = await call(true);
      assert.equal(retired.status, 410);
      assert.equal(retired.headers.get("cache-control"), "no-store");
      const payload = await retired.json();
      assert.equal(payload.code, "reference_review_required");
      assert.equal(payload.nextAction, "review_reference_evidence");
      assert.match(payload.message, /source|evidence/i);
      assert.equal(payload.row, undefined);
    } finally {
      if (previous.token === undefined) delete process.env.ADMIN_CLAW_TOKEN; else process.env.ADMIN_CLAW_TOKEN = previous.token;
      if (previous.mode === undefined) delete process.env.MATTANUTRA_LEGACY_TOKEN_AUTH; else process.env.MATTANUTRA_LEGACY_TOKEN_AUTH = previous.mode;
    }
  });

  it("ANNA-REF-ADMIN-03: the product editor provides reference review and never calls the retired action", async () => {
    const ui = await readFile("components/admin/product-view-ui.tsx", "utf8");
    const detail = await readFile("components/admin/product-view.tsx", "utf8");
    assert.match(ui, /ProductReferenceReview/);
    assert.doesNotMatch(ui + detail, /onIncreaseSafetyLimit|increaseProductSafetyLimit|\/safety-limit/);
    const labels = new Set<string>();
    for (const locale of ["en", "th", "zh-CN"] as Locale[]) {
      const markup = renderToStaticMarkup(React.createElement(ProductReferenceReview, { locale }));
      assert.ok(markup.includes(`/${locale}/admin/dashboard?view=supplements`));
      assert.doesNotMatch(markup, /<button|Increase limit|เพิ่มขีดจำกัด|提高上限/);
      labels.add(markup.replace(/href="[^"]*"/, ""));
    }
    assert.equal(labels.size, 3);
  });
});
