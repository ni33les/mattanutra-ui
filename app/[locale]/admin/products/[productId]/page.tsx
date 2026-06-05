import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  clientAdminSessionContext,
  type AdminAccessData,
  type AdminSettingsData,
  legacyAdminContext,
  resolveAdminSession
} from "@/lib/admin-access";
import {
  emptyAdminDashboardData,
  normalizeAdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { normalizeAdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import {
  emptyCommunicationsData
} from "@/lib/admin-communications";
import {
  emptyAgentsData,
  emptyVisibilityData
} from "@/lib/admin-execution";
import { emptyFlow } from "@/lib/admin-flow-data";
import { emptyFinancials } from "@/lib/admin-financials";
import { emptyAdminFoodsData } from "@/lib/admin-foods";
import {
  emptyAdminProductsData,
  getAdminProductsData
} from "@/lib/admin-products";
import { emptyAdminRetailStockData } from "@/lib/admin-retail-stock";
import {
  emptyAdminRecommendationInsightsData
} from "@/lib/admin-recommendation-insights";
import { emptyAdminReviewQueueData } from "@/lib/admin-review-queue";
import { emptyAdminSupplementsData } from "@/lib/admin-supplements";
import { emptyAlertsData } from "@/lib/admin-technical";
import {
  emptyCampaignsData,
  emptyContentData,
  emptyLeadsData
} from "@/lib/admin-query-data";
import { adminViewAllowed } from "@/lib/admin-rbac";
import { isLocale, type Locale } from "@/lib/i18n";
import { isUuid } from "@/lib/assessment-store";

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

  if (!isLocale(rawLocale) || !isUuid(productId)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const accessToken = firstParam(query.access_token);
  const cookieStore = await cookies();
  const sessionContext = await resolveAdminSession({
    csrfToken: cookieStore.get(adminCsrfCookieName)?.value,
    sessionCookie: cookieStore.get(adminSessionCookieName)?.value
  });
  const adminContext =
    sessionContext ?? (await legacyAdminContext(accessToken).catch(() => null));

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

  const productsData = await getAdminProductsData(
    normalizeAdminDashboardRange(query.range)
  );

  if (!productsData.rows.some((row) => row.id === productId)) {
    notFound();
  }
  const range = normalizeAdminDashboardRange(query.range);
  const data = emptyAdminDashboardData(range);
  const filters = normalizeAdminDashboardFilters(query);
  const accessData: AdminAccessData | null = null;
  const settingsData: AdminSettingsData | null = null;

  return (
    <AdminDashboard
      accessToken={accessToken ?? ""}
      accessData={accessData}
      adminContext={clientAdminSessionContext(adminContext)}
      alertsData={emptyAlertsData()}
      agentsData={emptyAgentsData()}
      campaignsData={emptyCampaignsData()}
      contentData={emptyContentData()}
      communicationsData={emptyCommunicationsData()}
      data={data}
      financialsData={emptyFinancials(range)}
      filters={filters}
      flowData={emptyFlow(range)}
      foodsData={emptyAdminFoodsData()}
      leadsData={emptyLeadsData()}
      locale={locale}
      productsData={productsData}
      productDetailId={productId}
      retailStockData={emptyAdminRetailStockData()}
      recommendationInsightsData={emptyAdminRecommendationInsightsData(range)}
      reviewQueueData={emptyAdminReviewQueueData()}
      selectedRetailCustomerOrderId={null}
      selectedReviewTaskId={null}
      selectedTaskId={null}
      settingsData={settingsData}
      supplementsData={emptyAdminSupplementsData()}
      visibilityData={emptyVisibilityData()}
      view="products"
    />
  );
}
