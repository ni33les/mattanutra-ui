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
  onRetry: () => void;
  onEmailSubmit: (email: string) => Promise<void> | void;
}>;

export function QuestionnaireCalculating({
  locale,
  status,
  onSeeResults,
  onRetry,
  onEmailSubmit
}: QuestionnaireCalculatingProps) {
  const copy = getWelcomeCopy(locale === "zh-CN" ? "en" : locale);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  const showFallback = status === "slow" || status === "error";
  const isReady = status === "ready";

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
        ) : (
          <>
            <span className="mn-quiz-calc__spinner" aria-hidden />
            <span>{copy.calcBuilding}</span>
          </>
        )}
      </div>

      {isReady ? (
        <button
          type="button"
          className="mn-quiz-calc__ready-btn"
          data-testid="healthscore-ready-btn"
          onClick={onSeeResults}
        >
          {copy.calcSee}
        </button>
      ) : null}

      <p className="mn-quiz-calc__note">
        {isReady
          ? copy.calcReadyNote
          : showFallback
            ? copy.calcSavedNote
            : copy.calcKeepOpen}
      </p>

      <div className="mn-quiz-calc__support">
        <a href={LINE_SUPPORT_URL} target="_blank" rel="noopener noreferrer">
          {copy.calcLine}
        </a>
      </div>

      <p className="mn-quiz-calc__disclaimer">{copy.calcDisclaimer}</p>

      {/* HTML parity: email capture only on slow/error fallback (~15s), not always-on */}
      {showFallback ? (
        <div className="mn-quiz-calc__fallback" data-testid="calc-fallback">
          <p>{status === "error" ? copy.calcError : copy.calcLonger}</p>
          <div className="mn-quiz-calc__actions">
            <button type="button" onClick={onRetry}>
              {copy.calcRetry}
            </button>
          </div>
          <div className="mn-quiz-calc__emailbox" data-testid="calc-emailbox">
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
              disabled={emailSent || emailBusy}
              onClick={() => void submitEmail()}
            >
              {emailSent ? "✓" : copy.calcSendWhenReady || copy.calcSend || "→"}
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
