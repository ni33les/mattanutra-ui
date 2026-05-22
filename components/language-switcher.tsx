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
      className="flex items-center gap-1 rounded-full border border-[var(--mn-line)] bg-[var(--mn-cream)]/75 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.55)]"
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
              "rounded-full px-2.5 py-1.5 font-[family:var(--mn-font-mono)] text-xs font-semibold uppercase tracking-[0.08em] transition",
              isActive
                ? "bg-[var(--mn-ink)] text-[var(--mn-paper)] shadow-sm"
                : "text-muted-foreground hover:bg-[var(--mn-mint)] hover:text-[var(--mn-teal-deep)]"
            )}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
