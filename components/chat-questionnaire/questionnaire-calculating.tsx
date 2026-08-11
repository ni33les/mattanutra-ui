"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { nongPoseSrc } from "@/lib/questionnaire/poses";
import { getWelcomeCopy } from "@/components/chat-questionnaire/questionnaire-welcome";

const LINE_SUPPORT_URL = "https://line.me/R/ti/p/%40344enooi";

export type CalculatingStatus = "building" | "ready" | "slow" | "error";

type QuestionnaireCalculatingProps = Readonly<{
  locale: Locale;
  status: CalculatingStatus;
  onSeeResults: () => void;
  /** When true, slow path can still open results (plan already created). */
  canOpenResults?: boolean;
  /** @deprecated Retry control removed from UI; kept optional for call-site compatibility. */
  onRetry?: () => void;
  onEmailSubmit: (email: string) => Promise<void> | void;
}>;

export function QuestionnaireCalculating({
  locale,
  status,
  onSeeResults,
  canOpenResults = false,
  onEmailSubmit
}: QuestionnaireCalculatingProps) {
  const copy = getWelcomeCopy(locale === "zh-CN" ? "en" : locale);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  const showFallback = status === "slow" || status === "error";
  const isReady = status === "ready";
  const isBuilding = status === "building";
  const showResultsBtn = isReady || (status === "slow" && canOpenResults);

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
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <div
      className="mn-quiz-calc"
      data-testid="questionnaire-calculating"
      aria-live="polite"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="mn-quiz-calc__nong"
        src={nongPoseSrc("wai")}
        alt=""
      />
      <div className="mn-quiz-calc__kicker">{copy.calcKicker}</div>
      <h1 className="mn-quiz-calc__title">{copy.calcTitle}</h1>
      <p className="mn-quiz-calc__copy">{copy.calcCopy}</p>

      <div className="mn-quiz-calc__status">
        {isReady ? (
          <>
            <span aria-hidden>✓</span>
            <span>{copy.calcReady}</span>
          </>
        ) : isBuilding ? (
          <>
            <span className="mn-quiz-calc__spinner" aria-hidden />
            <span>{copy.calcBuilding}</span>
          </>
        ) : (
          <>
            <span aria-hidden>…</span>
            <span>{copy.calcLonger}</span>
          </>
        )}
      </div>

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

      {isBuilding ? (
        <p className="mn-quiz-calc__note">{copy.calcKeepOpen}</p>
      ) : isReady ? (
        <p className="mn-quiz-calc__note">{copy.calcReadyNote}</p>
      ) : null}

      <div className="mn-quiz-calc__support">
        <a href={LINE_SUPPORT_URL} target="_blank" rel="noopener noreferrer">
          {copy.calcLine}
        </a>
      </div>

      <p className="mn-quiz-calc__disclaimer">{copy.calcDisclaimer}</p>

      {/* Slow/error: message + stacked email + submit (no retry). */}
      {showFallback ? (
        <div className="mn-quiz-calc__fallback" data-testid="calc-fallback">
          <p className="mn-quiz-calc__fallback-msg">
            {status === "error" ? copy.calcError : copy.calcLonger}
          </p>
          <p className="mn-quiz-calc__fallback-saved">{copy.calcSavedNote}</p>
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
    </div>
  );
}
