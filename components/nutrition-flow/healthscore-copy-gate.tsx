"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QuestionnaireCalculating,
  type CalculatingStatus
} from "@/components/chat-questionnaire/questionnaire-calculating";
import "@/components/chat-questionnaire/chat-questionnaire.css";
import {
  fetchHealthScoreCopyStatus,
  HEALTHSCORE_COPY_POLL_INTERVAL_MS,
  HEALTHSCORE_COPY_WAIT_MS
} from "@/lib/healthscore-copy-client";
import type { Locale } from "@/lib/i18n";

type HealthScoreCopyGateProps = Readonly<{
  locale: Locale;
  planId: string;
}>;

export function HealthScoreCopyGate({
  locale,
  planId
}: HealthScoreCopyGateProps) {
  const router = useRouter();
  const [status, setStatus] = useState<CalculatingStatus>("building");
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    const startedAt = Date.now();
    let timer = 0;

    async function tick() {
      if (cancelled.current) {
        return;
      }

      try {
        const copyStatus = await fetchHealthScoreCopyStatus(planId);

        if (cancelled.current) {
          return;
        }

        if (copyStatus.copyReady) {
          setStatus("ready");
          router.refresh();
          return;
        }

        if (copyStatus.copyFailed || Date.now() - startedAt >= HEALTHSCORE_COPY_WAIT_MS) {
          setStatus("error");
          return;
        }
      } catch {
        if (!cancelled.current) {
          setStatus("error");
        }
        return;
      }

      timer = window.setTimeout(() => {
        void tick();
      }, HEALTHSCORE_COPY_POLL_INTERVAL_MS);
    }

    void tick();

    return () => {
      cancelled.current = true;
      window.clearTimeout(timer);
    };
  }, [planId, router]);

  async function persistEmail(email: string) {
    await fetch(`/api/assessment/${encodeURIComponent(planId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contactEmail: email,
        intent: "capture",
        locale
      }),
      cache: "no-store",
      keepalive: true
    });
  }

  return (
    <QuestionnaireCalculating
      locale={locale}
      status={status}
      canOpenResults={false}
      onSeeResults={() => undefined}
      onEmailSubmit={persistEmail}
      onEmailComplete={() => {
        setStatus("sent");
      }}
    />
  );
}
