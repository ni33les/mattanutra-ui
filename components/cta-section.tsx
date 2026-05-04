import { LockClosedIcon } from "@heroicons/react/20/solid";

type CtaContent = Readonly<{
  button: string;
  reassurance: string;
  titleLine1: string;
  titleLine2: string;
}>;

export function CtaSection({ content }: Readonly<{ content: CtaContent }>) {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
        <h2 className="max-w-2xl text-4xl font-semibold tracking-normal text-balance text-gray-900 sm:text-5xl">
          {content.titleLine1}
          <br />
          {content.titleLine2}
        </h2>
        <div className="mt-10 flex items-center">
          <a
            href="#"
            className="inline-flex items-center gap-2 rounded-md bg-[#1FA77A] px-5 py-3 text-[15px] font-semibold uppercase tracking-[0.08em] text-white shadow-sm hover:bg-[#188a65] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1FA77A]"
          >
            {content.button} <span aria-hidden="true">-&gt;</span>
          </a>
        </div>
        <div className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-900">
          <LockClosedIcon
            aria-hidden={true}
            className="size-3.5 flex-none text-gray-900"
          />
          <span>{content.reassurance}</span>
        </div>
      </div>
    </section>
  );
}
