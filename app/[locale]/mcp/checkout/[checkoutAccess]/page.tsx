import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AgenticCheckoutPanel } from "@/components/agentic-checkout-panel";
import { McpWebsiteCheckoutPanel } from "@/components/mcp-website-checkout-panel";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { hashCapability } from "@/lib/agentic/capabilities";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { localizedRouteMetadata } from "@/lib/seo";
import {
  TH_MOCK_SHIPPING_MINOR,
  TH_MOCK_TAX_MINOR,
  addMinor,
  asMinor,
  asMinorOr
} from "@/lib/agentic/money";
import { redactedOrderCounts } from "@/lib/agentic/qa/counts";
import { loadAgenticCheckoutProducts } from "@/lib/agentic/commerce/checkout-products";
import {
  mcpOrderTrackSuccessPath,
  resolveAgenticPaidTrackingPath
} from "@/lib/agentic/commerce/checkout-return";
import { stripePublishableKey } from "@/lib/stripe-payments";

type PageProps = Readonly<{
  params: Promise<{ checkoutAccess: string; locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  return localizedRouteMetadata({
    indexable: false,
    locale,
    routeKey: "home"
  });
}

export default async function AgenticCheckoutPage({ params, searchParams }: PageProps) {
  const { checkoutAccess, locale: rawLocale } = await params;
  const query = await searchParams;

  if (!isLocale(rawLocale) || checkoutAccess.length < 32) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const runtime = getLiveAgenticRuntime();
  const checkout = await runtime.store.getCheckoutByAccessHash(
    hashCapability(runtime.config.capabilitySecret, checkoutAccess)
  );

  if (!checkout) {
    notFound();
  }

  const order = await runtime.store.getOrder(checkout.orderId);
  const items = await runtime.store.getOrderItems(checkout.orderId);

  if (!order) {
    notFound();
  }

  const sessionId = typeof query.session_id === "string" ? query.session_id : "";
  const paidTracking = await resolveAgenticPaidTrackingPath({
    checkoutAccess,
    locale,
    runtime,
    sessionId: sessionId || undefined
  });

  if (paidTracking) {
    redirect(paidTracking);
  }

  const expired = checkout.expiresAt <= new Date().toISOString();
  const frozen =
    order.frozenPlan && typeof order.frozenPlan === "object"
      ? (order.frozenPlan as Record<string, unknown>)
      : {};
  const shippingMinor = asMinorOr(
    checkout.shippingMinor ?? frozen.shippingMinor,
    TH_MOCK_SHIPPING_MINOR
  );
  const taxMinor = asMinorOr(checkout.taxMinor ?? frozen.taxMinor, TH_MOCK_TAX_MINOR);
  const subtotalMinor =
    frozen.subtotalMinor == null
      ? asMinor(order.totalPriceMinor)
      : asMinor(frozen.subtotalMinor);
  const totalPriceMinor =
    frozen.totalPriceMinor == null
      ? addMinor(subtotalMinor, shippingMinor, taxMinor)
      : asMinor(frozen.totalPriceMinor);
  const queryResult =
    typeof query.paymentStatus === "string"
      ? `paymentStatus=${query.paymentStatus} attempt=${query.attempt ?? "none"} reason=${query.reason ?? "none"} v${query.stateVersion ?? "?"}`
      : null;
  const counts =
    runtime.config.environment === "dev"
      ? await redactedOrderCounts({ orderId: order.id, runtime })
      : null;
  const lastResult = [queryResult, counts ? `TEST-DRIVER EVIDENCE (not payment truth) ${JSON.stringify(counts)}` : null]
    .filter(Boolean)
    .join("\n");
  const websiteCheckout = runtime.config.paymentProvider === "stripe_test";
  const products = websiteCheckout ? await loadAgenticCheckoutProducts(items) : [];
  const major = (minor: number) => asMinor(minor) / 100;
  const successUrl = mcpOrderTrackSuccessPath(locale);

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={`/${locale}/mcp/checkout/${checkoutAccess}`}
        title={dictionary.hero.eyebrow}
      />
      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:px-8 lg:py-16">
        {websiteCheckout ? (
          <McpWebsiteCheckoutPanel
            checkoutAccess={checkoutAccess}
            currency={order.currency}
            destinationCountry={order.destinationCountry}
            expired={expired}
            locale={locale}
            paid={order.paymentStatus === "paid"}
            successUrl={successUrl}
            products={products.map((item) => ({
              id: item.id,
              imageUrl: item.imageUrl,
              name: item.name
            }))}
            publishableKey={stripePublishableKey()}
            quantities={Object.fromEntries(products.map((item) => [item.id, item.quantity]))}
            sellerName={items[0]?.sellerName ?? null}
            shippingAmount={major(shippingMinor)}
            subtotalAmount={major(subtotalMinor)}
            totalAmount={major(totalPriceMinor)}
            unitPrices={Object.fromEntries(
              products.map((item) => [item.id, major(item.unitPriceMinor)])
            )}
          />
        ) : (
          <AgenticCheckoutPanel
            checkoutAccess={checkoutAccess}
            country={order.destinationCountry}
            currency={order.currency}
            expired={expired}
            successUrl={successUrl}
            items={items.map((item) => ({
              dailyPills: item.dailyPills,
              form: item.form,
              lineTotalMinor: item.lineTotalMinor,
              productName: item.productName,
              quantity: item.quantity
            }))}
            locale={locale}
            orderReference={order.reference}
            lastResult={lastResult || null}
            paid={order.paymentStatus === "paid"}
            refundable={
              order.paymentStatus === "paid" ||
              order.paymentStatus === "refunded" ||
              order.paymentStatus === "partially_refunded"
            }
            shippingMinor={shippingMinor}
            subtotalMinor={subtotalMinor}
            taxMinor={taxMinor}
            totalPriceMinor={totalPriceMinor}
          />
        )}
      </section>
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
