"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { browserPixelPageSafe, type MetaPublicConfig } from "@/lib/meta-event-policy";
import { configureMetaClient, marketingGranted, trackMetaEvent } from "@/lib/meta-client";

const copy = {
  en: { title: "Advertising measurement", body: "Allow Meta to measure visits and purchases using browser identifiers, plan IDs and hashed contact details? We do not share health answers, results or supplement details. Your choice does not affect your assessment.", accept: "Allow", decline: "Decline", settings: "Privacy choices", error: "Could not save your choice. Please try again." },
  th: { title: "การวัดผลโฆษณา", body: "อนุญาตให้ Meta วัดผลการเข้าชมและการซื้อโดยใช้รหัสเบราว์เซอร์ รหัสแผน และข้อมูลติดต่อที่แฮชแล้วหรือไม่ เราไม่ส่งคำตอบ ผลสุขภาพ หรือรายละเอียดอาหารเสริม การเลือกนี้ไม่มีผลต่อแบบประเมิน", accept: "อนุญาต", decline: "ไม่อนุญาต", settings: "ตัวเลือกความเป็นส่วนตัว", error: "บันทึกตัวเลือกไม่สำเร็จ โปรดลองอีกครั้ง" },
  "zh-CN": { title: "广告衡量", body: "是否允许 Meta 使用浏览器标识、方案编号和经过哈希处理的联系方式衡量访问和购买？我们不会分享健康答案、结果或补充剂详情。此选择不会影响评估。", accept: "允许", decline: "拒绝", settings: "隐私选择", error: "无法保存，请重试。" }
};

export function MarketingPreference({ locale }: { locale: Locale }) {
  const [config, setConfig] = useState<MetaPublicConfig>({ enabled: false, pixelId: "", environment: "dev" });
  const navigation = useRef({ key: "", id: "" });
  const pathname = usePathname(), search = useSearchParams().toString();
  const [open, setOpen] = useState(false), [choice, setChoice] = useState(0), [saving, setSaving] = useState(false), [error, setError] = useState(false);
  const excluded = /\/(admin|api)(\/|$)/.test(pathname);
  useEffect(() => {
    if (excluded) return;
    let active = true;
    void fetch("/api/marketing/consent", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(value => {
      if (active && value && ["dev", "uat", "prd"].includes(value.environment)) {
        configureMetaClient(value); setConfig(value);
        setOpen(!document.cookie.split(";").some(c => /^mn_marketing=(granted|denied)$/.test(c.trim())));
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [excluded]);
  useLayoutEffect(() => {
    if (config.enabled && window.fbq && !browserPixelPageSafe(location.href, document.referrer, config.environment)) {
      window.fbq("consent", "revoke");
      location.reload();
    }
  }, [pathname, search, config.environment, config.enabled]);
  useEffect(() => {
    if (!config.enabled || excluded || !marketingGranted()) return;
    if (browserPixelPageSafe(location.href, document.referrer, config.environment) && !window.fbq) {
      const queue: unknown[][] = [];
      const fbq = Object.assign((...args: unknown[]) => { if (fbq.callMethod) fbq.callMethod(...args); else queue.push(args); },
        { queue, loaded: true, version: "2.0", callMethod: undefined as ((...args: unknown[]) => void) | undefined });
      window.fbq = window._fbq = fbq;
      fbq("set", "autoConfig", false, config.pixelId);
      fbq("init", config.pixelId);
      const script = document.createElement("script"); script.async = true; script.src = "https://connect.facebook.net/en_US/fbevents.js";
      script.referrerPolicy = "no-referrer"; document.head.appendChild(script);
    }
    window.fbq?.("consent", "grant");
    const navigationKey = `${pathname}?${search}:${choice}`;
    if (navigation.current.key !== navigationKey) navigation.current = { key: navigationKey, id: crypto.randomUUID() };
    void trackMetaEvent("PageView", { locale, stage: pathname.includes("checkout") ? "checkout" : pathname.includes("quiz") ? "assessment" : pathname.includes("healthscore") || pathname.includes("reveal") ? "results" : "landing" }, `navigation:${navigation.current.id}`);
    // Next's client navigation retains third-party scripts. Cross the boundary with a fresh document.
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (!link || link.origin !== location.origin || event.ctrlKey || event.metaKey || event.shiftKey || link.target === "_blank") return;
      const target = new URL(link.href);
      if (target.pathname.endsWith("/nutrition/payment/checkout")) void trackMetaEvent("SelectOffer", {
        locale, planId: target.searchParams.get("planId"), offer: target.searchParams.get("plan"), stage: "offer"
      });
      if (!window.fbq) return;
      if (!browserPixelPageSafe(link.href, location.href, config.environment)) { event.preventDefault(); event.stopPropagation(); location.assign(link.href); }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [config, excluded, pathname, search, locale, choice]);

  async function save(granted: boolean) {
    setSaving(true); setError(false);
    try {
      const response = await fetch("/api/marketing/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ granted, sourceUrl: location.href }) });
      if (!response.ok) throw new Error();
      if (granted && !document.cookie.split(";").some(c => c.trim().startsWith("_fbp="))) {
        const random = crypto.getRandomValues(new Uint32Array(1))[0];
        document.cookie = `_fbp=fb.1.${Date.now()}.${random}; Max-Age=${90 * 86400}; Path=/; SameSite=Lax; Secure`;
      }
      if (!granted) { window.fbq?.("consent", "revoke"); for (const name of ["_fbp", "_fbc"]) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`; }
      setOpen(false); setChoice(v => v + 1);
    } catch { setError(true); } finally { setSaving(false); }
  }
  if (!config.enabled || excluded) return null;
  const labels = copy[locale];
  return <aside className="fixed bottom-3 left-3 z-[90] max-w-sm rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-900 shadow-lg" aria-label={labels.title}>
    {open ? <><strong>{labels.title}</strong><p className="my-2">{labels.body}</p><div className="flex gap-3"><button type="button" disabled={saving} onClick={() => void save(true)} className="rounded bg-teal-900 px-4 py-2 text-white">{labels.accept}</button><button type="button" disabled={saving} onClick={() => void save(false)} className="rounded border border-stone-400 px-4 py-2">{labels.decline}</button></div>{error && <p role="alert">{labels.error}</p>}</>
      : <button type="button" onClick={() => setOpen(true)}>{labels.settings}</button>}
  </aside>;
}
