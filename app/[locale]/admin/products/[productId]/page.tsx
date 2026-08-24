import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ProductAdminShell } from "@/components/admin/product-admin-shell";
import { AdminProductDetailView } from "@/components/admin/product-view";
import { content } from "@/components/admin/dashboard-content";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  clientAdminSessionContext,
  resolveAdminSession
} from "@/lib/admin-access";
import { normalizeAdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import { normalizeAdminDashboardRange } from "@/lib/admin-dashboard-data";
import { isUuidValue } from "@/lib/admin-product-helpers";
import { getAdminProductDetailData } from "@/lib/admin-products";
import { adminViewAllowed } from "@/lib/admin-rbac";
import { isLocale, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false
  },
  title: "MattaNutra Product Admin"
};

type ProductDetailPageProps = Readonly<{
  params: Promise<{
    locale: string;
    productId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function productDetailUrl(
  locale: Locale,
  productId: string,
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

  return `/${locale}/admin/products/${productId}${params.size > 0 ? `?${params.toString()}` : ""}`;
}

export default async function ProductDetailPage({
  params,
  searchParams
}: ProductDetailPageProps) {
  const [{ locale: rawLocale, productId }, query] = await Promise.all([
    params,
    searchParams
  ]);

  if (!isLocale(rawLocale) || !isUuidValue(productId)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const accessToken = firstParam(query.access_token);
  const range = normalizeAdminDashboardRange(query.range);
  const filters = normalizeAdminDashboardFilters(query);
  const cookieStore = await cookies();
  const sessionContext = await resolveAdminSession({
    csrfToken: cookieStore.get(adminCsrfCookieName)?.value,
    sessionCookie: cookieStore.get(adminSessionCookieName)?.value
  });
  const adminContext = sessionContext;

  if (!adminContext) {
    const loginParams = new URLSearchParams({
      next: productDetailUrl(locale, productId, query)
    });

    if (accessToken) {
      loginParams.set("access_token", accessToken);
    }

    redirect(`/${locale}/admin/login?${loginParams.toString()}`);
  }

  if (!adminViewAllowed(
    adminContext,
    "products",
    adminContext.effectiveOrganisation.type
  )) {
    redirect(`/${locale}/admin/dashboard?view=glance`);
  }

  const productDetailData = await getAdminProductDetailData(productId, range);

  if (!productDetailData) {
    notFound();
  }

  return (
    <ProductAdminShell
      accessToken=""
      adminContext={clientAdminSessionContext(adminContext)}
      filters={filters}
      locale={locale}
      pageTitle={content[locale].pageTitles.products}
      range={range}
    >
      <AdminProductDetailView
        accessToken=""
        data={productDetailData}
        locale={locale}
        productId={productId}
      />
    </ProductAdminShell>
  );
}
