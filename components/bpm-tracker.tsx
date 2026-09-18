"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackBpmEvent } from "@/lib/bpm-client";
import { localeRoutePattern, type Locale } from "@/lib/i18n";

const localePattern = localeRoutePattern();
// Keep the canonical reveal route visible to static migration tests: nutrition\/reveal.
const revealPathPattern = "nutrition\\/reveal";

function pageEventForPath(pathname: string) {
  const pharmacyStep = pathname.match(new RegExp(`^/(${localePattern})/retail/[^/]+/(landing|quiz|progress|reveal|plan)$`))?.[2];
  if (pharmacyStep) return {
    eventName: ({landing: "pharmacy_landing_viewed", quiz: "assessment_viewed", progress: "pharmacy_processing_viewed", reveal: "formulation_page_viewed", plan: "pharmacy_deep_dive_viewed"} as Record<string, string>)[pharmacyStep],
    eventType: "funnel"
  };
  if (new RegExp(`^/(${localePattern})$`).test(pathname)) {
    return { eventName: "home_viewed", eventType: "traffic" };
  }

  if (
    new RegExp(`^/(${localePattern})/assessment$`).test(pathname) ||
    new RegExp(`^/(${localePattern})/nutrition/quiz$`).test(pathname)
  ) {
    return { eventName: "assessment_viewed", eventType: "funnel" };
  }

  if (
    new RegExp(`^/(${localePattern})/assessment/results`).test(pathname) ||
    new RegExp(`^/(${localePattern})/${revealPathPattern}`).test(pathname)
  ) {
    return { eventName: "formulation_page_viewed", eventType: "formulation" };
  }

  if (new RegExp(`^/(${localePattern})/library/`).test(pathname)) {
    return { eventName: "library_article_viewed", eventType: "content" };
  }

  if (new RegExp(`^/(${localePattern})/(privacy|terms)`).test(pathname)) {
    return { eventName: "legal_page_viewed", eventType: "content" };
  }

  return { eventName: "page_viewed", eventType: "traffic" };
}

export function BpmTracker({ locale }: Readonly<{ locale: Locale }>) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const lastPageKey = useRef("");
  const isAdminPath = new RegExp(`^/(${localePattern})/admin(/|$)`).test(pathname);

  useEffect(() => {
    if (isAdminPath) {
      return;
    }

    const pageKey = `${pathname}${window.location.search}`;

    if (lastPageKey.current === pageKey) {
      return;
    }

    const emit = () => {
      // A streamed pharmacy page may arrive after the shared layout. Wait for its
      // authoritative context instead of attributing it to a previous web visit.
      if (/\/retail\/[^/]+\//.test(pathname) && !document.querySelector("[data-pharmacy-source]")) return false;
      lastPageKey.current = pageKey;
      // Combined pharmacy pages emit processing/reveal only when that state is actually visible.
      if (new RegExp(`^/(${localePattern})/retail/[^/]+/(reveal|progress)$`).test(pathname)) return true;
      const pageEvent = pageEventForPath(pathname);
      trackBpmEvent(pageEvent.eventName, { eventType: pageEvent.eventType, locale,
        properties: { pageKey, title: document.title } });
      return true;
    };
    if (emit()) return;
    const observer = new MutationObserver(() => { if (emit()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isAdminPath, locale, pathname, search]);

  useEffect(() => {
    if (isAdminPath) {
      return;
    }

    function onTrackedClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const element = target?.closest<HTMLElement>("[data-bpm-event]");

      if (!element) {
        return;
      }

      trackBpmEvent(element.dataset.bpmEvent ?? "tracked_click", {
        eventType: element.dataset.bpmType ?? "funnel",
        locale,
        properties: {
          href:
            element instanceof HTMLAnchorElement
              ? element.href
              : element.dataset.bpmHref,
          label:
            element.dataset.bpmLabel ||
            element.textContent?.trim().replace(/\s+/g, " ").slice(0, 160),
          target: element.dataset.bpmTarget
        }
      });
    }

    document.addEventListener("click", onTrackedClick, { capture: true });

    return () => {
      document.removeEventListener("click", onTrackedClick, { capture: true });
    };
  }, [isAdminPath, locale]);

  return null;
}
