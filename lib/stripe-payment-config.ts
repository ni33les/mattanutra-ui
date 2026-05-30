import {
  isAssessmentPlan,
  type AssessmentPlan
} from "@/lib/assessment-snapshot";
import type { Locale } from "@/lib/i18n";
import type { PaymentSourceSurface } from "@/lib/payment-paths";

export type StripeMode = "live" | "test";
export type PaymentProviderMode = StripeMode | "mock";
export type StripeWebhookPayloadShape = "fat" | "thin";

export type PaymentPlan = Readonly<{
  amountMicros: number;
  description: Record<Locale, string>;
  name: Record<Locale, string>;
  plan: AssessmentPlan;
  priceEnvName: string;
}>;

export type StripePaymentConfig = Readonly<{
  env: "dev" | "prd" | "uat";
  mode: PaymentProviderMode;
  priceIds: Record<AssessmentPlan, string>;
  publishableKey: string;
  secretKey: string;
  webhookSecrets: Record<StripeWebhookPayloadShape, string>;
}>;

export type CheckoutSessionInput = Readonly<{
  locale: Locale;
  planId?: string | null;
  request?: Request;
  selectedPlan: AssessmentPlan;
  sourceSurface: PaymentSourceSurface;
}>;

export const AMOUNT_MICROS_PER_UNIT = 1_000_000;
export const STRIPE_MINOR_UNITS_PER_MAJOR = 100;
const THB_USD_RATE_FALLBACK = 0.027;

export const SUPPORTED_STRIPE_WEBHOOK_EVENTS = new Set([
  "checkout.session.async_payment_failed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.completed",
  "checkout.session.expired",
  "payment_intent.payment_failed",
  "payout.canceled",
  "payout.failed",
  "payout.paid"
]);

const PAYMENT_PLANS: Record<AssessmentPlan, PaymentPlan> = {
  precision: {
    amountMicros: 690 * AMOUNT_MICROS_PER_UNIT,
    description: {
      en: "Your Right Amount Formula with supplement priorities, dose context, cautions, and product direction.",
      th: "สูตรปริมาณที่พอดี พร้อมลำดับความสำคัญ ปริมาณ ข้อควรระวัง และแนวทางสินค้า",
      "zh-CN": "你的合适剂量配方，包含补充剂优先级、剂量背景、注意事项和产品方向。"
    },
    name: {
      en: "Right Amount Formula",
      th: "สูตรปริมาณที่พอดี",
      "zh-CN": "合适剂量配方"
    },
    plan: "precision",
    priceEnvName: "STRIPE_PRICE_PRECISION_THB"
  },
  pro: {
    amountMicros: 1590 * AMOUNT_MICROS_PER_UNIT,
    description: {
      en: "The Right Amount Formula plus 90 days of wellness concierge guidance.",
      th: "สูตรปริมาณที่พอดี พร้อมคำแนะนำจากผู้ช่วยดูแลสุขภาพ 90 วัน",
      "zh-CN": "合适剂量配方，加上 90 天健康顾问指导。"
    },
    name: {
      en: "90-Day Wellness Concierge",
      th: "ผู้ช่วยดูแลสุขภาพ 90 วัน",
      "zh-CN": "90 天健康顾问"
    },
    plan: "pro",
    priceEnvName: "STRIPE_PRICE_PRO_THB"
  }
};

type MattanutraEnv = "dev" | "prd" | "uat";

export function normalizeStripeWebhookPayloadShape(
  value: unknown
): StripeWebhookPayloadShape | null {
  return value === "fat" || value === "thin" ? value : null;
}

function normalizeMattanutraEnvValue(value: string | null | undefined): MattanutraEnv | null {
  const raw = value?.trim().toLowerCase();

  if (!raw) {
    return null;
  }

  if (raw === "production" || raw === "prod") {
    return "prd";
  }

  if (raw === "staging" || raw === "stage") {
    return "uat";
  }

  if (raw === "development" || raw === "local") {
    return "dev";
  }

  return raw === "dev" || raw === "uat" || raw === "prd" ? raw : null;
}

