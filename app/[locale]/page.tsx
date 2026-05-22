import { notFound } from "next/navigation";
import { LandingPage } from "@/components/landing-page";
import { SiteFooter } from "@/components/site-footer";
import { ServiceIssue } from "@/components/service-issue";
import { TitleBar } from "@/components/title-bar";
import { getPublishedBlogPosts } from "@/lib/blog";
import { checkDatabaseConnection } from "@/lib/db";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { nutritionQuizPath } from "@/lib/nutrition-paths";

type HomeProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export default async function Home({ params }: HomeProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const assessmentPath = nutritionQuizPath(locale);
  const databaseReady = await checkDatabaseConnection();

  if (!databaseReady) {
    return (
      <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
        <TitleBar
          currentLocale={locale}
          currentPath={`/${locale}`}
          title={dictionary.hero.eyebrow}
        />
        <ServiceIssue href={`/${locale}`} locale={locale} />
        <SiteFooter content={dictionary.footer} locale={locale} />
      </main>
    );
  }

  const blogPosts = await getPublishedBlogPosts(locale, 3);

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={`/${locale}`}
        title={dictionary.hero.eyebrow}
      />
      <LandingPage
        assessmentPath={assessmentPath}
        blogPosts={blogPosts}
        locale={locale}
      />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
