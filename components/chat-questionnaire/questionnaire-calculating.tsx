"use client";

import { useState } from "react";
import { CalculatingWait } from "@/components/chat-questionnaire/calculating-wait";
import { getWelcomeCopy } from "@/components/chat-questionnaire/questionnaire-welcome";
import type { Locale } from "@/lib/i18n";

export type CalculatingStatus = "building" | "ready" | "error";
export type HealthScoreDeliveryReceipt = { id: string; status: string };
type QuestionnaireCalculatingProps = Readonly<{
  locale: Locale;
  status: CalculatingStatus;
  onSeeResults: () => void;
  canOpenResults?: boolean;
  onRetryCapture?: () => void;
  onRetryAnalysis?: () => void;
  onEmailSubmit: (email: string) => Promise<HealthScoreDeliveryReceipt>;
}>;

export function QuestionnaireCalculating({ locale, status, onSeeResults, canOpenResults = false,
  onRetryCapture, onRetryAnalysis, onEmailSubmit }: QuestionnaireCalculatingProps) {
  const copy = getWelcomeCopy(locale);
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState<HealthScoreDeliveryReceipt | null>(null);
  const [emailError, setEmailError] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const requested = delivery && ["waiting", "queued", "sending"].includes(delivery.status);
  const sent = delivery?.status === "sent";
  const isReady = status === "ready", isBuilding = status === "building";
  const statusLabel = sent ? copy.calcEmailSent : requested ? copy.calcEmailRequested
    : isReady ? copy.calcReady : isBuilding ? copy.calcBuilding : onRetryCapture ? copy.calcCaptureFailed : copy.calcSavedNote;

  async function submitEmail() {
    if (emailBusy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setEmailError(copy.calcEmailFailed); return; }
    setEmailBusy(true); setEmailError("");
    try {
      const result = await onEmailSubmit(email.trim());
      if (!result.id) throw new Error(copy.calcEmailFailed);
      if (["failed", "superseded"].includes(result.status)) throw new Error(copy.calcEmailFailed);
      if (result.status === "unknown") throw new Error(copy.calcEmailUnknown);
      setDelivery(result);
    } catch (error) { setEmailError(error instanceof Error ? error.message : copy.calcEmailFailed); }
    finally { setEmailBusy(false); }
  }

  return (
    <CalculatingWait copy={{ body: copy.calcCopy, disclaimer: copy.calcDisclaimer, kicker: copy.calcKicker,
      line: copy.calcLine, note: isBuilding ? copy.calcKeepOpen : isReady ? copy.calcReadyNote : null,
      status: statusLabel, title: copy.calcTitle }} showSupport={!sent && !requested} spinning={isBuilding} testId="questionnaire-calculating">
      {isReady && canOpenResults ? <button type="button" className="mn-quiz-calc__ready-btn" data-testid="healthscore-ready-btn" onClick={onSeeResults}>{copy.calcSee}</button> : null}
      {status === "error" ? <div className="mn-quiz-calc__fallback" data-testid="calc-fallback">
        {onRetryCapture ? <button type="button" className="mn-quiz-calc__ready-btn" data-testid="retry-capture" onClick={onRetryCapture}>{copy.calcRetryCapture}</button> : null}
        {onRetryAnalysis ? <button type="button" className="mn-quiz-calc__ready-btn" data-testid="retry-analysis" onClick={onRetryAnalysis}>{copy.calcRetryAnalysis}</button> : null}
        {!requested && !sent ? <div className="mn-quiz-calc__email-stack" data-testid="calc-emailbox">
          <input type="email" inputMode="email" autoComplete="email" placeholder={copy.calcEmailPlaceholder} value={email} disabled={emailBusy}
            onChange={event => setEmail(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void submitEmail(); } }} aria-label={copy.calcEmailPlaceholder} />
          <button type="button" className="mn-quiz-calc__email-submit" disabled={emailBusy} onClick={() => void submitEmail()}>{copy.calcSendWhenReady}</button>
        </div> : null}
        {emailError ? <p role="alert" className="mn-quiz-calc__email-thanks">{emailError}</p> : null}
      </div> : null}
    </CalculatingWait>
  );
}
