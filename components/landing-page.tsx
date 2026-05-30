import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Heart,
  Leaf,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { LandingReveal } from "@/components/landing-reveal";
import {
  assets,
  content,
  type LandingPricingPlan,
} from "@/components/landing-page-copy";
import type { BlogPostSummary, BlogTestimonial } from "@/lib/blog";
import type { Locale } from "@/lib/i18n";
import { paymentCheckoutPath } from "@/lib/payment-paths";

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
          light ? "mn-v14-eyebrow mn-v14-eyebrow--light" : "mn-v14-eyebrow"
        }
      >
        {eyebrow}
      </p>
      <h2
        className={
          light ? "mn-v14-heading mn-v14-heading--light" : "mn-v14-heading"
        }
      >
        {title} {accent ? <span>{accent}</span> : null}
      </h2>
      {body ? (
        <p
          className={
            light
              ? "mn-v14-section-copy mn-v14-section-copy--light"
              : "mn-v14-section-copy"
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
    <li className={light ? "mn-v14-check mn-v14-check--light" : "mn-v14-check"}>
      <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function PricingCard({
  featured = false,
  locale,
  plan,
}: Readonly<{
  featured?: boolean;
  locale: Locale;
  plan: LandingPricingPlan;
}>) {
  const bestForLabel =
    locale === "th"
      ? "เหมาะสำหรับ:"
      : locale === "zh-CN"
        ? "最适合："
        : "Best for:";

  return (
    <article
      className={
        featured
          ? "mn-v14-price-card mn-v14-price-card--featured"
          : "mn-v14-price-card"
      }
      data-reveal
    >
      {"popular" in plan && typeof plan.popular === "string" ? (
        <span className="mn-v14-popular">{plan.popular}</span>
      ) : null}
      <p
        className={
          featured ? "mn-v14-eyebrow mn-v14-eyebrow--light" : "mn-v14-eyebrow"
        }
      >
        {plan.badge}
      </p>
      <h3>{plan.name}</h3>
      <p className="mn-v14-price-desc">{plan.desc}</p>
      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <span
          className={
            featured
              ? "text-[var(--mn-ash-soft)] line-through"
              : "text-[var(--mn-ash-soft)] line-through"
          }
        >
          {plan.originalPrice}
        </span>
        <span
          className={
            featured
              ? "mn-v14-save-badge mn-v14-save-badge--dark"
              : "mn-v14-save-badge"
          }
        >
          {plan.saving}
        </span>
      </div>
      <div className="mn-v14-price">
        <span>{plan.currency}</span>
        <strong>{plan.price}</strong>
        <em>{plan.termLabel}</em>
      </div>
      <p className="mn-v14-price-term">{plan.term}</p>
      <Link
        className={
          featured
            ? "mn-v14-button mn-v14-button--bright w-full"
            : "mn-v14-button mn-v14-button--outline w-full"
        }
        href={paymentCheckoutPath(locale, {
          plan: plan.plan,
          sourceSurface: "landing",
        })}
      >
        {plan.cta}
      </Link>
      <ul className="mt-7 grid gap-3">
        {plan.features.map((feature, index) => (
          <CheckItem key={feature} light={featured && index > 0}>
            {feature}
          </CheckItem>
        ))}
      </ul>
      <p className={featured ? "mn-v14-best mn-v14-best--dark" : "mn-v14-best"}>
        <strong>{bestForLabel}</strong> {plan.best}
      </p>
      <p
        className={
          featured
            ? "mn-v14-guarantee mn-v14-guarantee--dark"
            : "mn-v14-guarantee"
        }
      >
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
        <span>
          <strong>{plan.guaranteeTitle}</strong> {plan.guarantee}
        </span>
      </p>
    </article>
  );
}

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
          imageAlt: testimonial.name,
        }));
  const journalCards =
    blogPosts.length > 0
      ? blogPosts.map((post) => ({
          body: post.excerpt,
          href: post.href,
          tag: copy.journal.tag,
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

      <section className="mn-v14-hero">
        <div className="mn-v14-glow mn-v14-glow--hero-a" />
        <div className="mn-v14-glow mn-v14-glow--hero-b" />
        <div className="mn-v14-container relative z-[1] grid items-center gap-14 py-20 lg:grid-cols-[1.02fr_0.98fr] lg:py-24">
          <div>
            <p className="mn-v14-eyebrow" data-reveal>
              {copy.hero.eyebrow}
            </p>
            <h1
              className="mn-hero-title mt-6 max-w-4xl font-[family:var(--mn-font-display)] text-5xl font-medium leading-[1.02] text-[var(--mn-ink)] sm:text-6xl lg:text-7xl"
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
              <p className="font-[family:var(--mn-font-display)] text-2xl italic text-[var(--mn-gold)]">
                {copy.hero.paliTitle}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--mn-ink-soft)]">
                {copy.hero.pali}
              </p>
            </div>
            <div className="mt-9 flex flex-wrap gap-3" data-reveal>
              <Link className="mn-v14-button" href={assessmentPath}>
                {copy.hero.primary}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link
                className="mn-v14-button mn-v14-button--outline"
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
          <div className="mn-v14-hero-scatter" data-reveal>
            <span className="mn-v14-hero-orb" />
            <span className="mn-v14-hero-orb-inner" />
            <Image
              alt="MattaNutra emblem"
              className="mn-v14-hero-figure"
              height={465}
              priority
              sizes="(min-width: 768px) 230px, 140px"
              src={assets.heroFigure}
              width={420}
            />
            {copy.hero.ingredientPills.map((pill, index) => (
              <span
                className="mn-v14-float-pill"
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

      <section className="border-b border-[var(--mn-line)] bg-[var(--mn-paper)]">
        <div className="mn-v14-container grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-24">
          <div className="relative" data-reveal>
            <span className="absolute -inset-3 -z-10 rounded-[28px] bg-linear-to-br from-[var(--mn-mint)] to-[var(--mn-sand-soft)]" />
            <Image
              alt={copy.problem.imageAlt}
              className="aspect-[4/3] w-full rounded-[22px] object-cover shadow-[0_20px_60px_-38px_rgba(10,37,64,0.45)]"
              height={666}
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              src={assets.problem}
              width={1000}
            />
          </div>
          <div data-reveal>
            <p className="mn-v14-eyebrow">{copy.problem.eyebrow}</p>
            <h2 className="mn-v14-heading mt-4 text-left">
              {copy.problem.title}
              <br />
              <span>{copy.problem.accent}</span>
            </h2>
            <p className="mt-6 text-lg leading-8 text-[var(--mn-ink-soft)]">
              {copy.problem.body}
            </p>
            <p className="mt-4 text-lg leading-8 text-[var(--mn-ink-soft)]">
              {copy.problem.body2}
            </p>
          </div>
        </div>
      </section>

      <section className="mn-v14-section" id="promises">
        <div className="mn-v14-container">
          <SectionIntro
            accent={copy.promises.accent}
            body={copy.promises.intro}
            eyebrow={copy.promises.eyebrow}
            title={copy.promises.title}
          />
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[Search, Leaf, UserRound, Heart].map((Icon, index) => {
              const [title, subtitle] = copy.promises.cards[index];
              return (
                <article className="text-center" data-reveal key={title}>
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--mn-mint)] text-[var(--mn-teal-deep)]">
                    <Icon aria-hidden className="size-6" />
                  </span>
                  <h3 className="mt-4 font-[family:var(--mn-font-display)] text-2xl font-medium text-[var(--mn-ink)]">
                    {title}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--mn-ash)]">
                    {subtitle}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="mn-v14-section border-y border-[var(--mn-line)] bg-[var(--mn-paper)]"
        id="how-it-works"
      >
        <div className="mn-v14-container">
          <SectionIntro
            accent={copy.how.accent}
            body={copy.how.intro}
            eyebrow={copy.how.eyebrow}
            title={copy.how.title}
          />
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {copy.how.steps.map(([title, label, body], index) => (
              <article className="mn-v14-step-card" data-reveal key={title}>
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
          <div className="mn-v14-glow mn-v14-glow--protocol" />
          <div className="mn-v14-container relative z-[1] grid items-center gap-14 py-20 lg:grid-cols-2 lg:py-24">
            <div data-reveal>
              <p className="mn-v14-badge">{copy.protocol.eyebrow}</p>
              <h2 className="mn-v14-heading mt-5 text-left">
                {copy.protocol.title}
                <br />
                <span>{copy.protocol.accent}</span>
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--mn-ink-soft)]">
                {copy.protocol.intro}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="mn-v14-button" href="#pricing">
                  {copy.protocol.primary}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
                <Link
                  className="mn-v14-button mn-v14-button--outline"
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
            <div className="mn-v14-phone" data-reveal>
              <div className="mn-v14-phone-header">
                <span>M</span>
                <div>
                  <strong>MattaNutra</strong>
                  <small>{copy.protocol.active}</small>
                </div>
                <em>{copy.protocol.channel}</em>
              </div>
              <div className="grid gap-3 bg-[var(--mn-cream)] p-4">
                <p className="mn-v14-chat">{copy.protocol.chat[0]}</p>
                <p className="mn-v14-chat mn-v14-chat--user">
                  {copy.protocol.chat[1]}
                </p>
                <p className="mn-v14-chat">{copy.protocol.chat[2]}</p>
                <div className="mn-v14-protocol-card">
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
                  <p className="mn-v14-based-on">{copy.protocol.basedOn}</p>
                  <details className="mn-v14-reasoning">
                    <summary>{copy.protocol.reasoningLabel}</summary>
                    <div>
                      {copy.protocol.reasoning.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </details>
                </div>
                <p className="mn-v14-chat">
                  {copy.protocol.foodNudge}
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {copy.protocol.foodTags.map((tag) => (
                      <span className="mn-v14-food-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </span>
                </p>
                <p className="mn-v14-chat mn-v14-chat--user">
                  {copy.protocol.vitaminQuestion}
                </p>
                <p className="mn-v14-chat">{copy.protocol.vitaminAnswer}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mn-v14-band">
          <div className="mn-v14-container" data-reveal>
            <h2>
              {copy.protocolBand.title}
              <br />
              <span>{copy.protocolBand.accent}</span>
            </h2>
            <p>{copy.protocolBand.body}</p>
          </div>
        </div>

        <div className="mn-v14-section" id="lp-practice">
          <div className="mn-v14-container">
            <SectionIntro
              accent={copy.practice.accent}
              body={copy.practice.intro}
              eyebrow={copy.practice.eyebrow}
              title={copy.practice.title}
            />
            <div className="mt-12 grid gap-7 md:grid-cols-3">
              {copy.practice.steps.map(([title, body, examples], index) => (
                <article
                  className="mn-v14-practice-card"
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

        <div className="mn-v14-section border-y border-[var(--mn-sand-deep)] bg-[var(--mn-sand-soft)]">
          <div className="mn-v14-container">
            <SectionIntro
              accent={copy.food.accent}
              body={copy.food.intro}
              eyebrow={copy.food.eyebrow}
              title={copy.food.title}
            />
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {copy.food.cards.map(([title, body, tags], index) => (
                <article
                  className={
                    index === 2
                      ? "mn-v14-food-card mn-v14-food-card--mint"
                      : "mn-v14-food-card"
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
              className="mx-auto mt-12 max-w-2xl text-center font-[family:var(--mn-font-display)] text-xl italic leading-8 text-[var(--mn-ink-soft)]"
              data-reveal
            >
              {copy.food.note}
            </p>
          </div>
        </div>

        <div className="mn-v14-difference">
          <div className="mx-auto max-w-3xl px-7" data-reveal>
            <p className="mn-v14-badge mn-v14-badge--dark">
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
                  index === 2 ? "mn-v14-difference-signoff" : undefined
                }
                key={paragraph}
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <div className="mn-v14-bridge">
          <div className="mx-auto max-w-3xl px-7 text-center" data-reveal>
            <h2>{copy.bridge.title}</h2>
            <p>{copy.bridge.body}</p>
            <Link className="mn-v14-button mt-7" href={assessmentPath}>
              {copy.bridge.cta}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <small>{copy.bridge.note}</small>
          </div>
        </div>
      </section>

      <section className="mn-v14-section" id="testimonials">
        <div className="mn-v14-container">
          <SectionIntro
            body={copy.results.intro}
            eyebrow={copy.results.eyebrow}
            title={copy.results.title}
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {testimonialCards.map((testimonial) => (
              <article
                className="mn-v14-testimonial-card"
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
            <Link className="mn-v14-button" href={assessmentPath}>
              {copy.results.cta}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mn-v14-origin" id="origin">
        <div className="mn-v14-glow mn-v14-glow--origin-a" />
        <div className="mn-v14-glow mn-v14-glow--origin-b" />
        <div className="relative z-[1] mx-auto max-w-5xl px-7">
          <div className="max-w-3xl" data-reveal>
            <p className="mn-v14-eyebrow">{copy.origin.eyebrow}</p>
            <h2 className="mn-v14-heading mt-4 text-left">
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
            className="mn-v14-origin-build"
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
                  width={280}
                />
                {index < assets.origin.length - 1 ? <i aria-hidden /> : null}
              </span>
            ))}
          </div>
          <div className="max-w-3xl" data-reveal>
            <h3 className="font-[family:var(--mn-font-display)] text-2xl font-medium text-[var(--mn-ink)]">
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
              <span className="font-[family:var(--mn-font-display)] text-lg italic text-[var(--mn-ink-soft)]">
                {copy.origin.signoff}
              </span>
              <span className="mt-1 text-xs font-semibold text-[var(--mn-ash)]">
                {copy.origin.tagline}
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="mn-v14-section" id="pricing">
        <div className="mn-v14-container">
          <SectionIntro
            accent={copy.pricing.accent}
            body={copy.pricing.intro}
            eyebrow={copy.pricing.eyebrow}
            title={copy.pricing.title}
          />
          <div className="mx-auto mt-12 grid max-w-5xl items-start gap-8 lg:grid-cols-[1fr_1.08fr]">
            <PricingCard locale={locale} plan={copy.pricing.plans[0]} />
            <PricingCard
              featured
              locale={locale}
              plan={copy.pricing.plans[1]}
            />
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[Lock, BadgeCheck, RefreshCw, ShieldCheck].map((Icon, index) => {
              const [title, body] = copy.pricing.trust[index];
              return (
                <article className="mn-v14-trust-card" data-reveal key={title}>
                  <Icon
                    aria-hidden
                    className="mx-auto size-5 text-[var(--mn-teal-deep)]"
                  />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="mn-v14-section border-y border-[var(--mn-line)] bg-[var(--mn-paper)]"
        id="journal"
      >
        <div className="mn-v14-container">
          <div
            className="mb-12 flex flex-wrap items-end justify-between gap-6"
            data-reveal
          >
            <div>
              <p className="mn-v14-eyebrow">{copy.journal.eyebrow}</p>
              <h2 className="mn-v14-heading mt-3 text-left">
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
                className="mn-v14-journal-card group"
                data-reveal
                href={post.href}
                key={post.title}
              >
                <span data-journal-tone={index % 3} />
                <div>
                  <p>{post.tag}</p>
                  <h3>{post.title}</h3>
                  <p>{post.body}</p>
                  <strong>
                    {copy.journal.readMore}
                    <ArrowRight aria-hidden className="size-4" />
                  </strong>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mn-v14-section" id="faq">
        <div className="mx-auto max-w-5xl px-7">
          <SectionIntro
            accent={copy.faq.accent}
            eyebrow={copy.faq.eyebrow}
            title={copy.faq.title}
          />
          <div className="mt-12 grid gap-3.5">
            {copy.faq.items.map(([question, answer]) => (
              <details className="mn-v14-faq-item" data-reveal key={question}>
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

      <section className="mn-v14-final-cta" id="assessment">
        <div className="mn-v14-glow mn-v14-glow--final" />
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
              className="mn-v14-button mn-v14-button--cream"
              href={assessmentPath}
            >
              {copy.final.primary}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link
              className="mn-v14-button mn-v14-button--ghost"
              href="#how-it-works"
            >
              {copy.final.secondary}
            </Link>
          </div>
          <p className="mt-8 font-[family:var(--mn-font-display)] text-lg text-[var(--mn-gold-soft)]">
            {copy.final.quote}
          </p>
        </div>
      </section>
    </div>
  );
}
