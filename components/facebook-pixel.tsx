"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  facebookPixelEnabled,
  initFacebookPixel,
  trackFacebookEvent,
  trackFacebookPageView
} from "@/lib/facebook-pixel";
import { localeRoutePattern, type Locale } from "@/lib/i18n";

const localePattern = localeRoutePattern();

function contentCategoryForPath(pathname: string) {
  if (new RegExp(`^/(${localePattern})$`).test(pathname)) {
    return "home";
  }

  if (
    new RegExp(`^/(${localePattern})/assessment$`).test(pathname) ||
    new RegExp(`^/(${localePattern})/nutrition/quiz$`).test(pathname)
  ) {
    return "assessment";
  }

  if (new RegExp(`^/(${localePattern})/nutrition/healthscore`).test(pathname)) {
    return "healthscore";
  }

  if (
    new RegExp(`^/(${localePattern})/assessment/results`).test(pathname) ||
    new RegExp(`^/(${localePattern})/nutrition/reveal`).test(pathname)
  ) {
    return "formulation";
  }

  if (new RegExp(`^/(${localePattern})/library`).test(pathname)) {
    return "library";
  }

  if (new RegExp(`^/(${localePattern})/basket`).test(pathname)) {
    return "basket";
  }

  return "site";
}

/**
 * Loads Meta Pixel and fires PageView on client navigations.
 * Conversion events are fired via trackFacebookFromBpm / trackFacebookEvent.
 */
export function FacebookPixel({ locale }: Readonly<{ locale: Locale }>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPageKey = useRef("");
  const isAdminPath = new RegExp(`^/(${localePattern})/admin(/|$)`).test(
    pathname
  );

  useEffect(() => {
    if (isAdminPath || !facebookPixelEnabled()) {
      return;
    }

    void initFacebookPixel();
  }, [isAdminPath]);

  useEffect(() => {
    if (isAdminPath || !facebookPixelEnabled()) {
      return;
    }

    const query = searchParams?.toString() || "";
    const pageKey = `${pathname}${query ? `?${query}` : ""}`;

    if (lastPageKey.current === pageKey) {
      return;
    }

    lastPageKey.current = pageKey;

    void trackFacebookPageView({
      content_name: document.title,
      content_category: contentCategoryForPath(pathname),
      locale
    });

    // Funnel-specific standard events on key pages
    const category = contentCategoryForPath(pathname);

    if (category === "assessment") {
      void trackFacebookEvent("InitiateCheckout", {
        content_name: "questionnaire",
        content_category: "assessment",
        locale
      });
    }

    if (category === "healthscore") {
      void trackFacebookEvent("CompleteRegistration", {
        content_name: "healthscore",
        content_category: "healthscore",
        locale,
        status: true
      });
    }

    if (category === "library") {
      void trackFacebookEvent("ViewContent", {
        content_name: document.title,
        content_category: "library",
        content_type: "article",
        locale
      });
    }
  }, [isAdminPath, locale, pathname, searchParams]);

  return null;
}