function hostFromUrlOrHost(value: string | null | undefined) {
  const first = value?.split(",")[0]?.trim();

  if (!first) {
    return null;
  }

  try {
    const parsed = new URL(first.includes("://") ? first : `https://${first}`);

    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function inferMattanutraEnvFromHost(host: string | null): MattanutraEnv | null {
  if (!host) {
    return null;
  }

  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return "dev";
  }

  if (host === "mattanutra.com" || host === "www.mattanutra.com") {
    return "prd";
  }

  if (/(^|[.-])uat($|[.-])/.test(host)) {
    return "uat";
  }

  if (/(^|[.-])dev($|[.-])/.test(host)) {
    return "dev";
  }

  return null;
}

function normalizedMattanutraEnv(request?: Request): MattanutraEnv {
  const explicit = normalizeMattanutraEnvValue(process.env.MATTANUTRA_ENV);

  if (explicit) {
    return explicit;
  }

  const candidates = [
    request?.headers.get("x-forwarded-host"),
    request?.headers.get("host"),
    request?.url,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.APP_BASE_URL,
    process.env.MATTANUTRA_API_BASE_URL,
    process.env.VERCEL_URL,
    process.env.RENDER_EXTERNAL_URL
  ];

  for (const candidate of candidates) {
    const inferred = inferMattanutraEnvFromHost(hostFromUrlOrHost(candidate));

    if (inferred) {
      return inferred;
    }
  }

  return process.env.NODE_ENV === "production" ? "prd" : "dev";
}

function stripeModeFromKey(key: string): StripeMode | null {
  if (key.startsWith("sk_test_") || key.startsWith("pk_test_")) {
    return "test";
  }

  if (key.startsWith("sk_live_") || key.startsWith("pk_live_")) {
    return "live";
  }

  return null;
}

function requestedStripePaymentMode(
  env: MattanutraEnv
): PaymentProviderMode {
  const requested = process.env.STRIPE_PAYMENT_MODE?.trim().toLowerCase();

  if (requested === "mock" || requested === "test" || requested === "live") {
    return requested;
  }

  return env === "dev" ? "mock" : env === "prd" ? "live" : "test";
}

export function stripePublishableKey() {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
}

export function paymentPlan(plan: AssessmentPlan) {
  return PAYMENT_PLANS[plan];
}

export function normalizePaymentPlan(plan: unknown): AssessmentPlan | null {
  return isAssessmentPlan(plan) ? plan : null;
}

export function normalizePaymentSourceSurface(
  value: unknown
): PaymentSourceSurface {
  return value === "landing" ? "landing" : "healthscore";
}

export function stripePaymentConfig(request?: Request): StripePaymentConfig {
  const env = normalizedMattanutraEnv(request);
  const expectedMode = requestedStripePaymentMode(env);
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const publishableKey = stripePublishableKey();
  const webhookSecrets = {
    fat: process.env.STRIPE_WEBHOOK_SECRET_FAT?.trim() ?? "",
    thin: process.env.STRIPE_WEBHOOK_SECRET_THIN?.trim() ?? ""
  };
  const secretMode = stripeModeFromKey(secretKey);
  const publishableMode = stripeModeFromKey(publishableKey);
  const priceIds = {
    precision: process.env.STRIPE_PRICE_PRECISION_THB?.trim() ?? "",
    pro: process.env.STRIPE_PRICE_PRO_THB?.trim() ?? ""
  };

  if (env === "uat" && expectedMode !== "test") {
    throw new Error("Stripe key mode mismatch for uat. Expected test keys.");
  }

  if (env !== "prd" && expectedMode === "live") {
    throw new Error(`Stripe key mode mismatch for ${env}. Expected non-live payments.`);
  }

  if (env === "prd" && expectedMode !== "live") {
    throw new Error("Stripe key mode mismatch for prd. Expected live keys.");
  }

  if (env !== "dev" && expectedMode === "mock") {
    throw new Error("Stripe mock mode is only allowed in dev.");
  }

  if (expectedMode === "mock") {
    return {
      env,
      mode: "mock",
      priceIds: {
        precision: priceIds.precision || "mock_price_precision_thb",
        pro: priceIds.pro || "mock_price_pro_thb"
      },
      publishableKey,
      secretKey,
      webhookSecrets: {
        fat: webhookSecrets.fat || "mock_whsec_fat",
        thin: webhookSecrets.thin || "mock_whsec_thin"
      }
    };
  }

  const missing = [
    !secretKey && "STRIPE_SECRET_KEY",
    !publishableKey && "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    !webhookSecrets.fat && "STRIPE_WEBHOOK_SECRET_FAT",
    !webhookSecrets.thin && "STRIPE_WEBHOOK_SECRET_THIN",
    !priceIds.precision && "STRIPE_PRICE_PRECISION_THB",
    !priceIds.pro && "STRIPE_PRICE_PRO_THB"
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Stripe configuration is missing: ${missing.join(", ")}`);
  }

  const invalidPriceConfig = Object.entries(priceIds)
    .filter(([planKey, value]) => {
      if (isStripePriceId(value)) {
        return false;
      }

      const planAmount = paymentPlan(planKey as AssessmentPlan).amountMicros /
        AMOUNT_MICROS_PER_UNIT;
      const configuredAmount = Number(value);

      return !Number.isFinite(configuredAmount) || configuredAmount !== planAmount;
    })
    .map(([planKey]) => PAYMENT_PLANS[planKey as AssessmentPlan].priceEnvName);

  if (invalidPriceConfig.length > 0) {
    throw new Error(
      `Stripe price configuration must be a Stripe price_ ID or the configured THB amount. Invalid: ${invalidPriceConfig.join(", ")}`
    );
  }

  if (secretMode !== expectedMode || publishableMode !== expectedMode) {
    throw new Error(
      `Stripe key mode mismatch for ${env}. Expected ${expectedMode} keys.`
    );
  }

  return {
    env,
    mode: expectedMode,
    priceIds,
    publishableKey,
    secretKey,
    webhookSecrets
  };
}

export function isStripePriceId(value: string) {
  return value.startsWith("price_");
}

function stripeMinorAmountFromMicros(amountMicros: number) {
  return Math.round(
    (amountMicros / AMOUNT_MICROS_PER_UNIT) * STRIPE_MINOR_UNITS_PER_MAJOR
  );
}

export function stripeLineItemForPlan(
  config: StripePaymentConfig,
  selectedPlan: AssessmentPlan,
  locale: Locale
) {
  const plan = paymentPlan(selectedPlan);
  const configuredPrice = config.priceIds[selectedPlan];

  if (isStripePriceId(configuredPrice)) {
    return {
      price: configuredPrice,
      quantity: 1
    };
  }

  return {
    price_data: {
      currency: "thb",
      product_data: {
        description: plan.description[locale],
        name: plan.name[locale]
      },
      unit_amount: stripeMinorAmountFromMicros(plan.amountMicros)
    },
    quantity: 1
  };
}

export function stripeLocale(locale: Locale) {
  const stripeLocales = {
    en: "en",
    th: "th",
    "zh-CN": "auto"
  } satisfies Record<Locale, "auto" | "en" | "th">;

  return stripeLocales[locale] ?? "auto";
}

export function amountMicrosFromStripeAmount(amount: number | null | undefined) {
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return null;
  }

  return Math.round((Number(amount) / STRIPE_MINOR_UNITS_PER_MAJOR) * AMOUNT_MICROS_PER_UNIT);
}

export function thbUsdRate() {
  const parsed = Number(process.env.FINANCE_THB_USD_RATE);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : THB_USD_RATE_FALLBACK;
}
