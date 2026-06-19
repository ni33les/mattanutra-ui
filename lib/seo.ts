import type { Metadata } from "next";
import {
  defaultLocale,
  indexableLocales,
  localeHtmlLang,
  type Locale,
  type LocaleCode
} from "@/lib/i18n";
import { t } from "@/lib/i18n-messages";
import type { MessageId } from "@/content/i18n/generated";

const fallbackSiteUrl = "https://www.mattanutra.com";

export type SeoRouteKey =
  | "home"
  | "nutritionQuiz"
  | "nutritionHealthScore"
  | "nutritionReveal"
  | "terms"
  | "privacy"
  | "basketCheckout"
  | "basketReturn"
  | "paymentCheckout"
  | "paymentReturn"
  | "orderTracking";

type SeoRouteConfig = Readonly<{
  changeFrequency: "always" | "daily" | "weekly" | "monthly" | "yearly";
  descriptionId: MessageId;
  indexable: boolean;
  path: string;
  priority: number;
  titleId: MessageId;
}>;

export type SeoRouteCopy = SeoRouteConfig & Readonly<{
  description: string;
  title: string;
}>;

export const seoRouteKeys = [
  "home",
  "nutritionQuiz",
  "nutritionHealthScore",
  "nutritionReveal",
  "terms",
  "privacy",
  "basketCheckout",
  "basketReturn",
  "paymentCheckout",
  "paymentReturn",
  "orderTracking"
] as const satisfies readonly SeoRouteKey[];

const seoRouteConfig = {
  home: {
    changeFrequency: "weekly",
    descriptionId: "seo.routes.home.description",
    indexable: true,
    path: "/",
    priority: 1,
    titleId: "seo.routes.home.title"
  },
  nutritionQuiz: {
    changeFrequency: "monthly",
    descriptionId: "seo.routes.nutritionQuiz.description",
    indexable: true,
    path: "/nutrition/quiz",
    priority: 0.8,
    titleId: "seo.routes.nutritionQuiz.title"
  },
  nutritionHealthScore: {
    changeFrequency: "monthly",
    descriptionId: "seo.routes.nutritionHealthScore.description",
    indexable: true,
    path: "/nutrition/healthscore",
    priority: 0.7,
    titleId: "seo.routes.nutritionHealthScore.title"
  },
  nutritionReveal: {
    changeFrequency: "monthly",
    descriptionId: "seo.routes.nutritionReveal.description",
    indexable: true,
    path: "/nutrition/reveal",
    priority: 0.7,
    titleId: "seo.routes.nutritionReveal.title"
  },
  terms: {
    changeFrequency: "monthly",
    descriptionId: "seo.routes.terms.description",
    indexable: true,
    path: "/terms",
    priority: 0.6,
    titleId: "seo.routes.terms.title"
  },
  privacy: {
    changeFrequency: "monthly",
    descriptionId: "seo.routes.privacy.description",
    indexable: true,
    path: "/privacy",
    priority: 0.6,
    titleId: "seo.routes.privacy.title"
  },
  basketCheckout: {
    changeFrequency: "monthly",
    descriptionId: "seo.routes.basketCheckout.description",
    indexable: false,
    path: "/basket/checkout",
    priority: 0,
    titleId: "seo.routes.basketCheckout.title"
  },
  basketReturn: {
    changeFrequency: "monthly",
    descriptionId: "seo.routes.basketReturn.description",
    indexable: false,
    path: "/basket/return",
    priority: 0,
    titleId: "seo.routes.basketReturn.title"
  },
  paymentCheckout: {
    changeFrequency: "monthly",
    descriptionId: "seo.routes.paymentCheckout.description",
    indexable: false,
    path: "/nutrition/payment/checkout",
    priority: 0,
    titleId: "seo.routes.paymentCheckout.title"
  },
  paymentReturn: {
    changeFrequency: "monthly",
    descriptionId: "seo.routes.paymentReturn.description",
    indexable: false,
    path: "/nutrition/payment/return",
    priority: 0,
    titleId: "seo.routes.paymentReturn.title"
  },
  orderTracking: {
    changeFrequency: "monthly",
    descriptionId: "seo.routes.orderTracking.description",
    indexable: false,
    path: "/order/track",
    priority: 0,
    titleId: "seo.routes.orderTracking.title"
  }
} satisfies Record<SeoRouteKey, SeoRouteConfig>;

export const indexableSeoRouteKeys = [
  "home",
  "nutritionQuiz",
  "nutritionHealthScore",
  "nutritionReveal",
  "terms",
  "privacy"
] as const satisfies readonly SeoRouteKey[];

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
      url: absoluteUrl(currentCanonicalPath)
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

export function getSeoRouteCopy(routeKey: SeoRouteKey, locale: LocaleCode): SeoRouteCopy {
  const route = seoRouteConfig[routeKey];

  return {
    ...route,
    description: t(locale, route.descriptionId),
    title: t(locale, route.titleId)
  };
}

export function localizedRouteMetadata(input: Readonly<{
  fallbackUsed?: boolean;
  indexable?: boolean;
  locale: Locale;
  path?: string;
  routeKey: SeoRouteKey;
  translatedPaths?: Partial<Record<LocaleCode, string>>;
}>) {
  const route = getSeoRouteCopy(input.routeKey, input.locale);
  const indexable =
    route.indexable &&
    input.indexable !== false &&
    input.fallbackUsed !== true;

  return localizedMetadata({
    description: route.description,
    indexable,
    locale: input.locale,
    path: input.path ?? route.path,
    title: route.title,
    translatedPaths: input.translatedPaths
  });
}

export function localizedSeoRoutePath(locale: LocaleCode, routeKey: SeoRouteKey) {
  return localizedPath(locale, getSeoRouteCopy(routeKey, locale).path);
}

export function localizedSeoStaticSitemapEntries(now = new Date()) {
  return indexableLocales.flatMap((locale) =>
    indexableSeoRouteKeys.map((routeKey) => {
      const route = getSeoRouteCopy(routeKey, locale);

      return {
        changeFrequency: route.changeFrequency,
        lastModified: now,
        priority: route.priority,
        url: absoluteUrl(localizedPath(locale, route.path))
      };
    })
  );
}
