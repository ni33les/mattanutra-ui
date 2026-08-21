import { getSql } from "@/lib/db";
import { isUuid, parsePublicId } from "@/lib/agentic/contract/ids";
import type { OrderItemRecord } from "@/lib/agentic/store/types";

export type AgenticCheckoutProduct = Readonly<{
  id: string;
  imageUrl: string | null;
  name: string;
  quantity: number;
  unitPriceMinor: number;
}>;

function productUuid(productId: string) {
  return parsePublicId(productId, "prd_") ?? (isUuid(productId) ? productId : null);
}

export async function loadAgenticCheckoutProducts(
  items: readonly OrderItemRecord[],
  locale = "en"
): Promise<readonly AgenticCheckoutProduct[]> {
  const ids = items
    .map((item) => productUuid(item.productId))
    .filter((item): item is string => Boolean(item));
  const sql = getSql();
  const byId = new Map<string, { image_url: string | null; title: string }>();

  if (sql && ids.length > 0) {
    try {
      const rows = await sql<Array<{
        id: string;
        image_url: string | null;
        title: string;
      }>>`
        select
          products.id::text as id,
          products.image_url,
          coalesce(
            nullif(product_translation_locale.title, ''),
            nullif(product_translation_en.title, ''),
            nullif(products.title, '')
          ) as title
        from public.products
        left join public.product_translations product_translation_locale
          on product_translation_locale.product_id = products.id
          and product_translation_locale.locale = ${locale}
          and product_translation_locale.status <> 'missing'
        left join public.product_translations product_translation_en
          on product_translation_en.product_id = products.id
          and product_translation_en.locale = 'en'
          and product_translation_en.status <> 'missing'
        where products.id = any(${ids}::uuid[])
      `;

      for (const row of rows) {
        byId.set(row.id, { image_url: row.image_url, title: row.title });
      }
    } catch {
      // Catalogue lookup is display-only; checkout still proceeds.
    }
  }

  return items.map((item) => {
    const uuid = productUuid(item.productId);
    const found = uuid ? byId.get(uuid) : undefined;

    return {
      id: uuid ?? item.productId,
      imageUrl: found?.image_url ?? null,
      name: found?.title || item.productName,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor
    };
  });
}
