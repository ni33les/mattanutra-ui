import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";
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

  redirect(
    `/${rawLocale}/basket/checkout?mode=agentic&order=${encodeURIComponent(checkoutAccess)}`
  );
}
