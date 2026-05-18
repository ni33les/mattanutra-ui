import {
  localeLabels,
  locales,
  type Locale
} from "@/lib/i18n";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = Readonly<{
  currentLocale: Locale;
  currentPath: string;
  localizedPaths?: Partial<Record<Locale, string>>;
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
      aria-label="Language"
      className="flex items-center gap-1 rounded-md border border-[#44c3c7]/30 bg-background/70 p-1"
    >
      {locales.map((locale) => {
        const isActive = locale === currentLocale;
        const next = localizedPaths?.[locale] ?? getLocalizedPath(currentPath, locale);
        const label = localeLabels[locale];

        return (
          <a
            key={locale}
            href={`/api/locale?locale=${locale}&next=${encodeURIComponent(next)}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition",
              isActive
                ? "bg-[var(--brand-blue)] text-white"
                : "text-muted-foreground hover:bg-[#44c3c7]/12 hover:text-[var(--brand-blue)]"
            )}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
