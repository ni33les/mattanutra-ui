"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import {
  DEFAULT_FACEBOOK_PIXEL_ID,
  facebookPixelEnabled,
  getFacebookPixelIds,
  initFacebookPixel,
  trackFacebookEvent,
  trackFacebookPageView
} from "@/lib/facebook-pixel";
import { localeRoutePattern, type Locale } from "@/lib/i18n";

const localePattern = localeRoutePattern();

/** Official Meta noscript fallback (same ID as the JS snippet). */
export function FacebookPixelNoscript() {
  if (!facebookPixelEnabled()) {
    return null;
  }

  const id = getFacebookPixelIds()[0] || DEFAULT_FACEBOOK_PIXEL_ID;

  return (
    <noscript>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        src={`https://www.facebook.com/tr?id=${encodeURIComponent(id)}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  );
}

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
 * Meta Pixel install matching the official base code:
 *   fbq('init', '27629903823308584');
 *   fbq('track', 'PageView');
 * plus SPA PageView + funnel events on client navigations.
 */
export function FacebookPixel({ locale }: Readonly<{ locale: Locale }>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPageKey = useRef("");
  const bootstrapped = useRef(false);
  const isAdminPath = new RegExp(`^/(${localePattern})/admin(/|$)`).test(
    pathname
  );

  const pixelIds = getFacebookPixelIds();
  const primaryId = pixelIds[0] || DEFAULT_FACEBOOK_PIXEL_ID;

  // Official bootstrap: init + first PageView (same as Meta snippet)
  const bootstrapScript = `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
${pixelIds.map((id) => `fbq('init', '${id}');`).join("\n")}
fbq('track', 'PageView');
`.trim();

  useEffect(() => {
    if (isAdminPath || !facebookPixelEnabled()) {
      return;
    }

    // Mark primary IDs as initialised for helper tracking after official bootstrap
    void initFacebookPixel().then(() => {
      bootstrapped.current = true;
    });
  }, [isAdminPath]);

  useEffect(() => {
    if (isAdminPath || !facebookPixelEnabled()) {
      return;
    }

    const query = searchParams?.toString() || "";
    const pageKey = `${pathname}${query ? `?${query}` : ""}`;

    // First PageView is fired by the official bootstrap script above.
    if (!lastPageKey.current) {
      lastPageKey.current = pageKey;
      return;
    }

    if (lastPageKey.current === pageKey) {
      return;
    }

    lastPageKey.current = pageKey;

    void trackFacebookPageView({
      content_name: document.title,
      content_category: contentCategoryForPath(pathname),
      locale
    });

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

  if (isAdminPath || !facebookPixelEnabled() || !primaryId) {
    return null;
  }

  return (
    <Script
      id="facebook-pixel-base"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{ __html: bootstrapScript }}
    />
  );
}
