import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProductBasketCheckoutPanel } from "@/components/retail-checkout/product-basket-checkout-panel";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { isUuid } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { nutritionRevealPath } from "@/lib/nutrition-paths";
import { stripePublishableKey } from "@/lib/stripe-payments";

type BasketCheckoutPageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    plan?: string;
    removed?: string;
    selected?: string;
  }>;
}>;

const copy = {
  en: {
    back: "Review recommendations",
    body:
      "Review your selected products, confirm delivery, and secure your order with Dream Pharmacy. Delivery is free today.",
    empty: "Your basket has no selected products.",
    eyebrow: "Secure checkout",
    title: "Complete your order"
  },
  th: {
    back: "ตรวจสอบคำแนะนำ",
    body:
      "ตรวจสอบสินค้าที่เลือก ยืนยันที่อยู่จัดส่ง และชำระเงินเพื่อให้ Dream Pharmacy เตรียมคำสั่งซื้อของคุณ วันนี้จัดส่งฟรี",
    empty: "ตะกร้าของคุณยังไม่มีสินค้าที่เลือก",
    eyebrow: "ชำระเงินอย่างปลอดภัย",
    title: "ดำเนินการสั่งซื้อสินค้า"
  },
  "zh-CN": {
    back: "查看推荐",
    body: "请核对已选择的产品，确认配送信息，并完成付款以便 Dream Pharmacy 准备订单。今日免配送费。",
    empty: "你的购物篮没有已选择的产品。",
    eyebrow: "安全结账",
    title: "完成你的产品订单"
  }
};

function parseIds(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => isUuid(item));
}

async function selectedProductsForCheckout(
  planId: string,
  selectedItemIds: readonly string[]
) {
  const sql = getSql();

  if (!sql || selectedItemIds.length < 1) {
    return [];
  }

  const rows = await sql<Array<{
    image_url: string | null;
    product_id: string;
    title: string;
  }>>`
    select distinct on (product_recommendation_items.product_id)
      product_recommendation_items.product_id::text,
      coalesce(
        nullif(products.title_en, ''),
        nullif(products.title, ''),
        'Product'
      ) as title,
      coalesce(products.image_url, product_recommendation_items.image_url) as image_url
    from public.product_recommendation_items
    join public.product_recommendation_runs
      on product_recommendation_runs.id = product_recommendation_items.run_id
    join public.products
      on products.id = product_recommendation_items.product_id
    where product_recommendation_runs.plan_id = ${planId}::uuid
      and product_recommendation_items.product_id = any(${selectedItemIds}::uuid[])
    order by product_recommendation_items.product_id,
      product_recommendation_runs.generated_at desc,
      product_recommendation_items.rank asc
  `;
  const byId = new Map(rows.map((row) => [row.product_id, row]));

  return selectedItemIds.map((id) => ({
    id,
    imageUrl: byId.get(id)?.image_url ?? null,
    name: byId.get(id)?.title ?? "Product"
  }));
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export default async function BasketCheckoutPage({
  params,
  searchParams
}: BasketCheckoutPageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const query = await searchParams;
  const planId =
    typeof query.plan === "string" && isUuid(query.plan) ? query.plan : null;
  const selectedItemIds = parseIds(query.selected);
  const removedItemIds = parseIds(query.removed);

  if (!planId) {
    redirect(`/${locale}/nutrition`);
  }

  const dictionary = getDictionary(locale);
  const labels = copy[locale];
  const currentPath = `/${locale}/basket/checkout`;
  const selectedProducts = await selectedProductsForCheckout(
    planId,
    selectedItemIds
  );

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:px-8 lg:py-16">
        <Link
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[var(--mn-teal-deep)]"
          href={nutritionRevealPath(locale, planId)}
        >
          <ArrowLeft aria-hidden className="size-4" />
          {labels.back}
        </Link>
        <div className="mb-8 max-w-3xl">
          <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.18em] text-[var(--mn-teal-deep)]">
            {labels.eyebrow}
          </p>
          <h1 className="mn-hero-title mt-4 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)] sm:text-5xl">
            {labels.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-[var(--mn-ink-soft)]">
            {selectedItemIds.length < 1 ? labels.empty : labels.body}
          </p>
        </div>
        {selectedItemIds.length < 1 ? null : (
          <ProductBasketCheckoutPanel
            locale={locale}
            planId={planId}
            publishableKey={stripePublishableKey()}
            removedItemIds={removedItemIds}
            selectedItemIds={selectedItemIds}
            selectedProducts={selectedProducts}
          />
        )}
      </section>
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
