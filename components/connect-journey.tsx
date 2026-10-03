"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Copy } from "lucide-react";
import { connectBrowserEvents, connectHref, connectProviders, providerNames, type ConnectBrowserEvent, type ConnectProvider } from "@/lib/connect";
import { connectCopy, providerSetup } from "@/lib/connect-copy";
import { trackMetaEvent } from "@/lib/meta-client";
import { uuidPattern, type MetaEventName } from "@/lib/meta-event-policy";
import type { Locale } from "@/lib/i18n";
import { useConnectSearch } from "@/components/connect-campaign-link";

let fallbackVisitor: string | undefined;
function visitorId() {
  try {
    const saved = sessionStorage.getItem("mn:connect:visitor");
    if (saved && uuidPattern.test(saved)) return saved;
    const id = crypto.randomUUID(); sessionStorage.setItem("mn:connect:visitor", id); return id;
  } catch { return fallbackVisitor ??= crypto.randomUUID(); }
}
const metaNames: Partial<Record<ConnectBrowserEvent, MetaEventName>> = {
  provider_selected: "McpProviderSelected", url_copied: "McpUrlCopied", provider_opened: "McpProviderOpened"
};
function track(name: typeof connectBrowserEvents[number], locale: Locale, provider?: ConnectProvider) {
  const sourceUrl = connectHref(locale, provider, location.search);
  void fetch("/api/connect/events", { method: "POST", keepalive: true, credentials: "same-origin", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: crypto.randomUUID(), visitorId: visitorId(), name, locale, provider, sourceUrl }) }).catch(() => undefined);
  const event = metaNames[name];
  if (event) void trackMetaEvent(event, { provider, locale, stage: provider ? "connect_guide" : "connect" });
}

export function ConnectVisit({ locale, provider }: { locale: Locale; provider?: ConnectProvider }) {
  const last = useRef("");
  useEffect(() => {
    const key = `${locale}:${provider || "landing"}`;
    if (last.current !== key) { last.current = key; track("page_viewed", locale, provider); }
  }, [locale, provider]);
  return null;
}

export function ConnectProviderCards({ locale }: { locale: Locale }) {
  const search = useConnectSearch();
  const copy = connectCopy[locale];
  return <div className="mn-connect-providers">{connectProviders.map((provider, index) => <a key={provider}
    href={connectHref(locale, provider, search)} className="mn-connect-provider" onClick={() => track("provider_selected", locale, provider)}>
    <span className={`mn-connect-provider-mark mn-connect-provider-mark--${provider}`} aria-hidden>{["✳", "◎", "◈", "𝕏"][index]}</span>
    <h3>{providerNames[provider]}</h3>
    <span className="mn-connect-card-link">{copy.guide}<ArrowUpRight size={18} aria-hidden /></span>
  </a>)}</div>;
}

export function ConnectActions({ locale, provider, serverUrl }: { locale: Locale; provider?: ConnectProvider; serverUrl: string }) {
  const copy = connectCopy[locale];
  const [feedback, setFeedback] = useState("");
  const urlInput = useRef<HTMLInputElement>(null);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(serverUrl);
      setFeedback(copy.copied);
      track("url_copied", locale, provider);
    } catch {
      setFeedback(copy.copyFailed);
      urlInput.current?.focus();
      urlInput.current?.select();
    }
  }

  return <div className="mn-connect-actions">
    <label htmlFor="connect-url">{copy.connectionUrl}</label>
    <div className="mn-connect-copy-row">
      <input ref={urlInput} id="connect-url" readOnly value={serverUrl} onFocus={event => event.target.select()} spellCheck={false} dir="ltr" />
      <button className="mn-v15-button" onClick={() => void copyUrl()}><Copy size={17} aria-hidden />{copy.copyUrl}</button>
    </div>
    <p className="mn-connect-copy-feedback" role="status" aria-live="polite">{feedback}</p>
    <p className="mn-connect-privacy">{copy.privacy}</p>
    {provider && <a className="mn-connect-settings" href={providerSetup[provider].settings} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
      onClick={() => track("provider_opened", locale, provider)}>{copy.open}<ArrowUpRight size={17} aria-hidden /></a>}
  </div>;
}
