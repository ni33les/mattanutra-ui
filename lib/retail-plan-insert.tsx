import fs from "node:fs/promises";
import path from "node:path";
import React from "react";
import {
  Document,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer
} from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import QRCode from "qrcode";
import sharp from "sharp";
import { buildLineOfficialAccountMessageUrl } from "@/lib/chat-links";
import { createCustomerLineConnectToken } from "@/lib/communications";
import { getSql } from "@/lib/db";
import {
  type FoodGapSupportItem,
  type FoodGuidanceItem,
  type FormulationIngredient,
  type FormulationResult,
  type LocalizedText,
  type RecommendedProduct
} from "@/lib/formulation-types";
import { isLocale, resolveLocalizedText, type Locale } from "@/lib/i18n";
import {
  localizedManagedFoodSeedText,
  managedFoodSeeds
} from "@/lib/managed-foods";
import { nutritionRevealPath } from "@/lib/nutrition-paths";
import { siteBaseUrl } from "@/lib/site-url";
import { isUuid, getStoredFormulationResult } from "@/lib/assessment-store";

type Db = NonNullable<ReturnType<typeof getSql>>;
const PdfImageWithAlt = PdfImage as React.ComponentType<
  React.ComponentProps<typeof PdfImage> & { alt: string }
>;

const panyaInsertExpiryMinutes = 90 * 24 * 60;
const maxProductCards = 4;
const maxFoodCards = 2;
const imageCache = new Map<string, Promise<string | null>>();
const noHyphenation = (word: string | null) => [word ?? ""];

type InsertTextProps = React.PropsWithChildren<{
  style?: Style | Style[];
}>;

function InsertText({ children, ...props }: InsertTextProps) {
  return (
    <Text {...props} hyphenationCallback={noHyphenation}>
      {children}
    </Text>
  );
}

export type RetailPlanInsertProduct = Readonly<{
  brandName: string | null;
  covers: string[];
  imageDataUri: string | null;
  productId: string;
  quantity: number;
  take: string;
  title: string;
  why: string;
}>;

export type RetailPlanInsertFood = Readonly<{
  category: string;
  foodId: string;
  imageDataUri: string | null;
  name: string;
  rationale: string;
  serving: string;
  supports: string[];
}>;

export type RetailPlanInsertData = Readonly<{
  brandMarkDataUri: string | null;
  customerFirstName: string;
  customerName: string | null;
  foodRows: RetailPlanInsertFood[];
  generatedAt: string;
  locale: Locale;
  orderDateLabel: string;
  orderId: string;
  orderNumber: string;
  organisationName: string | null;
  partnerLocationLabel: string | null;
  panyaCode: string;
  panyaExpiresAt: string;
  panyaLineUrl: string;
  panyaQrDataUri: string;
  planId: string;
  planUrl: string;
  productRows: RetailPlanInsertProduct[];
  revealQrDataUri: string;
}>;

type OrderRow = Readonly<{
  customer_email: string | null;
  customer_name: string | null;
  id: string;
  metadata: unknown;
  order_number: string;
  organisation_id: string;
  organisation_country_code: string | null;
  organisation_name: string | null;
  placed_at: Date | string | null;
  plan_id: string | null;
  payment_locale: string | null;
  assessment_locale: string | null;
  assessment_first_name: string | null;
}>;

type OrderLineRow = Readonly<{
  brand_name: string | null;
  image_url: string | null;
  metadata: unknown;
  product_id: string;
  product_title: string;
  quantity_ordered: number | string;
}>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function localized(value: LocalizedText | null | undefined, locale: Locale) {
  return value ? resolveLocalizedText(value, locale).trim() : "";
}

function visibleIngredients(result: FormulationResult | null) {
  return (result?.supplementBreakdown ?? [])
    .filter((ingredient) => ingredient.safety?.visibility !== "hidden")
    .filter((ingredient) => ingredient.status !== "review");
}

function safeFilename(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "order";
}

export function retailPlanInsertFilename(orderNumber: string) {
  return `plan-insert-${safeFilename(orderNumber)}.pdf`;
}

