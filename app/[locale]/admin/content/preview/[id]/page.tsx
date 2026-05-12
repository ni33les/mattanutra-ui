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

function previewCta(locale: Locale) {
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

function PreviewBar({
  status,
  type
}: Readonly<{ status: string | undefined; type: string | undefined }>) {
  return (
    <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm font-semibold text-amber-900">
      Admin preview · {readableToken(type)} · {readableToken(status)}
    </div>
  );
}

function TestimonialPreview({
  status,
  testimonial,
  type
}: Readonly<{
  status: string | undefined;
  testimonial: BlogTestimonial;
  type: string | undefined;
}>) {
  return (
    <main className="min-h-screen bg-gray-50">
      <PreviewBar status={status} type={type} />
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl items-center px-6 py-16">
        <figure className="w-full rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3A7BD5]">
            Testimonial preview
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
      <PreviewBar status={status} type={type} />
      <BlogArticle cta={previewCta(post.locale)} post={post} />
    </main>
  );
}
