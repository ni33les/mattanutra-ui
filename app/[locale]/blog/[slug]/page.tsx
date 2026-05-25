import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticle } from "@/components/blog-article";
import { SiteFooter } from "@/components/site-footer";
import { ServiceIssue } from "@/components/service-issue";
import { TitleBar } from "@/components/title-bar";
import {
  getPublishedBlogPost,
  getPublishedBlogPostLocalePaths
} from "@/lib/blog";
import { checkDatabaseConnection } from "@/lib/db";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { localizedMetadata } from "@/lib/seo";

type BlogArticlePageProps = Readonly<{
  params: Promise<{
    locale: string;
    slug: string;
  }>;
}>;

export const dynamic = "force-dynamic";

async function getPagePost(params: BlogArticlePageProps["params"]) {
  const { locale: rawLocale, slug } = await params;

  if (!isLocale(rawLocale)) {
    return null;
  }

  const locale: Locale = rawLocale;
  const post = await getPublishedBlogPost(locale, slug);

  return post ? { locale, post } : null;
}

const articleCtas = {
  en: {
    body:
      "Take a few minutes to discover your HealthScore and begin a more personal conversation about your energy, sleep, diet, budget, and what support actually fits your day.",
    eyebrow: "Your next step",
    href: "/en/nutrition/quiz",
    primaryLabel: "Start the assessment",
    secondaryHref: "/en",
    secondaryLabel: "Back to home",
    title: "Start with your HealthScore, then build from there"
  },
  th: {
      body:
        "ใช้เวลาเพียงไม่กี่นาทีเพื่อดูคะแนนสุขภาพของคุณ และเริ่มบทสนทนาที่เป็นส่วนตัวมากขึ้นเกี่ยวกับพลังงาน การนอน อาหาร งบประมาณ และสิ่งที่เหมาะกับชีวิตประจำวันของคุณจริงๆ",
      eyebrow: "ขั้นตอนถัดไป",
      href: "/th/nutrition/quiz",
      primaryLabel: "เริ่มทำแบบประเมิน",
      secondaryHref: "/th",
      secondaryLabel: "กลับหน้าหลัก",
      title: "เริ่มจากคะแนนสุขภาพของคุณ แล้วค่อยๆ สร้างแผนที่เหมาะกับคุณ"
  }
} satisfies Record<Locale, {
  body: string;
  eyebrow: string;
  href: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  title: string;
}>;

function getArticleCta(locale: Locale) {
  return articleCtas[locale];
}

export async function generateMetadata({
  params
}: BlogArticlePageProps): Promise<Metadata> {
  const databaseReady = await checkDatabaseConnection();

  if (!databaseReady) {
    return {};
  }

  const page = await getPagePost(params);

  if (!page) {
    return {};
  }

  const translationPaths = await getPublishedBlogPostLocalePaths(
    page.post.translationGroupId
  );

  return localizedMetadata({
    description: page.post.seoDescription,
    locale: page.locale,
    path: `/blog/${page.post.slug}`,
    title: `MattaNutra | ${page.post.seoTitle}`,
    translatedPaths: translationPaths
  });
}

export default async function BlogArticlePage({
  params
}: BlogArticlePageProps) {
  const { locale: rawLocale, slug } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const currentPath = `/${locale}/blog/${slug}`;
  const databaseReady = await checkDatabaseConnection();

  if (!databaseReady) {
    return (
      <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
        <TitleBar
          currentLocale={locale}
          currentPath={currentPath}
          title={dictionary.hero.eyebrow}
        />
        <ServiceIssue href={currentPath} locale={locale} />
        <SiteFooter content={dictionary.footer} locale={locale} />
      </main>
    );
  }

  const post = await getPublishedBlogPost(locale, slug);

  if (!post) {
    notFound();
  }

  const translationPaths = await getPublishedBlogPostLocalePaths(
    post.translationGroupId
  );
  const localizedPaths = translationPaths;

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        localizedPaths={localizedPaths}
        title={dictionary.hero.eyebrow}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
        <BlogArticle cta={getArticleCta(locale)} post={post} />
        <SiteFooter content={dictionary.footer} locale={locale} />
      </div>
    </main>
  );
}
