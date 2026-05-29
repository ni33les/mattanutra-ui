import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticle } from "@/components/blog-article";
import { adminDashboardTokenAllowed } from "@/lib/admin-auth";
import {
  getBlogPostForApi,
  getTestimonialForApi,
  type BlogTestimonial
} from "@/lib/blog";
import { isLocale, type Locale } from "@/lib/i18n";

type ContentPreviewPageProps = Readonly<{
  params: Promise<{
    id: string;
    locale: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false
  },
  title: "MattaNutra Admin Preview"
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readableToken(value: string | undefined) {
  return value
    ? value
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "Content";
}

const previewLabels = {
  en: {
    adminPreview: "Admin preview",
    content: "Content",
    testimonialPreview: "Testimonial preview"
  },
  th: {
    adminPreview: "ตัวอย่างสำหรับแอดมิน",
    content: "คอนเทนต์",
    testimonialPreview: "ตัวอย่างคำรับรอง"
  },
  "zh-CN": {
    adminPreview: "管理员预览",
    content: "内容",
    testimonialPreview: "见证预览"
  }
} satisfies Record<
  Locale,
  Record<"adminPreview" | "content" | "testimonialPreview", string>
>;

function readablePreviewToken(
  locale: Locale,
  value: string | undefined,
  fallback: string
) {
  if (!value) {
    return fallback;
  }

  if (locale === "zh-CN") {
    if (value === "blog_post") {
      return "博客文章";
    }

    if (value === "testimonial") {
      return "见证";
    }

    if (value === "published") {
      return "已发布";
    }

    if (value === "scheduled") {
      return "已定时";
    }

    if (value === "draft") {
      return "草稿";
    }

    if (value === "deleted" || value === "archived") {
      return "已删除";
    }
  }

  if (locale === "th") {
    if (value === "blog_post") {
      return "บทความ";
    }

    if (value === "testimonial") {
      return "คำรับรอง";
    }

    if (value === "published") {
      return "เผยแพร่แล้ว";
    }

    if (value === "scheduled") {
      return "ตั้งเวลาแล้ว";
    }

    if (value === "draft") {
      return "ฉบับร่าง";
    }

    if (value === "deleted" || value === "archived") {
      return "ลบแล้ว";
    }
  }

  return readableToken(value);
}

function previewCta(locale: Locale) {
  if (locale === "th") {
    return {
      body:
        "ใช้เวลาเพียงไม่กี่นาทีเพื่อดู HealthScore ของคุณ และเริ่มบทสนทนาที่เป็นส่วนตัวมากขึ้นเกี่ยวกับพลังงาน การนอน อาหาร งบประมาณ และสิ่งที่เหมาะกับชีวิตประจำวันของคุณจริงๆ",
      eyebrow: "ขั้นตอนถัดไป",
      href: "/th/nutrition/quiz",
      primaryLabel: "เริ่มทำแบบประเมิน",
      secondaryHref: "/th",
      secondaryLabel: "กลับหน้าหลัก",
      title: "เริ่มจาก HealthScore ของคุณ แล้วค่อยๆ สร้างแผนที่เหมาะกับคุณ"
    };
  }

  if (locale === "zh-CN") {
    return {
      body:
        "花几分钟了解您的 HealthScore，并围绕精力、睡眠、饮食、预算以及真正适合日常生活的支持，开启更个性化的对话。",
      eyebrow: "下一步",
      href: "/zh-CN/nutrition/quiz",
      primaryLabel: "开始评估",
      secondaryHref: "/zh-CN",
      secondaryLabel: "返回首页",
      title: "从您的 HealthScore 开始，再逐步建立适合您的计划"
    };
  }

  return {
    body:
      "Take a few minutes to discover your HealthScore and begin a more personal conversation about your energy, sleep, diet, budget, and what support actually fits your day.",
    eyebrow: "Your next step",
    href: "/en/nutrition/quiz",
    primaryLabel: "Start the assessment",
    secondaryHref: "/en",
    secondaryLabel: "Back to home",
    title: "Start with your HealthScore, then build from there"
  };
}

function PreviewBar({
  locale,
  status,
  type
}: Readonly<{
  locale: Locale;
  status: string | undefined;
  type: string | undefined;
}>) {
  const labels = previewLabels[locale];

  return (
    <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm font-semibold text-amber-900">
      {labels.adminPreview} · {readablePreviewToken(locale, type, labels.content)} ·{" "}
      {readablePreviewToken(locale, status, labels.content)}
    </div>
  );
}

function TestimonialPreview({
  locale,
  status,
  testimonial,
  type
}: Readonly<{
  locale: Locale;
  status: string | undefined;
  testimonial: BlogTestimonial;
  type: string | undefined;
}>) {
  const labels = previewLabels[locale];

  return (
    <main className="min-h-screen bg-gray-50">
      <PreviewBar locale={locale} status={status} type={type} />
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl items-center px-6 py-16">
        <figure className="w-full rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200 sm:p-10">
          <p className="text-xs font-semibold tracking-normal text-[#3A7BD5]">
            {labels.testimonialPreview}
          </p>
          <blockquote className="mt-6 text-2xl/9 font-semibold text-gray-900">
            &quot;{testimonial.quote}&quot;
          </blockquote>
          <figcaption className="mt-8 border-t border-gray-100 pt-6">
            <div className="font-semibold text-gray-900">
              {testimonial.authorName}
            </div>
            {testimonial.authorTitle || testimonial.authorHandle ? (
              <div className="mt-1 text-sm text-gray-600">
                {testimonial.authorTitle || testimonial.authorHandle}
              </div>
            ) : null}
          </figcaption>
        </figure>
      </section>
    </main>
  );
}

export default async function ContentPreviewPage({
  params,
  searchParams
}: ContentPreviewPageProps) {
  const { id, locale: rawLocale } = await params;
  const query = await searchParams;
  const accessToken = firstParam(query.access_token);

  if (!isLocale(rawLocale) || !adminDashboardTokenAllowed(accessToken)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const type = firstParam(query.type);
  const status = firstParam(query.status);

  if (type === "testimonial") {
    const testimonial = await getTestimonialForApi(id);

    if (!testimonial) {
      notFound();
    }

    return (
      <TestimonialPreview
        locale={locale}
        status={status}
        testimonial={testimonial}
        type={type}
      />
    );
  }

  const post = await getBlogPostForApi(id, locale);

  if (!post) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-white">
      <PreviewBar locale={locale} status={status} type={type} />
      <BlogArticle cta={previewCta(post.locale)} post={post} />
    </main>
  );
}
