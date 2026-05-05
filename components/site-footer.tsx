import Link from "next/link";
import type { Locale } from "@/lib/i18n";

function StarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 text-[#F4C430]"
      aria-hidden="true"
    >
      <path
        d="m12 2.8 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9L12 2.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LazadaLogo() {
  return (
    <span className="inline-flex items-center gap-2" aria-label="Lazada">
      <svg
        viewBox="0 0 32 28"
        className="h-6 w-7"
        role="img"
        aria-hidden="true"
      >
        <path
          d="M16 2.4 29 9.8v8.4L16 25.6 3 18.2V9.8L16 2.4Z"
          fill="#F36523"
        />
        <path d="M16 2.4 29 9.8 16 17.2 3 9.8 16 2.4Z" fill="#F9A11B" />
        <path d="M3 9.8 16 17.2v8.4L3 18.2V9.8Z" fill="#C6367A" />
        <path d="M29 9.8 16 17.2v8.4l13-7.4V9.8Z" fill="#7B2CBF" />
      </svg>
      <span className="text-base font-semibold tracking-normal text-[#20343A]">
        Lazada
      </span>
    </span>
  );
}

function ShopeeLogo() {
  return (
    <span className="inline-flex items-center gap-2" aria-label="Shopee">
      <svg
        viewBox="0 0 28 32"
        className="h-7 w-6"
        role="img"
        aria-hidden="true"
      >
        <path
          d="M5.3 9.4h17.4l1.3 19.5H4L5.3 9.4Z"
          fill="#EE4D2D"
          stroke="#EE4D2D"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M9 10c0-4.1 2.1-6.8 5-6.8s5 2.7 5 6.8"
          fill="none"
          stroke="#EE4D2D"
          strokeLinecap="round"
          strokeWidth="2.4"
        />
        <path
          d="M17.5 16.1c-.8-.7-1.8-1.1-3.1-1.1-1.8 0-3 .8-3 2.1 0 1.1.8 1.7 2.7 2.3 2.2.7 3.5 1.5 3.5 3.3 0 1.9-1.6 3.2-4 3.2-1.5 0-2.8-.4-3.8-1.2"
          fill="none"
          stroke="#FFFFFF"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
      <span className="text-base font-semibold tracking-normal text-[#20343A]">
        Shopee
      </span>
    </span>
  );
}

type FooterContent = Readonly<{
  copyright: string;
  privacy: string;
  recommended: string;
  starsLabel: string;
  terms: string;
  trustedLine1: string;
  trustedLine2: string;
}>;

export function SiteFooter({
  content,
  locale
}: Readonly<{ content: FooterContent; locale: Locale }>) {
  return (
    <footer className="border-t border-foreground/10 bg-background">
      <div className="mx-auto grid min-h-28 w-full max-w-6xl grid-cols-1 items-center gap-7 px-4 py-7 sm:px-6 md:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.65fr)] md:gap-4 lg:px-8">
        <div className="flex min-w-0 flex-col items-center gap-3 text-center text-[#20343A] sm:flex-row sm:justify-center md:justify-start md:text-left">
          <p className="max-w-full text-wrap text-[10px] font-semibold uppercase leading-5 tracking-[0.06em] sm:text-[11px] lg:text-xs">
            {content.recommended}
          </p>
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <LazadaLogo />
            <ShopeeLogo />
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-center md:justify-end">
          <div className="text-center">
            <div
              className="flex justify-center gap-1"
              aria-label={content.starsLabel}
            >
              {Array.from({ length: 5 }).map((_, index) => (
                <StarIcon key={index} />
              ))}
            </div>
            <p className="mt-3 text-sm font-semibold uppercase leading-5 tracking-[0.08em] text-[#20343A]">
              {content.trustedLine1}
              <br />
              {content.trustedLine2}
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 pb-6 pt-2 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
        <nav
          aria-label="Legal"
          className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]"
        >
          <Link href={`/${locale}/terms`} className="transition hover:text-[#3A7BD5]">
            {content.terms}
          </Link>
          <Link href={`/${locale}/privacy`} className="transition hover:text-[#3A7BD5]">
            {content.privacy}
          </Link>
        </nav>
        <p className="max-w-2xl text-[11px] leading-5">{content.copyright}</p>
      </div>
    </footer>
  );
}
