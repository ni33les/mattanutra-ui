import { notFound, redirect } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type LocalizedAdminAliasPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function dashboardAliasUrl(
  locale: Locale,
  query: Record<string, string | string[] | undefined>
) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      return;
    }

    if (value !== undefined) {
      params.set(key, value);
    }
  });

  return `/${locale}/admin/dashboard${params.size > 0 ? `?${params.toString()}` : ""}`;
}

export default async function LocalizedAdminAliasPage({
  params,
  searchParams
}: LocalizedAdminAliasPageProps) {
  const [{ locale: rawLocale }, query] = await Promise.all([
    params,
    searchParams
  ]);

  if (!isLocale(rawLocale)) {
    notFound();
  }

  redirect(dashboardAliasUrl(rawLocale, query));
}
