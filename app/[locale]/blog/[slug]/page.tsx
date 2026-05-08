import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticle } from "@/components/blog-article";
import { SiteFooter } from "@/components/site-footer";
import { ServiceIssue } from "@/components/service-issue";
import { TitleBar } from "@/components/title-bar";
import { getPublishedBlogPost } from "@/lib/blog";
import { checkDatabaseConnection } from "@/lib/db";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";

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

function getArticleCta(locale: Locale) {
  if (locale === "th") {
    return {
      body:
        "ใช้เวลาเพียงไม่กี่นาทีเพื่อดู HealthScore ของคุณ และเริ่มบทสนทนาที่เป็นส่วนตัวมากขึ้นเกี่ยวกับพลังงาน การนอน อาหาร งบประมาณ และสิ่งที่เหมาะกับชีวิตประจำวันของคุณจริงๆ",
      eyebrow: "ขั้นตอนถัดไป",
      href: "/th/assessment",
      primaryLabel: "เริ่มทำแบบประเมิน",
      secondaryHref: "/th",
      secondaryLabel: "กลับหน้าหลัก",
      title: "เริ่มจาก HealthScore ของคุณ แล้วค่อยๆ สร้างแผนที่เหมาะกับคุณ"
    };
  }

  return {
    body:
      "Take a few minutes to discover your HealthScore and begin a more personal conversation about your energy, sleep, diet, budget, and what support actually fits your day.",
    eyebrow: "Your next step",
    href: "/en/assessment",
    primaryLabel: "Start the assessment",
    secondaryHref: "/en",
    secondaryLabel: "Back to home",
    title: "Start with your HealthScore, then build from there"
  };
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

  return {
    description: page.post.seoDescription,
    title: `MattaNutra | ${page.post.seoTitle}`
  };
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
      <main className="flex min-h-screen flex-col bg-background text-foreground">
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

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
        <BlogArticle cta={getArticleCta(locale)} post={post} />
        <SiteFooter content={dictionary.footer} locale={locale} />
      </div>
    </main>
  );
}
