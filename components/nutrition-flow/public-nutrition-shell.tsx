import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n-messages";
import { nutritionQuizPath } from "@/lib/nutrition-paths";
import type { MessageId } from "@/content/i18n/generated";

type PublicNutritionShellKind = "healthScore" | "reveal";

type PublicNutritionShellCopy = Readonly<{
  accent: string;
  body: string;
  bullets: readonly string[];
  eyebrow: string;
  primary: string;
  secondary: string;
  title: string;
}>;

function shellId(kind: PublicNutritionShellKind, key: string) {
  const catalogKind = kind === "healthScore" ? "healthScore" : "reveal";

  return `customer.nutritionPublicShell.${catalogKind}.${key}` as MessageId;
}

function publicNutritionShellCopy(kind: PublicNutritionShellKind, locale: Locale): PublicNutritionShellCopy {
  return {
    accent: t(locale, shellId(kind, "accent")),
    body: t(locale, shellId(kind, "body")),
    bullets: [
      t(locale, shellId(kind, "bullet1")),
      t(locale, shellId(kind, "bullet2")),
      t(locale, shellId(kind, "bullet3"))
    ],
    eyebrow: t(locale, shellId(kind, "eyebrow")),
    primary: t(locale, shellId(kind, "primary")),
    secondary: t(locale, shellId(kind, "secondary")),
    title: t(locale, shellId(kind, "title"))
  };
}

export function PublicNutritionShell({
  kind,
  locale
}: Readonly<{
  kind: PublicNutritionShellKind;
  locale: Locale;
}>) {
  const copy = publicNutritionShellCopy(kind, locale);

  return (
    <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-6 py-14 sm:px-8 lg:grid-cols-[1fr_0.85fr] lg:py-20">
      <div>
        <p className="mn-mono-label text-xs font-bold uppercase tracking-normal text-[var(--mn-teal-deep)]">
          {copy.eyebrow}
        </p>
        <h1 className="mt-5 mn-font-display text-[clamp(38px,6vw,72px)] font-medium leading-[1.04] tracking-normal text-[var(--mn-ink)]">
          {copy.title}{" "}
          <em className="italic text-[var(--mn-teal-deep)]">
            {copy.accent}
          </em>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--mn-ink-soft)]">
          {copy.body}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            className="inline-flex items-center gap-2 rounded-full bg-[var(--mn-teal-deep)] px-6 py-3 text-sm font-bold text-white shadow-[var(--mn-shadow-soft)]"
            href={nutritionQuizPath(locale)}
          >
            {copy.primary}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
          <span className="text-sm font-semibold text-[var(--mn-ash)]">
            {copy.secondary}
          </span>
        </div>
      </div>
      <div className="grid gap-4">
        {copy.bullets.map((item) => (
          <div
            className="flex items-start gap-3 rounded-[var(--mn-radius)] border border-[var(--mn-line)] bg-[var(--mn-paper)] p-5 shadow-sm"
            key={item}
          >
            <CheckCircle2
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-[var(--mn-teal)]"
            />
            <p className="text-base font-semibold leading-7 text-[var(--mn-ink)]">
              {item}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
