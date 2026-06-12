"use client";

import { useMemo, useState } from "react";
import type { AdminPanyaData } from "@/lib/admin-panya";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type { PanyaConfig } from "@/lib/panya";
import type { Locale } from "@/lib/i18n";
import {
  BusinessStatsGrid,
  PlanIdLink,
  adminTaskVisibilityHref,
  classNames,
  formatGeneratedAt,
  formatNumber,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { SupplementListMeta } from "@/components/admin/safety-views";

type PanyaViewProps = Readonly<{
  accessToken: string;
  data: AdminPanyaData;
  locale: Locale;
  range: AdminDashboardRange;
  section: PanyaSection;
}>;

type ConversationFilter = "threads" | "messages" | "livingProtocol" | "escalated";
type PanyaSection = "configuration" | "conversations";
type ConversationThread = AdminPanyaData["conversations"][number];

function conversationMatchesFilter(
  conversation: ConversationThread,
  filter: ConversationFilter
) {
  if (filter === "messages") {
    return conversation.messageCount > 0;
  }

  if (filter === "livingProtocol") {
    return conversation.entitlement === "living_protocol";
  }

  if (filter === "escalated") {
    return (
      conversation.escalationCount > 0 || Boolean(conversation.openEscalationTaskId)
    );
  }

  return true;
}

function configText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function configNumber(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? String(parsed) : String(fallback);
}

function questionText(value: readonly string[]) {
  return value.join("\n");
}

function lines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function configFromState(state: ReturnType<typeof initialConfigState>): PanyaConfig {
  return {
    checkIns: {
      enabled: state.checkInsEnabled,
      minimumDaysBetweenMessages: Number(state.minimumDaysBetweenMessages) || 7,
      quietDaysAfterInbound: Number(state.quietDaysAfterInbound) || 3,
      questions: {
        en: lines(state.questionsEn),
        th: lines(state.questionsTh),
        "zh-CN": lines(state.questionsZh)
      }
    },
    guardrails: state.guardrails,
    quotas: {
      living_protocol: Number(state.quotaLivingProtocol) || 32,
      right_amount_formula: Number(state.quotaRightAmountFormula) || 12,
      unpaid: Number(state.quotaUnpaid) || 12
    },
    soul: state.soul,
    upsellTone: state.upsellTone
  };
}

function initialConfigState(config: PanyaConfig) {
  return {
    checkInsEnabled: config.checkIns.enabled,
    guardrails: config.guardrails,
    minimumDaysBetweenMessages: configNumber(
      config.checkIns.minimumDaysBetweenMessages,
      7
    ),
    questionsEn: questionText(config.checkIns.questions.en),
    questionsTh: questionText(config.checkIns.questions.th),
    questionsZh: questionText(config.checkIns.questions["zh-CN"]),
    quietDaysAfterInbound: configNumber(config.checkIns.quietDaysAfterInbound, 3),
    quotaLivingProtocol: configNumber(config.quotas.living_protocol, 32),
    quotaRightAmountFormula: configNumber(config.quotas.right_amount_formula, 12),
    quotaUnpaid: configNumber(config.quotas.unpaid, 12),
    soul: config.soul,
    upsellTone: config.upsellTone
  };
}

function conversationStatusClass(input: Readonly<{
  escalationCount: number;
  failedCount: number;
}>) {
  if (input.failedCount > 0) {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (input.escalationCount > 0) {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  return "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]";
}

export function AdminPanyaView({
  accessToken,
  data,
  locale,
  range,
  section: activeSection
}: PanyaViewProps) {
  const [selectedThreadKey, setSelectedThreadKey] = useState(
    data.selectedThreadKey ?? data.conversations[0]?.threadKey ?? null
  );
  const [conversationFilter, setConversationFilter] =
    useState<ConversationFilter>("threads");
  const [configState, setConfigState] = useState(() =>
    initialConfigState(data.activeConfig)
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState("");
  const metrics = useMemo<BusinessMetric[]>(
    () => [
      {
        color: "blue",
        id: "threads",
        label: "Conversations",
        series: [],
        value: formatNumber(data.summary.totalThreads, locale)
      },
      {
        color: "green",
        id: "messages",
        label: "Messages",
        series: [],
        value: formatNumber(data.summary.totalMessages, locale)
      },
      {
        color: "purple",
        id: "livingProtocol",
        label: "Living Protocol",
        series: [],
        value: formatNumber(data.summary.livingProtocol, locale)
      },
      {
        color: "red",
        id: "escalated",
        label: "Escalated",
        series: [],
        value: formatNumber(data.summary.escalated, locale)
      }
    ],
    [data.summary, locale]
  );
  const visibleConversations = useMemo(
    () =>
      data.conversations.filter((conversation) =>
        conversationMatchesFilter(conversation, conversationFilter)
      ),
    [conversationFilter, data.conversations]
  );
  const selectedThread =
    data.conversations.find((thread) => thread.threadKey === selectedThreadKey) ??
    visibleConversations[0] ??
    data.conversations[0] ??
    null;
  const exportQuery = accessToken
    ? `?access_token=${encodeURIComponent(accessToken)}`
    : "";
  const conversationHref = (threadKey: string) => {
    const params = new URLSearchParams({
      conversation: threadKey,
      range,
      view: "panya"
    });
    params.set("section", "conversations");

    if (accessToken) {
      params.set("access_token", accessToken);
    }

    return `/${locale}/admin/dashboard?${params.toString()}`;
  };

  async function saveConfig() {
    if (busy) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/panya", {
        body: JSON.stringify({
          action: "save_config",
          config: configFromState(configState)
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(configText(json.error) || "Could not save Panya config");
      }

      setMessage("Panya configuration activated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save Panya config"
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!selectedThread?.planId || replyBusy) {
      return;
    }

    setReplyBusy(true);
    setReplyError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/panya", {
        body: JSON.stringify({
          action: "send_reply",
          planId: selectedThread.planId,
          reply: replyBody,
          threadKey: selectedThread.threadKey
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(configText(json.error) || "Could not send reply");
      }

      setReplyBody("");
      setMessage(
        configText(json.message?.status) === "queued"
          ? "Reply queued for LINE delivery."
          : "Reply saved, but no active LINE channel was available."
      );

      if (typeof window !== "undefined") {
        window.location.href = conversationHref(selectedThread.threadKey);
      }
    } catch (sendError) {
      setReplyError(
        sendError instanceof Error ? sendError.message : "Could not send reply"
      );
    } finally {
      setReplyBusy(false);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#126B4F]">
            Panya
          </p>
          <h2 className="mt-1 text-2xl font-bold text-gray-900">
            Customer agent control room
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
            Configure Panya's voice, limits, check-ins, and review permanent
            customer conversations across LINE and future chat channels.
          </p>
        </div>
        {activeSection === "conversations" ? (
          <div className="flex flex-wrap gap-2">
            <a
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50"
              href={`/api/admin/panya/export${exportQuery ? `${exportQuery}&` : "?"}format=csv`}
            >
              Export CSV
            </a>
            <a
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50"
              href={`/api/admin/panya/export${exportQuery ? `${exportQuery}&` : "?"}format=json`}
            >
              Export JSON
            </a>
          </div>
        ) : null}
      </div>

      {activeSection === "conversations" ? (
        <BusinessStatsGrid
          metrics={metrics}
          onMetricSelect={(id) => setConversationFilter(id as ConversationFilter)}
          selectedMetricId={conversationFilter}
        />
      ) : null}

      <div
        className={classNames(
          "grid gap-6",
          activeSection === "conversations" &&
            "xl:grid-cols-[minmax(18rem,0.42fr)_minmax(0,1fr)]"
        )}
      >
        <section
          className={classNames(
            activeSection !== "configuration" && "hidden",
            "rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Soul and guardrails
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Active version{" "}
                {data.activeConfigVersion
                  ? `v${data.activeConfigVersion.version}`
                  : "uses defaults"}
                .
              </p>
            </div>
            <button
              className="rounded-md bg-[#1FA77A] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#188865] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              onClick={saveConfig}
              type="button"
            >
              {busy ? "Saving..." : "Activate config"}
            </button>
          </div>

          {message ? (
            <p className="mt-4 rounded-md bg-[#ECFDF5] px-3 py-2 text-sm font-semibold text-[#126B4F] ring-1 ring-[#A7F3D0]">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-100">
              {error}
            </p>
          ) : null}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-gray-800">Soul</span>
              <textarea
                className="mt-1 min-h-28 w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300"
                onChange={(event) =>
                  setConfigState((current) => ({
                    ...current,
                    soul: event.target.value
                  }))
                }
                value={configState.soul}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-gray-800">
                Guardrails
              </span>
              <textarea
                className="mt-1 min-h-36 w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300"
                onChange={(event) =>
                  setConfigState((current) => ({
                    ...current,
                    guardrails: event.target.value
                  }))
                }
                value={configState.guardrails}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-gray-800">
                Upsell tone
              </span>
              <textarea
                className="mt-1 min-h-24 w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300"
                onChange={(event) =>
                  setConfigState((current) => ({
                    ...current,
                    upsellTone: event.target.value
                  }))
                }
                value={configState.upsellTone}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Living Protocol", "quotaLivingProtocol"],
                ["Right Amount Formula", "quotaRightAmountFormula"],
                ["Unpaid", "quotaUnpaid"]
              ].map(([label, key]) => (
                <label className="block" key={key}>
                  <span className="text-sm font-semibold text-gray-800">
                    {label}
                  </span>
                  <input
                    className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300"
                    min={1}
                    onChange={(event) =>
                      setConfigState((current) => ({
                        ...current,
                        [key]: event.target.value
                      }))
                    }
                    type="number"
                    value={String(configState[key as keyof typeof configState])}
                  />
                </label>
              ))}
            </div>

            <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
                <input
                  checked={configState.checkInsEnabled}
                  onChange={(event) =>
                    setConfigState((current) => ({
                      ...current,
                      checkInsEnabled: event.target.checked
                    }))
                  }
                  type="checkbox"
                />
                Proactive check-ins enabled
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">
                    Minimum days between messages
                  </span>
                  <input
                    className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300"
                    min={1}
                    onChange={(event) =>
                      setConfigState((current) => ({
                        ...current,
                        minimumDaysBetweenMessages: event.target.value
                      }))
                    }
                    type="number"
                    value={configState.minimumDaysBetweenMessages}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">
                    Quiet days after inbound
                  </span>
                  <input
                    className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300"
                    min={0}
                    onChange={(event) =>
                      setConfigState((current) => ({
                        ...current,
                        quietDaysAfterInbound: event.target.value
                      }))
                    }
                    type="number"
                    value={configState.quietDaysAfterInbound}
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3">
                {[
                  ["English questions", "questionsEn"],
                  ["Thai questions", "questionsTh"],
                  ["Chinese questions", "questionsZh"]
                ].map(([label, key]) => (
                  <label className="block" key={key}>
                    <span className="text-xs font-semibold text-gray-600">
                      {label}
                    </span>
                    <textarea
                      className="mt-1 min-h-20 w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300"
                      onChange={(event) =>
                        setConfigState((current) => ({
                          ...current,
                          [key]: event.target.value
                        }))
                      }
                      value={String(configState[key as keyof typeof configState])}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          className={classNames(
            activeSection !== "conversations" && "hidden",
            "rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200"
          )}
        >
          <h3 className="text-lg font-semibold text-gray-900">Conversations</h3>
          <p className="mt-1 text-sm text-gray-600">
            Permanent customer communication archive. Message text is kept here,
            not in BPM payloads.
          </p>

          <div className="mt-5 grid max-h-[calc(100vh-20rem)] min-h-[28rem] gap-2 overflow-y-auto pr-1">
            {visibleConversations.map((conversation) => (
              <a
                className={classNames(
                  "block rounded-xl p-3 text-left ring-1 transition",
                  conversation.threadKey === selectedThread?.threadKey
                    ? "bg-[#ECFDF5] ring-[#1FA77A]"
                    : "bg-white ring-gray-200 hover:bg-gray-50"
                )}
                href={conversationHref(conversation.threadKey)}
                key={conversation.threadKey}
                onClick={() => setSelectedThreadKey(conversation.threadKey)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={classNames(
                      conversationStatusClass(conversation),
                      "rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
                    )}
                  >
                    {conversation.failedCount > 0
                      ? "Failed"
                      : conversation.escalationCount > 0
                        ? "Escalated"
                        : "Active"}
                  </span>
                  <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                    {conversation.entitlementLabel}
                  </span>
                  {conversation.openEscalationTaskId ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                      Human task
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 font-semibold text-gray-900">
                  {conversation.firstName ||
                    conversation.orderNumber ||
                    conversation.address ||
                    "Customer conversation"}
                </div>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-600">
                  {conversation.latestSnippet || "No message preview"}
                </p>
                <div className="mt-2 text-xs font-medium text-gray-500">
                  {formatGeneratedAt(conversation.lastMessageAt, locale)} ·{" "}
                  {formatNumber(conversation.messageCount, locale)} messages
                </div>
              </a>
            ))}
            {visibleConversations.length === 0 ? (
              <div className="rounded-xl bg-gray-50 p-6 text-sm font-medium text-gray-500 ring-1 ring-gray-200">
                {data.conversations.length === 0
                  ? "No customer conversations yet."
                  : "No conversations match this filter."}
              </div>
            ) : null}
          </div>
        </section>

        <section
          className={classNames(
            activeSection !== "conversations" && "hidden",
            "rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200"
          )}
        >
        <div className="flex flex-col gap-3 border-b border-gray-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {selectedThread?.firstName ||
                selectedThread?.orderNumber ||
                "Conversation detail"}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {selectedThread
                ? `${selectedThread.entitlementLabel} · ${selectedThread.locale ?? "unknown locale"}`
                : "Select a conversation to inspect the timeline."}
            </p>
          </div>
          {selectedThread ? (
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <SupplementListMeta
                label="Plan"
                value={<PlanIdLink locale={locale} planId={selectedThread.planId} />}
              />
              <SupplementListMeta
                label="Order"
                value={selectedThread.orderNumber ?? ""}
              />
              <SupplementListMeta
                label="Channel"
                value={readableToken(selectedThread.channelType ?? "line")}
              />
            </div>
          ) : null}
        </div>

        {selectedThread?.openEscalationTaskId ? (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <div className="font-semibold">Human review task is open</div>
            <p className="mt-1">
              Panya escalated this conversation. Review the task flow item or
              reply directly below.
            </p>
            <a
              className="mt-3 inline-flex rounded-md bg-white px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
              href={adminTaskVisibilityHref({
                accessToken,
                locale,
                range,
                taskId: selectedThread.openEscalationTaskId
              })}
            >
              Open human task
            </a>
          </div>
        ) : null}

        <div className="mt-5 max-h-[calc(100vh-26rem)] min-h-[22rem] space-y-3 overflow-y-auto pr-1">
          {data.messages.map((message) => {
            const outbound = message.direction === "outbound";
            const escalated = message.escalated;

            return (
              <article
                className={classNames(
                  "max-w-3xl rounded-2xl px-4 py-3 ring-1",
                  escalated
                    ? "bg-red-50 ring-red-200"
                    : outbound
                    ? "ml-auto bg-[#ECFDF5] ring-[#A7F3D0]"
                    : "bg-gray-50 ring-gray-200"
                )}
                key={message.id}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">
                  <span>{outbound ? "Panya / MattaNutra" : "Customer"}</span>
                  <span>·</span>
                  <span>{readableToken(message.messageType)}</span>
                  <span>·</span>
                  <span>{formatGeneratedAt(message.createdAt, locale)}</span>
                  {escalated ? (
                    <>
                      <span>·</span>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700 ring-1 ring-red-200">
                        Escalated
                      </span>
                    </>
                  ) : null}
                  <span
                    className={classNames(
                      message.status === "failed" || message.status === "no_channel"
                        ? "bg-red-50 text-red-700 ring-red-100"
                        : "bg-white text-gray-600 ring-gray-200",
                      "rounded-full px-2 py-0.5 ring-1"
                    )}
                  >
                    {readableToken(message.status)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-800">
                  {message.body}
                </p>
                {message.errorMessage ? (
                  <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                    {message.errorMessage}
                  </p>
                ) : null}
              </article>
            );
          })}
          {selectedThread && data.messages.length === 0 ? (
            <p className="rounded-xl bg-gray-50 p-6 text-sm font-medium text-gray-500 ring-1 ring-gray-200">
              No messages loaded for this conversation.
            </p>
          ) : null}
        </div>

        {selectedThread?.planId ? (
          <div className="mt-6 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
            <label className="block">
              <span className="text-sm font-semibold text-gray-900">
                Reply as MattaNutra
              </span>
              <textarea
                className="mt-2 min-h-28 w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300"
                onChange={(event) => setReplyBody(event.target.value)}
                placeholder="Write a reply to send through LINE..."
                value={replyBody}
              />
            </label>
            {replyError ? (
              <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-100">
                {replyError}
              </p>
            ) : null}
            <div className="mt-3 flex justify-end">
              <button
                className="rounded-md bg-[#1FA77A] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#188865] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={replyBusy || replyBody.trim().length < 1}
                onClick={sendReply}
                type="button"
              >
                {replyBusy ? "Queueing..." : "Send LINE reply"}
              </button>
            </div>
          </div>
        ) : selectedThread ? (
          <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm font-medium text-gray-600 ring-1 ring-gray-200">
            This conversation is not linked to a plan yet, so direct replies are
            disabled until the customer connects with a plan code.
          </div>
        ) : null}
      </section>
      </div>
    </section>
  );
}
