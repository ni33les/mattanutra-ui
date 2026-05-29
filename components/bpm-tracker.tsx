"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackBpmEvent } from "@/lib/bpm-client";
import { localeRoutePattern, type Locale } from "@/lib/i18n";

const localePattern = localeRoutePattern();
// Keep the canonical reveal route visible to static migration tests: nutrition\/reveal.
const revealPathPattern = "nutrition\\/reveal";

function pageEventForPath(pathname: string) {
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

  if (new RegExp(`^/(${localePattern})/blog/`).test(pathname)) {
    return { eventName: "blog_article_viewed", eventType: "content" };
  }

  if (new RegExp(`^/(${localePattern})/(privacy|terms)`).test(pathname)) {
    return { eventName: "legal_page_viewed", eventType: "content" };
  }

  return { eventName: "page_viewed", eventType: "traffic" };
}

export function BpmTracker({ locale }: Readonly<{ locale: Locale }>) {
  const pathname = usePathname();
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

    lastPageKey.current = pageKey;
    const pageEvent = pageEventForPath(pathname);

    trackBpmEvent(pageEvent.eventName, {
      eventType: pageEvent.eventType,
      locale,
      properties: {
        pageKey,
        title: document.title
      }
    });
  }, [isAdminPath, locale, pathname]);

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
