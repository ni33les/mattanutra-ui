"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, MessageCircle, X } from "lucide-react";
import { trackBpmEvent } from "@/lib/bpm-client";
import type { Locale } from "@/lib/i18n";

type LivingProtocolLineCtaProps = Readonly<{
  className?: string;
  locale: Locale;
  mode?: "general" | "living_protocol" | "nutrition_plan";
  presentation?: "button" | "inline_qr" | "section";
  planId: string;
  retailCustomerOrderId?: string | null;
  showBody?: boolean;
  showEyebrow?: boolean;
  source: string;
}>;

type LineCtaModeCopy = Readonly<{
  body: string;
  button: string;
  dialogTitle: string;
  eyebrow: string;
  heading: string;
}>;

type ConnectState = Readonly<{
  code: string;
  command: string;
  expiresAt: string;
  lineUrl: string;
}> | null;

const copy = {
  en: {
    close: "Close",
    error: "Could not create a LINE code at this time.",
    expires: "Code expires soon",
    instructions:
      "Scan the QR or open LINE. The connect message is prefilled; tap send in LINE and Panya will recognise this plan.",
    lineNote: "Opens LINE. The code expires shortly.",
    loading: "Creating code...",
    modes: {
      general: {
        body:
          "Ask about your order, your plan, or what to do next. Panya can help you navigate MattaNutra and bring in a human when needed.",
        button: "Connect with Panya",
        dialogTitle: "Connect with Panya on LINE",
        eyebrow: "LINE support",
        heading: "Connect with Panya"
      },
      living_protocol: {
        body:
          "Use LINE to keep the conversation going as sleep, stress, travel, food, or symptoms change. Panya keeps support connected to your MattaNutra plan.",
        button: "Connect with Panya",
        dialogTitle: "Connect with Panya on LINE",
        eyebrow: "Living Protocol",
        heading: "Connect with Panya for ongoing nutrition support"
      },
      nutrition_plan: {
        body:
          "Ask why nutrients were selected, how to read your plan, and what to do next. Ongoing refinement is available with Living Protocol.",
        button: "Connect with Panya",
        dialogTitle: "Connect with Panya on LINE",
        eyebrow: "Plan support",
        heading: "Connect with Panya to discuss your nutrition plan"
      }
    },
    openLine: "Open LINE",
  },
  th: {
    close: "ปิด",
    error: "ไม่สามารถสร้างรหัส LINE ได้ในขณะนี้",
    expires: "รหัสจะหมดอายุเร็ว ๆ นี้",
    instructions:
      "สแกน QR หรือเปิด LINE ข้อความเชื่อมต่อจะถูกใส่ไว้ให้แล้ว กดส่งใน LINE แล้ว Panya จะรู้ว่าเป็นแผนนี้",
    lineNote: "เปิด LINE รหัสจะหมดอายุในไม่ช้า",
    loading: "กำลังสร้างรหัส...",
    modes: {
      general: {
        body:
          "ถามเรื่องคำสั่งซื้อ แผนโภชนาการ หรือขั้นตอนถัดไปได้ Panya จะช่วยพาคุณใช้งาน MattaNutra และส่งต่อให้ทีมงานเมื่อจำเป็น",
        button: "เชื่อมต่อกับ Panya",
        dialogTitle: "เชื่อมต่อกับ Panya บน LINE",
        eyebrow: "ช่วยเหลือผ่าน LINE",
        heading: "เชื่อมต่อกับ Panya"
      },
      living_protocol: {
        body:
          "ใช้ LINE เพื่อคุยต่อเมื่อการนอน ความเครียด การเดินทาง อาหาร หรืออาการเปลี่ยนไป Panya จะอ้างอิงการช่วยเหลือกับแผน MattaNutra ของคุณ",
        button: "เชื่อมต่อกับ Panya",
        dialogTitle: "เชื่อมต่อกับ Panya บน LINE",
        eyebrow: "Living Protocol",
        heading: "เชื่อมต่อกับ Panya เพื่อดูแลโภชนาการอย่างต่อเนื่อง"
      },
      nutrition_plan: {
        body:
          "ถามได้ว่าทำไมจึงเลือกสารอาหารเหล่านี้ ควรอ่านแผนอย่างไร และควรทำอะไรต่อ การปรับแผนต่อเนื่องจะอยู่ในบริการ Living Protocol",
        button: "เชื่อมต่อกับ Panya",
        dialogTitle: "เชื่อมต่อกับ Panya บน LINE",
        eyebrow: "ช่วยเหลือเรื่องแผน",
        heading: "เชื่อมต่อกับ Panya เพื่อคุยเรื่องแผนโภชนาการของคุณ"
      }
    },
    openLine: "เปิด LINE",
  },
  "zh-CN": {
    close: "关闭",
    error: "目前无法创建 LINE 代码。",
    expires: "代码即将过期",
    instructions:
      "扫描二维码或打开 LINE。连接消息会自动填好；在 LINE 中点发送后，Panya 会识别这份方案。",
    lineNote: "打开 LINE。代码会在短时间后过期。",
    loading: "正在创建代码...",
    modes: {
      general: {
        body:
          "你可以询问订单、方案或下一步怎么做。Panya 会帮助你使用 MattaNutra，并在需要时转给人工团队。",
        button: "连接 Panya",
        dialogTitle: "在 LINE 上连接 Panya",
        eyebrow: "LINE 支持",
        heading: "连接 Panya"
      },
      living_protocol: {
        body:
          "当睡眠、压力、旅行、饮食或症状发生变化时，可通过 LINE 持续沟通。Panya 会把支持与你的 MattaNutra 方案保持关联。",
        button: "连接 Panya",
        dialogTitle: "在 LINE 上连接 Panya",
        eyebrow: "Living Protocol",
        heading: "连接 Panya，获得持续营养支持"
      },
      nutrition_plan: {
        body:
          "你可以询问为什么选择这些营养素、如何理解方案以及下一步怎么做。持续调整服务包含在 Living Protocol 中。",
        button: "连接 Panya",
        dialogTitle: "在 LINE 上连接 Panya",
        eyebrow: "方案支持",
        heading: "连接 Panya，讨论你的营养方案"
      }
    },
    openLine: "打开 LINE",
  }
} satisfies Record<Locale, {
  close: string;
  error: string;
  expires: string;
  instructions: string;
  lineNote: string;
  loading: string;
  modes: Record<NonNullable<LivingProtocolLineCtaProps["mode"]>, LineCtaModeCopy>;
  openLine: string;
}>;

