"use client";
import { useEffect, useState, type AnchorHTMLAttributes } from "react";
import { connectHref, isConnectProvider } from "@/lib/connect";
import { isLocale } from "@/lib/i18n";

export function ConnectCampaignLink({ href = "", ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [target, setTarget] = useState(href);
  useEffect(() => {
    const url = new URL(href, location.origin);
    const [, locale, segment, provider] = url.pathname.split("/");
    if (url.origin === location.origin && isLocale(locale) && segment === "connect")
      setTarget(connectHref(locale, isConnectProvider(provider) ? provider : undefined, location.search) + url.hash);
    else setTarget(href);
  }, [href]);
  return <a {...props} href={target} />;
}
