import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { nutritionPharmacyPath } from "@/lib/nutrition-paths";
import { pharmacyIdFromParam } from "@/lib/pharmacy-in-store";

function localeFromRequest(
  cookieLocale: string | undefined,
  acceptLanguage: string | null
): Locale {
  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  const accept = acceptLanguage?.toLowerCase() ?? "";

  if (accept.includes("th")) {
    return "th";
  }

  if (accept.includes("zh")) {
    return "zh-CN";
  }

  return defaultLocale;
}

type PharmacyEntryPageProps = Readonly<{
  params: Promise<{
    pharmacyId: string;
  }>;
}>;

export const dynamic = "force-dynamic";

export default async function PharmacyEntryPage({
  params
}: PharmacyEntryPageProps) {
  const { pharmacyId: rawPharmacyId } = await params;
  const pharmacyId = pharmacyIdFromParam(rawPharmacyId) || rawPharmacyId;
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale = localeFromRequest(
    cookieLocale,
    (await headers()).get("accept-language")
  );

  redirect(nutritionPharmacyPath(locale, pharmacyId));
}
