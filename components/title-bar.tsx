import { HealthspanLogo } from "@/components/healthspan-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/lib/i18n";

type TitleBarProps = Readonly<{
  currentLocale: Locale;
  currentPath?: string;
  localizedPaths?: Partial<Record<Locale, string>>;
  title: string;
}>;

export function TitleBar({
  currentLocale,
  currentPath = `/${currentLocale}`,
  localizedPaths,
  title
}: TitleBarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--mn-line)] bg-[var(--mn-paper)]/88 shadow-[0_1px_0_rgb(10_37_64/0.02)] backdrop-blur-xl">
      <div className="mx-auto flex h-18 w-full max-w-6xl items-center justify-between gap-4 px-6 sm:px-8">
        <a
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
        </a>
        <LanguageSwitcher
          currentLocale={currentLocale}
          currentPath={currentPath}
          localizedPaths={localizedPaths}
        />
      </div>
    </header>
  );
}
