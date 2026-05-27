import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { adminDashboardTokenAllowed } from "@/lib/admin-auth";
import {
  getAdminDashboardData,
  normalizeAdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { getAdminCommunicationsData } from "@/lib/admin-communications";
import { normalizeAdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import {
  getAdminAgentsData,
  getAdminTaskVisibilityData
} from "@/lib/admin-execution";
import { getAdminFlowData } from "@/lib/admin-flow-data";
import { getAdminFinancialsData } from "@/lib/admin-financials";
import { getAdminFoodsData } from "@/lib/admin-foods";
import { getAdminProductsData } from "@/lib/admin-products";
import {
  getAdminRecommendationInsightsData
} from "@/lib/admin-recommendation-insights";
import {
  getAdminCampaignsData,
  getAdminContentData,
  getAdminLeadsData
} from "@/lib/admin-query-data";
import { getAdminReviewQueueData } from "@/lib/admin-review-queue";
import { getAdminSupplementsData } from "@/lib/admin-supplements";
import { getAdminTechnicalAlertsData } from "@/lib/admin-technical";

export const dynamic = "force-dynamic";

type AdminDashboardPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminDashboardPage({
  searchParams
}: AdminDashboardPageProps) {
  const params = await searchParams;
  const accessToken = firstParam(params.access_token);
  const range = normalizeAdminDashboardRange(params.range);
  const rawView = firstParam(params.view);
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
    rawView === "product-insights" ||
    rawView === "products" ||
    rawView === "reviews" ||
    rawView === "supplement-insights" ||
    rawView === "supplements" ||
    rawView === "testimonials" ||
    rawView === "visibility"
      ? rawView
      : "glance";
  const filters = normalizeAdminDashboardFilters(params);
  const selectedReviewTaskId = firstParam(params.review);
  const selectedTaskId = firstParam(params.task);

  if (!adminDashboardTokenAllowed(accessToken)) {
    notFound();
  }

  const [
    alertsData,
    agentsData,
    campaignsData,
    contentData,
    communicationsData,
    data,
    financialsData,
    foodsData,
    flowData,
    leadsData,
    productsData,
    recommendationInsightsData,
    reviewQueueData,
    supplementsData,
    visibilityData
  ] = await Promise.all([
    getAdminTechnicalAlertsData(range),
    getAdminAgentsData(range),
    getAdminCampaignsData(range, filters),
    getAdminContentData(range, filters),
    getAdminCommunicationsData(range),
    getAdminDashboardData(range, filters),
    getAdminFinancialsData(range),
    getAdminFoodsData(),
    getAdminFlowData(range, filters),
    getAdminLeadsData(range, filters),
    getAdminProductsData(range),
    getAdminRecommendationInsightsData(range),
    getAdminReviewQueueData(),
    getAdminSupplementsData(range),
    getAdminTaskVisibilityData(range, selectedTaskId)
  ]);

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
      locale="en"
      productsData={productsData}
      recommendationInsightsData={recommendationInsightsData}
      reviewQueueData={reviewQueueData}
      selectedReviewTaskId={selectedReviewTaskId}
      selectedTaskId={selectedTaskId}
      supplementsData={supplementsData}
      visibilityData={visibilityData}
      view={view}
    />
  );
}
