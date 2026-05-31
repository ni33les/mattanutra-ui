import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  midpointUsdRateFromExchangerateHostPayload,
  normalizeCurrencyCode
} from "../lib/finance-fx.ts";

describe("retail stock and FX infrastructure", () => {
  it("stores organisation currency and retailer stock with soft-delete states", () => {
    const schema = readFileSync("db-schema.sql", "utf8");
    const migration = readFileSync("scripts/apply-retail-stock-schema.ts", "utf8");

    assert.match(schema, /currency text DEFAULT 'THB'::text NOT NULL/);
    assert.match(schema, /organisations_currency_check CHECK \(\(currency ~ '\^\[A-Z\]\{3\}\$'::text\)\)/);
    assert.match(schema, /CREATE TABLE public\.retail_product_stock/);
    assert.match(schema, /retail_product_stock_org_product_key UNIQUE \(organisation_id, product_id\)/);
    assert.match(schema, /retail_product_stock_status_check CHECK \(\(status = ANY \(ARRAY\['active'::text, 'disabled'::text, 'deleted'::text\]\)\)\)/);
    assert.match(schema, /retail_product_stock_active_price_check CHECK \(\(\(status <> 'active'::text\) OR \(retail_price_amount IS NOT NULL\)\)\)/);
    assert.match(schema, /retail_product_stock_organisation_id_fkey[\s\S]*ON DELETE RESTRICT/);
    assert.match(migration, /create table if not exists public\.retail_product_stock/);
    assert.match(migration, /set currency = 'USD'[\s\S]*lower\(slug\) = 'mattanutra'/);
  });

  it("keeps FX observations reusable while copying immutable USD rates onto transactions", () => {
    const schema = readFileSync("db-schema.sql", "utf8");
    const ledger = readFileSync("lib/finance-ledger.ts", "utf8");
    const fx = readFileSync("lib/finance-fx.ts", "utf8");

    assert.match(schema, /CREATE TABLE public\.finance_fx_rates/);
    assert.match(schema, /base_currency text NOT NULL/);
    assert.match(schema, /quote_currency text NOT NULL/);
    assert.match(schema, /mid numeric\(20,10\) NOT NULL/);
    assert.match(schema, /finance_transactions_fx_rate_id_fkey[\s\S]*REFERENCES public\.finance_fx_rates\(id\) ON DELETE RESTRICT/);
    assert.match(schema, /usd_rate numeric\(20,10\) NOT NULL/);
    assert.match(ledger, /fxRateId\?: string \| null/);
    assert.match(ledger, /fx_rate_id,/);
    assert.match(fx, /DEFAULT_FRESHNESS_MS = 24 \* 60 \* 60 \* 1000/);
    assert.match(fx, /EXCHANGERATE_HOST_API_KEY/);
    assert.match(fx, /fxFallbackUsed|fallbackUsed/);
  });

  it("normalizes exchangerate.host live quotes into currency-to-USD midpoints", () => {
    assert.equal(normalizeCurrencyCode("thb"), "THB");
    assert.equal(
      midpointUsdRateFromExchangerateHostPayload("THB", {
        quotes: {
          USDTHB: 36.5
        },
        source: "USD",
        success: true,
        timestamp: 1710000000
      }),
      1 / 36.5
    );
    assert.equal(
      midpointUsdRateFromExchangerateHostPayload("EUR", {
        rates: {
          USD: 1.08
        }
      }),
      1.08
    );
    assert.equal(midpointUsdRateFromExchangerateHostPayload("THB", {}), null);
    assert.throws(() => normalizeCurrencyCode("thai"));
  });

  it("exposes first-class stock UI, API, and RBAC hooks", () => {
    const rbac = readFileSync("lib/admin-rbac.ts", "utf8");
    const page = readFileSync("app/[locale]/admin/dashboard/page.tsx", "utf8");
    const dashboard = readFileSync("components/admin-dashboard.tsx", "utf8");
    const view = readFileSync("components/admin/retail-stock-view.tsx", "utf8");
    const service = readFileSync("lib/admin-retail-stock.ts", "utf8");
    const route = readFileSync("app/api/admin/retail-stock/route.ts", "utf8");

    assert.match(rbac, /"stock\.read"/);
    assert.match(rbac, /"stock\.write"/);
    assert.match(rbac, /retail_admin: \["access\.agents\.read", "settings\.read", "stock\.read", "stock\.write"\]/);
    assert.match(rbac, /retail_assistant: \["settings\.read", "stock\.read"\]/);
    assert.match(page, /getAdminRetailStockData\(adminContext, locale\)/);
    assert.match(dashboard, /AdminRetailStockView/);
    assert.match(view, /labels\.stock\.addProduct/);
    assert.match(view, /<option key=\{status\} value=\{status\}>/);
    assert.match(route, /action === "upsert_stock_item"/);
    assert.match(route, /action === "set_stock_status"/);
    assert.match(service, /products[\s\S]*status = 'approved'/);
    assert.match(service, /currency = excluded\.currency/);
    assert.match(service, /status <> 'deleted'/);
    assert.match(service, /recordAdminAudit/);
    assert.match(service, /admin\.stock_created/);
    assert.match(service, /admin\.stock_updated/);
    assert.match(service, /admin\.stock_status_updated/);
  });
});
