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
      className={cn("inline-flex w-max items-center gap-3", className)}
      {...props}
    >
      <span className={cn("mn-logo-mark-frame", isV14 && "mn-logo-mark-frame--v14")}>
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
        <span className="mn-logo-wordmark inline-flex items-baseline whitespace-nowrap text-[22px] font-medium tracking-normal sm:text-[23px]">
          <span className="text-[var(--mn-logo-ink,var(--mn-ink))]">Matta</span>
          <span className="text-[var(--mn-teal)]">Nutra</span>
        </span>
        <span className="mn-logo-tagline mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--mn-logo-tagline,var(--muted-foreground))] sm:text-[10.5px]">
          {copy.tagline}
        </span>
      </span>
    </div>
  );
}
