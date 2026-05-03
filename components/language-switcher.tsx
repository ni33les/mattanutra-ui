import Link from "next/link";
import {
  localeLabels,
  locales,
  type Locale
} from "@/lib/i18n";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = Readonly<{
  currentLocale: Locale;
}>;

export function LanguageSwitcher({ currentLocale }: LanguageSwitcherProps) {
  return (
    <nav aria-label="Language" className="flex items-center gap-1 rounded-md border border-foreground/10 bg-white/60 p-1.5">
      {locales.map((locale) => {
        const isActive = locale === currentLocale;
        const next = `/${locale}`;

        return (
          <Link
            key={locale}
            href={`/api/locale?locale=${locale}&next=${encodeURIComponent(next)}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded px-3.5 py-2 text-base font-medium transition",
              isActive
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            )}
          >
            {localeLabels[locale]}
          </Link>
        );
      })}
    </nav>
  );
}
