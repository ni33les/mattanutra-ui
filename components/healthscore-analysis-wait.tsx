"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";

type HealthScoreAnalysisWaitProps = Readonly<{
  locale: Locale;
  planId: string;
}>;

export function HealthScoreAnalysisWait({
  locale,
  planId
}: HealthScoreAnalysisWaitProps) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const copy =
    locale === "th"
      ? {
          body: "เรากำลังเตรียมคำอธิบาย HealthScore ให้พร้อมก่อนแสดงผล",
          title: "กำลังวิเคราะห์ HealthScore"
        }
      : {
          body: "We are preparing your HealthScore copy before showing the page.",
          title: "Analyzing your HealthScore"
        };

  useEffect(() => {
    let cancelled = false;
    let timeout: number | undefined;

    async function poll() {
      try {
        const response = await fetch(
          `/api/assessment/${encodeURIComponent(planId)}?mode=score`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error("Unable to load HealthScore status");
        }

        const payload = await response.json() as { status?: string };

        if (cancelled) {
          return;
        }

        if (payload.status === "ready") {
          router.refresh();
          return;
        }

        if (payload.status === "failed") {
          setFailed(true);
          return;
        }

        timeout = window.setTimeout(poll, 1500);
      } catch {
        if (!cancelled) {
          timeout = window.setTimeout(poll, 2500);
        }
      }
    }

    timeout = window.setTimeout(poll, 0);

    return () => {
      cancelled = true;

      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
    };
  }, [planId, router]);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="size-10 animate-spin rounded-full border-2 border-foreground/20 border-t-primary" />
      <h1 className="mt-8 text-3xl font-semibold text-foreground">
        {failed ? "HealthScore analysis is taking longer than expected" : copy.title}
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
        {failed
          ? "Please refresh in a moment. The HealthScore page will stay hidden until the AI copy is ready."
          : copy.body}
      </p>
    </section>
  );
}
