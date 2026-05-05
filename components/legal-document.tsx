import type { LegalContent } from "@/lib/legal-content";

type LegalDocumentProps = Readonly<{
  content: LegalContent;
}>;

export function LegalDocument({ content }: LegalDocumentProps) {
  return (
    <article className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8 sm:py-16">
      <div className="rounded-lg bg-white p-6 ring-1 ring-foreground/10 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#3A7BD5]">
          {content.eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-5xl">
          {content.title}
        </h1>
        <p className="mt-4 text-sm font-medium text-muted-foreground">
          {content.updatedLabel}: {content.lastUpdated}
        </p>
        <p className="mt-8 text-base leading-7 text-[#20343A]">
          {content.intro}
        </p>

        <div className="mt-10 space-y-9">
          {content.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold tracking-normal text-[#20343A]">
                {section.title}
              </h2>
              {section.paragraphs ? (
                <div className="mt-3 space-y-3">
                  {section.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm leading-7 text-muted-foreground sm:text-base"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : null}
              {section.bullets ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground sm:text-base">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
