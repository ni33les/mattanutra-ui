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
      className="flex items-center gap-1 rounded-md border border-[#1FA77A]/20 bg-background/60 p-1"
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
                ? "bg-[#1FA77A] text-white"
                : "text-muted-foreground hover:bg-[#1FA77A]/10 hover:text-[#20343A]"
            )}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
