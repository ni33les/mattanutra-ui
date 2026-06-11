import { notFound, redirect } from "next/navigation";
import { isLocale, locales, type Locale } from "@/lib/i18n";
import { fulfillRetailCheckoutSession } from "@/lib/retail-product-checkout";

type RetailCheckoutReturnResult = Awaited<ReturnType<typeof fulfillRetailCheckoutSession>>;

type BasketReturnPageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    payment?: string;
    session_id?: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

function fallbackDestination(locale: Locale, planId?: string | null) {
  return planId
    ? `/${locale}/nutrition/reveal?plan=${encodeURIComponent(planId)}`
    : `/${locale}`;
}

export default async function BasketReturnPage({
  params,
  searchParams
}: BasketReturnPageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const query = await searchParams;
  const sessionId = typeof query.session_id === "string" ? query.session_id : "";
  const paymentId = typeof query.payment === "string" ? query.payment : "";

  if (!sessionId && !paymentId) {
    redirect(`/${locale}`);
  }

  let result: RetailCheckoutReturnResult = null;

  try {
    result = await fulfillRetailCheckoutSession({
      paymentId: paymentId || undefined,
      sessionId: sessionId || undefined
    });
  } catch {
    redirect(`/${locale}`);
  }

  if (result?.status === "fulfilled" && result.destination) {
    redirect(result.destination);
  }

  redirect(fallbackDestination(locale, result?.planId));
}