function partnerLocationLabel(countryCode: string | null) {
  const cleaned = text(countryCode).toUpperCase();

  return cleaned || null;
}

function firstNameFromName(name: string | null) {
  const cleaned = text(name);

  if (!cleaned) {
    return "there";
  }

  return cleaned.split(/\s+/)[0] || cleaned;
}

function formatOrderDate(value: Date | string | null, locale: Locale) {
  const date = value ? new Date(value) : new Date();

  if (!Number.isFinite(date.getTime())) {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date());
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

async function tableExists(sql: Db, tableName: string) {
  const rows = await sql<Array<{ exists: boolean }>>`
    select to_regclass(${tableName}) is not null as exists
  `;

  return Boolean(rows[0]?.exists);
}

async function loadOrderRow(input: Readonly<{
  allowedOrganisationIds?: readonly string[] | null;
  orderId: string;
  sql: Db;
}>) {
  const checkoutReady = await tableExists(input.sql, "public.retail_checkout_payments");
  const organisationFilter =
    input.allowedOrganisationIds && input.allowedOrganisationIds.length > 0
      ? input.sql`and retail_customer_orders.organisation_id = any(${input.allowedOrganisationIds}::uuid[])`
      : input.sql``;
  const checkoutJoin = checkoutReady
    ? input.sql`
        left join lateral (
          select
            retail_checkout_payments.plan_id::text,
            retail_checkout_payments.locale
          from public.retail_checkout_payments
          where retail_checkout_payments.retail_customer_order_id = retail_customer_orders.id
            or retail_checkout_payments.id::text = retail_customer_orders.metadata ->> 'checkoutPaymentId'
          order by retail_checkout_payments.updated_at desc
          limit 1
        ) checkout_payment on true
      `
    : input.sql`
        left join lateral (
          select null::text as plan_id, null::text as locale
        ) checkout_payment on true
      `;

  const rows = await input.sql<OrderRow[]>`
    select
      retail_customer_orders.id::text,
      retail_customer_orders.organisation_id::text,
      organisations.country_code as organisation_country_code,
      organisations.name as organisation_name,
      retail_customer_orders.order_number,
      retail_customer_orders.customer_name,
      retail_customer_orders.customer_email,
      retail_customer_orders.placed_at,
      retail_customer_orders.metadata,
      checkout_payment.plan_id,
      checkout_payment.locale as payment_locale,
      assessments.locale as assessment_locale,
      assessments.first_name as assessment_first_name
    from public.retail_customer_orders
    join public.organisations
      on organisations.id = retail_customer_orders.organisation_id
    ${checkoutJoin}
    left join public.assessments
      on assessments.plan_id::text = checkout_payment.plan_id
    where retail_customer_orders.id = ${input.orderId}::uuid
      ${organisationFilter}
    limit 1
  `;

  return rows[0] ?? null;
}

async function loadOrderLineRows(sql: Db, orderId: string, locale: Locale) {
  const rows = await sql<OrderLineRow[]>`
    select
      retail_customer_order_lines.product_id::text,
      retail_customer_order_lines.quantity_ordered,
      retail_customer_order_lines.metadata,
      products.brand_name,
      products.image_url,
      coalesce(
        nullif(btrim(product_translation_locale.title), ''),
        nullif(btrim(product_translation_default.title), ''),
        products.title
      ) as product_title
    from public.retail_customer_order_lines
    join public.products
      on products.id = retail_customer_order_lines.product_id
    left join public.product_translations product_translation_locale
      on product_translation_locale.product_id = products.id
      and product_translation_locale.locale = ${locale}
      and product_translation_locale.status <> 'missing'
    left join public.product_translations product_translation_default
      on product_translation_default.product_id = products.id
      and product_translation_default.locale = 'en'
      and product_translation_default.status <> 'missing'
    where retail_customer_order_lines.customer_order_id = ${orderId}::uuid
    order by retail_customer_order_lines.created_at asc
  `;

  return rows;
}

function mimeFromPath(value: string) {
  const lower = value.toLowerCase();

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  return "";
}

async function imageBufferToPdfDataUri(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/webp") {
    const png = await sharp(buffer).png().toBuffer();

    return `data:image/png;base64,${png.toString("base64")}`;
  }

  if (mimeType === "image/png" || mimeType === "image/jpeg") {
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  return null;
}

async function localPublicImageDataUri(publicPath: string) {
  const normalized = publicPath.replace(/^\/+/, "");
  const filePath = path.join(process.cwd(), "public", normalized);
  const mimeType = mimeFromPath(filePath);

  if (!mimeType) {
    return null;
  }

  const buffer = await fs.readFile(filePath);

  return imageBufferToPdfDataUri(buffer, mimeType);
}

async function remoteImageDataUri(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(3500)
  });

  if (!response.ok) {
    return null;
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() ||
    mimeFromPath(new URL(url).pathname);

  if (!mimeType.startsWith("image/")) {
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > 4 * 1024 * 1024) {
    return null;
  }

  return imageBufferToPdfDataUri(buffer, mimeType);
}

