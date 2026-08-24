"use client";

import { useState } from "react";
import { CalculatingWait } from "@/components/chat-questionnaire/calculating-wait";
import { getWelcomeCopy } from "@/components/chat-questionnaire/questionnaire-welcome";
import type { Locale } from "@/lib/i18n";

export type CalculatingStatus = "building" | "ready" | "error" | "sent";

type QuestionnaireCalculatingProps = Readonly<{
  locale: Locale;
  status: CalculatingStatus;
  onSeeResults: () => void;
  /** When true, slow path can still open results (plan already created). */
  canOpenResults?: boolean;
  /** @deprecated Retry control removed from UI; kept optional for call-site compatibility. */
  onRetry?: () => void;
  onEmailSubmit: (email: string) => Promise<void> | void;
  onEmailComplete?: () => void;
}>;

export function QuestionnaireCalculating({
  locale,
  status,
  onSeeResults,
  canOpenResults = false,
  onEmailSubmit,
  onEmailComplete
}: QuestionnaireCalculatingProps) {
  const copy = getWelcomeCopy(locale === "zh-CN" ? "en" : locale);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(status === "sent");
  const [emailBusy, setEmailBusy] = useState(false);

  const isSent = status === "sent" || emailSent;
  const showEmailEscape = !isSent && status === "error";
  const isReady = status === "ready";
  const isBuilding = status === "building";
  const showResultsBtn = isReady && canOpenResults;
  const statusLabel = isSent
    ? copy.calcEmailThanks
    : isReady
      ? copy.calcReady
      : isBuilding
        ? copy.calcBuilding
        : copy.calcSavedNote;
  const note = isSent
    ? null
    : isBuilding
      ? copy.calcKeepOpen
      : isReady
        ? copy.calcReadyNote
        : null;

  async function submitEmail() {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || emailBusy) {
      return;
    }

    setEmailBusy(true);
    try {
      await onEmailSubmit(trimmed);
      setEmailSent(true);
      try {
        window.localStorage.setItem("mn_healthscore_delivery_email", trimmed);
      } catch {
        /* ignore */
      }
      onEmailComplete?.();
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <CalculatingWait
      copy={{
        body: isSent ? copy.calcSavedNote : copy.calcCopy,
        disclaimer: copy.calcDisclaimer,
        kicker: copy.calcKicker,
        line: copy.calcLine,
        note,
        status: statusLabel,
        title: isSent ? copy.calcEmailThanks : copy.calcTitle
      }}
      showSupport={!isSent}
      spinning={isBuilding && !isSent}
      testId="questionnaire-calculating"
    >
      {showResultsBtn ? (
        <button
          type="button"
          className="mn-quiz-calc__ready-btn"
          data-testid="healthscore-ready-btn"
          onClick={onSeeResults}
        >
          {copy.calcSee}
        </button>
      ) : null}

      {showEmailEscape ? (
        <div className="mn-quiz-calc__fallback" data-testid="calc-fallback">
          <div className="mn-quiz-calc__email-stack" data-testid="calc-emailbox">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={copy.calcEmailPlaceholder}
              value={email}
              disabled={emailSent || emailBusy}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitEmail();
                }
              }}
              aria-label={copy.calcEmailPlaceholder}
            />
            <button
              type="button"
              className="mn-quiz-calc__email-submit"
              disabled={emailSent || emailBusy}
              onClick={() => void submitEmail()}
            >
              {emailSent
                ? "✓"
                : copy.calcSendWhenReady || copy.calcSend || "Send when ready"}
            </button>
          </div>
          {emailSent ? (
            <p className="mn-quiz-calc__email-thanks">{copy.calcEmailThanks}</p>
          ) : null}
        </div>
      ) : null}
    </CalculatingWait>
  );
}
