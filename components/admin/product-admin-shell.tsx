"use client";

import { useState, type ReactNode } from "react";
import type {
  AdminClientSessionContext
} from "@/lib/admin-access";
import {
  allowedAdminViews,
  type AdminRole
} from "@/lib/admin-rbac";
import type { AdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type { Locale } from "@/lib/i18n";
import {
  content,
  type AdminContent
} from "@/components/admin/dashboard-content";
import {
  SidebarContent,
  adminLocaleTextClass,
  classNames
} from "@/components/admin/dashboard-shared";
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

export function ProductAdminShell({
  accessToken,
  adminContext,
  children,
  filters,
  locale,
  pageTitle,
  range
}: Readonly<{
  accessToken: string;
  adminContext: AdminClientSessionContext;
  children: ReactNode;
  filters: AdminDashboardFilters;
  locale: Locale;
  pageTitle: string;
  range: AdminDashboardRange;
}>) {
  const labels = content[locale];
  const allowedViews = allowedAdminViews(
    adminContext,
    adminContext.effectiveOrganisation.type
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
            panyaSection="conversations"
            range={range}
            view="products"
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
          panyaSection="conversations"
          range={range}
          view="products"
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
          {pageTitle}
        </div>
        <span className="hidden size-8 items-center justify-center rounded-full bg-[#1FA77A]/10 text-xs font-semibold text-[#126B4F] ring-1 ring-[#1FA77A]/20 sm:inline-flex">
          MN
        </span>
      </div>

      <main className="py-8 lg:pl-72">
        <div className="px-4 sm:px-6 lg:px-8">
          <h1
            className={classNames(
              "text-3xl font-bold text-gray-900",
              adminLocaleTextClass(locale, "heading")
            )}
          >
            {pageTitle}
          </h1>
          <AdminSessionBar
            context={adminContext}
            labels={labels}
            locale={locale}
          />
          {children}
        </div>
      </main>
    </div>
  );
}
