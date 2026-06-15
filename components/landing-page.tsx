import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Heart,
  Leaf,
  Search,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import { LandingReveal } from "@/components/landing-reveal";
import { assets, content } from "@/components/landing-page-copy";
import type { BlogPostSummary, BlogTestimonial } from "@/lib/blog";
import type { Locale } from "@/lib/i18n";

type LandingPageProps = Readonly<{
  assessmentPath: string;
  blogPosts: BlogPostSummary[];
  locale: Locale;
  testimonials: BlogTestimonial[];
}>;

function SectionIntro({
  accent,
  body,
  eyebrow,
  light = false,
  title,
}: Readonly<{
  accent?: string;
  body?: string;
  eyebrow: string;
  light?: boolean;
  title: string;
}>) {
  return (
    <div className="mx-auto max-w-3xl text-center" data-reveal>
      <p
        className={
          light ? "mn-v15-eyebrow mn-v15-eyebrow--light" : "mn-v15-eyebrow"
        }
      >
        {eyebrow}
      </p>
      <h2
        className={
          light ? "mn-v15-heading mn-v15-heading--light" : "mn-v15-heading"
        }
      >
        {title} {accent ? <span>{accent}</span> : null}
      </h2>
      {body ? (
        <p
          className={
            light
              ? "mn-v15-section-copy mn-v15-section-copy--light"
              : "mn-v15-section-copy"
          }
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

function CheckItem({
  children,
  light = false,
}: Readonly<{ children: string; light?: boolean }>) {
  return (
    <li className={light ? "mn-v15-check mn-v15-check--light" : "mn-v15-check"}>
      <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

const promiseIconComponents = [Search, Leaf, UserRound, Heart] as const;

export function LandingPage({
  assessmentPath,
  blogPosts,
  locale,
  testimonials,
}: LandingPageProps) {
  const copy = content[locale];
  const testimonialCards =
    testimonials.length > 0
      ? testimonials.map((testimonial) => ({
          id: testimonial.id,
          image: testimonial.authorImageUrl,
          name: testimonial.authorName,
          place: testimonial.authorTitle,
          quote: testimonial.quote,
          role: testimonial.authorHandle,
          imageAlt: testimonial.authorImageAlt || testimonial.authorName,
        }))
      : copy.results.fallback.map((testimonial) => ({
          ...testimonial,
          imageAlt: testimonial.imageAlt,
        }));
  const journalCards =
    blogPosts.length > 0
      ? blogPosts.map((post) => ({
          body: post.excerpt,
          href: post.href,
          tag: post.primaryTag || copy.journal.tag,
          title: post.title,
        }))
      : copy.journal.fallback.map(([tag, title, body]) => ({
          body,
          href: "#journal",
          tag,
          title,
        }));
  const browseHref = blogPosts[0]?.href ?? "#journal";

  return (
    <div className="flex-1">
      <LandingReveal />

      <section className="mn-v15-hero">
        <div className="mn-v15-glow mn-v15-glow--hero-a" />
        <div className="mn-v15-glow mn-v15-glow--hero-b" />
        <div className="mn-v15-container relative z-[1] grid items-center gap-14 py-20 lg:grid-cols-[1.02fr_0.98fr] lg:py-24">
          <div>
            <p className="mn-v15-eyebrow" data-reveal>
              {copy.hero.eyebrow}
            </p>
            <h1
              className="mn-hero-title mt-6 max-w-4xl mn-font-display text-5xl font-medium leading-[1.02] text-[var(--mn-ink)] sm:text-6xl lg:text-7xl"
              data-reveal
            >
              {copy.hero.title}
              <br />
              <span className="italic text-[var(--mn-teal-deep)]">
                {copy.hero.accent}
              </span>
            </h1>
            <p
              className="mn-hero-subtitle mt-7 max-w-xl text-lg leading-8 text-[var(--mn-ink-soft)] sm:text-xl"
              data-reveal
            >
              {copy.hero.intro}
            </p>
            <div
              className="mt-8 max-w-xl border-l-2 border-[var(--mn-gold-soft)] pl-5"
              data-reveal
            >
              <p className="mn-font-display text-2xl italic text-[var(--mn-gold)]">
                {copy.hero.paliTitle}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--mn-ink-soft)]">
                {copy.hero.pali}
              </p>
            </div>
            <div className="mt-9 flex flex-wrap gap-3" data-reveal>
              <Link className="mn-v15-button" href={assessmentPath}>
                {copy.hero.primary}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link
                className="mn-v15-button mn-v15-button--outline"
                href="#how-it-works"
              >
                {copy.hero.secondary}
              </Link>
            </div>
            <p
              className="mt-4 max-w-lg text-sm leading-6 text-[var(--mn-ink-soft)]"
              data-reveal
            >
              {copy.hero.microcopy}
            </p>
            <ul
              className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[var(--mn-ash)]"
              data-reveal
            >
              {copy.hero.checks.map((item) => (
                <li className="inline-flex items-center gap-2" key={item}>
                  <CheckCircle2
                    aria-hidden
                    className="size-4 text-[var(--mn-teal)]"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="mn-v15-hero-scatter" data-reveal>
            <span className="mn-v15-hero-orb" />
            <span className="mn-v15-hero-orb-inner" />
            <Image
              alt="MattaNutra emblem"
              className="mn-v15-hero-figure"
              height={465}
              priority
              sizes="(min-width: 768px) 230px, 140px"
              src={assets.heroFigure}
              unoptimized={true}
              width={420}
            />
            {copy.hero.ingredientPills.map((pill, index) => (
              <span
                className="mn-v15-float-pill"
                data-pill-index={index}
                key={pill}
              >
                {pill}
                <span>?</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="border-b border-[var(--mn-line)] bg-[var(--mn-cream)]">
        <div className="mn-v15-container py-8">
          <div className="mx-auto grid max-w-5xl gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--mn-gold-soft)_40%,transparent)] bg-[radial-gradient(circle_at_85%_0%,rgba(45,143,114,0.28),transparent_55%),linear-gradient(160deg,#1F6E58_0%,#0E2D4D_100%)] p-5 text-[var(--mn-cream)] shadow-[0_34px_70px_-34px_rgba(10,37,64,0.6)] md:grid-cols-3 md:p-6" data-reveal>
            {copy.proof.map((item, index) => (
              <div className="flex items-start gap-3" key={item.title}>
                <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-[var(--mn-teal-light)] ring-1 ring-white/15">
                  {index === 0 ? (
                    <Clock aria-hidden className="size-4" />
                  ) : index === 1 ? (
                    <BadgeCheck aria-hidden className="size-4" />
                  ) : (
                    <ShieldCheck aria-hidden className="size-4" />
                  )}
                </span>
                <span className="leading-snug">
                  <strong className="block text-[13.5px] text-white">
                    {item.title}
                  </strong>
                  <span className="mt-1 block text-[12.5px] text-[color-mix(in_srgb,var(--mn-cream)_90%,transparent)]">
                    {item.body}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="border-b border-[var(--mn-line)] bg-[var(--mn-paper)]">
        <div className="mn-v15-container py-20 lg:py-24">
          <SectionIntro
            accent={copy.clarity.accent}
            body={copy.clarity.body}
            eyebrow={copy.clarity.eyebrow}
            title={copy.clarity.title}
          />
          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {copy.clarity.cards.map((card) => (
              <article
                className="overflow-hidden rounded-[22px] border border-[var(--mn-line)] bg-[var(--mn-cream)] shadow-[var(--mn-shadow-soft)]"
                data-reveal
                key={card.title}
              >
                <Image
                  alt={card.imageAlt}
                  className="aspect-[4/3] w-full object-cover"
                  height={666}
                  sizes="(min-width: 768px) 25vw, 100vw"
                  src={card.image}
                  unoptimized={true}
                  width={1000}
                />
                <div className="p-5">
                  <h3 className="mn-font-display text-xl font-medium text-[var(--mn-ink)]">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--mn-ash)]">
                    {card.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
          <div className="mx-auto mt-16 max-w-[900px] border-t border-[var(--mn-line)] pt-10" data-reveal id="promises">
            <p className="mb-7 text-center mn-font-display text-[20px] text-[var(--mn-ink)]">
              {copy.promises.title}{" "}
              <em className="italic text-[var(--mn-teal-deep)]">
                {copy.promises.accent}
              </em>
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-7 lg:grid-cols-4">
              {copy.promises.cards.map(([title, body], index) => {
                const PromiseIcon = promiseIconComponents[index] ?? BadgeCheck;

                return (
                  <div className="flex items-center justify-center gap-3" key={title}>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--mn-mint)] text-[var(--mn-teal-deep)]">
                      <PromiseIcon aria-hidden className="size-[18px]" strokeWidth={1.8} />
                    </span>
                    <span className="text-left">
                      <span className="block mn-font-display text-[16px] leading-tight text-[var(--mn-ink)]">
                        {title}
                      </span>
                      <span className="block text-[12.5px] text-[var(--mn-ash)]">
                        {body}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section
        className="mn-v15-section border-y border-[var(--mn-line)] bg-[var(--mn-paper)]"
        id="how-it-works"
      >
        <div className="mn-v15-container">
          <SectionIntro
            accent={copy.how.accent}
            body={copy.how.intro}
            eyebrow={copy.how.eyebrow}
            title={copy.how.title}
          />
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {copy.how.steps.map(([title, label, body], index) => (
              <article className="mn-v15-step-card" data-reveal key={title}>
                <span>{index + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
                <strong>{label}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="living-protocol">
        <div className="relative overflow-hidden border-b border-[var(--mn-line)] bg-[var(--mn-cream)]">
          <div className="mn-v15-glow mn-v15-glow--protocol" />
          <div className="mn-v15-container relative z-[1] grid items-center gap-14 py-20 lg:grid-cols-2 lg:py-24">
            <div data-reveal>
              <p className="mn-v15-badge">{copy.protocol.eyebrow}</p>
              <h2 className="mn-v15-heading mt-5 text-left">
                {copy.protocol.title}
                <br />
                <span>{copy.protocol.accent}</span>
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--mn-ink-soft)]">
                {copy.protocol.intro}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="mn-v15-button" href={assessmentPath}>
                  {copy.protocol.primary}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
                <Link
                  className="mn-v15-button mn-v15-button--outline"
                  href="#lp-practice"
                >
                  {copy.protocol.secondary}
                </Link>
              </div>
              <ul className="mt-9 grid gap-3 text-[var(--mn-ink-soft)]">
                {copy.protocol.ticks.map((item) => (
                  <CheckItem key={item}>{item}</CheckItem>
                ))}
              </ul>
            </div>
            <div className="mn-v15-phone" data-reveal>
              <div className="mn-v15-phone-header">
                <span>M</span>
                <div>
                  <strong>MattaNutra</strong>
                  <small>{copy.protocol.active}</small>
                </div>
                <em>{copy.protocol.channel}</em>
              </div>
              <div className="grid gap-3 bg-[var(--mn-cream)] p-4">
                <p className="mn-v15-chat">{copy.protocol.chat[0]}</p>
                <p className="mn-v15-chat mn-v15-chat--user">
                  {copy.protocol.chat[1]}
                </p>
                <p className="mn-v15-chat">{copy.protocol.chat[2]}</p>
                <div className="mn-v15-protocol-card">
                  <div>
                    <p>{copy.protocol.updateLabel}</p>
                    <h3>{copy.protocol.tripTitle}</h3>
                  </div>
                  <ul>
                    {copy.protocol.updates.map((item, index) => (
                      <li key={item}>
                        <span>{index === 2 ? "—" : "✓"}</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mn-v15-based-on">{copy.protocol.basedOn}</p>
                  <details className="mn-v15-reasoning">
                    <summary>{copy.protocol.reasoningLabel}</summary>
                    <div>
                      {copy.protocol.reasoning.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </details>
                </div>
                <div className="mn-v15-chat">
                  <p>{copy.protocol.foodNudge}</p>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {copy.protocol.foodTags.map((tag) => (
                      <span className="mn-v15-food-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </span>
                </div>
                <p className="mn-v15-chat mn-v15-chat--user">
                  {copy.protocol.vitaminQuestion}
                </p>
                <p className="mn-v15-chat">{copy.protocol.vitaminAnswer}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mn-v15-band">
          <div className="mn-v15-container" data-reveal>
            <h2>
              {copy.protocolBand.title}
              <br />
              <span>{copy.protocolBand.accent}</span>
            </h2>
            <p>{copy.protocolBand.body}</p>
          </div>
        </div>

        <div className="mn-v15-section" id="lp-practice">
          <div className="mn-v15-container">
            <SectionIntro
              accent={copy.practice.accent}
              body={copy.practice.intro}
              eyebrow={copy.practice.eyebrow}
              title={copy.practice.title}
            />
            <div className="mt-12 grid gap-7 md:grid-cols-3">
              {copy.practice.steps.map(([title, body, examples], index) => (
                <article
                  className="mn-v15-practice-card"
                  data-reveal
                  key={title}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <div>
                    {examples.map((example) => (
                      <em key={example}>“{example}”</em>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="mn-v15-section border-y border-[var(--mn-sand-deep)] bg-[var(--mn-sand-soft)]">
          <div className="mn-v15-container">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16" data-reveal>
              <div className="relative" data-reveal>
                <span className="absolute -inset-3 -z-10 rounded-[28px] bg-linear-to-br from-[var(--mn-mint)] to-[color-mix(in_srgb,var(--mn-sand-soft)_60%,transparent)]" />
                <Image
                  alt={copy.food.imageAlt}
                  className="w-full rounded-[22px] object-cover shadow-[var(--mn-shadow-soft)]"
                  height={768}
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  src={assets.foodBowl}
                  unoptimized={true}
                  width={1024}
                />
              </div>
              <div>
                <p className="mn-v15-badge">
                  {copy.food.eyebrow}
                </p>
                <h2 className="mt-5 mn-font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.1] tracking-normal text-[var(--mn-ink)]">
                  {copy.food.title}{" "}
                  <em className="italic text-[var(--mn-teal-deep)]">
                    {copy.food.accent}
                  </em>
                </h2>
                <p className="mt-[18px] text-lg leading-8 text-[var(--mn-ink-soft)]">
                  {copy.food.intro}
                </p>
              </div>
            </div>
            <div className="mt-16 grid gap-6 md:grid-cols-3">
              {copy.food.cards.map(([title, body, tags], index) => (
                <article
                  className={
                    index === 2
                      ? "mn-v15-food-card mn-v15-food-card--mint"
                      : "mn-v15-food-card"
                  }
                  data-reveal
                  key={title}
                >
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <div>
                    {tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            <p
              className="mx-auto mt-12 max-w-2xl text-center mn-font-display text-xl italic leading-8 text-[var(--mn-ink-soft)]"
              data-reveal
            >
              {copy.food.note}
            </p>
          </div>
        </div>

        <div className="mn-v15-difference">
          <div className="mx-auto max-w-3xl px-7" data-reveal>
            <p className="mn-v15-badge mn-v15-badge--dark">
              {copy.difference.eyebrow}
            </p>
            <h2>
              {copy.difference.title}
              <br />
              <span>{copy.difference.accent}</span>
            </h2>
            {copy.difference.paragraphs.map((paragraph, index) => (
              <p
                className={
                  index === 2 ? "mn-v15-difference-signoff" : undefined
                }
                key={paragraph}
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <div className="mn-v15-bridge">
          <div className="mx-auto max-w-3xl px-7 text-center" data-reveal>
            <h2>{copy.bridge.title}</h2>
            <p>{copy.bridge.body}</p>
            <Link className="mn-v15-button mt-7" href={assessmentPath}>
              {copy.bridge.cta}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <small>{copy.bridge.note}</small>
          </div>
        </div>
      </section>

      <section className="mn-v15-section" id="testimonials">
        <div className="mn-v15-container">
          <SectionIntro
            body={copy.results.intro}
            eyebrow={copy.results.eyebrow}
            title={copy.results.title}
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {testimonialCards.map((testimonial) => (
              <article
                className="mn-v15-testimonial-card"
                data-reveal
                key={testimonial.id}
              >
                <div className="relative">
                  {testimonial.image ? (
                    <Image
                      alt={testimonial.imageAlt}
                      className="aspect-[4/3] w-full rounded-[14px] object-cover"
                      height={543}
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                      src={testimonial.image}
                      unoptimized={true}
                      width={724}
                    />
                  ) : (
                    <div className="grid aspect-[4/3] w-full place-items-center rounded-[14px] bg-[var(--mn-mint)] text-4xl font-semibold text-[var(--mn-teal-deep)]">
                      {testimonial.name.slice(0, 1)}
                    </div>
                  )}
                  <span>”</span>
                </div>
                <p>{testimonial.quote}</p>
                <div className="mt-auto border-t border-[var(--mn-line)] pt-4">
                  <strong>{testimonial.name}</strong>
                  <small>{testimonial.place}</small>
                  {testimonial.role ? <em>{testimonial.role}</em> : null}
                </div>
              </article>
            ))}
          </div>
          <div className="mt-12 text-center" data-reveal>
            <p className="mb-6 inline-flex max-w-3xl items-center justify-center gap-2 text-[var(--mn-ink-soft)]">
              <Leaf aria-hidden className="size-5 text-[var(--mn-teal)]" />
              {copy.results.join}
            </p>
            <br />
            <Link className="mn-v15-button" href={assessmentPath}>
              {copy.results.cta}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mn-v15-origin" id="origin">
        <div className="mn-v15-glow mn-v15-glow--origin-a" />
        <div className="mn-v15-glow mn-v15-glow--origin-b" />
        <div className="relative z-[1] mx-auto max-w-5xl px-7">
          <div className="max-w-3xl" data-reveal>
            <p className="mn-v15-eyebrow">{copy.origin.eyebrow}</p>
            <h2 className="mn-v15-heading mt-4 text-left">
              {copy.origin.title}
              <br />
              <span>{copy.origin.accent}</span>
            </h2>
            <p className="mt-6 text-lg leading-8 text-[var(--mn-ink-soft)]">
              {copy.origin.body}
            </p>
            <p className="mt-4 text-lg leading-8 text-[var(--mn-ink-soft)]">
              {copy.origin.body2}
            </p>
          </div>
          <div
            className="mn-v15-origin-build"
            role="img"
            aria-label={copy.origin.buildAlt}
            data-reveal
          >
            {assets.origin.map((src, index) => (
              <span className="contents" key={src}>
                <Image
                  alt=""
                  aria-hidden="true"
                  className="w-[110px] flex-none object-contain md:w-[100px]"
                  height={256}
                  loading="eager"
                  sizes="110px"
                  src={src}
                  unoptimized={true}
                  width={280}
                />
                {index < assets.origin.length - 1 ? <i aria-hidden /> : null}
              </span>
            ))}
          </div>
          <div className="max-w-3xl" data-reveal>
            <h3 className="mn-font-display text-2xl font-medium text-[var(--mn-ink)]">
              {copy.origin.founders}
            </h3>
            {copy.origin.founderParagraphs.map((paragraph) => (
              <p
                className="mt-4 text-lg leading-8 text-[var(--mn-ink-soft)]"
                key={paragraph}
              >
                {paragraph}
              </p>
            ))}
          </div>
          <div
            className="mt-12 flex max-w-3xl items-center gap-3.5 border-t border-[var(--mn-sand-deep)] pt-7"
            data-reveal
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--mn-gold-soft)] bg-[var(--mn-paper)] text-[var(--mn-gold)]">
              <Clock aria-hidden className="size-5" />
            </span>
            <span className="grid leading-tight">
              <span className="mn-font-display text-lg italic text-[var(--mn-ink-soft)]">
                {copy.origin.signoff}
              </span>
              <span className="mt-1 text-xs font-semibold text-[var(--mn-ash)]">
                {copy.origin.tagline}
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="mn-v15-section" id="start-free">
        <div className="mn-v15-container">
          <SectionIntro
            body={copy.questionnaire.body}
            eyebrow={copy.questionnaire.eyebrow}
            title={copy.questionnaire.title}
          />
          <div className="mx-auto mt-12 max-w-[680px] overflow-hidden rounded-[24px] bg-[var(--mn-paper)] shadow-[0_40px_80px_-44px_rgba(10,37,64,0.55)] ring-1 ring-[var(--mn-line)]" data-reveal>
            <div className="flex items-center gap-2.5 border-b border-[var(--mn-line)] bg-[var(--mn-cream)] px-5 py-3.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-linear-to-br from-[var(--mn-teal-light)] to-[var(--mn-teal-deep)] mn-font-display text-xs text-white">
                M
              </span>
              <span className="mn-font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mn-teal-deep)]">
                {copy.questionnaire.cardLabel}
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--mn-ash)]">
                <ShieldCheck
                  aria-hidden
                  className="size-3.5 text-[var(--mn-teal-deep)]"
                />
                {copy.questionnaire.privateLabel}
              </span>
            </div>
            <div className="px-5 pt-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[var(--mn-sand-deep)] bg-[var(--mn-gold-tint)] px-2.5 py-1 mn-font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--mn-gold)]">
                  {copy.questionnaire.sampleLabel}
                </span>
                <span className="text-xs text-[var(--mn-ash)]">
                  {copy.questionnaire.sampleBody}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="mn-font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--mn-ash)]">
                  {copy.questionnaire.progressPath}
                </span>
                <span className="mn-font-display text-[15px] text-[var(--mn-teal-deep)]">
                  {copy.questionnaire.progress}
                </span>
              </div>
              <div className="mt-1.5 h-[9px] overflow-hidden rounded-full bg-[var(--mn-cream-deep)] ring-1 ring-[var(--mn-line)]">
                <div className="h-full w-[8%] rounded-full bg-linear-to-r from-[var(--mn-gold-soft)] via-[var(--mn-teal-light)] to-[var(--mn-teal)]" />
              </div>
              <p className="mt-1.5 text-[12.5px] text-[var(--mn-ash-soft)]">
                {copy.questionnaire.progressNote}
              </p>
            </div>
            <div className="mx-5 mt-4 rounded-2xl border border-[var(--mn-mint-deep)] border-l-4 border-l-[var(--mn-teal)] bg-linear-to-br from-[var(--mn-mint)] to-[var(--mn-cream)] px-5 py-4">
              <p className="mn-font-display text-[15px] italic leading-[1.5] text-[var(--mn-ink-soft)]">
                “{copy.questionnaire.quote}”
              </p>
            </div>
            <div className="px-5 pt-5">
              <div className="flex items-baseline justify-between">
                <span className="mn-font-display text-base text-[var(--mn-ink)]">
                  {copy.questionnaire.skinTone}
                </span>
                <span className="mn-font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mn-ash)]">
                  {copy.questionnaire.foundation}
                </span>
              </div>
              <p className="mb-3 mt-0.5 text-[13px] text-[var(--mn-ash)]">
                {copy.questionnaire.skinBody}
              </p>
              <div className="grid grid-cols-6 gap-2">
                {["#F3E0CE", "#EBC9A6", "#DDB892", "#C49A6C", "#A87B52", "#7E5A3A"].map((tone) => (
                  <span
                    className="h-10 rounded-lg ring-1 ring-black/5"
                    key={tone}
                    style={{ background: tone }}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-4 px-5 pt-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--mn-ink)]">
                  {copy.questionnaire.sunExposure}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {copy.questionnaire.sunOptions.map((option, index) => (
                    <button
                      className={
                        index === 1
                          ? "rounded-full border border-[var(--mn-teal-deep)] bg-[var(--mn-teal-deep)] px-3.5 py-1.5 text-[13px] font-semibold text-white"
                          : "rounded-full border border-[var(--mn-line)] bg-[var(--mn-paper)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--mn-ink-soft)]"
                      }
                      key={option}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--mn-ink)]">
                  {copy.questionnaire.sunscreen}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {copy.questionnaire.sunscreenOptions.map((option, index) => (
                    <button
                      className={
                        index === 2
                          ? "rounded-full border border-[var(--mn-teal-deep)] bg-[var(--mn-teal-deep)] px-3.5 py-1.5 text-[13px] font-semibold text-white"
                          : "rounded-full border border-[var(--mn-line)] bg-[var(--mn-paper)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--mn-ink-soft)]"
                      }
                      key={option}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-xl bg-[color-mix(in_srgb,var(--mn-sand-soft)_70%,transparent)] px-4 py-3">
              <Sun aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--mn-gold)]" />
              <p className="text-[12.5px] leading-[1.5] text-[var(--mn-ink-soft)]">
                {copy.questionnaire.insight}
              </p>
            </div>
            <div className="px-5 pb-1 pt-4">
              <p className="mb-2 text-[11px] text-[var(--mn-ash)]">
                {copy.questionnaire.sectionsLabel}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {copy.questionnaire.sections.map((section, index) => (
                  <span
                    className={
                      index === 0
                        ? "inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--mn-ink)]"
                        : "inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--mn-ash)]"
                    }
                    key={section}
                  >
                    <span
                      className={
                        index === 0
                          ? "grid size-[15px] place-items-center rounded-full bg-[var(--mn-ink)] text-[8.5px] text-[var(--mn-cream)]"
                          : "grid size-[15px] place-items-center rounded-full bg-[var(--mn-cream-deep)] text-[8.5px] text-[var(--mn-ash)]"
                      }
                    >
                      {index + 1}
                    </span>
                    {section}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-4 border-t border-[var(--mn-line)] bg-[var(--mn-cream)] px-5 py-3.5 text-center">
              <span className="text-[12.5px] text-[var(--mn-ink-soft)]">
                {copy.questionnaire.bottom}
              </span>
            </div>
          </div>
          <div className="mt-9 text-center" data-reveal>
            <Link className="mn-v15-button" href={assessmentPath}>
              {copy.hero.primary}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <p className="mt-4 text-sm text-[var(--mn-ash)]">
              {copy.questionnaire.reassurance}
            </p>
          </div>
        </div>
      </section>

      <section
        className="mn-v15-section border-y border-[var(--mn-line)] bg-[var(--mn-paper)]"
        id="journal"
      >
        <div className="mn-v15-container">
          <div
            className="mb-12 flex flex-wrap items-end justify-between gap-6"
            data-reveal
          >
            <div>
              <p className="mn-v15-eyebrow">{copy.journal.eyebrow}</p>
              <h2 className="mn-v15-heading mt-3 text-left">
                {copy.journal.title} <span>{copy.journal.accent}</span>
              </h2>
            </div>
            <Link
              className="inline-flex items-center gap-2 font-semibold text-[var(--mn-teal-deep)] hover:text-[var(--mn-ink)]"
              href={browseHref}
            >
              {copy.journal.browse}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <div className="grid gap-7 md:grid-cols-3">
            {journalCards.map((post, index) => (
              <Link
                className="mn-v15-journal-card group"
                data-reveal
                href={post.href}
                key={post.title}
              >
                <span data-journal-tone={index % 3} />
                <div>
                  <p>{post.tag}</p>
                  <h3>{post.title}</h3>
                  <p>{post.body}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mn-v15-section" id="faq">
        <div className="mx-auto max-w-5xl px-7">
          <SectionIntro
            accent={copy.faq.accent}
            eyebrow={copy.faq.eyebrow}
            title={copy.faq.title}
          />
          <div className="mt-12 grid gap-3.5">
            {copy.faq.items.map(([question, answer]) => (
              <details className="mn-v15-faq-item" data-reveal key={question}>
                <summary>
                  {question}
                  <span>+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mn-v15-final-cta" id="assessment">
        <div className="mn-v15-glow mn-v15-glow--final" />
        <div
          className="relative z-[1] mx-auto max-w-4xl px-7 text-center"
          data-reveal
        >
          <h2>
            {copy.final.title}
            <br />
            <span>{copy.final.accent}</span>
          </h2>
          <p>{copy.final.body}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              className="mn-v15-button mn-v15-button--cream"
              href={assessmentPath}
            >
              {copy.final.primary}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link
              className="mn-v15-button mn-v15-button--ghost"
              href="#how-it-works"
            >
              {copy.final.secondary}
            </Link>
          </div>
          <p className="mt-8 mn-font-display text-lg text-[var(--mn-gold-soft)]">
            {copy.final.quote}
          </p>
        </div>
      </section>
    </div>
  );
}
