import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { BpmTracker } from "@/components/bpm-tracker";
import { MarketingPreference } from "@/components/marketing-preference";
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

// Marketing pages under this layout use ISR / default caching.
// Personal funnels (admin, assessment, basket, nutrition, order) set
// force-dynamic on their own route segments.

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

  return (
    <html dir={localeDirection(locale)} lang={localeHtmlLang(locale)}>
      <body
        className={[
          bodyFont.variable,
          displayFont.variable,
          monoFont.variable,
          thaiFont.variable,
          thaiSerifFont.variable
        ].join(" ")}
      >
        <Suspense fallback={null}><BpmTracker locale={locale} /></Suspense>
        <Suspense fallback={null}>
          <MarketingPreference locale={locale} />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
