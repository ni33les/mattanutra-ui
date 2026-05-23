import Link from "next/link";
import { HealthspanLogo } from "@/components/healthspan-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/lib/i18n";
import { nutritionQuizPath } from "@/lib/nutrition-paths";

type TitleBarProps = Readonly<{
  currentLocale: Locale;
  currentPath?: string;
  localizedPaths?: Partial<Record<Locale, string>>;
  title: string;
}>;

const titleBarCopy = {
  en: {
    assessment: "Free Assessment",
    availability: "Now available in",
    countries: ["Thailand", "Singapore", "Malaysia", "Philippines"],
    links: [
      ["#living-protocol", "Living Protocol"],
      ["#how-it-works", "How it works"],
      ["#promises", "Promises"],
      ["#pricing", "Pricing"],
      ["#journal", "Journal"]
    ]
  },
  th: {
    assessment: "เริ่มประเมินฟรี",
    availability: "พร้อมให้บริการใน",
    countries: ["ไทย", "สิงคโปร์", "มาเลเซีย", "ฟิลิปปินส์"],
    links: [
      ["#living-protocol", "Living Protocol"],
      ["#how-it-works", "วิธีทำงาน"],
      ["#promises", "คำมั่น"],
      ["#pricing", "ราคา"],
      ["#journal", "บทความ"]
    ]
  }
} as const;

function homeAnchor(locale: Locale, href: string) {
  return href.startsWith("#") ? `/${locale}${href}` : href;
}

function isAssessmentStartedPath(currentPath: string, locale: Locale) {
  const pathname = currentPath.startsWith("http")
    ? new URL(currentPath).pathname
    : currentPath.split("?")[0] || `/${locale}`;

  return pathname === `/${locale}/assessment` ||
    pathname === `/${locale}/assessment/results` ||
    pathname === `/${locale}/nutrition/quiz` ||
    pathname === `/${locale}/nutrition/healthscore` ||
    pathname === `/${locale}/nutrition/refine`;
}

export function TitleBar({
  currentLocale,
  currentPath = `/${currentLocale}`,
  localizedPaths,
  title
}: TitleBarProps) {
  const copy = titleBarCopy[currentLocale];
  const assessmentPath = nutritionQuizPath(currentLocale);
  const showAssessmentCta = !isAssessmentStartedPath(currentPath, currentLocale);

  return (
    <header className="mn-titlebar">
      <div className="mn-availability-bar" aria-label={copy.availability}>
        <span>{copy.availability}</span>
        <span className="mn-availability-pills">
          {copy.countries.map((country) => (
            <span key={country} className="mn-availability-pill">
              {country}
            </span>
          ))}
        </span>
      </div>
      <div className="mn-titlebar-main">
        <Link
          href={`/${currentLocale}`}
          data-bpm-event="site_logo_clicked"
          data-bpm-label="MattaNutra"
          data-bpm-target={`/${currentLocale}`}
          data-bpm-type="traffic"
          aria-label={
            currentLocale === "th" ? `${title} หน้าแรก` : `${title} home`
          }
          className="flex min-w-0 items-center text-foreground transition hover:text-[var(--mn-teal-deep)]"
        >
          <HealthspanLogo className="shrink-0" />
        </Link>
        <nav aria-label="Primary" className="mn-titlebar-nav">
          {copy.links.map(([href, label]) => (
            <Link
              href={homeAnchor(currentLocale, href)}
              key={href}
              className="mn-titlebar-link"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mn-titlebar-actions">
          <LanguageSwitcher
            currentLocale={currentLocale}
            currentPath={currentPath}
            localizedPaths={localizedPaths}
          />
          {showAssessmentCta ? (
            <Link className="mn-titlebar-cta" href={assessmentPath}>
              {copy.assessment}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
