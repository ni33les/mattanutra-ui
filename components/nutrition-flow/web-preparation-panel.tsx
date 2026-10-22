"use client";
import { useEffect, useState } from "react";
import { nutritionRevealPath } from "@/lib/nutrition-paths";
import type { Locale } from "@/lib/i18n";
import { webProductCopy } from "./web-product-copy";
import "./web-preparation.css";

export function WebRevealRecovery({ failed, ready, locale, planId, retry }: {
  failed: boolean; ready: boolean;
  locale: Locale; planId: string; retry: () => void;
}) {
  const c = webProductCopy[locale];
  const [slower, setSlower] = useState(false), [copied, setCopied] = useState(false), [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setSlower(true), 120_000);
    return () => window.clearTimeout(timer);
  }, [planId, ready]);
  async function copyLink() {
    try { await navigator.clipboard.writeText(new URL(nutritionRevealPath(locale, planId), window.location.origin).href); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); }
  }
  if (ready || (!failed && !slower)) return null;
  return <section className="mn-web-recovery" data-testid="web-reveal-recovery">
    <p role="status">{failed ? c.failed : c.slower}</p>
    {failed && <button type="button" data-testid="formulation-retry" className="mn-recovery-button" onClick={retry}>{c.retry}</button>}
    <div className="mn-web-resume">
      <p>{c.saved}</p><button type="button" onClick={copyLink}>{copied ? c.copied : c.copy}</button>
      {copyFailed && <p role="status">{c.copyFailed} <a href={nutritionRevealPath(locale, planId)}>{nutritionRevealPath(locale, planId)}</a></p>}
    </div>
  </section>;
}
