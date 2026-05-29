"use client";

import { useState, type FormEvent } from "react";
import { UserCircleIcon } from "@heroicons/react/24/outline";
import type { AdminClientSessionContext } from "@/lib/admin-access";
import { localeLabels, publicLocales, type Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  AdminLogoutButton,
  adminLocaleTextClass,
  classNames
} from "@/components/admin/dashboard-shared";

type SaveProfileResponse = Readonly<{
  error?: string;
  session?: AdminClientSessionContext;
  updated?: boolean;
}>;

async function saveProfile(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/access", {
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
  const json = (await response.json().catch(() => ({}))) as SaveProfileResponse;

  if (!response.ok) {
    throw new Error(json.error);
  }

  return json;
}

export function AdminSettingsView({
  context,
  labels,
  locale
}: Readonly<{
  context: AdminClientSessionContext;
  labels: AdminContent;
  locale: Locale;
}>) {
  const [session, setSession] = useState(context);
  const [displayName, setDisplayName] = useState(context.actorPerson.displayName);
  const [preferredLocale, setPreferredLocale] = useState<Locale>(
    context.actorPerson.preferredLocale
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canSave = !session.isLegacy;

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await saveProfile({
        action: "update_self",
        displayName,
        preferredLocale
      });

      if (result.session) {
        setSession(result.session);
      }

      setMessage(labels.settings.saved);
    } catch {
      setError(labels.settings.saveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-[#1FA77A]/10 text-[#126B4F] ring-1 ring-[#1FA77A]/15">
            <UserCircleIcon aria-hidden={true} className="size-5" />
          </span>
          <h2
            className={classNames(
              "text-base font-semibold text-gray-900",
              adminLocaleTextClass(locale, "heading")
            )}
          >
            {labels.settings.profile}
          </h2>
        </div>

        <form className="mt-5 grid gap-4" onSubmit={submitProfile}>
          <label className="grid gap-1 text-xs font-semibold text-gray-500">
            {labels.settings.displayName}
            <input
              className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
              disabled={!canSave || busy}
              onChange={(event) => setDisplayName(event.target.value)}
              required={true}
              value={displayName}
            />
          </label>

          <div className="grid gap-1 text-xs font-semibold text-gray-500">
            {labels.settings.email}
            <div className="rounded-md bg-gray-50 px-3 py-2 text-sm font-normal text-gray-600 ring-1 ring-inset ring-gray-200">
              {session.actorPerson.email}
            </div>
          </div>

          <label className="grid gap-1 text-xs font-semibold text-gray-500">
            {labels.settings.language}
            <select
              className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
              disabled={!canSave || busy}
              onChange={(event) => setPreferredLocale(event.target.value as Locale)}
              value={preferredLocale}
            >
              {publicLocales.map((localeCode) => (
                <option key={localeCode} value={localeCode}>
                  {localeLabels[localeCode]}
                </option>
              ))}
            </select>
          </label>

          {message || error ? (
            <div
              className={classNames(
                "rounded-md px-3 py-2 text-sm font-medium ring-1",
                error
                  ? "bg-red-50 text-red-700 ring-red-100"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-100"
              )}
            >
              {error || message}
            </div>
          ) : null}

          <div>
            <button
              className={classNames(
                "inline-flex items-center justify-center rounded-md bg-[#20343A] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#16252A] disabled:cursor-not-allowed disabled:opacity-60",
                adminLocaleTextClass(locale, "label")
              )}
              disabled={!canSave || busy}
              type="submit"
            >
              {labels.settings.save}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <h2
          className={classNames(
            "text-base font-semibold text-gray-900",
            adminLocaleTextClass(locale, "heading")
          )}
        >
          {labels.settings.account}
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {labels.settings.logoutHint}
        </p>
        <div className="mt-5">
          <AdminLogoutButton label={labels.logout} locale={locale} />
        </div>
      </section>
    </div>
  );
}
