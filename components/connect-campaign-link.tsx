"use client";
import { useSyncExternalStore, type AnchorHTMLAttributes } from "react";
import { connectHref, isConnectProvider } from "@/lib/connect";
import { isLocale } from "@/lib/i18n";

function subscribe(callback: () => void) { window.addEventListener("popstate", callback); return () => window.removeEventListener("popstate", callback); }
export function useConnectSearch() { return useSyncExternalStore(subscribe, () => location.search, () => ""); }
export function ConnectCampaignLink({ href = "", ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const search = useConnectSearch();
  const url = new URL(href, "https://mattanutra.local");
  const [, locale, segment, provider] = url.pathname.split("/");
  const target = url.origin === "https://mattanutra.local" && isLocale(locale) && segment === "connect"
    ? connectHref(locale, isConnectProvider(provider) ? provider : undefined, search) + url.hash : href;
  return <a {...props} href={target} />;
}
