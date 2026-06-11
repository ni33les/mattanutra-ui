"use client";

import {
  Mail,
  MessageCircle,
  MessageSquare,
  Plus,
  type LucideIcon
} from "lucide-react";
import { useState } from "react";
import type {
  AdminCommunicationRow,
  AdminCommunicationsData,
  AdminCommunicationStatus,
  AdminOrganisationCommunicationSettings
} from "@/lib/admin-communications";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  PlanIdLink,
  businessMetricColors,
  classNames,
  formatGeneratedAt,
  formatNumber,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { SupplementListMeta } from "@/components/admin/safety-views";
import { AdminModal } from "@/components/admin/ui";
import { lineOfficialAccountUrl } from "@/lib/chat-links";

function communicationStatusLabel(
  labels: AdminContent,
  status: AdminCommunicationStatus
) {
  if (status === "no_channel") {
    return labels.communications.noChannel;
  }

  return labels.communications[status];
}

function communicationStatusClass(status: AdminCommunicationStatus) {
  if (status === "failed") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (status === "no_channel") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === "queued") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === "sent" || status === "delivered") {
    return "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]";
  }

  return "bg-gray-50 text-gray-700 ring-gray-200";
}

function communicationTitle(row: AdminCommunicationRow) {
  return (
    row.subject ||
    row.taskTitle ||
    readableToken(row.messageType)
  );
}

const lineConnectUrl = lineOfficialAccountUrl();

type ConnectMethod = "line" | "email";
type ConnectProvider = ConnectMethod | "sms" | "whatsapp";

type ConnectProviderOption = Readonly<{
  description: string;
  disabled?: boolean;
  icon: LucideIcon;
  id: ConnectProvider;
  label: string;
}>;

const connectProviderOptions: ConnectProviderOption[] = [
  {
    description: "LINE bot or group chat",
    icon: MessageCircle,
    id: "line",
    label: "LINE"
  },
  {
    description: "Shared mailbox or named contact",
    icon: Mail,
    id: "email",
    label: "Email"
  },
  {
    description: "Coming soon",
    disabled: true,
    icon: MessageCircle,
    id: "whatsapp",
    label: "WhatsApp"
  },
  {
    description: "Coming soon",
    disabled: true,
    icon: MessageSquare,
    id: "sms",
    label: "SMS"
  }
];

