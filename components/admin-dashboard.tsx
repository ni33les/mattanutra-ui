"use client";

import {
  useCallback,
  useState
} from "react";
import type {
  AdminDashboardData
} from "@/lib/admin-dashboard-data";
import type {
  AdminCustomerInsightsData
} from "@/lib/admin-customer-insights";
import type {
  AdminCoverageImprovementInsightsData
} from "@/lib/admin-coverage-improvement-insights";
import type {
  AdminAgentsData,
  AdminTaskVisibilityData
} from "@/lib/admin-execution";
import type { AdminCommunicationsData } from "@/lib/admin-communications";
import type { AdminPanyaData } from "@/lib/admin-panya";
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
  AdminRetailFinancialsData
} from "@/lib/admin-retail-financials";
import type {
  AdminFoodsData
} from "@/lib/admin-foods";
import type {
  AdminProductsData
} from "@/lib/admin-products";
import type {
  AdminRetailStockData
} from "@/lib/admin-retail-stock";
import type {
  AdminFoodImprovementInsightsData,
  AdminProductImprovementInsightsData,
  AdminSupplementAvailabilityMatrixData,
  AdminSupplementImprovementInsightsData
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
import { allowedAdminViews, type AdminRole } from "@/lib/admin-rbac";
import type { Locale } from "@/lib/i18n";
import {
  content,
  type AdminContent,
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
import { AdminCustomerInsightsView } from "@/components/admin/customer-insights-view";
import { AdminCoverageImprovementInsightsView } from "@/components/admin/coverage-improvement-insights-view";
import { AdminCommunicationsView } from "@/components/admin/communications-view";
import { AdminPanyaView } from "@/components/admin/panya-view";
import { AdminTechnicalAlertsView } from "@/components/admin/technical-alerts-view";
import { AdminFinancialsView } from "@/components/admin/financials-view";
import { AdminRetailFinancialsView } from "@/components/admin/retail-financials-view";
import { AdminAccessView } from "@/components/admin/access-view";
import { AdminSettingsView } from "@/components/admin/settings-view";
import { AdminRetailStockView } from "@/components/admin/retail-stock-view";
import { AdminContentView, contentTypeForView } from "@/components/admin/content-view";
import {
  AdminFoodsView,
  AdminReviewQueueView,
  AdminSupplementsView
} from "@/components/admin/safety-views";
import {
  AdminProductDetailView,
  AdminProductsView
} from "@/components/admin/product-view";
import { AdminVisibilityView } from "@/components/admin/visibility-view";
import {
  AdminFoodImprovementInsightsView,
  AdminProductImprovementInsightsView,
  AdminSupplementAvailabilityMatrixView,
  AdminSupplementImprovementInsightsView
} from "@/components/admin/recommendation-insights-view";
import { AdminDrawer } from "@/components/admin/ui";

const sessionRoleLabels = {
  en: {
    platform_owner: "Platform Owner",
    platform_admin: "Platform Admin",
    retail_admin: "Retail Admin",
    retail_agent: "Retail Agent",
    retail_assistant: "Retail Assistant"
  },
  th: {
    platform_owner: "เจ้าของแพลตฟอร์ม",
    platform_admin: "แอดมินแพลตฟอร์ม",
    retail_admin: "แอดมินร้านค้า",
    retail_agent: "เอเจนต์ร้านค้า",
    retail_assistant: "ผู้ช่วยร้านค้า"
  },
  "zh-CN": {
    platform_owner: "平台所有者",
    platform_admin: "平台管理员",
    retail_admin: "零售管理员",
    retail_agent: "零售代理",
    retail_assistant: "零售助理"
  }
} satisfies Record<Locale, Record<AdminRole, string>>;

function AdminSessionBar({
  context,
  labels,
  locale
}: Readonly<{
  context: AdminClientSessionContext;
  labels: AdminContent;
  locale: Locale;
}>) {
  const [stoppingImpersonation, setStoppingImpersonation] = useState(false);
  const roleLabel = sessionRoleLabels[locale][context.role];
  const actorRoleLabel = sessionRoleLabels[locale][context.actorMembership.role];
  const actorLine = `${labels.access.actor}: ${context.actorPerson.displayName} · ${actorRoleLabel}`;
  const effectiveLine = context.assumedPerson
    ? `${labels.access.assumed}: ${context.effectivePerson.displayName} · ${context.effectiveOrganisation.name}`
    : `${context.effectivePerson.displayName} · ${roleLabel}`;

  async function stopImpersonation() {
    if (stoppingImpersonation) {
      return;
    }

    setStoppingImpersonation(true);

    try {
      await fetch("/api/admin/impersonation/stop", {
        credentials: "same-origin",
        method: "POST"
      });
    } finally {
      window.location.reload();
    }
  }

  return (
    <section className="mt-6 rounded-2xl bg-[#20343A] px-4 py-3 text-white shadow-sm sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold text-[#7DDDB8]">
            <span className="size-2 rounded-full bg-[#7DDDB8]" aria-hidden={true} />
            {labels.access.session}
          </p>
          <h2
            className={classNames(
              "mt-1 truncate text-lg font-bold text-white sm:text-xl",
              adminLocaleTextClass(locale, "heading")
            )}
          >
            {context.effectiveOrganisation.name}
          </h2>
          <p className="mt-1 text-sm text-white/75">{effectiveLine}</p>
          {context.assumedPerson ? (
            <p className="mt-1 text-xs text-white/60">{actorLine}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-white/75">
          <span className="rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15">
            {context.effectiveOrganisation.currency}
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15">
            {roleLabel}
          </span>
          {context.assumedPerson ? (
            <button
              className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-[#20343A] ring-1 ring-white/20 transition hover:bg-white/90 disabled:cursor-wait disabled:opacity-70"
              disabled={stoppingImpersonation}
              onClick={stopImpersonation}
              type="button"
            >
              {labels.access.stopAssuming}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function adminViewDatabaseAvailable({
  accessData,
  alertsData,
  agentsData,
  campaignsData,
  contentData,
  coverageImprovementInsightsData,
  customerInsightsData,
  communicationsData,
  data,
  financialsData,
  foodImprovementInsightsData,
  foodsData,
  flowData,
  leadsData,
  panyaData,
  productsData,
  productImprovementInsightsData,
  retailFinancialsData,
  retailStockData,
  reviewQueueData,
  supplementsData,
  supplementAvailabilityMatrixData,
  supplementImprovementInsightsData,
  visibilityData,
  view
}: Readonly<{
  accessData: AdminAccessData | null;
  alertsData: AdminTechnicalAlertsData;
  agentsData: AdminAgentsData;
  campaignsData: AdminCampaignsData;
  contentData: AdminContentInventoryData;
  coverageImprovementInsightsData: AdminCoverageImprovementInsightsData;
  customerInsightsData: AdminCustomerInsightsData;
  communicationsData: AdminCommunicationsData;
  data: AdminDashboardData;
  financialsData: AdminFinancialsData;
  foodImprovementInsightsData: AdminFoodImprovementInsightsData;
  foodsData: AdminFoodsData;
  flowData: AdminFlowData;
  leadsData: AdminLeadsData;
  panyaData: AdminPanyaData;
  productsData: AdminProductsData;
  productImprovementInsightsData: AdminProductImprovementInsightsData;
  retailFinancialsData: AdminRetailFinancialsData;
  retailStockData: AdminRetailStockData;
  reviewQueueData: AdminReviewQueueData;
  supplementsData: AdminSupplementsData;
  supplementAvailabilityMatrixData: AdminSupplementAvailabilityMatrixData;
  supplementImprovementInsightsData: AdminSupplementImprovementInsightsData;
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

  if (view === "customer-insights") {
    return customerInsightsData.databaseAvailable;
  }

  if (view === "coverage-improvement-insights") {
    return coverageImprovementInsightsData.databaseAvailable;
  }

  if (view === "blogs" || view === "content" || view === "testimonials") {
    return contentData.databaseAvailable;
  }

  if (view === "communications") {
    return communicationsData.databaseAvailable;
  }

  if (view === "panya") {
    return panyaData.databaseAvailable;
  }

  if (view === "flow") {
    return flowData.databaseAvailable;
  }

  if (view === "financials") {
    return financialsData.databaseAvailable;
  }

  if (view === "retail-financials" || view === "settlements") {
    return retailFinancialsData.databaseAvailable;
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

  if (
    view === "stock" ||
    view === "retail-audit" ||
    view === "retail-movements" ||
    view === "retail-customer-orders" ||
    view === "retail-fulfillment" ||
    view === "retail-stock-advice" ||
    view === "retail-reorder"
  ) {
    return retailStockData.databaseAvailable;
  }

  if (view === "food-insights") {
    return foodImprovementInsightsData.databaseAvailable;
  }

  if (view === "product-insights") {
    return productImprovementInsightsData.databaseAvailable;
  }

  if (view === "supplement-availability-matrix") {
    return supplementAvailabilityMatrixData.databaseAvailable;
  }

  if (view === "supplement-insights") {
    return supplementImprovementInsightsData.databaseAvailable;
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
  coverageImprovementInsightsData,
  customerInsightsData,
  communicationsData,
  data,
  financialsData,
  foodImprovementInsightsData,
  foodsData,
  filters,
  flowData,
  leadsData,
  locale,
  panyaData,
  panyaSection,
  productDetailId,
  productsData,
  productImprovementInsightsData,
  retailFinancialsData,
  retailStockData,
  reviewQueueData,
  selectedRetailCustomerOrderId,
  selectedReviewTaskId,
  selectedTaskId,
  settingsData,
  supplementsData,
  supplementAvailabilityMatrixData,
  supplementImprovementInsightsData,
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
  coverageImprovementInsightsData: AdminCoverageImprovementInsightsData;
  customerInsightsData: AdminCustomerInsightsData;
  communicationsData: AdminCommunicationsData;
  data: AdminDashboardData;
  financialsData: AdminFinancialsData;
  foodImprovementInsightsData: AdminFoodImprovementInsightsData;
  foodsData: AdminFoodsData;
  filters: AdminDashboardFilters;
  flowData: AdminFlowData;
  leadsData: AdminLeadsData;
  locale: Locale;
  panyaData: AdminPanyaData;
  panyaSection: "configuration" | "conversations";
  productDetailId?: string | null;
  productsData: AdminProductsData;
  productImprovementInsightsData: AdminProductImprovementInsightsData;
  retailFinancialsData: AdminRetailFinancialsData;
  retailStockData: AdminRetailStockData;
  reviewQueueData: AdminReviewQueueData;
  selectedRetailCustomerOrderId?: string | null;
  selectedReviewTaskId?: string | null;
  selectedTaskId?: string | null;
  settingsData: AdminSettingsData | null;
  supplementsData: AdminSupplementsData;
  supplementAvailabilityMatrixData: AdminSupplementAvailabilityMatrixData;
  supplementImprovementInsightsData: AdminSupplementImprovementInsightsData;
  visibilityData: AdminTaskVisibilityData;
  view: AdminDashboardView;
}>) {
  const labels = content[locale];
  const allowedViews = allowedAdminViews(
    adminContext,
    adminContext.effectiveOrganisation.type
  );
  const contentManagementView =
    view === "blogs" || view === "content" || view === "testimonials";
  const showDashboardTimeframeControls =
    !contentManagementView &&
    !(view === "panya" && panyaSection === "configuration") &&
    (view === "agents" ||
      view === "alerts" ||
      view === "campaigns" ||
      view === "communications" ||
      view === "coverage-improvement-insights" ||
      view === "customer-insights" ||
      view === "financials" ||
      view === "flow" ||
      view === "glance" ||
      view === "leads" ||
      view === "panya" ||
      view === "food-insights" ||
      view === "product-insights" ||
      view === "retail-financials" ||
      view === "settlements" ||
      view === "supplement-availability-matrix" ||
      view === "supplement-insights" ||
      view === "visibility");
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
    coverageImprovementInsightsData,
    customerInsightsData,
    communicationsData,
    data,
    financialsData,
    foodImprovementInsightsData,
    foodsData,
    flowData,
    leadsData,
    panyaData,
    productsData,
    productImprovementInsightsData,
    retailFinancialsData,
    retailStockData,
    reviewQueueData,
    supplementsData,
    supplementAvailabilityMatrixData,
    supplementImprovementInsightsData,
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
            panyaSection={panyaSection}
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
          panyaSection={panyaSection}
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
            orderId={selectedRetailCustomerOrderId}
            panyaSection={panyaSection}
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
                orderId={selectedRetailCustomerOrderId}
                panyaSection={panyaSection}
                range={data.range}
                reviewTaskId={selectedReviewTaskId}
                taskId={selectedTaskId}
                view={view}
              />
            </div>
          </div>

          <AdminSessionBar
            context={adminContext}
            labels={labels}
            locale={locale}
          />

          {!databaseAvailable ? (
            <div className="mt-6 rounded-md bg-amber-50 p-4 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
              {labels.dataUnavailable}
            </div>
          ) : null}

          {showDashboardTimeframeControls ? (
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
          ) : view === "retail-financials" || view === "settlements" ? (
            <AdminRetailFinancialsView
              accessToken={accessToken}
              data={retailFinancialsData}
              labels={labels}
              locale={locale}
              range={data.range}
              scope={view === "settlements" ? "platform" : "retail"}
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
          ) : view === "customer-insights" ? (
            <AdminCustomerInsightsView
              data={customerInsightsData}
              locale={locale}
            />
          ) : view === "coverage-improvement-insights" ? (
            <AdminCoverageImprovementInsightsView
              data={coverageImprovementInsightsData}
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
          ) : view === "panya" ? (
            <AdminPanyaView
              accessToken={accessToken}
              data={panyaData}
              locale={locale}
              section={panyaSection}
              range={data.range}
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
            productDetailId ? (
              <AdminProductDetailView
                accessToken={accessToken}
                data={productsData}
                locale={locale}
                productId={productDetailId}
              />
            ) : (
              <AdminProductsView
                accessToken={accessToken}
                data={productsData}
                locale={locale}
              />
            )
          ) : view === "stock" ||
            view === "retail-audit" ||
            view === "retail-movements" ||
            view === "retail-customer-orders" ||
            view === "retail-fulfillment" ||
            view === "retail-stock-advice" ||
            view === "retail-reorder" ? (
            <AdminRetailStockView
              accessToken={accessToken}
              data={retailStockData}
              filters={filters}
              labels={labels}
              locale={locale}
              range={data.range}
              selectedRetailCustomerOrderId={selectedRetailCustomerOrderId}
              view={view}
            />
          ) : view === "food-insights" ? (
            <AdminFoodImprovementInsightsView
              data={foodImprovementInsightsData}
              locale={locale}
            />
          ) : view === "product-insights" ? (
            <AdminProductImprovementInsightsView
              data={productImprovementInsightsData}
              locale={locale}
            />
          ) : view === "supplement-availability-matrix" ? (
            <AdminSupplementAvailabilityMatrixView
              data={supplementAvailabilityMatrixData}
              locale={locale}
            />
          ) : view === "supplement-insights" ? (
            <AdminSupplementImprovementInsightsView
              data={supplementImprovementInsightsData}
              locale={locale}
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
