import type { HTMLAttributes } from "react";
import Image from "next/image";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type HealthspanLogoProps = HTMLAttributes<HTMLDivElement> & Readonly<{
  locale?: Locale;
  variant?: "default" | "v14";
}>;

const logoCopy = {
  en: {
    aria: "MattaNutra logo. Knowing the Right Amount.",
    tagline: "Knowing the Right Amount"
  },
  th: {
    aria: "โลโก้ MattaNutra รู้ปริมาณที่พอดี",
    tagline: "รู้ปริมาณที่พอดี"
  },
  "zh-CN": {
    aria: "MattaNutra 标志。了解合适的剂量。",
    tagline: "了解合适的剂量"
  }
} satisfies Record<Locale, { aria: string; tagline: string }>;

export function HealthspanLogo({
  className,
  locale = "en",
  variant = "default",
  ...props
}: HealthspanLogoProps) {
  const copy = logoCopy[locale];
  const isV14 = variant === "v14";

  return (
    <div
      role="img"
      aria-label={copy.aria}
      className={cn("inline-flex max-w-full min-w-0 items-center gap-2 sm:gap-3", className)}
      {...props}
    >
      <span className={cn("mn-logo-mark-frame shrink-0", isV14 && "mn-logo-mark-frame--v14")}>
        <Image
          src="/v11/brand-mark.png"
          alt=""
          width={420}
          height={465}
          priority
          unoptimized={true}
          className="mn-logo-mark-image"
          aria-hidden="true"
        />
      </span>

      <span className="inline-grid min-w-0 leading-none">
        <span className="mn-logo-wordmark inline-flex items-baseline whitespace-nowrap text-[18px] font-medium tracking-normal sm:text-[22px] md:text-[23px]">
          <span className="text-[var(--mn-logo-ink,var(--mn-ink))]">Matta</span>
          <span className="text-[var(--mn-teal)]">Nutra</span>
        </span>
        <span
          className={cn(
            "mn-logo-tagline mt-0.5 truncate text-[9px] font-medium text-[var(--mn-logo-tagline,var(--muted-foreground))] sm:mt-1 sm:text-[10px] md:text-[10.5px]",
            locale === "zh-CN"
              ? "normal-case tracking-normal"
              : "uppercase tracking-[0.12em] sm:tracking-[0.16em]"
          )}
        >
          {copy.tagline}
        </span>
      </span>
    </div>
  );
}
