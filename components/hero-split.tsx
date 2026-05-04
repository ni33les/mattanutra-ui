import Image from "next/image";

const heroImageUrl = "/final.png";
const heroBottomLeftFade =
  "radial-gradient(ellipse at bottom left, rgba(251, 252, 248, 0.98) 0%, rgba(251, 252, 248, 0.78) 16%, rgba(251, 252, 248, 0.32) 31%, rgba(251, 252, 248, 0) 48%)";

type HeroSplitProps = Readonly<{
  cta: string;
  ctaHref: string;
  eyebrow: string;
  headline: string;
  headlineAccent: string;
  headlineMuted: string;
  imageAlt: string;
  secondaryCta: string;
  subheadline: string;
  subheadlineAccent: string;
}>;

function renderAccentText(text: string, accent: string, className: string) {
  if (!accent || !text.includes(accent)) {
    return text;
  }

  const [before, after] = text.split(accent);

  return (
    <>
      {before}
      <span className={className}>{accent}</span>
      {after}
    </>
  );
}

export function HeroSplit({
  cta,
  ctaHref,
  eyebrow,
  headline,
  headlineAccent,
  headlineMuted,
  imageAlt,
  secondaryCta,
  subheadline,
  subheadlineAccent
}: HeroSplitProps) {
  return (
    <section className="relative isolate overflow-hidden bg-background">
      <div className="grid min-h-[34rem] grid-cols-1 items-center gap-12 px-6 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#3A7BD5]">
            {eyebrow}
          </p>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-normal text-[#20343A] text-balance sm:text-6xl lg:text-7xl">
            {renderAccentText(headline, headlineAccent, "text-[#1FA77A]")}{" "}
            <span className="text-[#20343A]">{headlineMuted}</span>
          </h1>
          {subheadline ? (
            <p className="mt-8 max-w-xl text-lg font-medium leading-8 text-muted-foreground sm:text-xl">
              {renderAccentText(
                subheadline,
                subheadlineAccent,
                "font-semibold text-[#3A7BD5]"
              )}
            </p>
          ) : null}
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <a
              href={ctaHref}
              className="rounded-md bg-[#1FA77A] px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-[#188a65] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1FA77A]"
            >
              {cta}
            </a>
            <a
              href="#features"
              className="text-sm font-semibold leading-6 text-[#20343A]"
            >
              {secondaryCta} <span aria-hidden="true">-&gt;</span>
            </a>
          </div>
        </div>

        <div className="relative min-h-[24rem] overflow-hidden rounded-lg bg-background lg:min-h-[34rem]">
          <Image
            src={heroImageUrl}
            alt={imageAlt}
            fill
            priority
            sizes="(min-width: 1024px) 560px, 100vw"
            className="object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: heroBottomLeftFade }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-foreground/10 ring-inset"
          />
        </div>
      </div>
    </section>
  );
}
