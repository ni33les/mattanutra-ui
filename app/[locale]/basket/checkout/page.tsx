import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProductBasketCheckoutPanel } from "@/components/retail-checkout/product-basket-checkout-panel";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { loadAgenticBasketCheckout } from "@/lib/agentic/commerce/basket-checkout";
import { isUuid } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { getNamespace } from "@/lib/i18n-messages";
import { nutritionRevealPath } from "@/lib/nutrition-paths";
import { localizedRouteMetadata } from "@/lib/seo";
import { stripePaymentConfig } from "@/lib/stripe-payment-config";
import { stripePublishableKey } from "@/lib/stripe-payments";

type BasketCheckoutPageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    attempt?: string;
    mode?: string;
    order?: string;
    paymentStatus?: string;
    plan?: string;
    reason?: string;
    removed?: string;
    retailer?: string;
    selected?: string;
    stateVersion?: string;
  }>;
}>;

type BasketCheckoutCopy = Readonly<{
  back: string;
  body: string;
  empty: string;
  eyebrow: string;
  title: string;
}>;

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
  selectedItemIds: readonly string[],
  locale: Locale
) {
  const sql = getSql();

  if (!sql || selectedItemIds.length < 1) {
    return [];
  }

  const rows = await sql<Array<{
    currency: string | null;
    image_url: string | null;
    product_id: string;
    title: string;
    unit_price_amount: string | number | null;
  }>>`
    select distinct on (product_recommendation_items.product_id)
      product_recommendation_items.product_id::text,
      coalesce(
        nullif(product_translation_locale.title, ''),
        nullif(product_translation_en.title, ''),
        nullif(products.title, '')
      ) as title,
      coalesce(products.image_url, product_recommendation_items.image_url) as image_url,
      coalesce(
        product_recommendation_items.unit_price_amount,
        product_recommendation_items.price_amount
      ) as unit_price_amount,
      product_recommendation_items.currency
    from public.product_recommendation_items
    join public.product_recommendation_runs
      on product_recommendation_runs.id = product_recommendation_items.run_id
    join public.products
      on products.id = product_recommendation_items.product_id
    left join public.product_translations product_translation_locale
      on product_translation_locale.product_id = products.id
      and product_translation_locale.locale = ${locale}
      and product_translation_locale.status <> 'missing'
    left join public.product_translations product_translation_en
      on product_translation_en.product_id = products.id
      and product_translation_en.locale = 'en'
      and product_translation_en.status <> 'missing'
    where product_recommendation_runs.plan_id = ${planId}::uuid
      and product_recommendation_items.product_id = any(${selectedItemIds}::uuid[])
    order by product_recommendation_items.product_id,
      product_recommendation_runs.generated_at desc,
      product_recommendation_items.rank asc
  `;
  const byId = new Map(rows.map((row) => [row.product_id, row]));

  return selectedItemIds.map((id) => {
    const row = byId.get(id);
    const amount = row?.unit_price_amount == null ? null : Number(row.unit_price_amount);

    return {
      currency: row?.currency ?? null,
      id,
      imageUrl: row?.image_url ?? null,
      name: row?.title?.trim() || "",
      unitPriceAmount:
        amount != null && Number.isFinite(amount) && amount > 0 ? amount : null
    };
  });
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: BasketCheckoutPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  return localizedRouteMetadata({
    indexable: false,
    locale,
    routeKey: "basketCheckout"
  });
}

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
  const checkoutMode = query.mode === "agentic" ? "agentic" : "web";
  const checkoutAccess =
    typeof query.order === "string" ? query.order.trim() : "";
  const agenticBasket =
    checkoutMode === "agentic"
      ? await loadAgenticBasketCheckout({
          checkoutAccess,
          locale
        })
      : null;

  if (checkoutMode === "agentic") {
    if (!agenticBasket) {
      notFound();
    }

    if (agenticBasket.paid && agenticBasket.trackingPath) {
      redirect(agenticBasket.trackingPath);
    }
  }

  const planId =
    agenticBasket?.planId ??
    (typeof query.plan === "string" && isUuid(query.plan) ? query.plan : null);
  const selectedItemIds = agenticBasket
    ? [...agenticBasket.selectedItemIds]
    : parseIds(query.selected);
  const removedItemIds = parseIds(query.removed);
  const selectedRetailerOrganisationId =
    agenticBasket?.selectedRetailerOrganisationId ??
    (typeof query.retailer === "string" && isUuid(query.retailer)
      ? query.retailer
      : null);

  if (!planId) {
    redirect(`/${locale}/nutrition`);
  }

  const dictionary = getDictionary(locale);
  const labels = getNamespace<BasketCheckoutCopy>(locale, "customer.basketCheckout");
  const currentPath = `/${locale}/basket/checkout`;
  const selectedProducts = agenticBasket
    ? agenticBasket.selectedProducts
    : await selectedProductsForCheckout(
        planId,
        selectedItemIds,
        locale
      );
  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:px-8 lg:py-16">
        {checkoutMode === "agentic" ? null : (
          <Link
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[var(--mn-teal-deep)]"
            href={nutritionRevealPath(locale, planId)}
          >
            <ArrowLeft aria-hidden className="size-4" />
            {labels.back}
          </Link>
        )}
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
            agenticOrderId={agenticBasket?.agenticOrderId ?? null}
            destinationCountry={agenticBasket?.destinationCountry ?? null}
            frozenLines={agenticBasket?.frozenLines ?? []}
            initialQuotePreview={agenticBasket?.quotePreview ?? null}
            locale={locale}
            mockPayment={stripePaymentConfig().mode === "mock"}
            mode={checkoutMode}
            orderReference={agenticBasket?.orderReference ?? null}
            planId={planId}
            publishableKey={stripePublishableKey()}
            removedItemIds={removedItemIds}
            selectedRetailerOrganisationId={selectedRetailerOrganisationId}
            selectedItemIds={selectedItemIds}
            selectedProducts={selectedProducts}
            shippingAmount={agenticBasket?.shippingAmount ?? null}
          />
        )}
      </section>
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
