"use client";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { finalizeAssessmentCapture } from "@/lib/questionnaire/agents/capture-agent";
import type { QuestionnaireState } from "@/lib/questionnaire/types";
import type { ChatDraft } from "@/lib/questionnaire/browser-draft";
import { fetchWithBodyDeadline } from "@/lib/funnel-polling";
import { retryHealthScoreCopy, waitForHealthScoreCopy } from "@/lib/healthscore-copy-client";
import type { Locale } from "@/lib/i18n";
import type { CalculatingStatus } from "./questionnaire-calculating";

/** Capture recovery and analysis recovery share a receipt, while retries remain separate operations. */
export function useQuestionnaireCapture(input: {
  locale: Locale; paymentId?: string; pharmacyId?: string; resumeToken?: string; returningPlanId?: string; skipHealthScore: boolean;
  draft: MutableRefObject<ChatDraft | null>; save: (draft: ChatDraft) => void; onReady: (planId: string) => void;
}) {
  const [status, setStatus] = useState<CalculatingStatus>("building");
  const [planId, setPlanId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const latest = useRef(input);
  useEffect(() => { latest.current = input; }, [input]);
  useEffect(() => () => controllerRef.current?.abort(), [input.locale]);

  const run = useCallback(async (state: QuestionnaireState, analysisOnly = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    const options = latest.current;
    setStatus("building");
    try {
      let draft = options.draft.current;
      if (!draft) throw new Error("Saved questionnaire is missing");
      let receipt = draft.captured;
      if (!receipt && analysisOnly) throw new Error("Capture must complete before analysis can retry");
      if (!receipt) {
        draft = { ...draft, state: { ...state, phase: "completing" } };
        options.save(draft);
        const captured = await finalizeAssessmentCapture({ state: draft.state, contactEmail: draft.contactEmail,
          planId: options.returningPlanId || state.planId, expectedRevision: draft.revision || undefined,
          paymentId: options.paymentId || draft.paymentId, pharmacyId: options.pharmacyId, resumeToken: options.resumeToken,
          fetchImpl: (url, init) => fetchWithBodyDeadline(url, { ...init, signal: controller.signal }, 30_000) });
        controller.signal.throwIfAborted();
        if (!captured.ok || !captured.planId || captured.revision === undefined) throw new Error(captured.error || "Capture failed");
        receipt = { planId: captured.planId, revision: captured.revision, inputHash: captured.inputHash };
        draft = { ...draft, revision: receipt.revision, captured: receipt, state: { ...state, phase: "complete", planId: receipt.planId }, updatedAt: Date.now() };
        options.save(draft);
      }
      setPlanId(receipt.planId);
      if (!options.skipHealthScore) {
        await retryHealthScoreCopy(receipt.planId, options.locale, controller.signal);
        const result = await waitForHealthScoreCopy(receipt.planId, options.locale, controller.signal);
        if (result.status !== "ready") { setStatus("error"); return; }
      }
      controller.signal.throwIfAborted();
      setStatus("ready"); options.onReady(receipt.planId);
    } catch { if (!controller.signal.aborted) setStatus("error"); }
  }, []);
  return { status, planId, run, reset: () => { controllerRef.current?.abort(); setPlanId(null); setStatus("building"); } };
}
