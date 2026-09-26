"use client";

import { useState } from "react";
import type { AdminClientSessionContext } from "@/lib/admin-access";
import type { AdminRole } from "@/lib/admin-rbac";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import { adminLocaleTextClass, classNames } from "@/components/admin/dashboard-shared";

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

export function AdminSessionBar({
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
