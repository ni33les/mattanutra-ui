import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { BpmTracker } from "@/components/bpm-tracker";
import { MarketingPreference } from "@/components/marketing-preference";
import { metaPublicConfig } from "@/lib/meta-config";
import { META_CONSENT_COOKIE, metaCustomData, metaEventName, metaPageStage } from "@/lib/meta-event-policy";
import { metaPixelBootstrapScript } from "@/lib/meta-pixel-bootstrap";
import { META_PAGE_PATH_HEADER } from "@/lib/meta-page-request";
import { journeyChannelForPath } from "@/lib/journey-channel";
import "../globals.css";
import "../library-article-body.css";
import "../customer.css";
import {
  defaultLocale,
  getDictionary,
  isLocale,
  localeDirection,
  localeHtmlLang
} from "@/lib/i18n";

// The header uses runtime tracking config and the visitor's opt-out. Render it
// per request so build-time env and another visitor's preference cannot leak
// through the full-route cache. Page/data-level caches can still be used.

type LocaleLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}>;

// Bundle fonts so production builds do not depend on Google Fonts responses.
const bodyFont = localFont({
  src: "../../public/assets/pharmacy/fonts/dm-sans.ttf",
  variable: "--mn-font-body",
  display: "swap",
  weight: "100 1000",
  style: "normal",
  adjustFontFallback: "Arial"
});

const displayFont = localFont({
  src: [
    {
      path: "../../public/assets/pharmacy/fonts/fraunces.ttf",
      weight: "100 900",
      style: "normal"
    },
    {
      path: "../../public/assets/pharmacy/fonts/fraunces-italic.ttf",
      weight: "100 900",
      style: "italic"
    }
  ],
  variable: "--mn-font-display",
  display: "swap",
  adjustFontFallback: "Times New Roman"
});

// Google intermittently returns extensionless URLs that next/font cannot parse.
const monoFont = localFont({
  src: "../../public/assets/pharmacy/fonts/jetbrains-mono.woff2",
  variable: "--mn-font-mono",
  display: "swap",
  weight: "100 800",
  fallback: ["monospace"]
});

const thaiFont = localFont({
  src: "../../public/assets/pharmacy/fonts/noto-sans-thai.ttf",
  weight: "400 700",
  style: "normal",
  variable: "--mn-font-thai",
  display: "swap",
  adjustFontFallback: "Arial"
});

// Reuse the site's bundled variable font; Google can return extensionless URLs
// that Next's Google font loader cannot parse during a cloud build.
const thaiSerifFont = localFont({
  src: "../../public/assets/pharmacy/fonts/noto-serif-thai.ttf",
  weight: "100 900",
  adjustFontFallback: "Times New Roman",
  variable: "--mn-font-thai-serif",
  display: "swap"
});

export async function generateMetadata({
  params
}: Pick<LocaleLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const dictionary = getDictionary(isLocale(locale) ? locale : defaultLocale);

  return {
    title: dictionary.meta.title,
    description: dictionary.meta.description,
    icons: {
      apple: "/favicon.svg",
      icon: "/favicon.svg",
      shortcut: "/favicon.svg"
    }
  };
}

export default async function LocaleLayout({
  children,
  params
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const [requestHeaders, requestCookies] = await Promise.all([headers(), cookies()]);
  const pathname = requestHeaders.get(META_PAGE_PATH_HEADER) ?? "";
  const config = metaPublicConfig();
  const publicPage = pathname.split("/")[1] === locale && !/\/(admin|api)(\/|$)/.test(pathname);
  const enabled = config.enabled && publicPage && requestCookies.get(META_CONSENT_COOKIE)?.value !== "denied";
  const bootstrap = enabled ? metaPixelBootstrapScript(config, metaCustomData("PageView", {
    locale, channel: journeyChannelForPath(pathname), stage: metaPageStage(pathname),
    provider: /\/connect\/(claude|perplexity|chatgpt|grok)/.exec(pathname)?.[1]
  }, config.environment)) : "";

  return (
    <html dir={localeDirection(locale)} lang={localeHtmlLang(locale)}>
      <head>
        {bootstrap && <script id="meta-pixel-base" dangerouslySetInnerHTML={{ __html: bootstrap }} />}
      </head>
      <body
        className={[
          bodyFont.variable,
          displayFont.variable,
          monoFont.variable,
          thaiFont.variable,
          thaiSerifFont.variable
        ].join(" ")}
      >
        {bootstrap && (
          <noscript>
            {/* An image fallback belongs in body, not head (HTML parsing rules). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img height="1" width="1" style={{ display: "none" }} alt=""
              src={`https://www.facebook.com/tr?id=${encodeURIComponent(config.pixelId)}&ev=${metaEventName("PageView", config.environment)}&noscript=1`} />
          </noscript>
        )}
        <Suspense fallback={null}><BpmTracker locale={locale} /></Suspense>
        <Suspense fallback={null}>
          <MarketingPreference locale={locale} />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
