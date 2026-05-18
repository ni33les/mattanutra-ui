import { LockClosedIcon } from "@heroicons/react/20/solid";

type CtaContent = Readonly<{
  button: string;
  reassurance: string;
  titleLine1: string;
  titleLine2: string;
}>;

type CtaSectionProps = Readonly<{
  content: CtaContent;
  ctaHref: string;
}>;

const ctaBackgroundImage = "/cta-athletes.jpg";

export function CtaSection({ content, ctaHref }: CtaSectionProps) {
  return (
    <section className="relative overflow-hidden bg-[var(--brand-soft-turquoise)]">
      <div
        aria-hidden={true}
        className="absolute inset-0 bg-cover bg-center opacity-34"
        style={{
          backgroundImage: `url("${ctaBackgroundImage}")`,
          backgroundPosition: "center 45%"
        }}
      />
      <div
        aria-hidden={true}
        className="absolute inset-0 bg-gradient-to-b from-[#eefbfa]/82 via-[#edf6ff]/64 to-[#effaf4]/86"
      />
      <div className="relative mx-auto flex min-h-[28rem] max-w-7xl flex-col items-center justify-center px-6 py-24 text-center sm:py-32 lg:px-8">
        <h2 className="max-w-2xl text-4xl font-semibold tracking-normal text-balance text-[var(--brand-navy)] sm:text-5xl">
          {content.titleLine1}
          {content.titleLine2 ? (
            <>
              <br />
              {content.titleLine2}
            </>
          ) : null}
        </h2>
        <div className="mt-10 flex justify-center">
          <a
            href={ctaHref}
            data-bpm-event="home_bottom_assessment_clicked"
            data-bpm-label={content.button}
            data-bpm-target={ctaHref}
            data-bpm-type="funnel"
            className="inline-flex items-center gap-2 rounded-md bg-[var(--brand-blue)] px-5 py-3 text-[15px] font-semibold uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-[var(--brand-blue-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-turquoise)]"
          >
            {content.button}
          </a>
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--brand-navy)]">
          <LockClosedIcon
            aria-hidden={true}
            className="size-3.5 flex-none text-[var(--brand-green-dark)]"
          />
          <span>{content.reassurance}</span>
        </div>
      </div>
    </section>
  );
}
