import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  normalizePaymentPlan,
  stripePaymentConfig
} from "../lib/stripe-payments.ts";
import { paymentCheckoutPath } from "../lib/payment-paths.ts";

const schema = readFileSync(new URL("../db-schema.sql", import.meta.url), "utf8");
const platformSeed = readFileSync(
  new URL("../db-rollout/db-data-10-platform-seed.sql", import.meta.url),
  "utf8"
);
const paymentService = readFileSync(
  new URL("../lib/stripe-payments.ts", import.meta.url),
  "utf8"
);

async function withStripeEnv<T>(
  env: Readonly<{
    MATTANUTRA_ENV?: string;
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
    STRIPE_PRICE_PRECISION_THB?: string;
    STRIPE_PRICE_PRO_THB?: string;
    STRIPE_PAYMENT_MODE?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET_FAT?: string;
    STRIPE_WEBHOOK_SECRET_THIN?: string;
  }>,
  run: () => T | Promise<T>
) {
  const keys = [
    "MATTANUTRA_ENV",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "STRIPE_PRICE_PRECISION_THB",
    "STRIPE_PRICE_PRO_THB",
    "STRIPE_PAYMENT_MODE",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET_FAT",
    "STRIPE_WEBHOOK_SECRET_THIN"
  ] as const;
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]])
  );

  try {
    for (const key of keys) {
      const value = env[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    return await run();
  } finally {
    for (const key of keys) {
      const value = original[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const baseStripeEnv = {
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
  STRIPE_PRICE_PRECISION_THB: "price_precision_test",
  STRIPE_PRICE_PRO_THB: "price_pro_test",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET_FAT: "whsec_fat_123",
  STRIPE_WEBHOOK_SECRET_THIN: "whsec_thin_123"
};

describe("Stripe payment configuration", () => {
  it("uses mock payments for local dev by default", async () => {
    await withStripeEnv(
      {
        MATTANUTRA_ENV: "dev"
      },
      () => {
        assert.equal(stripePaymentConfig().mode, "mock");
      }
    );
  });

  it("uses test keys for uat", async () => {
    await withStripeEnv(
      {
        ...baseStripeEnv,
        MATTANUTRA_ENV: "uat"
      },
      () => {
        assert.equal(stripePaymentConfig().mode, "test");
      }
    );
  });

  it("rejects live keys outside prd", async () => {
    await withStripeEnv(
      {
        ...baseStripeEnv,
        MATTANUTRA_ENV: "dev",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_123",
        STRIPE_PAYMENT_MODE: "live",
        STRIPE_SECRET_KEY: "sk_live_123"
      },
      () => {
        assert.throws(
          () => stripePaymentConfig(),
          /Expected non-live payments/
        );
      }
    );

    await withStripeEnv(
      {
        ...baseStripeEnv,
        MATTANUTRA_ENV: "dev",
        STRIPE_PAYMENT_MODE: "test"
      },
      () => {
        assert.equal(stripePaymentConfig().mode, "test");
      }
    );

    await withStripeEnv(
      {
        ...baseStripeEnv,
        MATTANUTRA_ENV: "uat",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_123",
        STRIPE_SECRET_KEY: "sk_live_123"
      },
      () => {
        assert.throws(
          () => stripePaymentConfig(),
          /Expected test keys/
        );
      }
    );
  });

  it("requires live keys in prd", async () => {
    await withStripeEnv(
      {
        ...baseStripeEnv,
        MATTANUTRA_ENV: "prd",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_123",
        STRIPE_SECRET_KEY: "sk_live_123"
      },
      () => {
        assert.equal(stripePaymentConfig().mode, "live");
      }
    );

    await withStripeEnv(
      {
        ...baseStripeEnv,
        MATTANUTRA_ENV: "prd"
      },
      () => {
        assert.throws(
          () => stripePaymentConfig(),
          /Expected live keys/
        );
      }
    );
  });

  it("normalizes plan and checkout paths", () => {
    assert.equal(normalizePaymentPlan("precision"), "precision");
    assert.equal(normalizePaymentPlan("pro"), "pro");
    assert.equal(normalizePaymentPlan("max"), null);
    assert.equal(
      paymentCheckoutPath("th", {
        plan: "pro",
        planId: "00000000-0000-4000-8000-000000000001",
        sourceSurface: "healthscore"
      }),
      "/th/nutrition/payment/checkout?plan=pro&source=healthscore&planId=00000000-0000-4000-8000-000000000001"
    );
  });
});

describe("Stripe payment schema and lifecycle", () => {
  it("defines append-only payment versions and webhook idempotency", () => {
    assert.match(schema, /create\s+table\s+public\.payments\b/i);
    assert.match(schema, /create\s+table\s+public\.payment_versions\b/i);
    assert.match(schema, /payment_versions_no_update_delete/i);
    assert.match(schema, /create\s+table\s+public\.stripe_webhook_events\b/i);
    assert.match(
      schema,
      /payload_shape\s+text\s+default\s+'fat'::text\s+not\s+null/i
    );
    assert.match(schema, /stripe_webhook_events_stripe_mode_check/i);
    assert.match(schema, /'test'::text,\s*'live'::text,\s*'mock'::text/i);
    assert.match(schema, /stripe_event_id\s+text\s+not\s+null/i);
    assert.match(schema, /stripe_webhook_events_stripe_event_id_key\s+unique/i);
  });

  it("extends platform finance categories for payment accounting", () => {
    for (const category of ["revenue", "payment_fee", "payout", "refund"]) {
      assert.match(schema, new RegExp(`'${category}'`, "i"));
    }

    for (const account of [
      "Stripe",
      "MattaNutra revenue",
      "Stripe clearing",
      "MattaNutra bank"
    ]) {
      assert.match(platformSeed, new RegExp(account, "i"));
    }

    assert.match(paymentService, /entryType:\s*"nominal"/);
    assert.match(paymentService, /stripe:payment:\$\{payment\.id\}:nominal-revenue/);
    assert.match(paymentService, /paymentCustomerLedgerAccount/);
    assert.match(paymentService, /plan:\$\{payment\.plan_id\}:customer/);
    assert.match(paymentService, /entryType:\s*"actual"/);
    assert.match(paymentService, /stripe:payout:\$\{payout\.id\}:net/);
  });

  it("keeps required payment BPM lifecycle events in one service", () => {
    for (const eventName of [
      "payment_checkout_requested",
      "payment_checkout_session_created",
      "payment_checkout_opened",
      "payment_pregeneration_started",
      "payment_pregeneration_failed",
      "payment_checkout_returned",
      "payment_webhook_received",
      "payment_webhook_ignored",
      "payment_processing",
      "payment_succeeded",
      "payment_failed",
      "payment_cancelled",
      "payment_expired",
      "payment_fulfillment_started",
      "payment_fulfillment_succeeded",
      "payment_fulfillment_failed",
      "payment_reservation_bound",
      "payment_reservation_bind_failed",
      "payment_config_error",
      "payment_webhook_signature_failed",
      "payment_accounting_recorded",
      "payment_accounting_failed",
      "payment_payout_recorded",
      "payment_payout_failed"
    ]) {
      assert.match(paymentService, new RegExp(eventName));
    }
  });

  it("keeps local Stripe webhook forwarding narrow and explicit", () => {
    const packageJson = readFileSync(
      new URL("../package.json", import.meta.url),
      "utf8"
    );

    assert.match(packageJson, /stripe:webhook:dev/);
    assert.match(packageJson, /stripe:webhook:dev:fat/);
    assert.match(packageJson, /stripe:webhook:dev:thin/);
    assert.match(packageJson, /localhost:3000\/api\/stripe\/webhook\/fat/);
    assert.match(packageJson, /localhost:3000\/api\/stripe\/webhook\/thin/);
    assert.match(packageJson, /--forward-thin-to/);
    assert.match(packageJson, /--thin-events/);

    for (const eventName of [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
      "payment_intent.payment_failed",
      "payout.paid",
      "payout.failed",
      "payout.canceled"
    ]) {
      assert.match(packageJson, new RegExp(eventName));
    }
  });
});
