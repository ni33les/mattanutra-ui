import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import {
  getHomepageTestimonials
} from "@/lib/blog";
import { checkDatabaseConnection } from "@/lib/db";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { getRandomLibraryArticles } from "@/lib/library";
import { nutritionQuizPath } from "@/lib/nutrition-paths";
import { localizedRouteMetadata } from "@/lib/seo";
import { siteBaseUrl } from "@/lib/site-url";

type HomeProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Homepage is marketing content: short ISR so testimonials / library teasers refresh.
// Keep in sync with marketingPageRevalidateSeconds in lib/public-cache-policy.ts
// (Next segment config requires a static numeric literal).
export const revalidate = 300;

function isProductionBuildPhase() {
  return process.env.NEXT_PHASE === "phase-production-build";
}

export async function generateMetadata({
  params
}: HomeProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  return localizedRouteMetadata({
    locale,
    routeKey: "home"
  });
}

export default async function Home({ params }: HomeProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const assessmentPath = nutritionQuizPath(locale);

  if (isProductionBuildPhase()) {
    return (
      <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
        <TitleBar
          currentLocale={locale}
          currentPath={`/${locale}`}
          title={dictionary.hero.eyebrow}
          variant="landing"
        />
        <LandingPage
          assessmentPath={assessmentPath}
          libraryArticles={[]}
          locale={locale}
          testimonials={[]}
        />
        <SiteFooter content={dictionary.footer} locale={locale} />
      </main>
    );
  }

  const databaseReady = await checkDatabaseConnection();

  const libraryArticles = await getRandomLibraryArticles(locale, 3);
  const testimonials = databaseReady
    ? await getHomepageTestimonials(locale, 4)
    : [];
  const baseUrl = siteBaseUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": `${baseUrl}/#organization`,
        "@type": "Organization",
        name: "MattaNutra",
        url: baseUrl
      },
      {
        "@id": `${baseUrl}/${locale}#website`,
        "@type": "WebSite",
        inLanguage: locale,
        name: "MattaNutra",
        potentialAction: {
          "@type": "ReadAction",
          target: `${baseUrl}${assessmentPath}`
        },
        publisher: {
          "@id": `${baseUrl}/#organization`
        },
        url: `${baseUrl}/${locale}`
      }
    ]
  };

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={`/${locale}`}
        title={dictionary.hero.eyebrow}
        variant="landing"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c")
        }}
      />
      <LandingPage
        assessmentPath={assessmentPath}
        libraryArticles={libraryArticles}
        locale={locale}
        testimonials={testimonials}
      />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
