import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { LandingPage } from "@/components/landing-page";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import {
  getHomepageTestimonials
} from "@/lib/blog";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { getFeaturedLibraryArticles } from "@/lib/library";
import { marketingPageRevalidateSeconds } from "@/lib/public-cache-policy";
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

// Public data keeps its short refresh window even though the shared header
// makes the page dynamic. Segment config still requires a numeric literal.
export const revalidate = 300;
const cachedHomepageTestimonials = unstable_cache(
  (locale: Locale) => getHomepageTestimonials(locale, 4),
  ["public-homepage-testimonials"],
  { revalidate: marketingPageRevalidateSeconds }
);

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

  // Library cards combine static files with cached published content.
  // Testimonials stay empty during the production build phase to avoid DB access.
  const libraryArticles = await getFeaturedLibraryArticles(locale, 3);

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
          libraryArticles={libraryArticles}
          locale={locale}
          testimonials={[]}
        />
        <SiteFooter content={dictionary.footer} locale={locale} />
      </main>
    );
  }

  const testimonials = await cachedHomepageTestimonials(locale);
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
