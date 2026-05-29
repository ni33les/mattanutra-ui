import type { Metadata } from "next";
import {
  defaultLocale,
  indexableLocales,
  localeHtmlLang,
  type Locale,
  type LocaleCode
} from "@/lib/i18n";

const fallbackSiteUrl = "https://www.mattanutra.com";

function siteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.MATTANUTRA_PUBLIC_SITE_URL ||
    fallbackSiteUrl;

  return configured.replace(/\/+$/, "");
}

export function localizedPath(locale: LocaleCode, path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (normalizedPath === "/" || normalizedPath === "") {
    return `/${locale}`;
  }

  return `/${locale}${normalizedPath}`;
}

export function absoluteUrl(path: string) {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function localizedAlternates(input: Readonly<{
  path: string;
  translatedPaths?: Partial<Record<LocaleCode, string>>;
}>) {
  const alternateLocales = input.translatedPaths
    ? indexableLocales.filter((locale) => Boolean(input.translatedPaths?.[locale]))
    : indexableLocales;
  const languages = Object.fromEntries(
    alternateLocales.map((locale) => [
      localeHtmlLang(locale),
      absoluteUrl(input.translatedPaths?.[locale] ?? localizedPath(locale, input.path))
    ])
  ) as Record<string, string>;
  const defaultPath = input.translatedPaths?.[defaultLocale] ?? localizedPath(defaultLocale, input.path);

  return {
    canonical: absoluteUrl(defaultPath),
    languages: {
      ...languages,
      "x-default": absoluteUrl(defaultPath)
    } as Record<string, string>
  };
}

export function localizedMetadata(input: Readonly<{
  description: string;
  indexable?: boolean;
  locale: Locale;
  path: string;
  title: string;
  translatedPaths?: Partial<Record<LocaleCode, string>>;
}>): Metadata {
  const indexable = input.indexable !== false && indexableLocales.includes(input.locale);
  const alternates = localizedAlternates({
    path: input.path,
    translatedPaths: input.translatedPaths
  });
  const currentCanonicalPath =
    input.translatedPaths?.[input.locale] ?? localizedPath(input.locale, input.path);

  return {
    alternates: indexable
      ? {
          ...alternates,
          canonical: absoluteUrl(currentCanonicalPath)
        }
      : undefined,
    description: input.description,
    openGraph: {
      description: input.description,
      locale: localeHtmlLang(input.locale).replace("-", "_"),
      title: input.title,
      type: "website",
      url: absoluteUrl(localizedPath(input.locale, input.path))
    },
    robots: indexable
      ? undefined
      : {
          follow: false,
          index: false
        },
    title: input.title
  };
}
