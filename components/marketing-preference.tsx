"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { browserPixelPageSafe, type MetaPublicConfig } from "@/lib/meta-event-policy";
import { configureMetaClient, marketingGranted, marketingPreferenceSaved, META_PREFERENCE_CHANGED, saveMarketingPreference, trackMetaEvent } from "@/lib/meta-client";

let initialPreference: Promise<boolean> | undefined;

export function MarketingPreference({ locale }: { locale: Locale }) {
  const [config, setConfig] = useState<MetaPublicConfig>({ enabled: false, pixelId: "", environment: "dev" });
  const navigation = useRef({ key: "", id: "" });
  const pathname = usePathname(), search = useSearchParams().toString();
  const [choice, setChoice] = useState(0);
  const excluded = /\/(admin|api)(\/|$)/.test(pathname);
  useEffect(() => {
    if (excluded) return;
    let active = true;
    void fetch("/api/marketing/consent", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(async value => {
      if (active && value && ["dev", "uat", "prd"].includes(value.environment)) {
        if (value.enabled && !marketingPreferenceSaved()) {
          initialPreference ??= saveMarketingPreference(true, "site_default");
          try { await initialPreference; } catch { initialPreference = undefined; }
        }
        if (active) { configureMetaClient(value); setConfig(value); }
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [excluded]);
  useEffect(() => {
    const changed = () => setChoice(value => value + 1);
    window.addEventListener(META_PREFERENCE_CHANGED, changed);
    return () => window.removeEventListener(META_PREFERENCE_CHANGED, changed);
  }, []);
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
      Object.assign(fbq, { push: fbq });
      window.fbq = window._fbq = fbq;
      fbq("set", "autoConfig", false, config.pixelId);
      fbq("init", config.pixelId);
      const script = document.createElement("script"); script.async = true; script.src = "https://connect.facebook.net/en_US/fbevents.js";
      script.referrerPolicy = "no-referrer"; document.head.appendChild(script);
    }
    window.fbq?.("consent", "grant");
    const navigationKey = `${pathname}?${search}:${choice}`;
    if (navigation.current.key !== navigationKey) navigation.current = { key: navigationKey, id: crypto.randomUUID() };
    void trackMetaEvent("PageView", { locale, provider: /\/connect\/(claude|perplexity|chatgpt|grok)/.exec(pathname)?.[1], stage: pathname.includes("/connect") ? pathname.split("/").length > 3 ? "connect_guide" : "connect" : pathname.includes("checkout") ? "checkout" : pathname.includes("quiz") ? "assessment" : pathname.includes("healthscore") || pathname.includes("reveal") ? "results" : "landing" }, `navigation:${navigation.current.id}`);
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

  return null;
}
