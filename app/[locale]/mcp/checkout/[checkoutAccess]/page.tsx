import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgenticCheckoutPanel } from "@/components/agentic-checkout-panel";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { hashCapability } from "@/lib/agentic/capabilities";
import { getAgenticRuntime } from "@/lib/agentic/runtime";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { localizedRouteMetadata } from "@/lib/seo";

type PageProps = Readonly<{
  params: Promise<{ checkoutAccess: string; locale: string }>;
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

export default async function AgenticCheckoutPage({ params }: PageProps) {
  const { checkoutAccess, locale: rawLocale } = await params;

  if (!isLocale(rawLocale) || checkoutAccess.length < 32) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const runtime = getAgenticRuntime();
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
          paid={order.paymentStatus === "paid"}
          totalPriceMinor={order.totalPriceMinor}
        />
      </section>
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
