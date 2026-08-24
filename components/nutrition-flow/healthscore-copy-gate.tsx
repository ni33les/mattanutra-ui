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
  HEALTHSCORE_COPY_POLL_INTERVAL_MS
} from "@/lib/healthscore-copy-client";
import type { Locale } from "@/lib/i18n";

const COPY_WAIT_MS = 12_000;

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
  const [barPct, setBarPct] = useState(12);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    const startedAt = Date.now();
    let attempt = 0;
    let timer = 0;

    async function tick() {
      if (cancelled.current) {
        return;
      }

      attempt += 1;
      setBarPct(Math.min(90, 12 + attempt * 10));

      try {
        const copyStatus = await fetchHealthScoreCopyStatus(planId);

        if (cancelled.current) {
          return;
        }

        if (copyStatus.copyReady) {
          setBarPct(100);
          setStatus("ready");
          router.refresh();
          return;
        }

        if (copyStatus.copyFailed || Date.now() - startedAt >= COPY_WAIT_MS) {
          setStatus(copyStatus.copyFailed ? "error" : "slow");
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
      barPct={barPct}
      canOpenResults={false}
      onSeeResults={() => undefined}
      onEmailSubmit={persistEmail}
      onEmailComplete={() => {
        setStatus("sent");
      }}
    />
  );
}