async function imageDataUri(source: string | null | undefined) {
  const src = text(source);

  if (!src) {
    return null;
  }

  if (!imageCache.has(src)) {
    imageCache.set(src, (async () => {
      try {
        if (src.startsWith("/")) {
          return await localPublicImageDataUri(src);
        }

        if (/^https?:\/\//i.test(src)) {
          return await remoteImageDataUri(src);
        }
      } catch {
        return null;
      }

      return null;
    })());
  }

  return imageCache.get(src)!;
}

function normalizeFoodText(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function managedFoodSeedForText(value: string) {
  const normalized = normalizeFoodText(value);

  return managedFoodSeeds.find((seed) => {
    const names = [
      seed.normalizedName,
      seed.normalizedName.replace(/_/g, " "),
      seed.name.en,
      seed.name.th,
      seed.name["zh-CN"]
    ].map(normalizeFoodText);

    return names.some((name) => normalized.includes(name) || name.includes(normalized));
  });
}

function recommendationOptions(result: FormulationResult | null) {
  return [
    ...(result?.recommendations ?? []),
    ...((result?.productRecommendationOptions ?? []).flatMap((option) =>
      option.recommendations
    ))
  ];
}

function recommendationForProduct(
  result: FormulationResult | null,
  productId: string
) {
  return recommendationOptions(result).find((recommendation) =>
    recommendation.productId === productId ||
    recommendation.id === productId
  ) ?? null;
}

function ingredientLabel(ingredient: FormulationIngredient, locale: Locale) {
  return localized(ingredient.supplement, locale) ||
    localized(ingredient.supplement, "en") ||
    ingredient.id.replace(/[_-]+/g, " ");
}

function ingredientById(result: FormulationResult | null) {
  return new Map(
    visibleIngredients(result).map((ingredient) => [ingredient.id, ingredient])
  );
}

function sentence(value: string) {
  return value.trim().split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
}

function compactText(value: string, maxLength: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const clipped = cleaned.slice(0, maxLength - 1);
  const boundary = Math.max(
    clipped.lastIndexOf(";"),
    clipped.lastIndexOf(","),
    clipped.lastIndexOf(" ")
  );

  return `${clipped.slice(0, boundary > 60 ? boundary : maxLength - 1).trim()}...`;
}

function dosingServingsFromText(value: string) {
  const match = value.match(/^use\s+(\d+(?:\.\d+)?)\s+servings?/i);

  if (!match) {
    return null;
  }

  const servings = Math.max(1, Math.round(Number(match[1]) || 1));

  return servings;
}

function servingDoseText(servings: number) {
  return servings === 1
    ? "Take 1 serving daily with food."
    : `Take ${servings} servings daily with food.`;
}

function splitProductRecommendationText(
  recommendation: RecommendedProduct | null
) {
  const explicit = sentence(recommendation?.description ?? "");
  const servingsFromDescription = dosingServingsFromText(explicit);
  const servings = servingsFromDescription ??
    Math.max(1, Math.round(recommendation?.servingMultiplier ?? 1));
  const take = servingDoseText(servings);

  if (!explicit) {
    return {
      take,
      why: "Matched to your Right Amount formula and packed in this order."
    };
  }

  if (servingsFromDescription) {
    const rationale = explicit.replace(/^use\s+\d+(?:\.\d+)?\s+servings?\s*;?\s*/i, "");

    return {
      take,
      why: compactText(
        rationale || "Matched to your Right Amount formula and packed in this order.",
        126
      )
    };
  }

  return {
    take,
    why: compactText(explicit, 126)
  };
}

function dosingText(recommendation: RecommendedProduct | null) {
  return splitProductRecommendationText(recommendation).take;
}

function productWhy(recommendation: RecommendedProduct | null) {
  return splitProductRecommendationText(recommendation).why;
}

async function productRows(input: Readonly<{
  lines: readonly OrderLineRow[];
  locale: Locale;
  result: FormulationResult | null;
}>) {
  const ingredientMap = ingredientById(input.result);

  return Promise.all(input.lines.slice(0, maxProductCards).map(async (line) => {
    const recommendation = recommendationForProduct(input.result, line.product_id);
    const covers = (recommendation?.covers ?? [])
      .map((id) => ingredientMap.get(id))
      .filter((ingredient): ingredient is FormulationIngredient => Boolean(ingredient))
      .map((ingredient) => ingredientLabel(ingredient, input.locale))
      .slice(0, 3);

    return {
      brandName: line.brand_name,
      covers,
      imageDataUri: await imageDataUri(line.image_url),
      productId: line.product_id,
      quantity: Math.max(1, Math.round(Number(line.quantity_ordered) || 1)),
      take: dosingText(recommendation),
      title: line.product_title,
      why: productWhy(recommendation)
    };
  }));
}

function supportLabelsFromIds(
  ids: readonly string[],
  ingredients: Map<string, FormulationIngredient>,
  locale: Locale
) {
  return ids
    .map((id) => ingredients.get(id))
    .filter((ingredient): ingredient is FormulationIngredient => Boolean(ingredient))
    .map((ingredient) => ingredientLabel(ingredient, locale))
    .slice(0, 2);
}

async function foodRowsFromFoodGapSupport(
  items: readonly FoodGapSupportItem[],
  result: FormulationResult | null,
  locale: Locale
): Promise<RetailPlanInsertFood[]> {
  const ingredients = ingredientById(result);

  return Promise.all(items.slice(0, maxFoodCards).map(async (item) => ({
    category: localized(item.category, locale) || localized(item.category, "en"),
    foodId: item.foodId,
    imageDataUri: await imageDataUri(item.imagePath),
    name: localized(item.food, locale) || localized(item.food, "en"),
    rationale: localized(item.rationale, locale) || localized(item.rationale, "en"),
    serving: localized(item.serving, locale) || localized(item.frequency, locale),
    supports: supportLabelsFromIds(item.gapNeedIds, ingredients, locale)
  })));
}

async function foodRowsFromGuidance(
  items: readonly FoodGuidanceItem[],
  locale: Locale
): Promise<RetailPlanInsertFood[]> {
  return Promise.all(items
    .filter((item) => item.safety?.visibility !== "hidden")
    .slice(0, maxFoodCards)
    .map(async (item) => {
      const name = localized(item.food, locale) || localized(item.food, "en");
      const seed = managedFoodSeedForText(`${item.foodId ?? ""} ${name}`);
      const imagePath = item.imagePath ?? seed?.imagePath ?? null;

      return {
        category:
          localized(item.category, locale) ||
          (seed ? localizedManagedFoodSeedText(seed, "category", locale) : ""),
        foodId: item.foodId ?? item.id,
        imageDataUri: await imageDataUri(imagePath),
        name,
        rationale: localized(item.rationale, locale) || localized(item.rationale, "en"),
        serving: localized(item.serving, locale) || localized(item.frequency, locale),
        supports: item.nutrientTags?.slice(0, 2).map((tag) =>
          tag.replace(/[_-]+/g, " ")
        ) ?? []
      };
    }));
}

async function foodRows(result: FormulationResult | null, locale: Locale) {
  const variant = result?.foodGapSupport?.variants.balanced ??
    result?.foodGapSupport?.variants.compact ??
    null;

  if (variant?.items.length) {
    return foodRowsFromFoodGapSupport(variant.items, result, locale);
  }

  return foodRowsFromGuidance(result?.foodGuidance ?? [], locale);
}

function localeForInsert(
  requested: Locale | null | undefined,
  order: OrderRow
): Locale {
  const candidates = [
    requested,
    order.payment_locale,
    order.assessment_locale
  ];

  for (const candidate of candidates) {
    if (isLocale(candidate)) {
      return candidate;
    }
  }

  return "en";
}

export async function loadRetailPlanInsertData(input: Readonly<{
  allowedOrganisationIds?: readonly string[] | null;
  locale?: Locale | null;
  orderId: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(input.orderId)) {
    return null;
  }

  const order = await loadOrderRow({
    allowedOrganisationIds: input.allowedOrganisationIds,
    orderId: input.orderId,
    sql
  });

  if (!order?.plan_id || !isUuid(order.plan_id)) {
    return null;
  }

  const locale = localeForInsert(input.locale, order);
  const [result, lines, brandMarkDataUri] = await Promise.all([
    getStoredFormulationResult(order.plan_id, { locale, mode: "full" }),
    loadOrderLineRows(sql, order.id, locale),
    imageDataUri("/v11/brand-mark.png")
  ]);
  const planUrl = `${siteBaseUrl()}${nutritionRevealPath(locale, order.plan_id)}`;
  const token = await createCustomerLineConnectToken({
    expiresInMinutes: panyaInsertExpiryMinutes,
    planId: order.plan_id,
    retailCustomerOrderId: order.id,
    source: "shipping_insert"
  });
  const command = `MN ${token.code}`;
  const panyaLineUrl = buildLineOfficialAccountMessageUrl(command);
  const [panyaQrDataUri, revealQrDataUri, products, foods] = await Promise.all([
    QRCode.toDataURL(panyaLineUrl, { margin: 1, width: 220 }),
    QRCode.toDataURL(planUrl, { margin: 1, width: 220 }),
    productRows({ lines, locale, result }),
    foodRows(result, locale)
  ]);

  return {
    brandMarkDataUri,
    customerFirstName:
      text(order.assessment_first_name) || firstNameFromName(order.customer_name),
    customerName: order.customer_name,
    foodRows: foods,
    generatedAt: new Date().toISOString(),
    locale,
    orderDateLabel: formatOrderDate(order.placed_at, locale),
    orderId: order.id,
    orderNumber: order.order_number,
    organisationName: order.organisation_name,
    partnerLocationLabel: partnerLocationLabel(order.organisation_country_code),
    panyaCode: token.code,
    panyaExpiresAt: token.expiresAt,
    panyaLineUrl,
    panyaQrDataUri,
    planId: order.plan_id,
    planUrl,
    productRows: products,
    revealQrDataUri
  } satisfies RetailPlanInsertData;
}

const colors = {
  cream: "#F6F0E2",
  gold: "#B08A3E",
  green: "#2F7D55",
  ink: "#14304B",
  line: "#E2D7BD",
  sage: "#DBE5D7",
  soft: "#3D4F60"
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: colors.soft,
    flexDirection: "row",
    fontFamily: "Helvetica",
    fontSize: 10
  },
  panel: {
    backgroundColor: colors.cream,
    borderColor: colors.gold,
    borderStyle: "solid",
    borderWidth: 1,
    height: "100%",
    padding: 28,
    position: "relative",
    width: "50%"
  },
  panelDivider: {
    borderLeftColor: "#d6c9a9",
    borderLeftStyle: "dashed",
    borderLeftWidth: 1
  },
  center: {
    alignItems: "center",
    textAlign: "center"
  },
  eyebrow: {
    color: colors.green,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 2.1,
    textTransform: "uppercase"
  },
  brandMark: {
    height: 44,
    marginBottom: 8,
    objectFit: "contain",
    width: 44
  },
  wordmark: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: 700
  },
  tagline: {
    color: colors.gold,
    fontSize: 8,
    letterSpacing: 2.4,
    marginTop: 4,
    textTransform: "uppercase"
  },
  frontTitle: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1.08,
    marginBottom: 12
  },
  preparedLabel: {
    color: colors.soft,
    fontSize: 9,
    letterSpacing: 0.8,
    marginTop: 22
  },
  preparedName: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: 700,
    marginTop: 4
  },
  preparedMeta: {
    color: colors.gold,
    fontSize: 9,
    fontWeight: 700,
    marginTop: 6
  },
  pharmacist: {
    color: "#8a7f63",
    fontSize: 8,
    lineHeight: 1.45,
    marginTop: "auto",
    maxWidth: 230
  },
  spacer: {
    flexGrow: 1
  },
  qrWrap: {
    flexDirection: "row",
    gap: 18,
    justifyContent: "center"
  },
  qrCard: {
    alignItems: "center",
    width: 132
  },
  qrTile: {
    backgroundColor: "#ffffff",
    borderColor: colors.gold,
    borderRadius: 8,
    borderWidth: 1,
    height: 112,
    padding: 8,
    width: 112
  },
  qrImage: {
    height: "100%",
    objectFit: "contain",
    width: "100%"
  },
  qrTitle: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.2,
    marginTop: 9,
    textAlign: "center"
  },
  qrSub: {
    color: "#8a7f63",
    fontSize: 8,
    lineHeight: 1.35,
    marginTop: 3,
    textAlign: "center"
  },
  safetyBox: {
    backgroundColor: colors.sage,
    borderRadius: 7,
    color: "#786d53",
    fontSize: 7.6,
    lineHeight: 1.45,
    marginTop: "auto",
    padding: 9
  },
  trust: {
    color: colors.green,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 0.8,
    marginTop: 9,
    textAlign: "center",
    textTransform: "uppercase"
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: 700,
    lineHeight: 1.08,
    marginBottom: 10
  },
  productSectionTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1.1,
    marginBottom: 8,
    maxWidth: 292
  },
  lede: {
    color: colors.soft,
    fontSize: 10,
    lineHeight: 1.45,
    marginBottom: 12
  },
  foodCard: {
    backgroundColor: "#ffffff",
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden"
  },
  foodImage: {
    height: 92,
    objectFit: "cover",
    width: "100%"
  },
  foodBody: {
    padding: 10
  },
  foodName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: 700
  },
  foodReason: {
    color: colors.green,
    fontSize: 8.5,
    fontWeight: 700,
    lineHeight: 1.3,
    marginTop: 3,
    textTransform: "uppercase"
  },
  foodRationale: {
    color: "#8a7f63",
    fontSize: 8.3,
    lineHeight: 1.35,
    marginTop: 4
  },
  doseList: {
    flexGrow: 1,
    flexShrink: 1
  },
  doseRow: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 78,
    paddingBottom: 8,
    paddingRight: 8,
    paddingTop: 8
  },
  thumb: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: colors.line,
    borderRadius: 7,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    overflow: "hidden",
    width: 46
  },
  thumbImage: {
    height: "100%",
    objectFit: "contain",
    padding: 3,
    width: "100%"
  },
  thumbFallback: {
    color: colors.green,
    fontSize: 12,
    fontWeight: 700
  },
  productBody: {
    flexShrink: 1,
    paddingRight: 8,
    width: 286
  },
  productName: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.18
  },
  covers: {
    color: colors.green,
    fontSize: 7.4,
    fontWeight: 700,
    lineHeight: 1.25,
    marginTop: 3,
    textTransform: "uppercase"
  },
  take: {
    color: colors.ink,
    fontSize: 8.8,
    fontWeight: 700,
    lineHeight: 1.22,
    marginTop: 4
  },
  why: {
    color: "#8a7f63",
    fontSize: 7.4,
    lineHeight: 1.28,
    marginTop: 3
  },
  doseFoot: {
    borderTopColor: colors.gold,
    borderTopWidth: 1,
    color: "#786d53",
    fontSize: 7.6,
    lineHeight: 1.4,
    marginTop: 10,
    paddingTop: 8
  },
  emptyState: {
    backgroundColor: "#ffffff",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: "#8a7f63",
    fontSize: 9,
    lineHeight: 1.45,
    padding: 14
  }
});

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "MN";
}

