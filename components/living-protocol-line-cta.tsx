"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";

type LivingProtocolLineCtaProps = Readonly<{
  className?: string;
  locale: Locale;
  planId: string;
  retailCustomerOrderId?: string | null;
  source: string;
}>;

type ConnectState = Readonly<{
  code: string;
  command: string;
  expiresAt: string;
  lineUrl: string;
}> | null;

const copy = {
  en: {
    body:
      "Connect with Panya for order help and protocol questions. Living Protocol coaching unlocks with the full service.",
    close: "Close",
    copied: "Copied",
    copy: "Copy code",
    error: "Could not create a LINE code. Please try again.",
    expires: "Code expires soon",
    instructions:
      "Open LINE, add MattaNutra, then send this message exactly as shown.",
    loading: "Creating code...",
    openLine: "Open LINE",
    title: "Connect on LINE"
  },
  th: {
    body:
      "เชื่อมต่อกับ Panya เพื่อขอความช่วยเหลือเรื่องคำสั่งซื้อและคำถามเกี่ยวกับโปรโตคอล บริการโค้ช Living Protocol จะเปิดใช้เมื่อซื้อบริการเต็มรูปแบบ",
    close: "ปิด",
    copied: "คัดลอกแล้ว",
    copy: "คัดลอกรหัส",
    error: "ไม่สามารถสร้างรหัส LINE ได้ โปรดลองอีกครั้ง",
    expires: "รหัสจะหมดอายุเร็ว ๆ นี้",
    instructions:
      "เปิด LINE เพิ่ม MattaNutra แล้วส่งข้อความนี้ตามที่แสดง",
    loading: "กำลังสร้างรหัส...",
    openLine: "เปิด LINE",
    title: "เชื่อมต่อผ่าน LINE"
  },
  "zh-CN": {
    body:
      "连接 Panya，获取订单帮助并询问方案相关问题。完整 Living Protocol 服务开通后，可获得持续指导。",
    close: "关闭",
    copied: "已复制",
    copy: "复制代码",
    error: "无法创建 LINE 代码，请重试。",
    expires: "代码即将过期",
    instructions: "打开 LINE，添加 MattaNutra，然后准确发送以下消息。",
    loading: "正在创建代码...",
    openLine: "打开 LINE",
    title: "连接 LINE"
  }
} satisfies Record<Locale, Record<string, string>>;

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
  planId,
  retailCustomerOrderId,
  source
}: LivingProtocolLineCtaProps) {
  const labels = copy[locale];
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

  return (
    <div className={className}>
      <button
        className="inline-flex items-center gap-2 rounded-full bg-[#06C755] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#05B34D]"
        onClick={openConnect}
        type="button"
      >
        <MessageCircle aria-hidden className="size-4" />
        {labels.title}
      </button>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--mn-ink-soft)]">
        {labels.body}
      </p>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--mn-paper)] p-6 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-3xl font-medium text-[var(--mn-ink)]">
                  {labels.title}
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
