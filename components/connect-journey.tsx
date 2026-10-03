"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, LoaderCircle } from "lucide-react";
import { connectBrowserEvents, connectHref, connectProviders, providerNames, type ConnectAttempt, type ConnectBrowserEvent, type ConnectProvider } from "@/lib/connect";
import { connectCopy, providerSetup } from "@/lib/connect-copy";
import { trackMetaEvent } from "@/lib/meta-client";
import { uuidPattern, type MetaEventName } from "@/lib/meta-event-policy";
import type { Locale } from "@/lib/i18n";

let fallbackVisitor: string | undefined;
function visitorId() {
  try {
    const saved = sessionStorage.getItem("mn:connect:visitor");
    if (saved && uuidPattern.test(saved)) return saved;
    const id = crypto.randomUUID(); sessionStorage.setItem("mn:connect:visitor", id); return id;
  } catch { return fallbackVisitor ??= crypto.randomUUID(); }
}
const metaNames: Partial<Record<ConnectBrowserEvent, MetaEventName>> = {
  provider_selected: "McpProviderSelected", url_copied: "McpUrlCopied", provider_opened: "McpProviderOpened", prompt_copied: "McpPromptCopied"
};
function track(name: typeof connectBrowserEvents[number], locale: Locale, provider?: ConnectProvider) {
  const sourceUrl = connectHref(locale, provider, location.search);
  void fetch("/api/connect/events", { method: "POST", keepalive: true, credentials: "same-origin", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: crypto.randomUUID(), visitorId: visitorId(), name, locale, provider, sourceUrl }) }).catch(() => undefined);
  const event = metaNames[name];
  if (event) void trackMetaEvent(event, { provider, locale, stage: "connect_guide" });
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
  const [search, setSearch] = useState("");
  useEffect(() => setSearch(location.search), []);
  const copy = connectCopy[locale];
  return <div className="mn-connect-providers">{connectProviders.map((provider, index) => <a key={provider}
    href={connectHref(locale, provider, search)} className="mn-connect-provider" onClick={() => track("provider_selected", locale, provider)}>
    <span className={`mn-connect-provider-mark mn-connect-provider-mark--${provider}`} aria-hidden>{["✳", "◎", "◈", "𝕏"][index]}</span>
    <h3>{providerNames[provider]}</h3><p>{copy.guides[provider].intro}</p>
    <span className="mn-connect-card-link">{copy.guide}<ArrowUpRight size={18} aria-hidden /></span>
  </a>)}</div>;
}