function FrontCover({ data }: { data: RetailPlanInsertData }) {
  const partnerName = data.organisationName || "your retail partner";
  const partnerLocation = data.partnerLocationLabel
    ? `, ${data.partnerLocationLabel}`
    : "";

  return (
    <View style={[styles.panel, styles.panelDivider, styles.center]}>
      {data.brandMarkDataUri ? (
        <PdfImageWithAlt
          alt="MattaNutra brand mark"
          src={data.brandMarkDataUri}
          style={styles.brandMark}
        />
      ) : null}
      <InsertText style={styles.wordmark}>MattaNutra</InsertText>
      <InsertText style={styles.tagline}>Knowing the Right Amount</InsertText>
      <View style={styles.spacer} />
      <InsertText style={[styles.eyebrow, { marginBottom: 10 }]}>Mattannuta</InsertText>
      <InsertText style={styles.frontTitle}>Your Right Amount{"\n"}has arrived.</InsertText>
      <InsertText>Thank you for choosing MattaNutra.</InsertText>
      <InsertText style={styles.preparedLabel}>Prepared for</InsertText>
      <InsertText style={styles.preparedName}>Khun {data.customerFirstName}</InsertText>
      <InsertText style={styles.preparedMeta}>
        Order {data.orderNumber} - {data.orderDateLabel}
      </InsertText>
      <View style={styles.spacer} />
      <InsertText style={styles.pharmacist}>
        Hand-checked and packed by {partnerName}{partnerLocation}
      </InsertText>
    </View>
  );
}

