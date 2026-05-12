import type { Metadata } from "next";
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
  const filters = normalizeAdminDashboardFilters(query);
  const selectedGoalFilter = firstParam(query.goalFilter);
  const selectedGoalId = firstParam(query.goal);
  const selectedReviewTaskId = firstParam(query.review);

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
      locale={locale}
      selectedGoalFilter={selectedGoalFilter}
      reviewQueueData={reviewQueueData}
      selectedReviewTaskId={selectedReviewTaskId}
      supplementsData={supplementsData}
      visibilityData={visibilityData}
      view={view}
    />
  );
}
