"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";

type LivingProtocolLineCtaProps = Readonly<{
  className?: string;
  locale: Locale;
  mode?: "general" | "living_protocol" | "nutrition_plan";
  presentation?: "button" | "section";
  planId: string;
  retailCustomerOrderId?: string | null;
  showBody?: boolean;
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
    copied: "Copied",
    copy: "Copy code",
    error: "Could not create a LINE code. Please try again.",
    expires: "Code expires soon",
    instructions:
      "Scan the QR code or open LINE, then send the code below. It links this chat to your plan without putting private details in the message.",
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
    copied: "คัดลอกแล้ว",
    copy: "คัดลอกรหัส",
    error: "ไม่สามารถสร้างรหัส LINE ได้ โปรดลองอีกครั้ง",
    expires: "รหัสจะหมดอายุเร็ว ๆ นี้",
    instructions:
      "สแกน QR หรือเปิด LINE แล้วส่งรหัสด้านล่าง ระบบจะเชื่อมแชทนี้กับแผนของคุณโดยไม่ใส่ข้อมูลส่วนตัวในข้อความ",
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
    copied: "已复制",
    copy: "复制代码",
    error: "无法创建 LINE 代码，请重试。",
    expires: "代码即将过期",
    instructions:
      "扫描二维码或打开 LINE，然后发送下方代码。它会把聊天连接到你的方案，但不会在消息中包含隐私信息。",
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
  copied: string;
  copy: string;
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
  source
}: LivingProtocolLineCtaProps) {
  const labels = copy[locale];
  const modeLabels = labels.modes[mode];
  const [connect, setConnect] = useState<ConnectState>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
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

  async function openConnect() {
    setOpen(true);
    setError("");
    postBpm({
      eventName: "customer_line_cta_clicked",
      locale,
      planId,
      source
    });

    if (connect || loading) {
      return;
    }

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
    } catch {
      setError(labels.error);
    } finally {
      setLoading(false);
    }
  }

  async function copyCommand() {
    if (!connect?.command) {
      return;
    }

    await navigator.clipboard?.writeText(connect.command).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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
      {presentation === "section" ? (
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

            <div className="mt-5 grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
              <a
                className="grid size-40 place-items-center rounded-xl bg-white p-2 ring-1 ring-[var(--mn-line)]"
                href={connect?.lineUrl ?? "#"}
                rel="noreferrer"
                target="_blank"
              >
                {qrUrl ? (
                  <img
                    alt="MattaNutra LINE QR code"
                    className="size-36"
                    height={144}
                    src={qrUrl}
                    width={144}
                  />
                ) : (
                  <span className="text-sm text-[var(--mn-ash)]">
                    {loading ? labels.loading : "LINE"}
                  </span>
                )}
              </a>
              <div className="min-w-0">
                <div className="rounded-xl bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]">
                  <p className="font-mono text-lg font-bold text-[var(--mn-ink)]">
                    {connect?.command ?? (loading ? labels.loading : "MN PLAN")}
                  </p>
                  <p className="mt-2 text-xs text-[var(--mn-ash)]">
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
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--mn-line)] px-4 py-2 text-sm font-bold text-[var(--mn-ink)] hover:bg-[var(--mn-cream)] disabled:opacity-50"
                    disabled={!connect?.command}
                    onClick={copyCommand}
                    type="button"
                  >
                    {copied ? (
                      <Check aria-hidden className="size-4" />
                    ) : (
                      <Copy aria-hidden className="size-4" />
                    )}
                    {copied ? labels.copied : labels.copy}
                  </button>
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
