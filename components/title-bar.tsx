import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { HealthspanLogo } from "@/components/healthspan-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale, LocaleCode } from "@/lib/i18n";
import { getNamespace } from "@/lib/i18n-messages";
import { nutritionQuizPath } from "@/lib/nutrition-paths";

type TitleBarProps = Readonly<{
  currentLocale: Locale;
  currentPath?: string;
  localizedPaths?: Partial<Record<LocaleCode, string>>;
  title: string;
  variant?: "default" | "landing";
}>;

type TitleBarCopy = Readonly<{
  assessment: string;
  availability: string;
  availableCountries: readonly (readonly [string, string])[];
  comingSoon: string;
  comingSoonCountries: readonly (readonly [string, string])[];
  homeAria: string;
  links: readonly (readonly [string, string])[];
  logoTagline: string;
  menu: string;
  navAria: string;
}>;

function titleBarHref(locale: Locale, href: string) {
  if (href.startsWith("#")) {
    return `/${locale}${href}`;
  }

  if (href.startsWith("/")) {
    return href.startsWith(`/${locale}/`) || href === `/${locale}`
      ? href
      : `/${locale}${href}`;
  }

  return href;
}

function isAssessmentStartedPath(currentPath: string, locale: Locale) {
  const pathname = currentPath.startsWith("http")
    ? new URL(currentPath).pathname
    : currentPath.split("?")[0] || `/${locale}`;

  return pathname === `/${locale}/assessment` ||
    pathname === `/${locale}/assessment/results` ||
    pathname === `/${locale}/nutrition/quiz` ||
    pathname === `/${locale}/nutrition/healthscore` ||
    pathname === `/${locale}/nutrition/reveal`;
}

export function TitleBar({
  currentLocale,
  currentPath = `/${currentLocale}`,
  localizedPaths,
  title,
  variant = "default"
}: TitleBarProps) {
  const copy = getNamespace<TitleBarCopy>(currentLocale, "customer.titleBar", {
    "customer.titleBar.homeAria": { title }
  });
  const assessmentPath = nutritionQuizPath(currentLocale);
  const titleCtaHref = assessmentPath;
  const showAssessmentCta = !isAssessmentStartedPath(currentPath, currentLocale);
  const isLanding = variant === "landing";

  return (
    <header className={isLanding ? "mn-titlebar mn-titlebar--landing" : "mn-titlebar"}>
      <div className="mn-availability-bar" aria-label={copy.availability}>
        <span className="mn-availability-label">{copy.availability}</span>
        <span className="mn-availability-pills">
          {copy.availableCountries.map(([flag, country]) => (
            <span key={country} className="mn-availability-pill">
              <span aria-hidden>{flag}</span>
              <span>{country}</span>
            </span>
          ))}
        </span>
        <span className="hidden h-3.5 w-px bg-white/15 sm:inline-block" />
        <span className="mn-availability-coming">
          <span className="mn-availability-label mn-availability-label--muted">
            {copy.comingSoon}
          </span>
          <span className="mn-availability-pills">
            {copy.comingSoonCountries.map(([flag, country]) => (
              <span key={country} className="mn-availability-pill mn-availability-pill--soon">
                <span aria-hidden>{flag}</span>
                <span>{country}</span>
              </span>
            ))}
          </span>
        </span>
      </div>
      <div className="mn-titlebar-main">
        <Link
          href={`/${currentLocale}`}
          data-bpm-event="site_logo_clicked"
          data-bpm-label="MattaNutra"
          data-bpm-target={`/${currentLocale}`}
          data-bpm-type="traffic"
          aria-label={copy.homeAria}
          className="flex min-w-0 items-center text-foreground transition hover:text-[var(--mn-teal-deep)]"
        >
          {isLanding ? (
            <span className="inline-flex w-max items-center gap-3">
              <Image
                src="/v15/logo.png"
                alt=""
                width={96}
                height={150}
                priority
                className="h-9 w-9 object-contain"
                aria-hidden="true"
                unoptimized={true}
              />
              <span className="inline-grid leading-none">
                <span className="mn-logo-wordmark inline-flex items-baseline whitespace-nowrap text-[22px] font-medium tracking-normal">
                  <span className="text-[var(--mn-logo-ink,var(--mn-ink))]">Matta</span>
                  <span className="text-[var(--mn-teal)]">Nutra</span>
                </span>
                <span
                  className={
                    currentLocale === "zh-CN"
                      ? "mn-logo-tagline mt-1 text-[10px] font-medium normal-case tracking-normal text-[var(--mn-logo-tagline,var(--muted-foreground))]"
                      : "mn-logo-tagline mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--mn-logo-tagline,var(--muted-foreground))]"
                  }
                >
                  {copy.logoTagline}
                </span>
              </span>
            </span>
          ) : (
            <HealthspanLogo className="shrink-0" locale={currentLocale} variant="v14" />
          )}
        </Link>
        <nav
          aria-label={copy.navAria}
          className="mn-titlebar-nav"
        >
          {copy.links.map(([href, label]) => (
            <Link
              href={titleBarHref(currentLocale, href)}
              key={href}
              className="mn-titlebar-link"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mn-titlebar-actions">
          {showAssessmentCta ? (
            <Link className="mn-titlebar-cta" href={titleCtaHref}>
              {copy.assessment}
            </Link>
          ) : null}
          <LanguageSwitcher
            currentLocale={currentLocale}
            currentPath={currentPath}
            localizedPaths={localizedPaths}
          />
          <details className="mn-titlebar-mobile-menu">
            <summary aria-label={copy.menu}>
              <Menu aria-hidden className="size-5" />
            </summary>
            <div className="mn-titlebar-mobile-panel">
              {copy.links.map(([href, label]) => (
                <Link
                  href={titleBarHref(currentLocale, href)}
                  key={href}
                  className="mn-titlebar-mobile-link"
                >
                  {label}
                </Link>
              ))}
              <div className="mn-titlebar-mobile-actions">
                {showAssessmentCta ? (
                  <Link className="mn-titlebar-mobile-cta" href={titleCtaHref}>
                    {copy.assessment}
                  </Link>
                ) : null}
                <LanguageSwitcher
                  currentLocale={currentLocale}
                  currentPath={currentPath}
                  localizedPaths={localizedPaths}
                />
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
