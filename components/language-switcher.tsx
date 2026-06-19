import {
  isCjkLocale,
  localeLabels,
  publicLocales,
  type Locale,
  type LocaleCode
} from "@/lib/i18n";
import { t } from "@/lib/i18n-messages";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = Readonly<{
  currentLocale: Locale;
  currentPath: string;
  localizedPaths?: Partial<Record<LocaleCode, string>>;
}>;

function getLocalizedPath(currentPath: string, locale: Locale) {
  const url = new URL(currentPath, "https://mattanutra.local");
  const segments = url.pathname.split("/");

  segments[1] = locale;
  url.pathname = segments.join("/") || `/${locale}`;
  url.searchParams.delete("_rsc");

  return `${url.pathname}${url.search}${url.hash}`;
}

export function LanguageSwitcher({
  currentLocale,
  currentPath,
  localizedPaths
}: LanguageSwitcherProps) {
  return (
    <nav
      aria-label={t(currentLocale, "customer.languageSwitcher.aria")}
      className="mn-language-switcher flex items-center overflow-hidden rounded-full border border-[var(--mn-line)] bg-[var(--mn-paper)] text-[13px] shadow-sm"
    >
      {publicLocales.map((locale) => {
        const isActive = locale === currentLocale;
        const next = localizedPaths?.[locale] ?? getLocalizedPath(currentPath, locale);
        const label = localeLabels[locale];

        return (
          <a
            key={locale}
            href={next}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "px-3 py-1.5 mn-font-body text-xs font-semibold uppercase tracking-normal transition",
              isCjkLocale(locale) && "normal-case tracking-normal",
              isActive
                ? "bg-[var(--mn-ink)] text-[var(--mn-paper)] shadow-sm"
                : "text-[var(--mn-ash)] hover:bg-[var(--mn-cream)] hover:text-[var(--mn-teal-deep)]"
            )}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
