import type { BlogPostSummary } from "@/lib/blog";

type BlogSectionContent = Readonly<{
  description: string;
  title: string;
}>;

export function BlogSection({
  content,
  posts
}: Readonly<{
  content: BlogSectionContent;
  posts: BlogPostSummary[];
}>) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-balance text-[var(--brand-navy)] sm:text-5xl">
            {content.title}
          </h2>
          <p className="mt-2 text-lg/8 text-gray-600">
            {content.description}
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-2xl auto-rows-fr grid-cols-1 gap-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {posts.map((post) => (
            <article
              key={post.id}
              className="relative isolate flex flex-col justify-end overflow-hidden rounded-2xl bg-gray-900 px-8 pt-80 pb-8 sm:pt-48 lg:pt-80"
            >
              {post.imageUrl ? (
                <>
                  {/* External CMS images are intentionally rendered directly. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={post.imageAlt}
                    src={post.imageUrl}
                    className="absolute inset-0 -z-10 size-full object-cover"
                  />
                </>
              ) : (
                <div className="absolute inset-0 -z-10 bg-linear-to-br from-[var(--brand-navy)] via-[var(--brand-blue)] to-[var(--brand-green)]" />
              )}
              <div className="absolute inset-0 -z-10 bg-linear-to-t from-gray-900 via-gray-900/40" />
              <div className="absolute inset-0 -z-10 rounded-2xl inset-ring inset-ring-gray-900/10" />

              <div className="flex flex-wrap items-center gap-y-1 overflow-hidden text-sm/6 text-gray-300">
                <time dateTime={post.datetime} className="mr-8">
                  {post.date}
                </time>
              </div>
              <h3 className="mt-3 text-lg/6 font-semibold text-white">
                <a
                  href={post.href}
                  data-bpm-event="blog_card_clicked"
                  data-bpm-label={post.title}
                  data-bpm-target={post.href}
                  data-bpm-type="content"
                >
                  <span className="absolute inset-0" />
                  {post.title}
                </a>
              </h3>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
