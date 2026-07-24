import type { Metadata } from "next";
import {
  DM_Sans,
  Fraunces,
  JetBrains_Mono,
  Noto_Sans_Thai,
  Noto_Serif_Thai
} from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BpmTracker } from "@/components/bpm-tracker";
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

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--mn-font-body",
  display: "swap",
  weight: "variable",
  axes: ["opsz"]
});

const displayFont = Fraunces({
  subsets: ["latin"],
  variable: "--mn-font-display",
  display: "swap",
  style: ["normal", "italic"],
  weight: "variable",
  axes: ["opsz"]
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--mn-font-mono",
  display: "swap",
  weight: ["400", "500", "600"]
});

const thaiFont = Noto_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--mn-font-thai",
  display: "swap"
});

const thaiSerifFont = Noto_Serif_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "600"],
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
        <BpmTracker locale={locale} />
        {children}
      </body>
    </html>
  );
}
