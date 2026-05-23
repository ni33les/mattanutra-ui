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
      aria-label="MattaNutra logo. Knowing the Right Amount."
      className={cn("inline-flex w-max items-center gap-3", className)}
      {...props}
    >
      <span className="mn-logo-mark-frame">
        <Image
          src="/v11/logo-mark.png"
          alt=""
          width={96}
          height={150}
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
          Knowing the Right Amount
        </span>
      </span>
    </div>
  );
}
