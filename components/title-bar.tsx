import { HealthspanLogo } from "@/components/healthspan-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/lib/i18n";

type TitleBarProps = Readonly<{
  currentLocale: Locale;
  title: string;
}>;

export function TitleBar({ currentLocale, title }: TitleBarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-foreground/10 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-18 w-full max-w-6xl items-center justify-between gap-4 px-6 sm:px-8">
        <a
          href={`/${currentLocale}`}
          className="flex min-w-0 items-center gap-3 text-base font-semibold uppercase tracking-[0.14em] text-foreground"
        >
          <HealthspanLogo className="h-10 w-10 shrink-0" />
          <span className="truncate">{title}</span>
        </a>
        <LanguageSwitcher currentLocale={currentLocale} />
      </div>
    </header>
  );
}