function BackCover({ data }: { data: RetailPlanInsertData }) {
  return (
    <View style={[styles.panel, styles.center]}>
      <InsertText style={styles.eyebrow}>Stay connected</InsertText>
      <View style={styles.spacer} />
      <View style={styles.qrWrap}>
        <View style={styles.qrCard}>
          <View style={styles.qrTile}>
            <PdfImageWithAlt
              alt="Panya LINE QR code"
              src={data.panyaQrDataUri}
              style={styles.qrImage}
            />
          </View>
          <InsertText style={styles.qrTitle}>Ask Panya on LINE</InsertText>
          <InsertText style={styles.qrSub}>
            Your plan, explained anytime. Code {data.panyaCode}
          </InsertText>
        </View>
        <View style={styles.qrCard}>
          <View style={styles.qrTile}>
            <PdfImageWithAlt
              alt="Plan QR code"
              src={data.revealQrDataUri}
              style={styles.qrImage}
            />
          </View>
          <InsertText style={styles.qrTitle}>Open your plan</InsertText>
          <InsertText style={styles.qrSub}>
            Revisit your personalized Right Amount on the web
          </InsertText>
        </View>
      </View>
      <InsertText style={[styles.lede, { marginTop: 18, textAlign: "center" }]}>
        Bodies change. Re-check your Right Amount in 60 days.
      </InsertText>
      <View style={styles.spacer} />
      <InsertText style={styles.safetyBox}>
        Wellness information only. Share this plan with a physician or
        pharmacist if you use medication, are pregnant or breastfeeding, have a
        medical condition, or your situation changes.
      </InsertText>
      <InsertText style={styles.trust}>
        Registered products - Every batch verified
      </InsertText>
    </View>
  );
}

