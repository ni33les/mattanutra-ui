import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgenticCheckoutPanel } from "@/components/agentic-checkout-panel";
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

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={`/${locale}/mcp/checkout/${checkoutAccess}`}
        title="MattaNutra"
      />
      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:px-8 lg:py-16">
        <AgenticCheckoutPanel
          checkoutAccess={checkoutAccess}
          country={order.destinationCountry}
          currency={order.currency}
          expired={expired}
          items={items.map((item) => ({
            dailyPills: item.dailyPills,
            form: item.form,
            lineTotalMinor: item.lineTotalMinor,
            productName: item.productName,
            quantity: item.quantity
          }))}
          locale={locale}
          orderReference={order.reference}
          lastResult={
            typeof query.paymentStatus === "string"
              ? `paymentStatus=${query.paymentStatus} attempt=${query.attempt ?? "none"} reason=${query.reason ?? "none"} v${query.stateVersion ?? "?"}`
              : null
          }
          paid={order.paymentStatus === "paid"}
          shippingMinor={shippingMinor}
          subtotalMinor={subtotalMinor}
          taxMinor={taxMinor}
          totalPriceMinor={totalPriceMinor}
        />
      </section>
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
