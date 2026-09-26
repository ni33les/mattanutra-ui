"use client";

import { AdminSessionBar } from "@/components/admin/session-bar";

import { useState, type ReactNode } from "react";
import type {
  AdminClientSessionContext
} from "@/lib/admin-access";
import {
  allowedAdminViews
} from "@/lib/admin-rbac";
import type { AdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type { Locale } from "@/lib/i18n";
import {
  content
} from "@/components/admin/dashboard-content";
import {
  SidebarContent,
  adminLocaleTextClass,
  classNames
} from "@/components/admin/dashboard-shared";
import { AdminDrawer } from "@/components/admin/ui";

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
