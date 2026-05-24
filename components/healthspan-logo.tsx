import type { HTMLAttributes } from "react";
import Image from "next/image";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type HealthspanLogoProps = HTMLAttributes<HTMLDivElement> & Readonly<{
  locale?: Locale;
}>;

const logoCopy = {
  en: {
    aria: "MattaNutra logo. Knowing the Right Amount.",
    tagline: "Knowing the Right Amount"
  },
  th: {
    aria: "โลโก้ MattaNutra รู้ปริมาณที่พอดี",
    tagline: "รู้ปริมาณที่พอดี"
  }
} satisfies Record<Locale, { aria: string; tagline: string }>;

export function HealthspanLogo({
  className,
  locale = "en",
  ...props
}: HealthspanLogoProps) {
  const copy = logoCopy[locale];

  return (
    <div
      role="img"
      aria-label={copy.aria}
      className={cn("inline-flex w-max items-center gap-3", className)}
      {...props}
    >
      <span className="mn-logo-mark-frame">
        <Image
          src="/v11/brand-mark.png"
          alt=""
          width={420}
          height={465}
          priority
          unoptimized
          className="mn-logo-mark-image"
          aria-hidden="true"
        />
      </span>

      <span className="inline-grid leading-none">
        <span className="flex items-baseline gap-1 font-[family:var(--mn-font-display)] text-[21px] font-semibold tracking-normal sm:text-[23px]">
          <span className="text-[var(--mn-logo-ink,var(--mn-ink))]">Matta</span>
          <span className="text-[var(--mn-teal)]">Nutra</span>
        </span>
        <span className="mt-1 font-[family:var(--mn-font-mono)] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--mn-logo-tagline,var(--muted-foreground))] sm:text-[10.5px]">
          {copy.tagline}
        </span>
      </span>
    </div>
  );
}
