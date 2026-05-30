"use client";

import {
  useCallback,
  useState
} from "react";
import type {
  AdminDashboardData
} from "@/lib/admin-dashboard-data";
import type {
  AdminAgentsData,
  AdminTaskVisibilityData
} from "@/lib/admin-execution";
import type { AdminCommunicationsData } from "@/lib/admin-communications";
import type {
  AdminReviewQueueData
} from "@/lib/admin-review-queue";
import type { AdminTechnicalAlertsData } from "@/lib/admin-technical";
import type {
  AdminSupplementsData
} from "@/lib/admin-supplements";
import type { AdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import type {
  AdminFlowData
} from "@/lib/admin-flow-data";
import type {
  AdminFinancialsData
} from "@/lib/admin-financials";
import type {
  AdminFoodsData
} from "@/lib/admin-foods";
import type {
  AdminProductsData
} from "@/lib/admin-products";
import type {
  AdminRecommendationInsightsData
} from "@/lib/admin-recommendation-insights";
import type {
  AdminCampaignsData,
  AdminContentInventoryData,
  AdminLeadsData
} from "@/lib/admin-query-data";
import type {
  AdminAccessData,
  AdminClientSessionContext,
  AdminSettingsData
} from "@/lib/admin-access";
import { allowedAdminViews } from "@/lib/admin-rbac";
import type { Locale } from "@/lib/i18n";
import {
  content,
  type AdminDashboardView
} from "@/components/admin/dashboard-content";
import {
  AdminLocaleSwitcher,
  SidebarContent,
  adminLocaleTextClass,
  adminExecutionEventsHref,
  classNames,
  formatGeneratedAt,
  useLiveAdminData
} from "@/components/admin/dashboard-shared";
import {
  AdminFilterPanel,
  LocaleFilterSelector,
  TimeframeSelector
} from "@/components/admin/dashboard-filters";
import { AdminAtAGlanceView } from "@/components/admin/business-overview";
import { AdminFlowView } from "@/components/admin/flow-view";
import { AdminAgentsView } from "@/components/admin/agents-view";
import { AdminCampaignsView } from "@/components/admin/marketing-campaigns";
import { AdminLeadsView } from "@/components/admin/marketing-leads";
import { AdminCommunicationsView } from "@/components/admin/communications-view";
import { AdminTechnicalAlertsView } from "@/components/admin/technical-alerts-view";
import { AdminFinancialsView } from "@/components/admin/financials-view";
import { AdminAccessView } from "@/components/admin/access-view";
import { AdminSettingsView } from "@/components/admin/settings-view";
import { AdminContentView, contentTypeForView } from "@/components/admin/content-view";
import {
  AdminFoodsView,
  AdminProductsView,
  AdminReviewQueueView,
  AdminSupplementsView
} from "@/components/admin/safety-views";
import { AdminVisibilityView } from "@/components/admin/visibility-view";
import { AdminRecommendationInsightsView } from "@/components/admin/recommendation-insights-view";
import { AdminDrawer } from "@/components/admin/ui";

function adminViewDatabaseAvailable({
  accessData,
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
  visibilityData,
  view
}: Readonly<{
  accessData: AdminAccessData | null;
  alertsData: AdminTechnicalAlertsData;
  agentsData: AdminAgentsData;
  campaignsData: AdminCampaignsData;
  contentData: AdminContentInventoryData;
  communicationsData: AdminCommunicationsData;
  data: AdminDashboardData;
  financialsData: AdminFinancialsData;
  foodsData: AdminFoodsData;
  flowData: AdminFlowData;
  leadsData: AdminLeadsData;
  productsData: AdminProductsData;
  recommendationInsightsData: AdminRecommendationInsightsData;
  reviewQueueData: AdminReviewQueueData;
  supplementsData: AdminSupplementsData;
  visibilityData: AdminTaskVisibilityData;
  view: AdminDashboardView;
}>) {
  if (
    view === "access" ||
    view === "access-agents" ||
    view === "audit" ||
    view === "memberships" ||
    view === "organisations" ||
    view === "people"
  ) {
    return Boolean(accessData);
  }

  if (view === "settings") {
    return true;
  }

  if (view === "glance") {
    return (
      alertsData.databaseAvailable &&
      communicationsData.databaseAvailable &&
      data.databaseAvailable &&
      flowData.databaseAvailable &&
      reviewQueueData.databaseAvailable
    );
  }

  if (view === "agents") {
    return agentsData.databaseAvailable;
  }

  if (view === "alerts") {
    return alertsData.databaseAvailable;
  }

  if (view === "campaigns") {
    return campaignsData.databaseAvailable;
  }

  if (view === "blogs" || view === "content" || view === "testimonials") {
    return contentData.databaseAvailable;
  }

  if (view === "communications") {
    return communicationsData.databaseAvailable;
  }

  if (view === "flow") {
    return flowData.databaseAvailable;
  }

  if (view === "financials") {
    return financialsData.databaseAvailable;
  }

  if (view === "foods") {
    return foodsData.databaseAvailable;
  }

  if (view === "leads") {
    return leadsData.databaseAvailable;
  }

  if (view === "products") {
    return productsData.databaseAvailable;
  }

  if (view === "product-insights" || view === "supplement-insights") {
    return recommendationInsightsData.databaseAvailable;
  }

  if (view === "reviews") {
    return reviewQueueData.databaseAvailable;
  }

  if (view === "supplements") {
    return supplementsData.databaseAvailable;
  }

  if (view === "visibility") {
    return visibilityData.databaseAvailable;
  }

  return data.databaseAvailable;
}

export function AdminDashboard({
  accessToken,
  accessData,
  adminContext,
  alertsData,
  agentsData,
  campaignsData,
  contentData,
  communicationsData,
  data,
  financialsData,
  foodsData,
  filters,
  flowData,
  leadsData,
  locale,
  productsData,
  recommendationInsightsData,
  reviewQueueData,
  selectedReviewTaskId,
  selectedTaskId,
  settingsData,
  supplementsData,
  visibilityData,
  view
}: Readonly<{
  accessToken: string;
  accessData: AdminAccessData | null;
  adminContext: AdminClientSessionContext;
  alertsData: AdminTechnicalAlertsData;
  agentsData: AdminAgentsData;
  campaignsData: AdminCampaignsData;
  contentData: AdminContentInventoryData;
  communicationsData: AdminCommunicationsData;
  data: AdminDashboardData;
  financialsData: AdminFinancialsData;
  foodsData: AdminFoodsData;
  filters: AdminDashboardFilters;
  flowData: AdminFlowData;
  leadsData: AdminLeadsData;
  locale: Locale;
  productsData: AdminProductsData;
  recommendationInsightsData: AdminRecommendationInsightsData;
  reviewQueueData: AdminReviewQueueData;
  selectedReviewTaskId?: string | null;
  selectedTaskId?: string | null;
  settingsData: AdminSettingsData | null;
  supplementsData: AdminSupplementsData;
  visibilityData: AdminTaskVisibilityData;
  view: AdminDashboardView;
}>) {
  const labels = content[locale];
  const allowedViews = allowedAdminViews(adminContext);
  const contentManagementView =
    view === "blogs" || view === "content" || view === "testimonials";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [visibilityHeartbeatAt, setVisibilityHeartbeatAt] = useState(0);
  const recordVisibilityHeartbeat = useCallback(() => {
    setVisibilityHeartbeatAt(Date.now());
  }, []);
  const visibilityStreamKey = `${view}:${data.range}:visibility`;
  const liveAuthEnabled = Boolean(accessToken || adminContext.sessionId);
  const liveVisibilityData = useLiveAdminData({
    enabled: view === "visibility" && liveAuthEnabled,
    eventName: "visibility",
    href:
      liveAuthEnabled && view === "visibility"
        ? adminExecutionEventsHref({
            accessToken,
            range: data.range,
            view: "visibility"
          })
        : "",
    initialData: visibilityData,
    onHeartbeat: recordVisibilityHeartbeat,
    streamKey: visibilityStreamKey
  });
  const agentsStreamKey = `${view}:${data.range}:agents`;
  const liveAgentsData = useLiveAdminData({
    enabled: view === "agents" && liveAuthEnabled,
    eventName: "agents",
    href:
      liveAuthEnabled && view === "agents"
        ? adminExecutionEventsHref({
            accessToken,
            range: data.range,
            view: "agents"
          })
        : "",
    initialData: agentsData,
    streamKey: agentsStreamKey
  });

  const databaseAvailable = adminViewDatabaseAvailable({
    accessData,
    alertsData,
    agentsData: liveAgentsData,
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
    visibilityData: liveVisibilityData,
    view
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#20343A]">
      {sidebarOpen ? (
        <AdminDrawer onClose={() => setSidebarOpen(false)}>
          <SidebarContent
            accessToken={accessToken}
            allowedViews={allowedViews}
            filters={filters}
            labels={labels}
            locale={locale}
            onNavigate={() => setSidebarOpen(false)}
            range={data.range}
            view={view}
          />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="absolute left-full top-5 ml-4 rounded-md bg-[#20343A] px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-[#16252A]"
          >
            {labels.closeSidebar}
          </button>
        </AdminDrawer>
      ) : null}

      <aside className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <SidebarContent
          accessToken={accessToken}
          allowedViews={allowedViews}
          filters={filters}
          labels={labels}
          locale={locale}
          range={data.range}
          view={view}
        />
      </aside>

      <div className="sticky top-0 z-40 flex items-center gap-x-4 border-b border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 hover:text-gray-900"
        >
          {labels.openSidebar}
        </button>
        <div className="flex-1 text-sm/6 font-semibold text-gray-900">
          {labels.pageTitles[view]}
        </div>
        <span className="hidden size-8 items-center justify-center rounded-full bg-[#1FA77A]/10 text-xs font-semibold text-[#126B4F] ring-1 ring-[#1FA77A]/20 sm:inline-flex">
          MN
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <AdminLocaleSwitcher
            accessToken={accessToken}
            filters={filters}
            labels={labels}
            locale={locale}
            range={data.range}
            reviewTaskId={selectedReviewTaskId}
            taskId={selectedTaskId}
            view={view}
          />
        </div>
      </div>

      <main className="py-8 lg:pl-72">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1
                className={classNames(
                  "text-3xl font-bold text-gray-900",
                  adminLocaleTextClass(locale, "heading")
                )}
              >
                {labels.pageTitles[view]}
              </h1>
              {view === "glance" ? (
                <p className="mt-1 text-xs text-gray-400">
                  {labels.generated}: {formatGeneratedAt(data.generatedAt, locale)}
                </p>
              ) : null}
            </div>
            <div className="hidden items-center gap-3 lg:flex lg:justify-end">
              <AdminLocaleSwitcher
                accessToken={accessToken}
                filters={filters}
                labels={labels}
                locale={locale}
                range={data.range}
                reviewTaskId={selectedReviewTaskId}
                taskId={selectedTaskId}
                view={view}
              />
            </div>
          </div>

          {!databaseAvailable ? (
            <div className="mt-6 rounded-md bg-amber-50 p-4 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
              {labels.dataUnavailable}
            </div>
          ) : null}

          {!contentManagementView &&
          (view === "agents" ||
          view === "alerts" ||
          view === "campaigns" ||
          view === "communications" ||
          view === "financials" ||
          view === "flow" ||
          view === "glance" ||
          view === "leads" ||
          view === "product-insights" ||
          view === "supplement-insights" ||
          view === "visibility") ? (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <TimeframeSelector
                  accessToken={accessToken}
                  data={data}
                  filters={filters}
                  labels={labels}
                  locale={locale}
                  view={view}
                />
                {view === "campaigns" ||
                view === "flow" ||
                view === "glance" ||
                view === "leads" ? (
                  <LocaleFilterSelector
                    accessToken={accessToken}
                    filters={filters}
                    locale={locale}
                    range={data.range}
                    view={view}
                  />
                ) : null}
              </div>

              {view === "campaigns" ||
              view === "flow" ||
              view === "glance" ||
              view === "leads" ? (
                <AdminFilterPanel
                  accessToken={accessToken}
                  filters={filters}
                  labels={labels}
                  locale={locale}
                  range={data.range}
                  view={view}
                />
              ) : null}
            </>
          ) : null}

          {(view === "access" ||
            view === "access-agents" ||
            view === "audit" ||
            view === "memberships" ||
            view === "organisations" ||
            view === "people") &&
          accessData ? (
            <AdminAccessView
              accessToken={accessToken}
              context={adminContext}
              data={accessData}
              labels={labels}
              locale={locale}
              view={view}
            />
          ) : view === "settings" ? (
            <AdminSettingsView
              context={adminContext}
              labels={labels}
              locale={locale}
              settingsData={settingsData}
            />
          ) : view === "campaigns" ? (
            <AdminCampaignsView
              data={campaignsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "blogs" ||
            view === "content" ||
            view === "testimonials" ? (
            <AdminContentView
              accessToken={accessToken}
              contentTypeFilter={contentTypeForView(view)}
              data={contentData}
              labels={labels}
              locale={locale}
            />
          ) : view === "flow" ? (
            <AdminFlowView
              accessToken={accessToken}
              flowData={flowData}
              labels={labels}
              locale={locale}
            />
          ) : view === "financials" ? (
            <AdminFinancialsView
              accessToken={accessToken}
              data={financialsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "glance" ? (
            <AdminAtAGlanceView
              accessToken={accessToken}
              alertsData={alertsData}
              communicationsData={communicationsData}
              data={data}
              filters={filters}
              flowData={flowData}
              labels={labels}
              locale={locale}
              reviewQueueData={reviewQueueData}
            />
          ) : view === "leads" ? (
            <AdminLeadsView
              data={leadsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "agents" ? (
            <AdminAgentsView
              data={liveAgentsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "communications" ? (
            <AdminCommunicationsView
              accessToken={accessToken}
              data={communicationsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "alerts" ? (
            <AdminTechnicalAlertsView
              data={alertsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "reviews" ? (
            <AdminReviewQueueView
              accessToken={accessToken}
              data={reviewQueueData}
              foodsData={foodsData}
              labels={labels}
              locale={locale}
              productsData={productsData}
              selectedReviewTaskId={selectedReviewTaskId}
              supplementsData={supplementsData}
            />
          ) : view === "foods" ? (
            <AdminFoodsView
              accessToken={accessToken}
              data={foodsData}
              locale={locale}
            />
          ) : view === "products" ? (
            <AdminProductsView
              accessToken={accessToken}
              data={productsData}
              locale={locale}
            />
          ) : view === "product-insights" || view === "supplement-insights" ? (
            <AdminRecommendationInsightsView
              data={recommendationInsightsData}
              locale={locale}
              mode={view === "product-insights" ? "products" : "supplements"}
            />
          ) : view === "supplements" ? (
            <AdminSupplementsView
              accessToken={accessToken}
              data={supplementsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "visibility" ? (
            <AdminVisibilityView
              data={liveVisibilityData}
              heartbeatAt={visibilityHeartbeatAt}
              labels={labels}
              locale={locale}
              selectedTaskId={selectedTaskId}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