function FoodPanel({ data }: { data: RetailPlanInsertData }) {
  return (
    <View style={styles.panel}>
      <InsertText style={styles.eyebrow}>Food and supplements, together</InsertText>
      <InsertText style={[styles.sectionTitle, { marginTop: 12 }]}>
        The best source is sometimes on your plate.
      </InsertText>
      <InsertText style={styles.lede}>
        Some of what your plan needs is already at the table. Top up at dinner,
        or top up from the bottle - either way, you are knowing, not guessing.
      </InsertText>
      {data.foodRows.length > 0 ? data.foodRows.map((food) => (
        <View key={food.foodId} style={styles.foodCard}>
          {food.imageDataUri ? (
            <PdfImageWithAlt
              alt={food.name}
              src={food.imageDataUri}
              style={styles.foodImage}
            />
          ) : (
            <View style={[styles.foodImage, styles.center]}>
              <InsertText style={styles.thumbFallback}>{initials(food.name)}</InsertText>
            </View>
          )}
          <View style={styles.foodBody}>
            <InsertText style={styles.foodName}>{food.name}</InsertText>
            <InsertText style={styles.foodReason}>
              {food.supports.length
                ? food.supports.join(" - ")
                : food.category || "Food-level support"}
            </InsertText>
            <InsertText style={styles.foodRationale}>
              {food.serving ? `${food.serving}. ` : ""}{food.rationale}
            </InsertText>
          </View>
        </View>
      )) : (
        <InsertText style={styles.emptyState}>
          Your full plan remains available online. Food support can be reviewed
          with Panya whenever you need a practical meal idea.
        </InsertText>
      )}
      <InsertText style={[styles.foodRationale, { marginTop: "auto" }]}>
        Foods matched to your plan and shown as gentle support beside measured
        supplement dosing.
      </InsertText>
    </View>
  );
}

