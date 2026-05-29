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
import {
  adminContentPreviewCopy,
  readablePreviewToken
} from "@/components/admin/content-preview-copy";

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

function PreviewBar({
  locale,
  status,
  type
}: Readonly<{
  locale: Locale;
  status: string | undefined;
  type: string | undefined;
}>) {
  const labels = adminContentPreviewCopy[locale].labels;

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
  const labels = adminContentPreviewCopy[locale].labels;

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
      <BlogArticle cta={adminContentPreviewCopy[post.locale].cta} post={post} />
    </main>
  );
}
