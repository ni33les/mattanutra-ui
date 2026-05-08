import Link from "next/link";
import {
  CloudArrowUpIcon,
  LockClosedIcon,
  ServerIcon
} from "@heroicons/react/20/solid";
import { HighlightedBrandText } from "@/components/highlighted-brand-text";
import type { ComponentType } from "react";
import type { BlogPost } from "@/lib/blog";

const pointIcons: ComponentType<{
  "aria-hidden": boolean;
  className: string;
}>[] = [CloudArrowUpIcon, LockClosedIcon, ServerIcon];

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
    <section className="bg-white px-6 pt-2 pb-24 sm:pb-32 lg:px-8">
      <div className="relative mx-auto min-h-[26rem] w-full max-w-6xl overflow-hidden rounded-lg bg-[#F3F8FF] px-6 py-16 ring-1 ring-[#3A7BD5]/10 sm:px-10 lg:px-16">
        <div
          aria-hidden={true}
          className="absolute inset-0 bg-cover bg-center opacity-28"
          style={{
            backgroundImage: 'url("/mainphoto.png")',
            backgroundPosition: "center 42%"
          }}
        />
        <div
          aria-hidden={true}
          className="absolute inset-0 bg-gradient-to-r from-[#F3F8FF]/96 via-[#F3F8FF]/82 to-[#F3F8FF]/52"
        />
        <div className="relative flex min-h-[18rem] max-w-3xl flex-col justify-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#3A7BD5]">
            {eyebrow}
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-normal text-balance text-[#20343A] sm:text-5xl">
            <HighlightedBrandText text={title} />
          </h2>
          <p className="mt-6 max-w-2xl text-lg/8 text-pretty text-[#20343A]/78">
            <HighlightedBrandText text={body} />
          </p>
          <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-x-6">
            <Link
              href={href}
              className="rounded-md bg-[#1FA77A] px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-[#188a65] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1FA77A]"
            >
              {primaryLabel}
            </Link>
            <Link
              href={secondaryHref}
              className="text-sm/6 font-semibold text-gray-900 transition hover:text-[#3A7BD5]"
            >
              {secondaryLabel} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function BlogArticle({
  cta,
  post
}: Readonly<{ cta: BlogArticleCta; post: BlogPost }>) {
  const points = post.body.points ?? [];

  return (
    <>
      <div className="relative isolate overflow-hidden bg-white py-24 sm:py-32">
        <div
          aria-hidden="true"
          className="absolute -top-80 left-[max(6rem,33%)] -z-10 transform-gpu blur-3xl sm:left-1/2 md:top-20 lg:ml-20 xl:top-3 xl:ml-56"
        >
          <div
            style={{
              clipPath:
                "polygon(63.1% 29.6%, 100% 17.2%, 76.7% 3.1%, 48.4% 0.1%, 44.6% 4.8%, 54.5% 25.4%, 59.8% 49.1%, 55.3% 57.9%, 44.5% 57.3%, 27.8% 48%, 35.1% 81.6%, 0% 97.8%, 39.3% 100%, 35.3% 81.5%, 97.2% 52.8%, 63.1% 29.6%)"
            }}
            className="aspect-[801/1036] w-[50rem] bg-linear-to-tr from-[#DDF7EC] to-[#8BC6FF] opacity-30"
          />
        </div>
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <p className="text-base/7 font-semibold text-[#3A7BD5]">
              MattaNutra Journal
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-pretty text-gray-900 sm:text-5xl">
              {post.title}
            </h1>
            <p className="mt-6 text-xl/8 text-gray-700">{post.subtitle}</p>
          </div>
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 lg:mx-0 lg:mt-10 lg:max-w-none lg:grid-cols-12">
            <div className="relative lg:order-last lg:col-span-5">
              <svg
                aria-hidden="true"
                className="absolute -top-160 left-1 -z-10 h-256 w-702 -translate-x-1/2 mask-[radial-gradient(64rem_64rem_at_111.5rem_0%,white,transparent)] stroke-gray-900/10"
              >
                <defs>
                  <pattern
                    id={`blog-pattern-${post.id}`}
                    width={200}
                    height={200}
                    patternUnits="userSpaceOnUse"
                  >
                    <path d="M0.5 0V200M200 0.5L0 0.499983" />
                  </pattern>
                </defs>
                <rect
                  fill={`url(#blog-pattern-${post.id})`}
                  width="100%"
                  height="100%"
                  strokeWidth={0}
                />
              </svg>
              {post.testimonial ? (
                <figure className="border-l border-[#3A7BD5] pl-8">
                  <blockquote className="text-xl/8 font-semibold tracking-tight text-gray-900">
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
                          className="mt-1 size-10 flex-none rounded-full bg-gray-50 object-cover"
                        />
                      </>
                    ) : (
                      <div className="relative mt-1 flex size-10 flex-none items-center justify-center overflow-hidden rounded-full bg-[#EAF5FF] text-xs font-semibold text-[#3A7BD5]">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,#DDF7EC,transparent_45%),radial-gradient(circle_at_75%_75%,#CFE8FF,transparent_45%)]" />
                        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0_42%,rgba(31,167,122,0.2)_43%_45%,transparent_46%)]" />
                        <span className="relative">
                          {initials(post.testimonial.authorName)}
                        </span>
                      </div>
                    )}
                    <div className="text-sm/6">
                      <div className="font-semibold text-gray-900">
                        {post.testimonial.authorName}
                      </div>
                      <div className="text-gray-600">
                        {post.testimonial.authorTitle ||
                          post.testimonial.authorHandle}
                      </div>
                    </div>
                  </figcaption>
                </figure>
              ) : post.imageUrl ? (
                <figure>
                  {/* External CMS images are intentionally rendered directly. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={post.imageAlt}
                    src={post.imageUrl}
                    className="aspect-[4/3] w-full rounded-2xl object-cover shadow-sm"
                  />
                </figure>
              ) : null}
            </div>
            <div className="max-w-xl text-base/7 text-gray-600 lg:col-span-7">
              {post.body.intro ? <p>{post.body.intro}</p> : null}
              {points.length > 0 ? (
                <ul role="list" className="mt-8 max-w-xl space-y-8 text-gray-600">
                  {points.map((point, index) => {
                    const Icon = pointIcons[index] ?? ServerIcon;

                    return (
                      <li key={point.title} className="flex gap-x-3">
                        <Icon
                          aria-hidden={true}
                          className="mt-1 size-5 flex-none text-[#3A7BD5]"
                        />
                        <span>
                          <strong className="font-semibold text-gray-900">
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
                <h2 className="mt-16 text-2xl font-bold tracking-tight text-gray-900">
                  {post.body.sectionTitle}
                </h2>
              ) : null}
              {post.body.closing ? (
                <p className="mt-6">{post.body.closing}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <BlogAssessmentCta {...cta} />
    </>
  );
}
