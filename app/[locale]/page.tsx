import { notFound } from "next/navigation";
import { CtaSection } from "@/components/cta-section";
import { FeatureRow } from "@/components/feature-row";
import { HeroSplit } from "@/components/hero-split";
import { SiteFooter } from "@/components/site-footer";
import { SupportFeatureSection } from "@/components/support-feature-section";
import { TitleBar } from "@/components/title-bar";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";

type HomeProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function Home({ params }: HomeProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const assessmentPath = `/${locale}/assessment`;

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={`/${locale}`}
        title={dictionary.hero.eyebrow}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
        <HeroSplit
          cta={dictionary.hero.cta}
          ctaHref={assessmentPath}
          eyebrow={dictionary.hero.eyebrow}
          headline={dictionary.hero.subtitle}
          headlineAccent={dictionary.hero.subtitleAccent}
          headlineMuted={dictionary.hero.subtitleMuted}
          imageAlt={dictionary.hero.imageAlt}
          secondaryCta={dictionary.hero.secondaryCta}
          subheadline={dictionary.hero.followOn}
          subheadlineAccent={dictionary.hero.followOnAccent}
        />
        <FeatureRow content={dictionary.featureSection} />
        <CtaSection content={dictionary.cta} ctaHref={assessmentPath} />
        <SupportFeatureSection content={dictionary.supportSection} />
        <SiteFooter content={dictionary.footer} />
      </div>
    </main>
  );
}
