"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { browserPixelPageSafe, metaPageStage, type MetaPublicConfig } from "@/lib/meta-event-policy";
import { metaCampaignAttribution, metaClickId } from "@/lib/meta-attribution";
import { configureMetaClient, marketingGranted, marketingPreferenceSaved, META_PREFERENCE_CHANGED, saveMarketingPreference, trackMetaEvent } from "@/lib/meta-client";

let initialPreference: Promise<boolean> | undefined;
const startupRetryDelays = [500, 1500];

export function MarketingPreference({ locale }: { locale: Locale }) {
  const [config, setConfig] = useState<MetaPublicConfig | null>(null);
  const navigation = useRef({ key: "", id: "" });
  const pathname = usePathname(), search = useSearchParams().toString();
  const [choice, setChoice] = useState(0);
  const grantedPreference = useRef(marketingGranted());
  const excluded = /\/(admin|api)(\/|$)/.test(pathname);
  useEffect(() => {
    if (excluded) return;
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let latestConfig: MetaPublicConfig | undefined;
    const configure = (value: MetaPublicConfig) => {
      if (active) setConfig(value);
    };
    const initialise = async (attempt: number) => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch("/api/marketing/consent", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Could not load advertising configuration");
        const value = await response.json();
        if (!value || !["dev", "uat", "prd"].includes(value.environment) || typeof value.enabled !== "boolean" || typeof value.pixelId !== "string") {
          throw new Error("Invalid advertising configuration");
        }
        if (!active) return;
        latestConfig = value;
        const adArrival = metaClickId(location.href, value.environment) || Object.keys(metaCampaignAttribution(location.href, value.environment)).length > 0;
        if (value.enabled && (!marketingPreferenceSaved() || marketingGranted() && adArrival)) {
          initialPreference ??= saveMarketingPreference(true, "site_default");
          const saving = initialPreference;
          // Coalesce only an in-flight save; later mounts may need a fresh context.
          try { await saving; } finally { if (initialPreference === saving) initialPreference = undefined; }
        }
        configure(value);
      } catch {
        if (!active) return;
        if (attempt < startupRetryDelays.length) {
          retryTimer = setTimeout(() => { void initialise(attempt + 1); }, startupRetryDelays[attempt]);
        } else if (latestConfig) {
          // A later explicit Privacy choice can still start tracking after retries end.
          configure(latestConfig);
        }
      } finally {
        clearTimeout(timeout);
      }
    };
    void initialise(0);
    return () => { active = false; clearTimeout(retryTimer); controller?.abort(); };
  }, [excluded]);
  useEffect(() => {
    const changed = () => {
      const granted = marketingGranted();
      if (grantedPreference.current === granted) return;
      grantedPreference.current = granted;
      setChoice(value => value + 1);
    };
    window.addEventListener(META_PREFERENCE_CHANGED, changed);
    return () => window.removeEventListener(META_PREFERENCE_CHANGED, changed);
  }, []);
  useLayoutEffect(() => {
    if (config?.enabled && window.fbq && !browserPixelPageSafe(location.href, document.referrer, config.environment)) {
      window.fbq("consent", "revoke");
      location.reload();
    }
  }, [pathname, search, config?.environment, config?.enabled]);
  useEffect(() => {
    if (!config) return;
    if (!config.enabled || excluded || !marketingGranted()) { configureMetaClient(config); return; }
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
    // Install the Pixel queue before releasing funnel events captured during startup.
    configureMetaClient(config);
    const navigationKey = `${pathname}?${search}:${choice}`;
    if (navigation.current.key !== navigationKey) navigation.current = { key: navigationKey, id: crypto.randomUUID() };
    void trackMetaEvent("PageView", { locale, provider: /\/connect\/(claude|perplexity|chatgpt|grok)/.exec(pathname)?.[1], stage: metaPageStage(pathname) }, `navigation:${navigation.current.id}`);
    // Next's client navigation retains third-party scripts. Cross the boundary with a fresh document.
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (!link || link.origin !== location.origin || event.ctrlKey || event.metaKey || event.shiftKey || link.target === "_blank") return;
      const target = new URL(link.href);
      if (target.pathname.endsWith("/nutrition/payment/checkout")) void trackMetaEvent("SelectOffer", {
        locale, planId: target.searchParams.get("planId"), offer: target.searchParams.get("plan"), purchase_type: "plan", stage: "offer"
      });
      if (!window.fbq) return;
      if (!browserPixelPageSafe(link.href, location.href, config.environment)) { event.preventDefault(); event.stopPropagation(); location.assign(link.href); }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [config, excluded, pathname, search, locale, choice]);

  return null;
}
