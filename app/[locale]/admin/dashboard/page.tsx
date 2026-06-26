import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  clientAdminSessionContext,
  getAdminAccessData,
  getAdminSettingsData,
  legacyAdminContext,
  resolveAdminSession,
  type AdminAccessData,
  type AdminSettingsData
} from "@/lib/admin-access";
import {
  emptyAdminDashboardData,
  getAdminDashboardData,
  normalizeAdminDashboardRange
} from "@/lib/admin-dashboard-data";
import {
  emptyAdminCustomerInsightsData,
  getAdminCustomerInsightsData
} from "@/lib/admin-customer-insights";
import {
  emptyAdminPlanCoverageSimulationData,
  emptyAdminProductCoverageData,
  getAdminPlanCoverageSimulationData,
  getAdminProductCoverageData,
  normalizeSimulationSampleSize
} from "@/lib/admin-product-coverage";
import {
  emptyCommunicationsData,
  getAdminCommunicationsData
} from "@/lib/admin-communications";
import {
  emptyAdminPanyaData,
  getAdminPanyaData
} from "@/lib/admin-panya";
import { normalizeAdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import {
  emptyAgentsData,
  emptyVisibilityData,
  getAdminAgentsData,
  getAdminTaskVisibilityData
} from "@/lib/admin-execution";
import { emptyFlow, getAdminFlowData } from "@/lib/admin-flow-data";
import {
  emptyFinancials,
  getAdminFinancialsData
} from "@/lib/admin-financials";
import {
  emptyAdminRetailFinancialsData,
  getAdminRetailFinancialsData
} from "@/lib/admin-retail-financials";
import { emptyAdminFoodsData, getAdminFoodsData } from "@/lib/admin-foods";
import {
  emptyAdminProductsData,
  getAdminProductsData
} from "@/lib/admin-products";
import {
  emptyAdminRetailStockData,
  getAdminRetailStockData
} from "@/lib/admin-retail-stock";
import {
  emptyCampaignsData,
  emptyContentData,
  emptyLeadsData,
  getAdminCampaignsData,
  getAdminContentData,
  getAdminLeadsData
} from "@/lib/admin-query-data";
import {
  emptyAdminReviewQueueData,
  getAdminReviewQueueData
} from "@/lib/admin-review-queue";
import {
  emptyAdminSupplementsData,
  getAdminSupplementsData
} from "@/lib/admin-supplements";
import {
  emptyAlertsData,
  getAdminTechnicalAlertsData
} from "@/lib/admin-technical";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  adminViewAllowed,
  firstAllowedAdminView,
  isAdminDashboardView
} from "@/lib/admin-rbac";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false
  },
  title: "MattaNutra Admin"
};

type LocalizedAdminDashboardPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function panyaSectionParam(value: string | string[] | undefined) {
  return firstParam(value) === "configuration" ? "configuration" : "conversations";
}

function countryCodeParam(value: string | string[] | undefined) {
  return firstParam(value) ?? "TH";
}

function dashboardUrl(
  locale: Locale,
  query: Record<string, string | string[] | undefined>,
  overrides?: Record<string, string | undefined>
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

  Object.entries(overrides ?? {}).forEach(([key, value]) => {
    if (value === undefined) {
      params.delete(key);
      return;
    }

    params.set(key, value);
  });

  return `/${locale}/admin/dashboard${params.size > 0 ? `?${params.toString()}` : ""}`;
}

