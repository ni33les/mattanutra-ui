"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Pause, Play } from "lucide-react";
import { nutritionRevealPath } from "@/lib/nutrition-paths";
import type { Locale } from "@/lib/i18n";
import { webPreparationCards, webProductCopy } from "./web-product-copy";
import "./web-preparation.css";

export function WebPreparationDetails({ answers, failed, ready, locale, planId, retry }: {
  answers: Record<string, unknown>; failed: boolean; ready: boolean;
  locale: Locale; planId: string; retry: () => void;
}) {
  const c = webProductCopy[locale], cards = webPreparationCards(answers, locale);
  const root = useRef<HTMLElement | null>(null);
  const [startedPending] = useState(!ready);
  const [card, setCard] = useState(0), [paused, setPaused] = useState(false);
  const [pointerInside, setPointerInside] = useState(false), [focusInside, setFocusInside] = useState(false);
  const interacting = pointerInside || focusInside;
  const [preparationHeight, setPreparationHeight] = useState(0);
  const [slower, setSlower] = useState(false), [copied, setCopied] = useState(false), [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => {
    if (ready || !root.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => { for (const entry of entries) setPreparationHeight(entry.target.getBoundingClientRect().height); });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [ready]);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setSlower(true), 120_000);
    return () => window.clearTimeout(timer);
  }, [planId, ready]);
  useEffect(() => {
    if (ready || failed || paused || interacting) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      if (!document.hidden && !motion.matches) timer = setInterval(() => setCard(value => (value + 1) % cards.length), 6000);
    };
    sync(); document.addEventListener("visibilitychange", sync); motion.addEventListener("change", sync);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", sync); motion.removeEventListener("change", sync); };
  }, [cards.length, failed, interacting, paused, ready]);
  async function copyLink() {
    try { await navigator.clipboard.writeText(new URL(nutritionRevealPath(locale, planId), window.location.origin).href); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); }
  }
  if (ready && !startedPending) return null;
  return <section ref={root} className="mn-web-preparation-details" style={ready && preparationHeight ? { minHeight: preparationHeight } : undefined}>
    <p role="status" className="mn-web-progress-message">{!ready && <LoaderCircle aria-hidden="true" className={failed ? "" : "mn-web-spinner"} size={18} />}{ready ? c.ready : failed ? c.failed : slower ? c.slower : c.estimate}</p>
    {failed && <button type="button" data-testid="formulation-retry" className="mn-recovery-button" onClick={retry}>{c.retry}</button>}
    <div>
      {(!ready || startedPending) && <div className="mn-web-detail-carousel" aria-label={c.details}
        onPointerEnter={() => setPointerInside(true)} onPointerLeave={() => setPointerInside(false)}
        onFocusCapture={() => setFocusInside(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false); }}>
        <article data-testid="web-preparation-detail" data-card={cards[card].id}>
          <p className="mn-mono-label">{cards[card].title}</p>
          {cards[card].value && <h2>{cards[card].value}</h2>}
          <p>{cards[card].body}</p>
        </article>
        <div className="mn-web-detail-controls">
          <button type="button" aria-label={c.previous} onClick={() => setCard(value => (value + cards.length - 1) % cards.length)}><ChevronLeft size={18} /></button>
          <span aria-hidden="true">{card + 1} / {cards.length}</span>
          <button type="button" aria-label={c.next} onClick={() => setCard(value => (value + 1) % cards.length)}><ChevronRight size={18} /></button>
          <button type="button" aria-label={paused ? c.play : c.pause} onClick={() => setPaused(value => !value)}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
        </div>
      </div>}
    </div>
    <div className="mn-web-resume">
      <p>{c.saved}</p><button type="button" onClick={copyLink}>{copied ? c.copied : c.copy}</button>
      {copyFailed && <p role="status">{c.copyFailed} <a href={nutritionRevealPath(locale, planId)}>{nutritionRevealPath(locale, planId)}</a></p>}
    </div>
  </section>;
}
