import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CloudArrowUpIcon,
  LockClosedIcon,
  ServerIcon
} from "@heroicons/react/20/solid";
import { HighlightedBrandText } from "@/components/highlighted-brand-text";
import type { ComponentType } from "react";
import type { BlogPost } from "@/lib/blog";
import type { Locale } from "@/lib/i18n";

const markdownComponents: Components = {
  a: ({ children, href }) => (
    <a
      className="mn-link-accent"
      href={href}
      rel={href?.startsWith("http") ? "noreferrer" : undefined}
      target={href?.startsWith("http") ? "_blank" : undefined}
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-8 border-l-4 border-[var(--mn-gold)] pl-5 text-lg/8 font-medium text-[var(--mn-ink-soft)]">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-[var(--mn-cream)] px-1.5 py-0.5 text-[0.9em] font-semibold text-[var(--mn-ink)] ring-1 ring-[var(--mn-line)]">
      {children}
    </code>
  ),
  h2: ({ children }) => (
    <h2 className="mt-16 font-serif text-3xl font-medium tracking-normal text-[var(--mn-ink)]">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-10 text-xl font-semibold tracking-normal text-[var(--mn-ink)]">
      {children}
    </h3>
  ),
  hr: () => <hr className="my-10 border-[var(--mn-line)]" />,
  img: ({ alt, src }) =>
    src ? (
      // Markdown-authored images are intentionally rendered directly.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={alt ?? ""}
        className="my-10 aspect-video w-full rounded-[var(--mn-radius-lg)] bg-[var(--mn-cream)] object-cover outline-1 -outline-offset-1 outline-[var(--mn-line)]"
        src={String(src)}
      />
    ) : null,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  ol: ({ children }) => (
    <ol className="mt-6 list-decimal space-y-3 pl-6 text-[var(--mn-ink-soft)]">
      {children}
    </ol>
  ),
  p: ({ children }) => <p className="mt-6 first:mt-0">{children}</p>,
  pre: ({ children }) => (
    <pre className="mt-8 overflow-x-auto rounded-[var(--mn-radius-md)] bg-[var(--mn-ink)] p-4 text-sm text-[var(--mn-paper)]">
      {children}
    </pre>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--mn-ink)]">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="mt-6 list-disc space-y-3 pl-6 text-[var(--mn-ink-soft)]">{children}</ul>
  )
};

const pointIcons: ComponentType<{
  "aria-hidden": boolean;
  className: string;
}>[] = [CloudArrowUpIcon, LockClosedIcon, ServerIcon];

const blogArticleCopy = {
  en: {
    journal: "MattaNutra Journal"
  },
  th: {
    journal: "บทความ MattaNutra"
  }
} satisfies Record<Locale, { journal: string }>;

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type BlogArticleCta = Readonly<{
  body: string;
  eyebrow: string;
  href: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  title: string;
}>;