export default async function LocalizedAdminDashboardPage({
  params,
  searchParams
}: LocalizedAdminDashboardPageProps) {
  const [{ locale: rawLocale }, query] = await Promise.all([
    params,
    searchParams
  ]);

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const accessToken = firstParam(query.access_token);
  const range = normalizeAdminDashboardRange(query.range);
  const rawView = firstParam(query.view);
  const view = isAdminDashboardView(rawView) ? rawView : "glance";

  if (view === "products") {
    const productParams = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
      if (key === "view") {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item) => productParams.append(key, item));
        return;
      }

      if (value !== undefined) {
        productParams.set(key, value);
      }
    });

    redirect(`/${locale}/admin/products${productParams.size > 0 ? `?${productParams.toString()}` : ""}`);
  }

  const filters = normalizeAdminDashboardFilters(query);
  const selectedReviewTaskId = firstParam(query.review);
  const selectedTaskId = firstParam(query.task);
  const selectedRetailCustomerOrderId = firstParam(query.order);
  const panyaSection = panyaSectionParam(query.section);
  const coverageCountryCode = countryCodeParam(query.country);
  const simulatorSampleSize = normalizeSimulationSampleSize(firstParam(query.samples));
  const cookieStore = await cookies();
  const sessionContext = await resolveAdminSession({
    csrfToken: cookieStore.get(adminCsrfCookieName)?.value,
    sessionCookie: cookieStore.get(adminSessionCookieName)?.value
  });
  const adminContext =
    sessionContext ?? (await legacyAdminContext(accessToken).catch(() => null));

  if (!adminContext) {
    const loginParams = new URLSearchParams({
      next: dashboardUrl(locale, query)
    });

    if (accessToken) {
      loginParams.set("access_token", accessToken);
    }

    redirect(`/${locale}/admin/login?${loginParams.toString()}`);
  }

  if (!adminViewAllowed(
    adminContext,
    view,
    adminContext.effectiveOrganisation.type
  )) {
    redirect(
      dashboardUrl(locale, query, {
        view: firstAllowedAdminView(
          adminContext,
          "glance",
          adminContext.effectiveOrganisation.type
        )
      })
    );
  }

  let alertsData = emptyAlertsData();
  let accessData: AdminAccessData | null = null;
  let agentsData = emptyAgentsData();
  let campaignsData = emptyCampaignsData();
  let contentData = emptyContentData();
  let customerInsightsData = emptyAdminCustomerInsightsData(range);
  let communicationsData = emptyCommunicationsData();
  let data = emptyAdminDashboardData(range);
  let financialsData = emptyFinancials(range);
  let retailFinancialsData = emptyAdminRetailFinancialsData(range);
  let foodsData = emptyAdminFoodsData();
  let flowData = emptyFlow(range);
  let leadsData = emptyLeadsData();
  let productsData = emptyAdminProductsData();
  let planCoverageSimulationData = emptyAdminPlanCoverageSimulationData({
    countryCode: coverageCountryCode,
    sampleSize: simulatorSampleSize
  });
  let panyaData = emptyAdminPanyaData();
  let productCoverageData = emptyAdminProductCoverageData(coverageCountryCode);
  let retailStockData = emptyAdminRetailStockData();
  let reviewQueueData = emptyAdminReviewQueueData();
  let settingsData: AdminSettingsData | null = null;
  let supplementsData = emptyAdminSupplementsData();
  let visibilityData = emptyVisibilityData();

  if (
    view === "access" ||
    view === "access-agents" ||
    view === "audit" ||
    view === "memberships" ||
    view === "organisations" ||
    view === "people"
  ) {
    accessData = await getAdminAccessData(adminContext);
  } else if (view === "settings") {
    settingsData = await getAdminSettingsData(adminContext);
  } else if (view === "glance") {
    data = await getAdminDashboardData(range, filters);
    flowData = await getAdminFlowData(range, filters);
    reviewQueueData = await getAdminReviewQueueData();
    communicationsData = await getAdminCommunicationsData(range, adminContext);
    alertsData = await getAdminTechnicalAlertsData(range);
  } else if (view === "agents") {
    agentsData = await getAdminAgentsData(range);
  } else if (view === "alerts") {
    alertsData = await getAdminTechnicalAlertsData(range);
  } else if (view === "campaigns") {
    campaignsData = await getAdminCampaignsData(range, filters);
  } else if (
    view === "blogs" ||
    view === "content" ||
    view === "testimonials"
  ) {
    contentData = await getAdminContentData(range, filters);
  } else if (view === "communications") {
    communicationsData = await getAdminCommunicationsData(range, adminContext);
  } else if (view === "panya") {
    panyaData = await getAdminPanyaData(
      range,
      adminContext,
      firstParam(query.conversation)
    );
  } else if (view === "financials") {
    financialsData = await getAdminFinancialsData(range);
  } else if (view === "settlements") {
    retailFinancialsData = await getAdminRetailFinancialsData(adminContext, range);
  } else if (view === "flow") {
    flowData = await getAdminFlowData(range, filters);
  } else if (view === "foods") {
    foodsData = await getAdminFoodsData();
  } else if (view === "leads") {
    leadsData = await getAdminLeadsData(range, filters);
  } else if (
    view === "stock" ||
    view === "retail-audit" ||
    view === "retail-financials" ||
    view === "retail-movements" ||
    view === "retail-customer-orders" ||
    view === "retail-fulfillment" ||
    view === "retail-stock-advice" ||
    view === "retail-reorder"
  ) {
    if (view === "retail-financials") {
      retailFinancialsData = await getAdminRetailFinancialsData(adminContext, range);
    } else {
      retailStockData = await getAdminRetailStockData(adminContext, locale);
    }
  } else if (view === "product-coverage") {
    productCoverageData = await getAdminProductCoverageData({
      countryCode: coverageCountryCode
    });
  } else if (view === "plan-coverage-simulator") {
    planCoverageSimulationData = await getAdminPlanCoverageSimulationData({
      countryCode: coverageCountryCode,
      sampleSize: simulatorSampleSize
    });
  } else if (view === "customer-insights") {
    customerInsightsData = await getAdminCustomerInsightsData(range);
  } else if (view === "reviews") {
    foodsData = await getAdminFoodsData();
    reviewQueueData = await getAdminReviewQueueData();
    productsData = await getAdminProductsData(range);
    supplementsData = await getAdminSupplementsData(range);
  } else if (view === "supplements") {
    supplementsData = await getAdminSupplementsData(range);
  } else if (view === "visibility") {
    visibilityData = await getAdminTaskVisibilityData(range, selectedTaskId);
  }

  return (
    <AdminDashboard
      accessToken={accessToken ?? ""}
      accessData={accessData}
      adminContext={clientAdminSessionContext(adminContext)}
      alertsData={alertsData}
      agentsData={agentsData}
      campaignsData={campaignsData}
      contentData={contentData}
      customerInsightsData={customerInsightsData}
      communicationsData={communicationsData}
      data={data}
      financialsData={financialsData}
      foodsData={foodsData}
      filters={filters}
      flowData={flowData}
      leadsData={leadsData}
      locale={locale}
      planCoverageSimulationData={planCoverageSimulationData}
      productCoverageData={productCoverageData}
      productsData={productsData}
      panyaData={panyaData}
      panyaSection={panyaSection}
      retailFinancialsData={retailFinancialsData}
      retailStockData={retailStockData}
      reviewQueueData={reviewQueueData}
      selectedRetailCustomerOrderId={selectedRetailCustomerOrderId}
      selectedReviewTaskId={selectedReviewTaskId}
      selectedTaskId={selectedTaskId}
      settingsData={settingsData}
      supplementsData={supplementsData}
      visibilityData={visibilityData}
      view={view}
    />
  );
}