export function AdminCommunicationsView({
  accessToken,
  data,
  labels,
  locale
}: Readonly<{
  accessToken: string;
  data: AdminCommunicationsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const [settings, setSettings] = useState<AdminOrganisationCommunicationSettings | null>(
    data.organisationSettings
  );
  const [emailContactName, setEmailContactName] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [lineContactName, setLineContactName] = useState("");
  const [lineCode, setLineCode] = useState<{
    code: string;
    command: string;
    expiresAt: string;
    lineUrl: string;
  } | null>(null);
  const [connectMethod, setConnectMethod] = useState<ConnectMethod>("line");
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [retryErrorId, setRetryErrorId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const communicationMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "communicationsTotal",
      label: labels.communications.total,
      series: [],
      value: formatNumber(data.summary.total, locale)
    },
    {
      color: businessMetricColors.contentScheduled,
      id: "communicationsQueued",
      label: labels.communications.queued,
      series: [],
      value: formatNumber(data.summary.queued, locale)
    },
    {
      color: businessMetricColors.freeRequests,
      id: "communicationsSent",
      label: labels.communications.sent,
      series: [],
      value: formatNumber(data.summary.sent, locale)
    },
    {
      color: businessMetricColors.contentPublished,
      id: "communicationsDelivered",
      label: labels.communications.delivered,
      series: [],
      value: formatNumber(data.summary.delivered, locale)
    },
    {
      color: businessMetricColors.communicationIssues,
      id: "communicationsFailed",
      label: labels.communications.failed,
      series: [],
      value: formatNumber(data.summary.failed, locale)
    },
    {
      color: businessMetricColors.noChannel,
      id: "communicationsNoChannel",
      label: labels.communications.noChannel,
      series: [],
      value: formatNumber(data.summary.noChannel, locale)
    }
  ];

  async function retryMessage(row: AdminCommunicationRow) {
    setRetryErrorId(null);
    setRetryingId(row.id);

    try {
      const response = await fetch(
        `/api/admin/communications/messages/${row.id}/retry`,
        {
          body: JSON.stringify({ accessToken }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      if (!response.ok) {
        throw new Error("Unable to retry communication");
      }

      window.location.reload();
    } catch {
      setRetryErrorId(row.id);
    } finally {
      setRetryingId(null);
    }
  }

  async function loadOrganisationSettings(organisationId: string) {
    setSettingsBusy(true);
    setSettingsError("");

    try {
      const response = await fetch(
        `/api/admin/communications/organisation?organisationId=${encodeURIComponent(organisationId)}`,
        { credentials: "same-origin" }
      );
      const json = await response.json();

      if (!response.ok || !json.settings) {
        throw new Error("Unable to load communication settings");
      }

      setSettings(json.settings);
      setLineCode(null);
    } catch {
      setSettingsError("Could not load communication settings.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function postOrganisationAction(body: Record<string, unknown>) {
    if (!settings) {
      return false;
    }

    setSettingsBusy(true);
    setSettingsError("");

    try {
      const response = await fetch("/api/admin/communications/organisation", {
        body: JSON.stringify({
          organisationId: settings.selectedOrganisationId,
          ...body
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const json = await response.json();

      if (!response.ok || !json.settings) {
        throw new Error("Unable to save communication settings");
      }

      setSettings(json.settings);
      return true;
    } catch {
      setSettingsError("Could not save communication settings.");
      return false;
    } finally {
      setSettingsBusy(false);
    }
  }

  async function addEmailChannel() {
    if (!emailContactName.trim() || !emailAddress.trim()) {
      return;
    }

    const saved = await postOrganisationAction({
      action: "add_email",
      displayName: emailContactName,
      email: emailAddress
    });

    if (saved) {
      setEmailContactName("");
      setEmailAddress("");
      setConnectModalOpen(false);
    }
  }

  function openConnectModal() {
    setSettingsError("");
    setLineCode(null);
    setConnectModalOpen(true);
  }

  function selectConnectMethod(provider: ConnectProviderOption) {
    if (provider.disabled || provider.id === "sms" || provider.id === "whatsapp") {
      return;
    }

    setConnectMethod(provider.id);
    setLineCode(null);
  }

  function closeConnectModal() {
    setConnectModalOpen(false);

    if (settings) {
      void loadOrganisationSettings(settings.selectedOrganisationId);
    }
  }

  async function startLineConnection() {
    if (!settings) {
      return;
    }

    setSettingsBusy(true);
    setSettingsError("");

    try {
      const response = await fetch("/api/admin/communications/line-connect", {
        body: JSON.stringify({
          displayName: lineContactName,
          locale,
          organisationId: settings.selectedOrganisationId
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const json = await response.json();

      if (!response.ok || !json.token?.code) {
        throw new Error("Unable to create LINE connection code");
      }

      setLineCode({
        code: json.token.code,
        command: json.token.command ?? `MN ${json.token.code}`,
        expiresAt: json.token.expiresAt,
        lineUrl: json.token.lineUrl
      });
    } catch {
      setSettingsError("Could not create LINE connection code.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function sendTestMessage(channelType: "email" | "line") {
    if (!settings) {
      return;
    }

    setSettingsBusy(true);
    setSettingsError("");

    try {
      const response = await fetch("/api/admin/communications/test", {
        body: JSON.stringify({
          channelType,
          organisationId: settings.selectedOrganisationId
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("Unable to queue test message");
      }

      window.location.reload();
    } catch {
      setSettingsError("Could not queue test message.");
    } finally {
      setSettingsBusy(false);
    }
  }

  const preferenceByKey = new Map(
    settings?.preferences.map((preference) => [
      `${preference.eventKey}:${preference.channelType}`,
      preference
    ]) ?? []
  );
  const isPlatformScope = settings?.scope === "platform";
  const channelHeading = isPlatformScope
    ? "Platform communication channels"
    : "Retail communication channels";
  const channelDescription = isPlatformScope
    ? "Configure where platform operational and revenue notifications are sent."
    : "Configure where retailer order notifications are sent.";
  const preferenceHeading = isPlatformScope
    ? "Platform notification preferences"
    : "Retail notification preferences";
  const preferenceDescription = isPlatformScope
    ? "Choose which platform events notify MattaNutra."
    : "Choose which order events notify this retailer.";
  const emptyChannelCopy = isPlatformScope
    ? "No platform channels configured."
    : "No retailer channels configured.";

  return (
    <section className="mt-8 space-y-6">
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
          <span className="size-2 rounded-full bg-[#1FA77A]" />
          {labels.visibility.liveUpdated} · {labels.contentPages.updated}{" "}
          {formatGeneratedAt(data.generatedAt, locale)}
        </span>
      </div>

      <BusinessStatsGrid metrics={communicationMetrics} />

      {settings ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {channelHeading}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {channelDescription}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <button
                  className="inline-flex items-center gap-2 rounded-md bg-[#1FA77A] px-3.5 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-[#188865] transition hover:bg-[#188865] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!settings.canManage || settingsBusy}
                  onClick={openConnectModal}
                  type="button"
                >
                  <Plus className="size-4" aria-hidden={true} />
                  Add channel
                </button>
              </div>
            </div>

            {settingsError ? (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-100">
                {settingsError}
              </p>
            ) : null}

            <div className="mt-5 grid gap-3">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500">
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Email/address</th>
                      <th className="py-2 pr-4">Buttons</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {settings.channels.map((channel) => (
                      <tr key={channel.id}>
                        <td className="py-3 pr-4 font-medium text-gray-900">
                          {readableToken(channel.channelType)}
                          {channel.status !== "active" ? (
                            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                              {readableToken(channel.status)}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4 text-gray-700">
                          {channel.displayName || "—"}
                        </td>
                        <td className="py-3 pr-4 text-gray-600">{channel.address}</td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-2">
                            {channel.channelType === "email" || channel.channelType === "line" ? (
                              <button
                                className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-900 ring-1 ring-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={settingsBusy}
                                onClick={() =>
                                  sendTestMessage(
                                    channel.channelType === "line" ? "line" : "email"
                                  )
                                }
                                type="button"
                              >
                                Test
                              </button>
                            ) : null}
                            <button
                              className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-900 ring-1 ring-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={!settings.canManage || settingsBusy}
                              onClick={() =>
                                postOrganisationAction({
                                  action: "update_channel",
                                  channelId: channel.id,
                                  status: channel.status === "active" ? "disabled" : "active"
                                })
                              }
                              type="button"
                            >
                              {channel.status === "active" ? "Disable" : "Enable"}
                            </button>
                            {channel.status === "disabled" ? (
                              <button
                                className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={!settings.canManage || settingsBusy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Delete this disabled communication channel?"
                                    )
                                  ) {
                                    void postOrganisationAction({
                                      action: "delete_channel",
                                      channelId: channel.id
                                    });
                                  }
                                }}
                                type="button"
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {settings.channels.length === 0 ? (
                      <tr>
                        <td className="py-6 text-sm font-medium text-gray-500" colSpan={4}>
                          {emptyChannelCopy}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-base font-semibold text-gray-900">
              {preferenceHeading}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {preferenceDescription}
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500">
                    <th className="py-2 pr-4">Event</th>
                    <th className="py-2 pr-4">LINE</th>
                    <th className="py-2 pr-4">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {settings.eventKeys.map((eventKey) => (
                    <tr key={eventKey}>
                      <td className="py-3 pr-4 font-medium text-gray-900">
                        {readableToken(eventKey)}
                      </td>
                      {(["line", "email"] as const).map((channelType) => {
                        const preference = preferenceByKey.get(`${eventKey}:${channelType}`);

                        return (
                          <td key={channelType} className="py-3 pr-4">
                            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                              <input
                                checked={Boolean(preference?.enabled)}
                                disabled={!settings.canManage || settingsBusy}
                                onChange={(event) =>
                                  postOrganisationAction({
                                    action: "update_preference",
                                    channelType,
                                    enabled: event.target.checked,
                                    eventKey
                                  })
                                }
                                type="checkbox"
                              />
                              Enabled
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {settings && connectModalOpen ? (
        <AdminModal
          description={
            isPlatformScope
              ? "Add a platform notification destination."
              : "Add a retailer notification destination."
          }
          onClose={closeConnectModal}
          open={connectModalOpen}
          size="md"
          title="Add communication channel"
        >
          {settingsError ? (
            <p className="mx-6 mt-5 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-100">
              {settingsError}
            </p>
          ) : null}

          <div className="grid gap-2 border-b border-gray-100 px-6 py-5 sm:grid-cols-2">
            {connectProviderOptions.map((provider) => {
              const Icon = provider.icon;
              const selected = provider.id === connectMethod;

              return (
                <button
                  aria-pressed={!provider.disabled && selected}
                  className={classNames(
                    "flex min-h-20 items-start gap-3 rounded-md px-3 py-3 text-left ring-1 transition",
                    provider.disabled
                      ? "cursor-not-allowed bg-gray-50 text-gray-400 ring-gray-200"
                      : selected
                        ? "bg-[#ECFDF5] text-[#126B4F] ring-[#1FA77A]"
                        : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"
                  )}
                  disabled={provider.disabled}
                  key={provider.id}
                  onClick={() => selectConnectMethod(provider)}
                  type="button"
                >
                  <span
                    className={classNames(
                      "inline-flex size-9 shrink-0 items-center justify-center rounded-md ring-1",
                      provider.disabled
                        ? "bg-white text-gray-400 ring-gray-200"
                        : selected
                          ? "bg-white text-[#126B4F] ring-[#A7F3D0]"
                          : "bg-gray-50 text-gray-600 ring-gray-200"
                    )}
                  >
                    <Icon className="size-4" aria-hidden={true} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {provider.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5">
                      {provider.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {connectMethod === "email" ? (
            <div className="space-y-4 px-6 py-5">
              <label className="block">
                <span className="text-sm font-semibold text-gray-800">Contact name</span>
                <input
                  className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50"
                  disabled={!settings.canManage || settingsBusy}
                  onChange={(event) => setEmailContactName(event.target.value)}
                  placeholder="Delight Pharmacy orders desk"
                  type="text"
                  value={emailContactName}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-gray-800">Email address</span>
                <input
                  className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50"
                  disabled={!settings.canManage || settingsBusy}
                  onChange={(event) => setEmailAddress(event.target.value)}
                  placeholder="orders@example.com"
                  type="email"
                  value={emailAddress}
                />
              </label>
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={settingsBusy}
                  onClick={closeConnectModal}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-[#20343A] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    !settings.canManage ||
                    settingsBusy ||
                    !emailContactName.trim() ||
                    !emailAddress.trim()
                  }
                  onClick={addEmailChannel}
                  type="button"
                >
                  Add email
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                {lineCode?.lineUrl ? (
                  <a
                    className="block rounded-md bg-white p-2 ring-1 ring-gray-200"
                    href={lineCode.lineUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <img
                      alt="MattaNutra LINE connect QR code"
                      className="size-44"
                      height={176}
                      src={`/api/qr?data=${encodeURIComponent(lineCode.lineUrl)}`}
                      width={176}
                    />
                  </a>
                ) : (
                  <div className="grid size-48 place-items-center rounded-md bg-gray-50 p-4 text-center text-sm leading-6 text-gray-500 ring-1 ring-gray-200">
                    Create a code to show a QR that includes the connection message.
                  </div>
                )}
                <div className="text-sm leading-6 text-gray-600">
                  <p>
                    Enter a contact name, create a code, then scan the QR. The QR opens LINE with the connection message ready to send.
                  </p>
                  <a
                    className="mt-3 inline-flex text-sm font-semibold text-[#126B4F] hover:text-[#0F5D44]"
                    href={lineCode?.lineUrl ?? lineConnectUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {lineCode ? "Open LINE with code" : "Open LINE bot"}
                  </a>
                </div>
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-gray-800">Contact name</span>
                <input
                  className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50"
                  disabled={!settings.canManage || settingsBusy}
                  onChange={(event) => setLineContactName(event.target.value)}
                  placeholder="Person or group name"
                  type="text"
                  value={lineContactName}
                />
              </label>
              <button
                className="w-full rounded-md bg-[#20343A] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!settings.canManage || settingsBusy || !lineContactName.trim()}
                onClick={startLineConnection}
                type="button"
              >
                Create LINE connect code
              </button>
              {lineCode ? (
                <div className="rounded-md bg-gray-50 p-3 ring-1 ring-gray-200">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Send this message in LINE
                  </div>
                  <div className="mt-2 select-all rounded-md bg-[#20343A] px-3 py-2 font-mono text-sm font-semibold text-white">
                    {lineCode.command}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Expires {formatGeneratedAt(lineCode.expiresAt, locale)}
                  </div>
                </div>
              ) : null}
              <div className="flex justify-end border-t border-gray-100 pt-4">
                <button
                  className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={settingsBusy}
                  onClick={closeConnectModal}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </AdminModal>
      ) : null}

      {data.rows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="divide-y divide-gray-100">
            {data.rows.map((row) => (
              <article key={row.id} className="px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={classNames(
                          communicationStatusClass(row.status),
                          "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                        )}
                      >
                        {communicationStatusLabel(labels, row.status)}
                      </span>
                      <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                        {readableToken(row.channelType ?? row.provider ?? "manual")}
                      </span>
                    </div>

                    <h3 className="mt-3 text-base font-semibold text-gray-900">
                      {communicationTitle(row)}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">
                      {row.body}
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <SupplementListMeta
                        label={labels.communications.time}
                        value={formatGeneratedAt(row.createdAt, locale)}
                      />
                      <SupplementListMeta
                        label={labels.communications.messageType}
                        value={readableToken(row.messageType)}
                      />
                      <SupplementListMeta
                        label={labels.communications.address}
                        value={row.address ?? ""}
                      />
                      <SupplementListMeta
                        label={labels.communications.plan}
                        value={<PlanIdLink locale={locale} planId={row.planId} />}
                      />
                      <SupplementListMeta
                        label={labels.communications.task}
                        value={row.taskTitle ?? row.taskId ?? ""}
                      />
                    </div>

                    {row.errorMessage ? (
                      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-100">
                        {row.errorMessage}
                      </p>
                    ) : null}
                    {retryErrorId === row.id ? (
                      <p className="mt-3 text-sm font-medium text-red-700">
                        {labels.communications.retryError}
                      </p>
                    ) : null}
                  </div>

                  {row.status === "failed" || row.status === "no_channel" ? (
                    <button
                      className="inline-flex w-max items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={retryingId === row.id}
                      onClick={() => retryMessage(row)}
                      type="button"
                    >
                      {retryingId === row.id
                        ? labels.communications.retrying
                        : labels.communications.retry}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.communications.empty}
        </div>
      )}
    </section>
  );
}