function BlogAssessmentCta({
  body,
  eyebrow,
  href,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  title
}: BlogArticleCta) {
  return (
    <section className="bg-[var(--mn-cream)] px-6 pt-2 pb-24 sm:pb-32 lg:px-8">
      <div className="mn-blog-cta-card mx-auto min-h-[26rem] w-full max-w-6xl px-6 py-16 sm:px-10 lg:px-16">
        <div
          aria-hidden={true}
          className="mn-blog-cta-background absolute inset-0 bg-cover bg-center opacity-28"
        />
        <div
          aria-hidden={true}
          className="mn-blog-cta-wash"
        />
        <div className="relative flex min-h-[18rem] max-w-3xl flex-col justify-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--mn-gold)]">
            {eyebrow}
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-normal text-balance text-[var(--mn-ink)] sm:text-5xl">
            <HighlightedBrandText text={title} />
          </h2>
          <p className="mt-6 max-w-2xl text-lg/8 text-pretty text-[color-mix(in_srgb,var(--mn-ink)_78%,transparent)]">
            <HighlightedBrandText text={body} />
          </p>
          <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-x-6">
            <Link
              href={href}
              data-bpm-event="blog_assessment_cta_clicked"
              data-bpm-label={primaryLabel}
              data-bpm-target={href}
              data-bpm-type="funnel"
              className="mn-primary-button"
            >
              {primaryLabel}
            </Link>
            <Link
              href={secondaryHref}
              data-bpm-event="blog_home_cta_clicked"
              data-bpm-label={secondaryLabel}
              data-bpm-target={secondaryHref}
              data-bpm-type="content"
              className="text-sm/6 font-semibold text-[var(--mn-ink)] transition hover:text-[var(--mn-teal-deep)]"
            >
              {secondaryLabel} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function BlogMarkdownBody({ markdown }: Readonly<{ markdown: string }>) {
  return (
    <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
      {markdown}
    </ReactMarkdown>
  );
}

function StructuredBlogBody({ post }: Readonly<{ post: BlogPost }>) {
  const points = post.body.points ?? [];

  return (
    <>
      {post.body.intro ? <p>{post.body.intro}</p> : null}
      {points.length > 0 ? (
        <ul role="list" className="mt-8 max-w-xl space-y-8 text-[var(--mn-ink-soft)]">
          {points.map((point, index) => {
            const Icon = pointIcons[index] ?? ServerIcon;

            return (
              <li key={point.title} className="flex gap-x-3">
                <Icon
                  aria-hidden={true}
                  className="mt-1 size-5 flex-none text-[var(--mn-gold)]"
                />
                <span>
                  <strong className="font-semibold text-[var(--mn-ink)]">
                    {point.title}
                  </strong>{" "}
                  {point.body}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {post.body.sectionBody ? (
        <p className="mt-8">{post.body.sectionBody}</p>
      ) : null}
      {post.body.sectionTitle ? (
        <h2 className="mt-16 font-serif text-3xl font-medium tracking-normal text-[var(--mn-ink)]">
          {post.body.sectionTitle}
        </h2>
      ) : null}
      {post.body.closing ? <p className="mt-6">{post.body.closing}</p> : null}
    </>
  );
}

export function BlogArticle({
  cta,
  post
}: Readonly<{ cta: BlogArticleCta; post: BlogPost }>) {
  const markdown = post.contentMarkdown.trim();
  const copy = blogArticleCopy[post.locale];

  return (
    <>
      <div className="relative isolate overflow-hidden bg-[var(--mn-cream)] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <p className="mn-v11-eyebrow">
              {copy.journal}
            </p>
            <h1 className="mn-hero-title mt-3 font-serif text-4xl font-medium tracking-normal text-pretty text-[var(--mn-ink)] sm:text-5xl">
              {post.title}
            </h1>
            <p className="mn-hero-subtitle mt-6 text-xl/8 text-[var(--mn-ink-soft)]">{post.subtitle}</p>
          </div>
          <div className="mx-auto mt-14 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-10 lg:mx-0 lg:max-w-none lg:grid-cols-12">
            <div className="relative space-y-10 lg:order-last lg:col-span-5">
              {post.imageUrl ? (
                <figure className="relative mx-auto aspect-video w-full max-w-xl overflow-hidden rounded-[var(--mn-radius-lg)] bg-[var(--mn-paper)] shadow-sm outline-1 -outline-offset-1 outline-[var(--mn-line)] sm:aspect-2/1 lg:aspect-[4/3] lg:max-w-none">
                  {/* External CMS images are intentionally rendered directly. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={post.imageAlt}
                    src={post.imageUrl}
                    className="absolute inset-0 size-full object-cover"
                  />
                </figure>
              ) : null}
              {post.testimonial ? (
                <figure className="border-l border-[var(--mn-gold)] pl-8">
                  <blockquote className="text-xl/8 font-semibold tracking-normal text-[var(--mn-ink)]">
                    <p>&quot;{post.testimonial.quote}&quot;</p>
                  </blockquote>
                  <figcaption className="mt-8 flex gap-x-4">
                    {post.testimonial.authorImageUrl ? (
                      <>
                        {/* External CMS images are intentionally rendered directly. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={post.testimonial.authorImageAlt}
                          src={post.testimonial.authorImageUrl}
                          className="mt-1 size-10 flex-none rounded-full bg-[var(--mn-paper)] object-cover ring-1 ring-[var(--mn-line)]"
                        />
                      </>
                    ) : (
                      <div className="mn-blog-avatar-fallback">
                        <span className="relative">
                          {initials(post.testimonial.authorName)}
                        </span>
                      </div>
                    )}
                    <div className="text-sm/6">
                      <div className="font-semibold text-[var(--mn-ink)]">
                        {post.testimonial.authorName}
                      </div>
                      <div className="text-[var(--mn-ink-soft)]">
                        {post.testimonial.authorTitle ||
                          post.testimonial.authorHandle}
                      </div>
                    </div>
                  </figcaption>
                </figure>
              ) : null}
            </div>
            <div className="max-w-xl rounded-[var(--mn-radius-lg)] bg-[var(--mn-paper)] p-6 text-base/7 text-[var(--mn-ink-soft)] shadow-sm ring-1 ring-[var(--mn-line)] sm:p-8 lg:col-span-7">
              {markdown ? (
                <BlogMarkdownBody markdown={markdown} />
              ) : (
                <StructuredBlogBody post={post} />
              )}
            </div>
          </div>
        </div>
      </div>
      <BlogAssessmentCta {...cta} />
    </>
  );
}
