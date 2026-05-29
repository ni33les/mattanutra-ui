import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminLogin } from "@/components/admin-login";
import { isLocale, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false
  },
  title: "MattaNutra Admin Access"
};

type AdminLoginPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNextPath(locale: Locale, value: string | undefined) {
  if (!value || value.startsWith("//")) {
    return `/${locale}/admin/dashboard`;
  }

  if (value.startsWith(`/${locale}/admin/`) || value === `/${locale}/admin/dashboard`) {
    return value;
  }

  if (value.startsWith("/admin/")) {
    return value;
  }

  return `/${locale}/admin/dashboard`;
}

export default async function AdminLoginPage({
  params,
  searchParams
}: AdminLoginPageProps) {
  const [{ locale: rawLocale }, query] = await Promise.all([
    params,
    searchParams
  ]);

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;

  return (
    <AdminLogin
      accessToken={firstParam(query.access_token) ?? ""}
      email={firstParam(query.email) ?? ""}
      inviteToken={firstParam(query.invite) ?? ""}
      locale={locale}
      nextPath={safeNextPath(locale, firstParam(query.next))}
    />
  );
}
