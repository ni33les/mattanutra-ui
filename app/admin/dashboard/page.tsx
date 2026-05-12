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
import { getAdminGoalsData } from "@/lib/admin-goals";
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
    rawView === "campaigns" ||
    rawView === "content" ||
    rawView === "communications" ||
    rawView === "flow" ||
    rawView === "glance" ||
    rawView === "goals" ||
    rawView === "leads" ||
    rawView === "reviews" ||
    rawView === "supplements" ||
    rawView === "visibility"
      ? rawView
      : "glance";
  const filters = normalizeAdminDashboardFilters(params);
  const selectedGoalFilter = firstParam(params.goalFilter);
  const selectedGoalId = firstParam(params.goal);
  const selectedReviewTaskId = firstParam(params.review);

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
    flowData,
    goalsData,
    leadsData,
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
    getAdminFlowData(range, filters),
    getAdminGoalsData(range, selectedGoalId),
    getAdminLeadsData(range, filters),
    getAdminReviewQueueData(),
    getAdminSupplementsData(),
    getAdminTaskVisibilityData(range)
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
      filters={filters}
      flowData={flowData}
      goalsData={goalsData}
      leadsData={leadsData}
      locale="en"
      selectedGoalFilter={selectedGoalFilter}
      reviewQueueData={reviewQueueData}
      selectedReviewTaskId={selectedReviewTaskId}
      supplementsData={supplementsData}
      visibilityData={visibilityData}
      view={view}
    />
  );
}
