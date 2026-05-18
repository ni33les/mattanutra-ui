import type { HTMLAttributes } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type HealthspanLogoProps = HTMLAttributes<HTMLDivElement>;

export function HealthspanLogo({
  className,
  ...props
}: HealthspanLogoProps) {
  return (
    <div
      role="img"
      aria-label="MattaNutra logo. know the right amount."
      className={cn("inline-flex w-max items-center gap-[13.5px]", className)}
      {...props}
    >
      <Image
        src="/favicon.svg"
        alt=""
        width={38}
        height={38}
        priority
        unoptimized
        className="h-[40px] w-[40px] shrink-0 sm:h-[44px] sm:w-[44px]"
        aria-hidden="true"
      />

      <span className="inline-grid leading-none">
        <span className="flex items-baseline text-[20px] font-semibold tracking-[0.04em] sm:text-[22.5px]">
          <span className="font-extrabold text-[var(--brand-blue)]">Matta</span>
          <span className="text-[var(--brand-green)]">Nutra</span>
        </span>
        <span className="mt-[4.5px] text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:text-[11.5px]">
          know the right amount
        </span>
      </span>
    </div>
  );
}
