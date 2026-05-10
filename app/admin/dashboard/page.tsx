import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { adminDashboardTokenAllowed } from "@/lib/admin-auth";
import {
  getAdminDashboardData,
  normalizeAdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { normalizeAdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import { getAdminFlowData } from "@/lib/admin-flow-data";
import { getAdminReviewQueueData } from "@/lib/admin-review-queue";
import { getAdminSupplementsData } from "@/lib/admin-supplements";
import {
  getAdminJobsData,
  getAdminTechnicalAlertsData
} from "@/lib/admin-technical";

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
    rawView === "flow" ||
    rawView === "jobs" ||
    rawView === "reviews" ||
    rawView === "supplements"
      ? rawView
      : "kpi";
  const filters = normalizeAdminDashboardFilters(params);

  if (!adminDashboardTokenAllowed(accessToken)) {
    notFound();
  }

  const [
    alertsData,
    data,
    flowData,
    jobsData,
    reviewQueueData,
    supplementsData
  ] = await Promise.all([
    getAdminTechnicalAlertsData(range),
    getAdminDashboardData(range, filters),
    getAdminFlowData(range, filters),
    getAdminJobsData(range),
    getAdminReviewQueueData(),
    getAdminSupplementsData()
  ]);

  return (
    <AdminDashboard
      accessToken={accessToken ?? ""}
      alertsData={alertsData}
      data={data}
      filters={filters}
      flowData={flowData}
      jobsData={jobsData}
      locale="en"
      reviewQueueData={reviewQueueData}
      supplementsData={supplementsData}
      view={view}
    />
  );
}
