"use client";

import { useEffect, useState, type ComponentProps, type MouseEvent } from "react";
import { FormulationResults } from "@/components/formulation-results";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getDictionary, isLocale, localeDirection, localeHtmlLang, type Locale } from "@/lib/i18n";
import { nutritionRevealPath } from "@/lib/nutrition-paths";

type WebRevealPageProps = Pick<ComponentProps<typeof FormulationResults>, "initialResult" | "planId"> & {
  locale: Locale;
  commerce: NonNullable<ComponentProps<typeof FormulationResults>["commerce"]>;
};

/** Display language is local UI state; a language change must not restart a saved plan. */
export function WebRevealPage({ locale: initialLocale, planId, initialResult, commerce }: WebRevealPageProps) {
  const [locale, setLocale] = useState(initialLocale);
  const dictionary = getDictionary(locale);
  const currentPath = nutritionRevealPath(locale, planId);

  function revealLocale(url: URL) {
    const [, candidate, section, page, extra] = url.pathname.split("/");
    return url.origin === window.location.origin && isLocale(candidate) && section === "nutrition"
      && page === "reveal" && !extra && url.searchParams.get("plan") === planId ? candidate : null;
  }

  useEffect(() => {
    document.documentElement.lang = localeHtmlLang(locale);
    document.documentElement.dir = localeDirection(locale);
  }, [locale]);

  useEffect(() => {
    function restoreLanguage() {
      const url = new URL(window.location.href);
      const candidate = url.pathname.split("/")[1];
      if (isLocale(candidate) && url.pathname === `/${candidate}/nutrition/reveal` && url.searchParams.get("plan") === planId) {
        setLocale(candidate);
      }
    }
    window.addEventListener("popstate", restoreLanguage);
    return () => window.removeEventListener("popstate", restoreLanguage);
  }, [planId]);

  function switchLanguage(event: MouseEvent<HTMLElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest("a") : null;
    if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
    const target = new URL(anchor.href);
    const nextLocale = revealLocale(target);
    if (!nextLocale) return;
    event.preventDefault();
    if (nextLocale === locale) return;
    // Keep all current query parameters and scroll position, just like the current basket.
    const next = new URL(window.location.href);
    next.pathname = target.pathname;
    window.history.pushState(null, "", `${next.pathname}${next.search}${next.hash}`);
    setLocale(nextLocale);
  }

  return <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground" onClickCapture={switchLanguage}>
    <TitleBar currentLocale={locale} currentPath={currentPath} title={dictionary.hero.eyebrow} />
    <FormulationResults initialResult={initialResult} initialStackPreference="balanced"
      commerce={commerce} locale={locale} planId={planId} />
    <SiteFooter content={dictionary.footer} locale={locale} currentPath={currentPath} />
  </main>;
}
