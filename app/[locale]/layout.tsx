import type { Metadata } from "next";
import {
  DM_Sans,
  Fraunces,
  JetBrains_Mono,
  Noto_Sans_Thai
} from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BpmTracker } from "@/components/bpm-tracker";
import "../globals.css";
import "../customer.css";
import {
  defaultLocale,
  getDictionary,
  isLocale,
  localeDirection,
  localeHtmlLang
} from "@/lib/i18n";

export const dynamic = "force-dynamic";

type LocaleLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}>;

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--mn-font-body",
  display: "swap"
});

const displayFont = Fraunces({
  subsets: ["latin"],
  variable: "--mn-font-display",
  display: "swap"
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--mn-font-mono",
  display: "swap"
});

const thaiFont = Noto_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--mn-font-thai",
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
          thaiFont.variable
        ].join(" ")}
      >
        <BpmTracker locale={locale} />
        {children}
      </body>
    </html>
  );
}
