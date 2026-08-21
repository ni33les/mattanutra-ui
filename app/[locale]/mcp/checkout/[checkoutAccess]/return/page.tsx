import { notFound, redirect } from "next/navigation";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";
import { resolveAgenticPaidTrackingPath } from "@/lib/agentic/commerce/checkout-return";
import { isLocale, type Locale } from "@/lib/i18n";

type PageProps = Readonly<{
  params: Promise<{ checkoutAccess: string; locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export const dynamic = "force-dynamic";

export default async function AgenticCheckoutReturnPage({
  params,
  searchParams
}: PageProps) {
  const { checkoutAccess, locale: rawLocale } = await params;
  const query = await searchParams;

  if (!isLocale(rawLocale) || checkoutAccess.length < 32) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const sessionId = typeof query.session_id === "string" ? query.session_id : "";
  const dest = await resolveAgenticPaidTrackingPath({
    checkoutAccess,
    locale,
    runtime: getLiveAgenticRuntime(),
    sessionId: sessionId || undefined
  });

  if (dest) {
    redirect(dest);
  }

  redirect(`/${locale}/mcp/checkout/${encodeURIComponent(checkoutAccess)}`);
}
