import { getSql } from "@/lib/db";
import { toJsonValue } from "@/lib/assessment-store";
import { clearProductRecommendationCandidateCache } from "./admin-products.ts";
import { loadAdminProductRow } from "./admin-product-read-model.ts";
import { cleanNullableText, isUuidValue } from "./admin-product-helpers.ts";

// Offer (link) management for products.
// Extracted as part of Sprint 2 split of admin-products.

export type UpsertProductOfferInput = Readonly<{
  actor?: string | null;
  availabilityStatus?: string;
  commissionRate?: number | null;
  currency?: string | null;
  linkType?: "affiliate" | "direct";
  network?: string | null;
  platform?: string | null;
  priceAmount?: number | null;
  priority?: number;
  productId: string;
  status?: string;
  trackingId?: string | null;
  url: string;
}>;

export type RemoveProductOfferInput = Readonly<{
  actor?: string | null;
  offerId: string;
  productId: string;
}>;

export async function upsertProductOffer(
  input: UpsertProductOfferInput
) {
  const sql = getSql();
  const productId = isUuidValue(input.productId) ? input.productId : null;
  const url = input.url.trim();

  if (!sql || !productId) {
    throw new Error("Product link requires a valid product");
  }

  if (!url) {
    throw new Error("Product link URL is required");
  }

  const rows = await sql<Array<{ id: string }>>`
    insert into public.product_offers (
      product_id,
      network,
      url,
      link_type,
      platform,
      commission_rate,
      admin_priority,
      price_amount,
      currency,
      availability_status,
      tracking_id,
      status,
      created_at,
      updated_at
    )
    values (
      ${productId}::uuid,
      ${cleanNullableText(input.network, 100)},
      ${url},
      ${input.linkType ?? "affiliate"},
      ${cleanNullableText(input.platform, 100)},
      ${input.commissionRate ?? null},
      ${Math.round(input.priority ?? 0)},
      ${input.priceAmount ?? null},
      ${cleanNullableText(input.currency, 20) ?? "THB"},
      ${input.availabilityStatus ?? "unknown"},
      ${cleanNullableText(input.trackingId, 500)},
      ${input.status ?? "active"},
      now(),
      now()
    )
    on conflict (product_id, url)
    do update set
      network = excluded.network,
      link_type = excluded.link_type,
      platform = excluded.platform,
      commission_rate = excluded.commission_rate,
      admin_priority = excluded.admin_priority,
      price_amount = excluded.price_amount,
      currency = excluded.currency,
      availability_status = excluded.availability_status,
      tracking_id = excluded.tracking_id,
      status = excluded.status,
      updated_at = now()
    returning id::text
  `;
  const offerId = rows[0]?.id;

  await sql`
    insert into public.product_admin_audit (
      product_id,
      action,
      actor,
      after_payload
    )
    values (
      ${productId}::uuid,
      'product_offer_upserted',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue({
        commissionRate: input.commissionRate ?? null,
        offerId,
        linkType: input.linkType ?? "affiliate",
        platform: input.platform ?? null,
        priority: input.priority ?? 0,
        url
      }))}::jsonb
    )
  `;

  clearProductRecommendationCandidateCache();

  return loadAdminProductRow(productId);
}

export async function removeProductOffer(
  input: RemoveProductOfferInput
) {
  const sql = getSql();
  const productId = isUuidValue(input.productId) ? input.productId : null;
  const offerId = isUuidValue(input.offerId) ? input.offerId : null;

  if (!sql || !productId || !offerId) {
    throw new Error("Product link removal requires valid ids");
  }

  await sql`
    update public.product_offers
    set
      status = 'inactive',
      updated_at = now()
    where id = ${offerId}::uuid
      and product_id = ${productId}::uuid
  `;

  await sql`
    insert into public.product_admin_audit (
      product_id,
      action,
      actor,
      after_payload
    )
    values (
      ${productId}::uuid,
      'product_offer_removed',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue({ offerId, url: null }))}::jsonb
    )
  `;

  clearProductRecommendationCandidateCache();

  return loadAdminProductRow(productId);
}