export function ConnectActions({ locale, provider, serverUrl }: { locale: Locale; provider: ConnectProvider; serverUrl: string }) {
  const copy = connectCopy[locale], storageKey = `mn:connect:attempt:${provider}`;
  const [attempt, setAttempt] = useState<ConnectAttempt | null>(null);
  const [status, setStatus] = useState<"idle" | "preparing" | "pending" | "verified" | "expired" | "unavailable" | "paused">("idle");
  const [feedback, setFeedback] = useState("");
  const [manual, setManual] = useState("");
  const [retry, setRetry] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const inFlight = useRef<Promise<ConnectAttempt | null> | null>(null);
  const activeAttempt = useRef<ConnectAttempt | null>(null);
  const manualInput = useRef<HTMLTextAreaElement>(null);
  const remember = (value: ConnectAttempt) => {
    activeAttempt.current = value; setAttempt(value); setStatus(value.status);
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Cookie still owns this attempt for the open page. */ }
  };

  useEffect(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) || "null") as ConnectAttempt | null;
      if (value && uuidPattern.test(value.id) && new URL(value.connectionUrl).origin === new URL(serverUrl).origin && new URL(value.connectionUrl).pathname === "/api/mcp") {
        const restored = { ...value, status: value.status === "verified" ? "pending" as const : Date.parse(value.expiresAt) <= Date.now() ? "expired" as const : "pending" as const };
        activeAttempt.current = restored; setAttempt(restored); setStatus(restored.status);
      }
    } catch { /* Storage may be disabled or cleared. */ }
  }, [storageKey, serverUrl]);

  useEffect(() => { if (manual) { manualInput.current?.focus(); manualInput.current?.select(); } }, [manual]);

  useEffect(() => {
    if (!attempt || attempt.status === "verified" || !panel.current) return;
    let visible = false, stopped = false, polling = false, started = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const controller = new AbortController();
    const check = async () => {
      if (stopped || polling || !visible || document.hidden) return;
      if (Date.now() - started >= 120000) { setStatus("paused"); clearInterval(timer); return; }
      polling = true;
      try {
        const response = await fetch(`/api/connect/attempts/${attempt.id}`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(7000)]) });
        if (!response.ok) throw new Error("Unavailable");
        const result = await response.json();
        if (stopped || result.id !== attempt.id || !["pending", "verified", "expired"].includes(result.status)) return;
        setStatus(result.status);
        if (result.status !== "pending") {
          clearInterval(timer); stopped = true;
          const next = { ...attempt, status: result.status } as ConnectAttempt;
          activeAttempt.current = next; setAttempt(next);
          try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Optional recovery cache. */ }
        }
      } catch { if (!controller.signal.aborted) setStatus("unavailable"); }
      finally { polling = false; }
    };
    const resume = () => {
      clearInterval(timer);
      if (stopped || !visible || document.hidden) return;
      started = Date.now(); void check(); timer = setInterval(() => void check(), 3000);
    };
    const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); resume(); }, { threshold: 0.05 });
    observer.observe(panel.current);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => { stopped = true; clearInterval(timer); controller.abort(); observer.disconnect(); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); };
  }, [attempt?.id, attempt?.status, retry, storageKey]);

  async function prepare(fresh = false): Promise<ConnectAttempt | null> {
    const current = activeAttempt.current;
    if (!fresh && current && Date.parse(current.expiresAt) > Date.now()) return current;
    if (inFlight.current) return inFlight.current;
    setStatus("preparing");
    inFlight.current = (async () => {
      try {
        const response = await fetch("/api/connect/attempts", { method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(10000), headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider, locale, visitorId: visitorId(), sourceUrl: location.href }) });
        if (!response.ok) throw new Error("Unavailable");
        const result = await response.json() as ConnectAttempt;
        if (!uuidPattern.test(result.id) || !result.connectionUrl) throw new Error("Invalid attempt");
        remember(result); return result;
      } catch { setStatus("unavailable"); return null; }
      finally { inFlight.current = null; }
    })();
    return inFlight.current;
  }

  async function copyText(value: string, kind: "url" | "prompt" | "starter") {
    setManual("");
    try {
      await navigator.clipboard.writeText(value); setFeedback(copy.copied);
      if (kind !== "starter") track(kind === "url" ? "url_copied" : "prompt_copied", locale, provider);
    } catch { setFeedback(copy.copyFailed); setManual(value); }
  }
  async function copyUrl(fresh = false) { const next = await prepare(fresh); await copyText(next?.connectionUrl || serverUrl, "url"); }
  const connectionUrl = attempt?.connectionUrl || serverUrl;
  return <div className="mn-connect-actions" ref={panel}>
    <div className="mn-connect-url-panel">
      <label htmlFor="connect-url">{copy.connectionUrl}</label>
      <textarea id="connect-url" readOnly rows={3} value={connectionUrl} onFocus={event => event.target.select()} spellCheck={false} dir="ltr" />
      <div className="mn-connect-buttons">
        <button className="mn-v15-button" onClick={() => void copyUrl()} disabled={status === "preparing"}><Copy size={17} aria-hidden />{copy.copyUrl}</button>
        <a className="mn-v15-button mn-v15-button--outline" href={providerSetup[provider].settings} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
          onClick={() => track("provider_opened", locale, provider)}>{copy.open}<ArrowUpRight size={17} aria-hidden /></a>
      </div>
      <p className="mn-connect-fineprint">{copy.privacy}</p>
    </div>
    <div className="mn-connect-test" id="connection-test">
      <span className="mn-v15-eyebrow">03</span><h2>{copy.testTitle}</h2><p>{copy.testDescription}</p>
      <blockquote>{copy.testPrompt}</blockquote>
      <button className="mn-v15-button mn-v15-button--outline" onClick={() => void copyText(copy.testPrompt, "prompt")}><Copy size={17} aria-hidden />{copy.copyPrompt}</button>
      <div className={`mn-connect-status mn-connect-status--${status}`} role="status" aria-live="polite" aria-atomic="true">
        {status === "verified" ? <Check aria-hidden size={20} /> : ["pending", "preparing"].includes(status) ? <LoaderCircle className="mn-connect-spinner" aria-hidden size={20} /> : null}
        <span>{status === "idle" ? copy.waiting : status === "preparing" ? copy.preparing : status === "pending" ? copy.waiting : copy[status]}</span>
      </div>
      {["paused", "unavailable"].includes(status) && attempt && <button className="mn-connect-text-button" onClick={() => setRetry(value => value + 1)}>{copy.retry}</button>}
      {["expired", "unavailable", "paused"].includes(status) && <button className="mn-connect-text-button" onClick={() => void copyUrl(true)}>{copy.newLink}</button>}
      {status === "unavailable" && <p className="mn-connect-fallback"><a href={serverUrl} rel="noreferrer">{serverUrl}</a></p>}
      {status === "verified" && <div className="mn-connect-starter"><h3>{copy.starterTitle}</h3><p>{copy.starterPrompt}</p>
        <button className="mn-v15-button" onClick={() => void copyText(copy.starterPrompt, "starter")}><Copy size={17} aria-hidden />{copy.copyStarter}</button></div>}
    </div>
    <p className="mn-connect-copy-feedback" role="status" aria-live="polite">{feedback}</p>
    {manual && <label className="mn-connect-manual">{copy.manualCopy}<textarea ref={manualInput} readOnly rows={5} value={manual} onFocus={event => event.target.select()} /></label>}
  </div>;
}
