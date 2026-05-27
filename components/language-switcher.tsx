import {
  localeLabels,
  publicLocales,
  type Locale,
  type LocaleCode
} from "@/lib/i18n";
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

const languageSwitcherCopy = {
  en: {
    aria: "Language"
  },
  th: {
    aria: "ภาษา"
  }
} satisfies Record<Locale, { aria: string }>;

export function LanguageSwitcher({
  currentLocale,
  currentPath,
  localizedPaths
}: LanguageSwitcherProps) {
  const copy = languageSwitcherCopy[currentLocale];

  return (
    <nav
      aria-label={copy.aria}
      className="flex items-center overflow-hidden rounded-full border border-[var(--mn-line)] bg-transparent text-[13px]"
    >
      {publicLocales.map((locale) => {
        const isActive = locale === currentLocale;
        const next = localizedPaths?.[locale] ?? getLocalizedPath(currentPath, locale);
        const label = localeLabels[locale];

        return (
          <a
            key={locale}
            href={`/api/locale?locale=${locale}&next=${encodeURIComponent(next)}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "px-3 py-1.5 font-[family:var(--mn-font-body)] text-xs font-semibold uppercase tracking-normal transition",
              isActive
                ? "bg-[var(--mn-ink)] text-[var(--mn-paper)] shadow-sm"
                : "text-[var(--mn-ash)] hover:bg-[var(--mn-paper)] hover:text-[var(--mn-teal-deep)]"
            )}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