function ProductPanel({ data }: { data: RetailPlanInsertData }) {
  return (
    <View style={[styles.panel, styles.panelDivider]}>
      <InsertText style={styles.eyebrow}>Your packed Right Amount</InsertText>
      <InsertText style={[styles.productSectionTitle, { marginTop: 12 }]}>
        How these products fit your formula.
      </InsertText>
      <View style={styles.doseList}>
        {data.productRows.length > 0 ? data.productRows.map((product) => (
          <View key={product.productId} style={styles.doseRow}>
            <View style={styles.thumb}>
              {product.imageDataUri ? (
                <PdfImageWithAlt
                  alt={product.title}
                  src={product.imageDataUri}
                  style={styles.thumbImage}
                />
              ) : (
                <InsertText style={styles.thumbFallback}>
                  {initials(product.title)}
                </InsertText>
              )}
            </View>
            <View style={styles.productBody}>
              <InsertText style={styles.productName}>
                {product.quantity > 1 ? `${product.quantity} x ` : ""}
                {product.title}
              </InsertText>
              <InsertText style={styles.covers}>
                {compactText(
                  product.covers.length
                    ? product.covers.join(" - ")
                    : product.brandName || "Matched product",
                  58
                )}
              </InsertText>
              <InsertText style={styles.take}>{product.take}</InsertText>
              <InsertText style={styles.why}>{product.why}</InsertText>
            </View>
          </View>
        )) : (
          <InsertText style={styles.emptyState}>
            Product dosing is available in your online reveal page. Ask Panya if
            you want help reading the product labels.
          </InsertText>
        )}
      </View>
      <InsertText style={styles.doseFoot}>
        Follow product labels and pharmacist advice. Do not combine with other
        supplements containing the same ingredients unless advised.
      </InsertText>
    </View>
  );
}

function RetailPlanInsertDocument({ data }: { data: RetailPlanInsertData }) {
  return (
    <Document
      author="MattaNutra"
      subject={`Personalized shipping insert for ${data.orderNumber}`}
      title={`MattaNutra plan insert ${data.orderNumber}`}
    >
      <Page orientation="landscape" size="A4" style={styles.page}>
        <BackCover data={data} />
        <FrontCover data={data} />
      </Page>
      <Page orientation="landscape" size="A4" style={styles.page}>
        <FoodPanel data={data} />
        <ProductPanel data={data} />
      </Page>
    </Document>
  );
}

export async function renderRetailPlanInsertPdf(data: RetailPlanInsertData) {
  return renderToBuffer(<RetailPlanInsertDocument data={data} />);
}

export async function renderRetailPlanInsertPdfForOrder(input: Readonly<{
  allowedOrganisationIds?: readonly string[] | null;
  locale?: Locale | null;
  orderId: string;
}>) {
  const data = await loadRetailPlanInsertData(input);

  if (!data) {
    return null;
  }

  return {
    buffer: await renderRetailPlanInsertPdf(data),
    data,
    filename: retailPlanInsertFilename(data.orderNumber)
  };
}
