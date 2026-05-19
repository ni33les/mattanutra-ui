import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { adminDashboardTokenAllowed } from "@/lib/admin-auth";
import {
  emptyAdminDashboardData,
  getAdminDashboardData,
  normalizeAdminDashboardRange
} from "@/lib/admin-dashboard-data";
import {
  emptyCommunicationsData,
  getAdminCommunicationsData
} from "@/lib/admin-communications";
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
import { emptyAdminFoodsData, getAdminFoodsData } from "@/lib/admin-foods";
import {
  emptyAdminProductsData,
  getAdminProductsData
} from "@/lib/admin-products";
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
  const view =
    rawView === "alerts" ||
    rawView === "agents" ||
    rawView === "blogs" ||
    rawView === "campaigns" ||
    rawView === "content" ||
    rawView === "communications" ||
    rawView === "financials" ||
    rawView === "foods" ||
    rawView === "flow" ||
    rawView === "glance" ||
    rawView === "leads" ||
    rawView === "products" ||
    rawView === "reviews" ||
    rawView === "supplements" ||
    rawView === "testimonials" ||
    rawView === "visibility"
      ? rawView
      : "glance";
  const filters = normalizeAdminDashboardFilters(query);
  const selectedReviewTaskId = firstParam(query.review);
  const selectedTaskId = firstParam(query.task);

  if (!adminDashboardTokenAllowed(accessToken)) {
    notFound();
  }

  let alertsData = emptyAlertsData();
  let agentsData = emptyAgentsData();
  let campaignsData = emptyCampaignsData();
  let contentData = emptyContentData();
  let communicationsData = emptyCommunicationsData();
  let data = emptyAdminDashboardData(range);
  let financialsData = emptyFinancials(range);
  let foodsData = emptyAdminFoodsData();
  let flowData = emptyFlow(range);
  let leadsData = emptyLeadsData();
  let productsData = emptyAdminProductsData();
  let reviewQueueData = emptyAdminReviewQueueData();
  let supplementsData = emptyAdminSupplementsData();
  let visibilityData = emptyVisibilityData();

  if (view === "glance") {
    data = await getAdminDashboardData(range, filters);
    flowData = await getAdminFlowData(range, filters);
    reviewQueueData = await getAdminReviewQueueData();
    communicationsData = await getAdminCommunicationsData(range);
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
    communicationsData = await getAdminCommunicationsData(range);
  } else if (view === "financials") {
    financialsData = await getAdminFinancialsData(range);
  } else if (view === "flow") {
    flowData = await getAdminFlowData(range, filters);
  } else if (view === "foods") {
    foodsData = await getAdminFoodsData();
  } else if (view === "leads") {
    leadsData = await getAdminLeadsData(range, filters);
  } else if (view === "products") {
    productsData = await getAdminProductsData();
  } else if (view === "reviews") {
    reviewQueueData = await getAdminReviewQueueData();
    productsData = await getAdminProductsData();
    supplementsData = await getAdminSupplementsData();
  } else if (view === "supplements") {
    supplementsData = await getAdminSupplementsData();
  } else if (view === "visibility") {
    visibilityData = await getAdminTaskVisibilityData(range, selectedTaskId);
  }

  return (
    <AdminDashboard
      accessToken={accessToken ?? ""}
      alertsData={alertsData}
      agentsData={agentsData}
      campaignsData={campaignsData}
      contentData={contentData}
      communicationsData={communicationsData}
      data={data}
      financialsData={financialsData}
      foodsData={foodsData}
      filters={filters}
      flowData={flowData}
      leadsData={leadsData}
      locale={locale}
      productsData={productsData}
      reviewQueueData={reviewQueueData}
      selectedReviewTaskId={selectedReviewTaskId}
      selectedTaskId={selectedTaskId}
      supplementsData={supplementsData}
      visibilityData={visibilityData}
      view={view}
    />
  );
}
