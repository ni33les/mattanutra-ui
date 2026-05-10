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
import { getAdminFlowData } from "@/lib/admin-flow-data";
import { getAdminGoalsData } from "@/lib/admin-goals";
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
    rawView === "communications" ||
    rawView === "flow" ||
    rawView === "goals" ||
    rawView === "reviews" ||
    rawView === "supplements"
      ? rawView
      : "kpi";
  const filters = normalizeAdminDashboardFilters(query);
  const selectedGoalId = firstParam(query.goal);

  if (!adminDashboardTokenAllowed(accessToken)) {
    notFound();
  }

  const [
    alertsData,
    communicationsData,
    data,
    flowData,
    goalsData,
    reviewQueueData,
    supplementsData
  ] = await Promise.all([
    getAdminTechnicalAlertsData(range),
    getAdminCommunicationsData(range),
    getAdminDashboardData(range, filters),
    getAdminFlowData(range, filters),
    getAdminGoalsData(range, selectedGoalId),
    getAdminReviewQueueData(),
    getAdminSupplementsData()
  ]);

  return (
    <AdminDashboard
      accessToken={accessToken ?? ""}
      alertsData={alertsData}
      communicationsData={communicationsData}
      data={data}
      filters={filters}
      flowData={flowData}
      goalsData={goalsData}
      locale={locale}
      reviewQueueData={reviewQueueData}
      supplementsData={supplementsData}
      view={view}
    />
  );
}
