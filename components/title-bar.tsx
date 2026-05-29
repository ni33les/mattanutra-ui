import Link from "next/link";
import { Menu } from "lucide-react";
import { HealthspanLogo } from "@/components/healthspan-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale, LocaleCode } from "@/lib/i18n";
import { nutritionQuizPath } from "@/lib/nutrition-paths";

type TitleBarProps = Readonly<{
  currentLocale: Locale;
  currentPath?: string;
  localizedPaths?: Partial<Record<LocaleCode, string>>;
  title: string;
}>;

const titleBarCopy = {
  en: {
    assessment: "Free Assessment",
    availability: "Now available in",
    countries: ["Thailand", "Singapore", "Malaysia", "Philippines"],
    homeAria: (title: string) => `${title} home`,
    links: [
      ["#living-protocol", "Living Protocol"],
      ["#how-it-works", "How it works"],
      ["#promises", "Promises"],
      ["#pricing", "Pricing"],
      ["#journal", "Journal"]
    ],
    menu: "Open menu",
    navAria: "Primary"
  },
  th: {
    assessment: "เริ่มประเมินฟรี",
    availability: "พร้อมให้บริการใน",
    countries: ["ไทย", "สิงคโปร์", "มาเลเซีย", "ฟิลิปปินส์"],
    homeAria: (title: string) => `${title} หน้าแรก`,
    links: [
      ["#living-protocol", "โปรโตคอลชีวิต"],
      ["#how-it-works", "วิธีทำงาน"],
      ["#promises", "คำมั่น"],
      ["#pricing", "ราคา"],
      ["#journal", "บทความ"]
    ],
    menu: "เปิดเมนู",
    navAria: "เมนูหลัก"
  },
  "zh-CN": {
    assessment: "免费评估",
    availability: "现已覆盖",
    countries: ["泰国", "新加坡", "马来西亚", "菲律宾"],
    homeAria: (title: string) => `${title} 首页`,
    links: [
      ["#living-protocol", "生活协议"],
      ["#how-it-works", "如何运作"],
      ["#promises", "承诺"],
      ["#pricing", "价格"],
      ["#journal", "文章"]
    ],
    menu: "打开菜单",
    navAria: "主导航"
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
    pathname === `/${locale}/nutrition/reveal`;
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
          aria-label={copy.homeAria(title)}
          className="flex min-w-0 items-center text-foreground transition hover:text-[var(--mn-teal-deep)]"
        >
          <HealthspanLogo className="shrink-0" locale={currentLocale} variant="v14" />
        </Link>
        <nav
          aria-label={copy.navAria}
          className="mn-titlebar-nav"
        >
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
          {showAssessmentCta ? (
            <Link className="mn-titlebar-cta" href={assessmentPath}>
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
                  href={homeAnchor(currentLocale, href)}
                  key={href}
                  className="mn-titlebar-mobile-link"
                >
                  {label}
                </Link>
              ))}
              <div className="mn-titlebar-mobile-actions">
                {showAssessmentCta ? (
                  <Link className="mn-titlebar-mobile-cta" href={assessmentPath}>
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
