"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackBpmEvent } from "@/lib/bpm-client";
import type { Locale } from "@/lib/i18n";

function pageEventForPath(pathname: string) {
  if (/^\/(en|th)$/.test(pathname)) {
    return { eventName: "home_viewed", eventType: "traffic" };
  }

  if (/^\/(en|th)\/assessment$/.test(pathname)) {
    return { eventName: "assessment_viewed", eventType: "funnel" };
  }

  if (/^\/(en|th)\/assessment\/results/.test(pathname)) {
    return { eventName: "formulation_page_viewed", eventType: "formulation" };
  }

  if (/^\/(en|th)\/blog\//.test(pathname)) {
    return { eventName: "blog_article_viewed", eventType: "content" };
  }

  if (/^\/(en|th)\/(privacy|terms)/.test(pathname)) {
    return { eventName: "legal_page_viewed", eventType: "content" };
  }

  return { eventName: "page_viewed", eventType: "traffic" };
}

export function BpmTracker({ locale }: Readonly<{ locale: Locale }>) {
  const pathname = usePathname();
  const lastPageKey = useRef("");
  const isAdminPath = /^\/(en|th)\/admin(\/|$)/.test(pathname);

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
