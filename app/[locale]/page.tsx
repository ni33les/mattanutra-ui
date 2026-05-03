import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnimatedHeroCopy } from "@/components/animated-hero-copy";
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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <TitleBar currentLocale={locale} title={dictionary.hero.eyebrow} />
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col justify-center px-6 py-20 sm:px-8">
        <div className="max-w-3xl">
          <AnimatedHeroCopy
            title={dictionary.hero.title}
            subtitle={dictionary.hero.subtitle}
            followOn={dictionary.hero.followOn}
          />
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="https://docs.digitalocean.com/products/app-platform/getting-started/sample-apps/next.js/"
              className="inline-flex h-13 items-center gap-2.5 rounded-md bg-foreground px-6 text-base font-medium text-background transition hover:opacity-90"
            >
              {dictionary.hero.cta}
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
