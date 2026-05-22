import Link from "next/link";
import type { SVGProps } from "react";
import type { Locale } from "@/lib/i18n";

function StarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 text-[var(--brand-green)]"
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
      <span className="text-base font-semibold tracking-normal text-[var(--brand-navy)]">
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
      <span className="text-base font-semibold tracking-normal text-[var(--brand-navy)]">
        Shopee
      </span>
    </span>
  );
}

const socialLinks = [
  {
    href: "https://x.com/MattaNutra",
    icon: (props: SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M13.682 10.622 20.239 3h-1.554l-5.693 6.618L8.445 3H3.2l6.877 10.007L3.2 21h1.554l6.012-6.989L15.569 21h5.244l-7.131-10.378Zm-2.128 2.474-.697-.997-5.543-7.929H7.7l4.474 6.399.697.996 5.815 8.318h-2.386l-4.745-6.787Z" />
      </svg>
    ),
    name: "X"
  },
  {
    href: "https://www.instagram.com/mattanutra/",
    icon: (props: SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path
          clipRule="evenodd"
          d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 0 1 1.772 1.153 4.902 4.902 0 0 1 1.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 0 1-1.153 1.772 4.902 4.902 0 0 1-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 0 1-1.772-1.153 4.902 4.902 0 0 1-1.153-1.772c-.247-.636-.416-1.363-.465-2.427C2.013 15.099 2 14.744 2 12.315v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 0 1 1.153-1.772A4.902 4.902 0 0 1 5.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63Zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 0 0-.748-1.15 3.098 3.098 0 0 0-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058ZM12 6.865a5.135 5.135 0 1 1 0 10.27 5.135 5.135 0 0 1 0-10.27Zm0 1.802a3.333 3.333 0 1 0 0 6.666 3.333 3.333 0 0 0 0-6.666Zm5.338-3.205a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"
          fillRule="evenodd"
        />
      </svg>
    ),
    name: "Instagram"
  },
  {
    href: "https://www.facebook.com/people/MattaNutra/61589624542529/",
    icon: (props: SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path
          clipRule="evenodd"
          d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
          fillRule="evenodd"
        />
      </svg>
    ),
    name: "Facebook"
  },
  {
    href: "https://www.tiktok.com/@mattanutra",
    icon: (props: SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M16.6 5.82a5.45 5.45 0 0 1-3.12-3.31h-2.86v12.07a2.55 2.55 0 1 1-1.83-2.44V9.23a5.41 5.41 0 1 0 4.86 5.38V8.44a8.34 8.34 0 0 0 4.86 1.55V7.05a5.46 5.46 0 0 1-1.91-1.23Z" />
      </svg>
    ),
    name: "TikTok"
  },
  {
    href: "https://www.youtube.com/@MattaNutra",
    icon: (props: SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path
          clipRule="evenodd"
          d="M19.812 5.418c.861.23 1.538.907 1.768 1.768C21.998 8.746 22 12 22 12s0 3.255-.418 4.814a2.504 2.504 0 0 1-1.768 1.768C18.254 19 12 19 12 19s-6.255 0-7.814-.419a2.505 2.505 0 0 1-1.768-1.768C2 15.255 2 12 2 12s0-3.255.417-4.814a2.507 2.507 0 0 1 1.768-1.768C5.744 5 11.998 5 11.998 5s6.255 0 7.814.418ZM15.194 12 10 15V9l5.194 3Z"
          fillRule="evenodd"
        />
      </svg>
    ),
    name: "YouTube"
  },
  {
    href: "https://line.me/R/ti/p/@344enooi?oat_content=url&ts=05091931",
    icon: (props: SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M12 3.5c-5.05 0-9.16 3.28-9.16 7.31 0 3.61 3.23 6.64 7.6 7.22.3.06.7.2.8.47.09.24.06.62.03.86l-.13.82c-.04.24-.19.94.79.51.98-.42 5.29-3.11 7.22-5.33A6.48 6.48 0 0 0 21.16 10.81C21.16 6.78 17.05 3.5 12 3.5Zm-3.95 9.18H6.29a.48.48 0 0 1-.48-.48V8.37a.48.48 0 0 1 .96 0v3.35h1.28a.48.48 0 1 1 0 .96Zm1.85-.48a.48.48 0 0 1-.96 0V8.37a.48.48 0 1 1 .96 0v3.83Zm4.15 0a.48.48 0 0 1-.85.3l-1.76-2.4v2.1a.48.48 0 1 1-.96 0V8.37a.48.48 0 0 1 .85-.29l1.76 2.4V8.37a.48.48 0 1 1 .96 0v3.83Zm2.95-2.4a.48.48 0 1 1 0 .96h-1.28v.96H17a.48.48 0 1 1 0 .96h-1.76a.48.48 0 0 1-.48-.48V8.37c0-.26.21-.48.48-.48H17a.48.48 0 1 1 0 .96h-1.28v.95H17Z" />
      </svg>
    ),
    name: "LINE"
  }
] as const;

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
      <div className="mn-site-footer-main">
        <div className="mn-site-footer-brand-row">
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
            <p className="mt-3 text-sm font-semibold uppercase leading-5 tracking-[0.08em] text-[var(--brand-navy)]">
              {content.trustedLine1}
              <br />
              {content.trustedLine2}
            </p>
          </div>
        </div>
      </div>
      <div className="mn-site-footer-bottom">
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <nav
            aria-label="Legal"
            className="mn-site-footer-nav"
          >
            <Link
              href={`/${locale}/terms`}
              data-bpm-event="footer_terms_clicked"
              data-bpm-label={content.terms}
              data-bpm-target={`/${locale}/terms`}
              data-bpm-type="content"
              className="transition hover:text-[var(--brand-blue)]"
            >
              {content.terms}
            </Link>
            <Link
              href={`/${locale}/privacy`}
              data-bpm-event="footer_privacy_clicked"
              data-bpm-label={content.privacy}
              data-bpm-target={`/${locale}/privacy`}
              data-bpm-type="content"
              className="transition hover:text-[var(--brand-blue)]"
            >
              {content.privacy}
            </Link>
          </nav>
          <p className="max-w-2xl text-[11px] leading-5">{content.copyright}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-x-7 gap-y-2">
          {socialLinks.map((item) => (
            <a
              className="flex size-8 items-center justify-center text-[var(--brand-navy)] transition hover:text-[var(--brand-green)]"
              href={item.href}
              key={item.name}
              rel="noreferrer"
              target="_blank"
            >
              <span className="sr-only">{item.name}</span>
              <item.icon aria-hidden="true" className="size-5" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