function postBpm(input: Readonly<{
  eventName: string;
  locale: Locale;
  planId: string;
  source: string;
}>) {
  void fetch("/api/bpm", {
    body: JSON.stringify({
      eventName: input.eventName,
      eventStatus: "observed",
      eventType: "chat",
      locale: input.locale,
      planId: input.planId,
      properties: {
        source: input.source
      }
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  }).catch(() => undefined);
}

export function LivingProtocolLineCta({
  className = "",
  locale,
  mode = "general",
  presentation = "button",
  planId,
  retailCustomerOrderId,
  showBody = true,
  showEyebrow = true,
  source
}: LivingProtocolLineCtaProps) {
  const labels = copy[locale];
  const modeLabels = labels.modes[mode];
  const [connect, setConnect] = useState<ConnectState>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const qrUrl = useMemo(
    () =>
      connect?.lineUrl
        ? `/api/qr?data=${encodeURIComponent(connect.lineUrl)}`
        : "",
    [connect?.lineUrl]
  );

  useEffect(() => {
    postBpm({
      eventName: "customer_line_cta_viewed",
      locale,
      planId,
      source
    });
  }, [locale, planId, source]);

  const createConnectCode = useCallback(async () => {
    if (connect || loading) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await fetch(`/api/assessment/${planId}/line-connect`, {
        body: JSON.stringify({
          retailCustomerOrderId,
          source
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.command || !payload?.lineUrl) {
        throw new Error("LINE connect failed");
      }

      setConnect({
        code: String(payload.code ?? ""),
        command: String(payload.command),
        expiresAt: String(payload.expiresAt ?? ""),
        lineUrl: String(payload.lineUrl)
      });

      // Meta Subscribe + BPM: connect code issued (user starting LINE link).
      trackBpmEvent("line_connected", {
        eventType: "funnel",
        locale,
        planId,
        properties: {
          channel: "web",
          source
        }
      });
    } catch {
      setError(labels.error);
    } finally {
      setLoading(false);
    }
  }, [connect, labels.error, loading, locale, planId, retailCustomerOrderId, source]);

  useEffect(() => {
    if (presentation !== "inline_qr") {
      return;
    }

    const timer = window.setTimeout(() => {
      void createConnectCode();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [createConnectCode, presentation]);

  async function openConnect() {
    setOpen(true);
    postBpm({
      eventName: "customer_line_cta_clicked",
      locale,
      planId,
      source
    });

    await createConnectCode();
  }

  const trigger = (
    <button
      className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-[#06C755] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#05B34D] focus:outline-none focus:ring-2 focus:ring-[#06C755]/40 focus:ring-offset-2"
      onClick={openConnect}
      type="button"
    >
      <MessageCircle aria-hidden className="size-4" />
      {modeLabels.button}
    </button>
  );

  return (
    <div className={className}>
      {presentation === "inline_qr" ? (
        <div className="mn-font-body text-sm leading-6 text-[var(--mn-ink-soft)]">
          <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
            <a
              aria-label={modeLabels.dialogTitle}
              className={`mx-auto grid size-44 place-items-center rounded-2xl bg-white p-3 ring-1 ring-[var(--mn-line)] transition hover:ring-[var(--mn-teal)] ${
                connect?.lineUrl ? "" : "pointer-events-none"
              }`}
              href={connect?.lineUrl ?? "#"}
              rel="noreferrer"
              target="_blank"
            >
              {qrUrl ? (
                <Image
                  alt="MattaNutra LINE connect QR code"
                  className="size-36"
                  height={144}
                  src={qrUrl}
                  unoptimized={true}
                  width={144}
                />
              ) : (
                <span className="px-3 text-center text-sm leading-6 text-[var(--mn-ash)]">
                  {loading ? labels.loading : "LINE"}
                </span>
              )}
            </a>
            <div className="min-w-0">
              {showEyebrow ? (
                <p className="text-sm font-medium leading-6 text-[var(--mn-ink)]">
                  {modeLabels.eyebrow}
                </p>
              ) : null}
              <h2 className="text-xl font-semibold leading-7 text-[var(--mn-ink)]">
                {modeLabels.heading}
              </h2>
              <p className="mt-3">{modeLabels.body}</p>
              <p className="mt-3">{labels.instructions}</p>
              <div className="mt-4 rounded-[14px] border border-[var(--mn-line)] bg-[var(--mn-cream)] px-4 py-3">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold text-[var(--mn-ink-soft)]">
                    MN
                  </span>
                  <span className="font-mono text-lg font-semibold text-[var(--mn-ink)]">
                    {connect?.code ?? (loading ? labels.loading : "")}
                  </span>
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--mn-ash)]">
                  {labels.expires}
                </p>
              </div>
              {error ? (
                <p className="mt-3 text-sm font-semibold text-[var(--mn-error)]">
                  {error}
                </p>
              ) : null}
              {connect?.lineUrl ? (
                <a
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#06C755] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_-8px_rgb(6_199_85_/_0.6)] hover:bg-[#05B34D]"
                  href={connect.lineUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {labels.openLine}
                  <ExternalLink aria-hidden className="size-4" />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : presentation === "section" ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--mn-line)] bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-soft)] sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--mn-teal-deep)]">
                {modeLabels.eyebrow}
              </p>
              <h3 className="mt-2 font-serif text-2xl font-medium leading-tight text-[var(--mn-ink)] sm:text-3xl">
                {modeLabels.heading}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--mn-ink-soft)] sm:text-base">
                {modeLabels.body}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 lg:items-end">
              {trigger}
              <p className="max-w-xs text-xs leading-5 text-[var(--mn-ash)] lg:text-right">
                {labels.lineNote}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {trigger}
          {showBody ? (
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--mn-ink-soft)]">
              {modeLabels.body}
            </p>
          ) : null}
        </>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--mn-paper)] p-6 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-3xl font-medium text-[var(--mn-ink)]">
                  {modeLabels.dialogTitle}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--mn-ink-soft)]">
                  {labels.instructions}
                </p>
              </div>
              <button
                aria-label={labels.close}
                className="rounded-full p-2 text-[var(--mn-ash)] hover:bg-[var(--mn-cream)]"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
              <a
                aria-label="MattaNutra LINE connect QR code"
                className={`grid size-48 place-items-center rounded-2xl bg-white p-3 ring-1 ring-[var(--mn-line)] ${
                  connect?.lineUrl ? "" : "pointer-events-none"
                }`}
                href={connect?.lineUrl ?? "#"}
                rel="noreferrer"
                target="_blank"
              >
                {qrUrl ? (
                  <Image
                    alt="MattaNutra LINE connect QR code"
                    className="size-40"
                    height={160}
                    src={qrUrl}
                    unoptimized={true}
                    width={160}
                  />
                ) : (
                  <span className="text-sm text-[var(--mn-ash)]">
                    {loading ? labels.loading : "LINE"}
                  </span>
                )}
              </a>
              <div className="min-w-0">
                <div className="rounded-[14px] border border-[var(--mn-line)] bg-[var(--mn-cream)] px-4 py-3">
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold text-[var(--mn-ink-soft)]">
                      MN
                    </span>
                    <span className="font-mono text-xl font-semibold text-[var(--mn-ink)]">
                      {connect?.code ?? (loading ? labels.loading : "")}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--mn-ash)]">
                    {labels.expires}
                  </p>
                </div>
                {error ? (
                  <p className="mt-3 text-sm font-semibold text-[var(--mn-error)]">
                    {error}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white ${
                      connect?.lineUrl
                        ? "bg-[#06C755] hover:bg-[#05B34D]"
                        : "pointer-events-none bg-[#06C755]/50"
                    }`}
                    href={connect?.lineUrl ?? "#"}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {labels.openLine}
                    <ExternalLink aria-hidden className="size-4" />
                  </a>
                </div>
              </div>
            </div>

            <button
              className="mt-6 w-full rounded-full border border-[var(--mn-line)] px-4 py-3 text-sm font-bold text-[var(--mn-ink)] hover:bg-[var(--mn-cream)]"
              onClick={() => setOpen(false)}
              type="button"
            >
              {labels.close}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
