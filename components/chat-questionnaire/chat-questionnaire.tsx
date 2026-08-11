"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyAnswer,
  computePrecision,
  createInitialState,
  deserializeState,
  getDefinition,
  getNextPrompt,
  isVisibleTurn,
  reopenTurn,
  serializeState,
  skipTurn,
  startQuestionnaire,
  summarizeAnswer
} from "@/lib/questionnaire/engine";
import { finalizeAssessmentCapture } from "@/lib/questionnaire/agents/capture-agent";
import { emitQuestionnaireEvents } from "@/lib/questionnaire/agents/progress-agent";
import { nongPoseSrc } from "@/lib/questionnaire/poses";
import type {
  LogMessage,
  QuestionnaireEvent,
  QuestionnaireState,
  TurnDef
} from "@/lib/questionnaire/types";
import { getBpmPayload, trackBpmEvent } from "@/lib/bpm-client";
import type { Locale } from "@/lib/i18n";
import {
  nutritionHealthScorePath,
  nutritionRevealPath
} from "@/lib/nutrition-paths";
import {
  getWelcomeCopy,
  QuestionnaireWelcome
} from "@/components/chat-questionnaire/questionnaire-welcome";
import {
  QuestionnaireCalculating,
  type CalculatingStatus
} from "@/components/chat-questionnaire/questionnaire-calculating";
import "./chat-questionnaire.css";

const ASSESSMENT_REQUEST_TIMEOUT_MS = 30_000;
const CALC_FALLBACK_MS = 15_000;

/**
 * Section / finish stage overlay timing.
 * Hold long enough to read Part N + title (HTML was 950ms — felt too snappy in React).
 * Single-shot show: opacity fade only (no scale morph).
 */
const STAGE_MS = 1800;
const STAGE_FADE_OUT_MS = 280;
const UX_VERSION = "v14-landing";
const DELIVERY_EMAIL_KEY = "mn_healthscore_delivery_email";

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function runLeafBurst(count = 8) {
  if (typeof document === "undefined" || prefersReducedMotion()) {
    return;
  }
  const w = window.innerWidth;
  const y = window.innerHeight * 0.55;
  for (let i = 0; i < count; i += 1) {
    const leaf = document.createElement("span");
    leaf.className = "mn-quiz-leaf";
    leaf.textContent = Math.random() < 0.5 ? "🌿" : "🍃";
    leaf.style.left = `${w / 2 + (Math.random() * 160 - 80)}px`;
    leaf.style.top = `${y + Math.random() * 60}px`;
    leaf.style.animationDelay = `${Math.random() * 0.25}s`;
    document.body.appendChild(leaf);
    window.setTimeout(() => leaf.remove(), 2000);
  }
}

type ChatQuestionnaireProps = Readonly<{
  locale: Locale;
  paymentId?: string;
  returningPlanId?: string;
  resumeToken?: string;
  showDevShortcut?: boolean;
}>;

type UiScreen = "welcome" | "chat" | "calculating";

function storageKey(locale: string) {
  return `mn_state_v6_${locale}`;
}

function loadLocalState(locale: string): QuestionnaireState | null {
  try {
    const raw = window.localStorage.getItem(storageKey(locale));
    return raw ? deserializeState(raw) : null;
  } catch {
    return null;
  }
}

function saveLocalState(locale: string, state: QuestionnaireState) {
  try {
    window.localStorage.setItem(storageKey(locale), serializeState(state));
  } catch {
    /* ignore */
  }
}

function clearLocalState(locale: string) {
  try {
    window.localStorage.removeItem(storageKey(locale));
  } catch {
    /* ignore */
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    ASSESSMENT_REQUEST_TIMEOUT_MS
  );

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function resultsPath(
  locale: Locale,
  planId: string,
  paymentId?: string
) {
  return paymentId
    ? nutritionRevealPath(locale, planId)
    : nutritionHealthScorePath(locale, planId);
}

export function ChatQuestionnaire({
  locale,
  paymentId,
  returningPlanId,
  resumeToken,
  showDevShortcut
}: ChatQuestionnaireProps) {
  const router = useRouter();
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const finalizing = useRef(false);
  const fallbackTimer = useRef<number | null>(null);
  const readyPlanId = useRef<string | null>(null);

  const [uiScreen, setUiScreen] = useState<UiScreen>("welcome");
  const [state, setState] = useState<QuestionnaireState | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const [composerError, setComposerError] = useState("");
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [textValue, setTextValue] = useState("");
  const [height, setHeight] = useState(175);
  const [weight, setWeight] = useState(72);
  const [vo2, setVo2] = useState("");
  const [hrv, setHrv] = useState("");
  const [labValues, setLabValues] = useState<Record<string, string>>({});
  const [labUnits, setLabUnits] = useState<Record<string, string>>({});
  const [processingError, setProcessingError] = useState("");
  const [calcStatus, setCalcStatus] = useState<CalculatingStatus>("building");
  const [reviewOpen, setReviewOpen] = useState(false);

  const [stageFlash, setStageFlash] = useState<null | {
    pose: string;
    eyebrow: string;
    title: string;
    /** show = visible; exit = opacity fade only (no scale morph) */
    phase: "show" | "exit";
  }>(null);
  const pendingEmail = useRef<string | null>(null);
  const stageTimers = useRef<number[]>([]);
  /** Bumps when a new stage starts so stale timeouts cannot clear a newer overlay. */
  const stageGeneration = useRef(0);


  const chrome = useMemo(
    () => getWelcomeCopy(locale === "zh-CN" ? "en" : locale),
    [locale]
  );

  const definition = useMemo(
    () => (state ? getDefinition(state) : getDefinition(createInitialState({ locale }))),
    [state, locale]
  );
  const ui = definition.ui;
  const prompt = state ? getNextPrompt(state) : null;
  const precision = state ? computePrecision(definition, state) : 8;
  const currentTurn: TurnDef | null = prompt?.turn ?? null;

  /** Premium progress meter (v14 HTML): Part N of 6 · % + encouragement + remaining. */
  const progressMeta = useMemo(() => {
    if (!state) {
      return {
        barPct: 8,
        partLabel: chrome.progressPart
          .replace("{n}", "1")
          .replace("{pct}", "0"),
        detail: chrome.progressEncourage0
      };
    }

    const core = definition.turns.filter(
      (turn) =>
        turn.req &&
        !turn.opt &&
        turn.kind !== "gate" &&
        isVisibleTurn(definition, turn, state.answers)
    );
    const answered = core.filter(
      (turn) => state.answers[turn.k] !== undefined
    ).length;
    const pct = core.length ? Math.round((answered / core.length) * 100) : 0;
    const active =
      currentTurn ??
      definition.turns.find(
        (turn) =>
          isVisibleTurn(definition, turn, state.answers) &&
          state.answers[turn.k] === undefined
      ) ??
      definition.turns[definition.turns.length - 1];
    const sec = Math.min(5, active?.sec ?? 0);
    const sectionTurns = definition.turns.filter(
      (turn) =>
        turn.sec === sec &&
        turn.req &&
        !turn.opt &&
        turn.kind !== "gate" &&
        isVisibleTurn(definition, turn, state.answers)
    );
    const sectionAnswered = sectionTurns.filter(
      (turn) => state.answers[turn.k] !== undefined
    ).length;
    const remaining = Math.max(0, sectionTurns.length - sectionAnswered);
    const encourage =
      pct < 25
        ? chrome.progressEncourage0
        : pct < 50
          ? chrome.progressEncourage25
          : pct < 75
            ? chrome.progressEncourage50
            : chrome.progressEncourage75;
    const remainBit =
      remaining <= 0
        ? ""
        : remaining === 1
          ? chrome.progressRemainingOne
          : chrome.progressRemainingMany.replace("{n}", String(remaining));

    return {
      // Fill tracks answered progress (not precision floor) so the meter moves visibly
      barPct: Math.max(4, pct),
      partLabel: chrome.progressPart
        .replace("{n}", String(sec + 1))
        .replace("{pct}", String(pct)),
      detail: `${encourage}${remainBit}`
    };
  }, [state, definition, currentTurn, chrome]);

  const track = useCallback(
    async (events: readonly QuestionnaireEvent[]) => {
      await emitQuestionnaireEvents(
        events,
        (eventName, payload) => {
          trackBpmEvent(eventName, {
            eventType: payload?.eventType as "funnel" | undefined,
            locale: payload?.locale ?? locale,
            planId: payload?.planId,
            properties: payload?.properties
          });
        },
        { locale, planId: returningPlanId, channel: "web" }
      );
    },
    [locale, returningPlanId]
  );

  const persistCheckpoint = useCallback(
    async (next: QuestionnaireState, sectionIndex?: number) => {
      saveLocalState(locale, next);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);

      if (typeof sectionIndex === "number" && sectionIndex >= 0) {
        try {
          await fetch("/api/questionnaire/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "checkpoint",
              locale,
              channel: "web",
              sectionIndex,
              planId: returningPlanId,
              state: serializeState(next),
              bpm: getBpmPayload()
            }),
            cache: "no-store",
            keepalive: true
          });
        } catch {
          /* non-blocking */
        }
      }
    },
    [locale, returningPlanId]
  );

  // Boot: welcome gate unless in-progress resume
  useEffect(() => {
    const saved = loadLocalState(locale);
    trackBpmEvent("chat_view", {
      eventType: "funnel",
      locale,
      properties: {
        channel: "web",
        questionnaireVersion: "v6-conversational",
        uxVersion: UX_VERSION
      }
    });

    if (
      saved &&
      saved.version === "v6-conversational" &&
      Object.keys(saved.answers).length > 0 &&
      saved.phase !== "complete" &&
      saved.phase !== "completing"
    ) {
      setState({
        ...saved,
        phase: "resume_prompt",
        locale: locale as typeof saved.locale,
        autoFilled: saved.autoFilled ?? [],
        halfwayDone: saved.halfwayDone ?? false,
        sinceAck: saved.sinceAck ?? 0
      });
      setUiScreen("chat");
      return;
    }

    setState(
      createInitialState({
        locale,
        channel: "web",
        planId: returningPlanId ?? null
      })
    );
    setUiScreen("welcome");
  }, [locale, returningPlanId]);

  useEffect(() => {
    if (uiScreen !== "chat") {
      return;
    }

    const scroller = logScrollRef.current;
    if (scroller) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    } else {
      logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [state?.log.length, currentTurn?.k, uiScreen]);

  // Reset composer draft when turn changes + pull focus to answers
  useEffect(() => {
    if (uiScreen !== "chat") {
      return;
    }

    setComposerError("");
    setMultiSel([]);
    setTextValue("");
    if (currentTurn?.kind === "sliders") {
      setHeight(
        Number(state?.answers.height) || definition.meta.height.default
      );
      setWeight(
        Number(state?.answers.weight) || definition.meta.weight.default
      );
    }

    if (currentTurn?.kind === "labs") {
      const units: Record<string, string> = {};
      const values: Record<string, string> = {};
      for (const lab of definition.meta.labs) {
        units[lab.k] =
          String(state?.answers[`unit_${lab.k.slice(4)}`] ?? lab.u[0]);
        values[lab.k] = String(state?.answers[lab.k] ?? "");
      }
      setLabUnits(units);
      setLabValues(values);
    }

    if (currentTurn?.kind === "fitness") {
      setVo2(String(state?.answers.vo2 ?? ""));
      setHrv(String(state?.answers.hrv ?? ""));
    }

    const focusTimer = window.setTimeout(() => {
      const root = composerRef.current;
      if (!root || state?.phase !== "active") {
        return;
      }

      // Focus first control only — no temporary focus ring/box on the whole group
      // (that looked like a strange box flashing around the answers).
      const target = root.querySelector<HTMLElement>(
        "button.mn-chat-q__chip, button.mn-chat-q__swatch, button.mn-chat-q__primary, input, button.mn-chat-q__ghost, button.mn-chat-q__skip-link"
      );
      target?.focus({ preventScroll: true });
      root.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);

    return () => window.clearTimeout(focusTimer);
  }, [
    currentTurn?.k,
    currentTurn?.kind,
    definition.meta,
    state?.answers,
    state?.phase,
    uiScreen
  ]);

  useEffect(() => {
    return () => {
      if (fallbackTimer.current) {
        window.clearTimeout(fallbackTimer.current);
      }
    };
  }, []);

  const armCalcFallback = useCallback(() => {
    if (fallbackTimer.current) {
      window.clearTimeout(fallbackTimer.current);
    }

    fallbackTimer.current = window.setTimeout(() => {
      setCalcStatus((prev) => (prev === "ready" ? prev : "slow"));
    }, CALC_FALLBACK_MS);
  }, []);

  const pollHealthScore = useCallback(
    async (planId: string) => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const response = await fetchWithTimeout(
          `/api/assessment/${encodeURIComponent(planId)}?view=healthscore&locale=${encodeURIComponent(locale)}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error("Unable to load HealthScore");
        }

        const payload = (await response.json()) as {
          status?: string;
          healthScore?: unknown;
        };

        if (payload.status === "ready" && payload.healthScore) {
          return true;
        }

        if (payload.status === "failed") {
          throw new Error("HealthScore analysis failed");
        }

        await sleep(1500);
      }

      return false;
    },
    [locale]
  );

  const clearStageTimers = useCallback(() => {
    for (const id of stageTimers.current) {
      window.clearTimeout(id);
      window.cancelAnimationFrame(id);
    }
    stageTimers.current = [];
  }, []);

  useEffect(() => () => clearStageTimers(), [clearStageTimers]);

  const showStageOverlay = useCallback(
    (payload: { pose: string; eyebrow: string; title: string }) => {
      if (prefersReducedMotion()) {
        return Promise.resolve();
      }

      clearStageTimers();
      const generation = stageGeneration.current + 1;
      stageGeneration.current = generation;

      return new Promise<void>((resolve) => {
        // Mount already "shown" at full size — CSS keyframe fades opacity only
        // (matches HTML #stage.show). Avoid prep/hold/exit scale morphs.
        setStageFlash({ ...payload, phase: "show" });

        const exitTimer = window.setTimeout(() => {
          if (stageGeneration.current !== generation) {
            return;
          }
          setStageFlash({ ...payload, phase: "exit" });
        }, STAGE_MS);

        const doneTimer = window.setTimeout(() => {
          if (stageGeneration.current !== generation) {
            resolve();
            return;
          }
          setStageFlash(null);
          stageTimers.current = [];
          resolve();
        }, STAGE_MS + STAGE_FADE_OUT_MS);

        stageTimers.current = [exitTimer, doneTimer];
      });
    },
    [clearStageTimers]
  );

  const showStageFlash = useCallback(
    (sectionIndex: number) => {
      const def = getDefinition(
        state ?? createInitialState({ locale, channel: "web" })
      );
      const section = def.sections[sectionIndex];
      if (!section) {
        return Promise.resolve();
      }

      return showStageOverlay({
        pose: section.pose || "open",
        eyebrow: section.eyebrow,
        title: section.title
      });
    },
    [locale, showStageOverlay, state]
  );

  /** v14 finish(): showStage('wai', '', stageDone) before done/calc screen. */
  const showFinishStage = useCallback(() => {
    const def = getDefinition(
      state ?? createInitialState({ locale, channel: "web" })
    );
    return showStageOverlay({
      pose: "wai",
      eyebrow: "",
      title: def.ui.stageDone || (locale === "th" ? "ขอบคุณค่ะ 🙏" : "Thank you 🙏")
    });
  }, [locale, showStageOverlay, state]);

  const finalize = useCallback(
    async (completed: QuestionnaireState) => {
      runLeafBurst(10);
      setUiScreen("calculating");
      setCalcStatus("building");
      setProcessingError("");
      armCalcFallback();

      let queuedEmail = pendingEmail.current;
      if (!queuedEmail) {
        try {
          queuedEmail = window.localStorage.getItem(DELIVERY_EMAIL_KEY);
        } catch {
          queuedEmail = null;
        }
      }

      trackBpmEvent("assessment_submitted", {
        eventType: "funnel",
        locale,
        properties: {
          channel: "web",
          questionnaireVersion: "v6-conversational",
          uxVersion: UX_VERSION,
          precision: computePrecision(getDefinition(completed), completed),
          sessionId: completed.sessionId
        }
      });

      try {
        const captured = await finalizeAssessmentCapture({
          state: { ...completed, phase: "completing" },
          planId: returningPlanId || completed.planId,
          paymentId,
          resumeToken,
          contactEmail: queuedEmail,
          bpm: getBpmPayload(),
          fetchImpl: fetchWithTimeout as typeof fetch
        });

        if (!captured.ok || !captured.planId) {
          throw new Error(captured.error || "Capture failed");
        }

        readyPlanId.current = captured.planId;
        if (queuedEmail) {
          void persistDeliveryEmail(queuedEmail, captured.planId);
        }

        let ready =
          captured.status === "ready" && Boolean(captured.healthScore);

        if (!ready) {
          ready = await pollHealthScore(captured.planId);
        }

        if (!ready) {
          setCalcStatus("slow");
          return;
        }

        if (fallbackTimer.current) {
          window.clearTimeout(fallbackTimer.current);
        }

        clearLocalState(locale);
        trackBpmEvent("healthscore_ready", {
          email: queuedEmail || undefined,
          eventType: "funnel",
          locale,
          planId: captured.planId,
          properties: {
            channel: "web",
            questionnaireVersion: "v6-conversational",
            uxVersion: UX_VERSION
          }
        });
        setCalcStatus("ready");
      } catch {
        finalizing.current = false;
        setCalcStatus("error");
        setProcessingError(ui.processingError || "Something went wrong");
        setState((prev) => (prev ? { ...prev, phase: "complete" } : prev));
      }
    },
    [
      armCalcFallback,
      locale,
      paymentId,
      pollHealthScore,
      resumeToken,
      returningPlanId,
      ui.processingError
    ]
  );

  const commitState = useCallback(
    async (
      next: QuestionnaireState,
      events: readonly QuestionnaireEvent[]
    ) => {
      const partBreak = events.find((e) => e.type === "chat_part_break");
      // Section stage only on true part boundaries (engine chat_part_break).
      if (partBreak && partBreak.type === "chat_part_break") {
        await showStageFlash(partBreak.sectionIndex);
      }

      // No typing-indicator bubble (ellipsis flash) between questions.
      setState(next);
      void track(events);
      const sectionDone = events.find((e) => e.type === "chat_section_done");
      await persistCheckpoint(
        next,
        sectionDone && sectionDone.type === "chat_section_done"
          ? sectionDone.sectionIndex
          : partBreak && partBreak.type === "chat_part_break"
            ? partBreak.sectionIndex
            : undefined
      );

      if (next.phase === "complete" && !finalizing.current) {
        finalizing.current = true;
        // Match HTML finish() stage before calculating / done screen.
        await showFinishStage();
        await finalize(next);
      }
    },
    [
      finalize,
      persistCheckpoint,
      showFinishStage,
      showStageFlash,
      state?.log.length,
      track
    ]
  );

  function beginFromWelcome() {
    trackBpmEvent("welcome_cta", {
      eventType: "funnel",
      locale,
      properties: {
        channel: "web",
        questionnaireVersion: "v6-conversational",
        uxVersion: UX_VERSION
      }
    });

    const initial =
      state && state.phase === "intro"
        ? state
        : createInitialState({
            locale,
            channel: "web",
            planId: returningPlanId ?? null
          });
    const started = startQuestionnaire(initial);
    setState(started.state);
    setUiScreen("chat");
    void track(started.events);
    saveLocalState(locale, started.state);
  }

  async function onAnswer(value: unknown, label?: string) {
    if (!state || !currentTurn) {
      return;
    }

    const result = applyAnswer(state, currentTurn.k, value, { label });
    if (!result.ok) {
      setComposerError(result.error);
      return;
    }

    setComposerError("");
    await commitState(result.state, result.events);
  }

  async function onSkip() {
    if (!state || !currentTurn) {
      return;
    }

    const result = skipTurn(state, currentTurn.k);
    if (!result.ok) {
      setComposerError(result.error);
      return;
    }

    await commitState(result.state, result.events);
  }

  function resumeContinue() {
    if (!state) {
      return;
    }

    setState({ ...state, phase: "active" });
  }

  function resumeRestart() {
    clearLocalState(locale);
    finalizing.current = false;
    readyPlanId.current = null;
    setCalcStatus("building");
    setState(
      createInitialState({
        locale,
        channel: "web",
        planId: returningPlanId ?? null
      })
    );
    setUiScreen("welcome");
  }

  function onReviewEdit(turnKey: string) {
    if (!state) {
      return;
    }

    const result = reopenTurn(state, turnKey);
    if (!result.ok) {
      setComposerError(result.error);
      return;
    }

    setReviewOpen(false);
    setState(result.state);
    saveLocalState(locale, result.state);
  }

  const reviewItems = useMemo(() => {
    if (!state) {
      return [] as Array<{ key: string; question: string; answer: string }>;
    }

    const def = getDefinition(state);
    const items: Array<{ key: string; question: string; answer: string }> = [];

    for (const turn of def.turns) {
      if (!isVisibleTurn(def, turn, state.answers)) {
        continue;
      }

      if (state.answers[turn.k] === undefined || state.answers[turn.k] === null) {
        continue;
      }

      const answer = summarizeAnswer(state, turn.k);
      if (!answer) {
        continue;
      }

      items.push({
        key: turn.k,
        question: turn.q.replace(/<[^>]+>/g, ""),
        answer
      });
    }

    return items;
  }, [state]);

  async function persistDeliveryEmail(email: string, planId?: string | null) {
    const trimmed = email.trim();
    if (!trimmed) {
      return;
    }
    pendingEmail.current = trimmed;
    try {
      window.localStorage.setItem(DELIVERY_EMAIL_KEY, trimmed);
    } catch {
      /* ignore */
    }
    trackBpmEvent("email_capture", {
      eventType: "funnel",
      locale,
      planId: planId || readyPlanId.current || returningPlanId || undefined,
      properties: {
        channel: "web",
        questionnaireVersion: "v6-conversational",
        uxVersion: UX_VERSION,
        source: "calc_emailbox"
      }
    });
    const id = planId || readyPlanId.current || returningPlanId || state?.planId;
    if (!id) {
      return;
    }
    try {
      await fetchWithTimeout(`/api/assessment/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactEmail: trimmed,
          intent: "capture",
          locale
        }),
        cache: "no-store",
        keepalive: true
      });
    } catch {
      /* non-blocking */
    }
  }

  async function onFallbackEmail(email: string) {
    await persistDeliveryEmail(email);
  }

  function avatarClass(pose?: string) {
    return pose === "celebrate"
      ? "mn-chat-q__avatar mn-chat-q__avatar--celebrate"
      : "mn-chat-q__avatar";
  }

  /**
   * Paged single-question mode (HTML collapse parity):
   * show only the current turn's question / reaction / halfway card —
   * not a scrolling transcript of prior answers.
   *
   * First page special case: intro greeting stays with the first question
   * ("Ready. Let's begin…" + firstName) until the user advances.
   */
  function isLogItemVisibleOnPage(msg: LogMessage, index: number): boolean {
    if (!state) {
      return true;
    }

    const log = state.log;
    const firstBot = log.find(
      (entry): entry is Extract<LogMessage, { kind: "bot" }> =>
        entry.kind === "bot"
    );
    const onFirstQuestionPage =
      state.phase === "active" &&
      firstBot != null &&
      state.turnIndex === firstBot.turnIndex &&
      currentTurn?.k === firstBot.turnKey &&
      Object.keys(state.answers).length === 0;

    const lastHalfway = [...log]
      .map((entry, i) => ({ entry, i }))
      .reverse()
      .find((item) => item.entry.kind === "halfway");

    // After halfway fires, show only the halfway card until the next bot question
    // exists after it; then show only post-halfway current content.
    if (lastHalfway && lastHalfway.i === index && msg.kind === "halfway") {
      const hasLaterBot = log
        .slice(lastHalfway.i + 1)
        .some((entry) => entry.kind === "bot");
      return !hasLaterBot;
    }

    if (msg.kind === "halfway") {
      return false;
    }

    // Intro greeting: with the first question on page 1 (not only before the bot exists)
    if (msg.kind === "intro") {
      return onFirstQuestionPage || (!firstBot && state.phase === "active");
    }

    // Only the latest bot prompt for the active turn
    if (msg.kind === "bot") {
      return (
        state.phase === "active" &&
        msg.turnIndex === state.turnIndex &&
        msg.turnKey === currentTurn?.k
      );
    }

    // Hide prior user answers from the page (they live in Review)
    if (msg.kind === "user") {
      return false;
    }

    // Section cards are replaced by the full-screen stage overlay
    if (msg.kind === "section") {
      return false;
    }

    // Show only the most recent react/ack if it sits after the current bot
    // (includes meetLine / name react after answering firstName, etc.)
    if (msg.kind === "react" || msg.kind === "ack") {
      const lastBotIdx = (() => {
        for (let i = log.length - 1; i >= 0; i -= 1) {
          const entry = log[i];
          if (
            entry?.kind === "bot" &&
            entry.turnIndex === state.turnIndex
          ) {
            return i;
          }
        }
        return -1;
      })();
      // If we just answered and already advanced, still show the latest react
      // that is the newest message (brief beat) — otherwise only after current bot.
      if (lastBotIdx >= 0 && index > lastBotIdx) {
        for (let i = log.length - 1; i > index; i -= 1) {
          const entry = log[i];
          if (entry?.kind === "react" || entry?.kind === "ack") {
            return false;
          }
          if (entry?.kind === "bot") {
            break;
          }
        }
        return true;
      }
      // Reaction for previous turn: show only if it's the newest log entry
      // (before the next bot is appended) so meetLine is not dropped.
      if (index === log.length - 1) {
        return true;
      }
      return false;
    }

    // Transient system lines (e.g. vegan skip) — only while newest
    if (msg.kind === "system") {
      return index === log.length - 1;
    }

    return false;
  }

  function renderLogItem(msg: LogMessage, index: number) {
    if (!isLogItemVisibleOnPage(msg, index)) {
      return null;
    }

    if (msg.kind === "intro") {
      // v14 HTML: intro is bubble-first (no mascot avatar beside the greeting).
      return (
        <div
          key={`intro-${index}`}
          className="mn-chat-q__row mn-chat-q__row--bot mn-chat-q__row--no-avatar"
          data-testid="paged-question"
        >
          <div className="mn-chat-q__bubble">
            <div className="mn-chat-q__q">{msg.text}</div>
            {msg.hint ? <div className="mn-chat-q__hint">{msg.hint}</div> : null}
          </div>
        </div>
      );
    }

    if (msg.kind === "bot") {
      return (
        <div
          key={`bot-${msg.turnKey}-${index}`}
          className="mn-chat-q__row mn-chat-q__row--bot"
          data-testid="paged-question"
        >
          <div className={avatarClass(msg.pose)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nongPoseSrc(msg.pose)} alt="" />
          </div>
          <div className="mn-chat-q__bubble">
            <div className="mn-chat-q__q">{msg.question}</div>
            {msg.why ? <div className="mn-chat-q__why">{msg.why}</div> : null}
            {msg.remainingHint ? (
              <span className="mn-chat-q__countchip">{msg.remainingHint}</span>
            ) : null}
          </div>
        </div>
      );
    }

    if (msg.kind === "react" || msg.kind === "ack") {
      return (
        <div
          key={`${msg.kind}-${msg.id}-${index}`}
          className={`mn-chat-q__row mn-chat-q__row--bot mn-chat-q__row--react${msg.kind === "ack" ? " mn-chat-q__row--ack" : ""}`}
        >
          <div className={avatarClass(msg.pose)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nongPoseSrc(msg.pose)} alt="" />
          </div>
          <div className="mn-chat-q__bubble">
            <div className="mn-chat-q__q">{msg.text}</div>
          </div>
        </div>
      );
    }

    if (msg.kind === "halfway") {
      return (
        <div
          key={`halfway-${index}`}
          className="mn-chat-q__row mn-chat-q__row--bot mn-chat-q__row--health-preview"
          data-testid="halfway-health-preview"
        >
          <div className={avatarClass(msg.pose)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nongPoseSrc(msg.pose)} alt="" />
          </div>
          <div className="mn-chat-q__bubble mn-chat-q__bubble--health-preview">
            <div className="mn-chat-q__health-preview-title">{msg.title}</div>
            {msg.text ? (
              <div className="mn-chat-q__health-preview-lede">{msg.text}</div>
            ) : null}
            <div className="mn-chat-q__preview-lines">
              {msg.lines.map((line) => (
                <div key={line.label} className="mn-chat-q__preview-line">
                  <span>{line.label}</span>
                  <b>{line.value}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (msg.kind === "system") {
      return (
        <div
          key={`sys-${index}`}
          className="mn-chat-q__row mn-chat-q__row--bot mn-chat-q__row--sec"
        >
          <div className="mn-chat-q__bubble">
            <div className="mn-chat-q__sec-desc">{msg.text}</div>
          </div>
        </div>
      );
    }

    return null;
  }

  function renderComposer() {
    if (!state || uiScreen !== "chat") {
      return null;
    }

    if (state.phase === "resume_prompt") {
      return (
        <div className="mn-chat-q__actions">
          <p className="mn-chat-q__q" style={{ marginBottom: 4 }}>
            {ui.resumeQ}
          </p>
          <button type="button" className="mn-chat-q__primary" onClick={resumeContinue}>
            {ui.resumeYes}
          </button>
          <button type="button" className="mn-chat-q__ghost" onClick={resumeRestart}>
            {ui.resumeNo}
          </button>
        </div>
      );
    }

    if (state.phase === "complete" && processingError) {
      return (
        <div className="mn-chat-q__actions">
          <div className="mn-chat-q__err">{processingError}</div>
          <button
            type="button"
            className="mn-chat-q__primary"
            onClick={() => {
              finalizing.current = false;
              void finalize(state);
            }}
          >
            {ui.confirm}
          </button>
        </div>
      );
    }

    if (!currentTurn || state.phase !== "active") {
      return null;
    }

    const turn = currentTurn;

    if (turn.kind === "single") {
      return (
        <div className="mn-chat-q__chips">
          {turn.opts?.map((o) => (
            <button
              key={o.v}
              type="button"
              className="mn-chat-q__chip"
              onClick={() => void onAnswer(o.v, o.l)}
            >
              {o.l}
            </button>
          ))}
        </div>
      );
    }

    if (turn.kind === "multi") {
      const excl = turn.excl || [];
      const max = turn.max;
      return (
        <>
          <div className="mn-chat-q__chips">
            {turn.opts?.map((o) => {
              const selected = multiSel.includes(o.v);
              const capped =
                Boolean(max) &&
                !selected &&
                multiSel.filter((v) => !excl.includes(v)).length >= (max || 0);
              return (
                <button
                  key={o.v}
                  type="button"
                  className={`mn-chat-q__chip${selected ? " mn-chat-q__chip--sel" : ""}${capped ? " mn-chat-q__chip--disabled" : ""}`}
                  onClick={() => {
                    setMultiSel((prev) => {
                      if (excl.includes(o.v)) {
                        return selected ? [] : [o.v];
                      }

                      const withoutExcl = prev.filter((v) => !excl.includes(v));
                      if (selected) {
                        return withoutExcl.filter((v) => v !== o.v);
                      }

                      if (max && withoutExcl.length >= max) {
                        setComposerError(ui.pickMax3 || "Too many choices");
                        return withoutExcl;
                      }

                      setComposerError("");
                      return [...withoutExcl, o.v];
                    });
                  }}
                >
                  {o.l}
                </button>
              );
            })}
          </div>
          {composerError ? <div className="mn-chat-q__err">{composerError}</div> : null}
          <div className="mn-chat-q__actions">
            <button
              type="button"
              className="mn-chat-q__primary"
              onClick={() => {
                if (!multiSel.length) {
                  setComposerError(ui.needAnswer || "Pick an answer first");
                  return;
                }

                const labels = multiSel
                  .map((v) => turn.opts?.find((o) => o.v === v)?.l || v)
                  .join(" · ");
                void onAnswer(multiSel, labels);
              }}
            >
              {ui.confirm}
            </button>
          </div>
        </>
      );
    }

    if (turn.kind === "confirm") {
      return (
        <div className="mn-chat-q__actions">
          <button
            type="button"
            className="mn-chat-q__primary"
            onClick={() => void onAnswer(true, turn.btn || ui.confirm)}
          >
            {turn.btn || ui.confirm}
          </button>
        </div>
      );
    }

    if (turn.kind === "gate") {
      return (
        <div className="mn-chat-q__actions mn-chat-q__actions--row">
          <button
            type="button"
            className="mn-chat-q__primary"
            onClick={() => void onAnswer("go", ui.precisionGo)}
          >
            {ui.precisionGo}
          </button>
          <button
            type="button"
            className="mn-chat-q__ghost"
            onClick={() => void onAnswer("skip", ui.precisionSkip)}
          >
            {ui.precisionSkip}
          </button>
        </div>
      );
    }

    if (turn.kind === "swatch") {
      return (
        <div className="mn-chat-q__swatches">
          {definition.meta.skinColors.map((color, ix) => {
            const value = definition.meta.skinValues[ix] || String(ix + 1);
            return (
              <button
                key={value}
                type="button"
                className="mn-chat-q__swatch"
                style={{ background: color }}
                aria-label={(ui.toneLabel || "Tone {n}").replace("{n}", value)}
                onClick={() =>
                  void onAnswer(
                    value,
                    (ui.toneLabel || "Tone {n}").replace("{n}", value)
                  )
                }
              />
            );
          })}
        </div>
      );
    }

    if (turn.kind === "sliders") {
      const ftTotal = height / 2.54;
      const ft = Math.floor(ftTotal / 12);
      const inch = Math.round(ftTotal % 12);
      const lb = Math.round(weight * 2.205);
      return (
        <>
          <div className="mn-chat-q__fieldbox">
            <div className="mn-chat-q__sliderline">
              <small>{ui.height}</small>
              <span>
                <b>{height}</b> {ui.cm}{" "}
                <small>
                  ({(ui.ftFmt || "{f} ft {i} in")
                    .replace("{f}", String(ft))
                    .replace("{i}", String(inch))}
                  )
                </small>
              </span>
            </div>
            <input
              type="range"
              min={definition.meta.height.min}
              max={definition.meta.height.max}
              value={height}
              aria-label={ui.height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
            <div className="mn-chat-q__sliderline" style={{ marginTop: 12 }}>
              <small>{ui.weight}</small>
              <span>
                <b>{weight}</b> {ui.kg}{" "}
                <small>
                  ({(ui.lbFmt || "{p} lb").replace("{p}", String(lb))})
                </small>
              </span>
            </div>
            <input
              type="range"
              min={definition.meta.weight.min}
              max={definition.meta.weight.max}
              value={weight}
              aria-label={ui.weight}
              onChange={(e) => setWeight(Number(e.target.value))}
            />
          </div>
          <div className="mn-chat-q__actions">
            <button
              type="button"
              className="mn-chat-q__primary"
              onClick={() =>
                void onAnswer(
                  { h: String(height), w: String(weight), height, weight },
                  `${height} ${ui.cm} · ${weight} ${ui.kg}`
                )
              }
            >
              {ui.confirm}
            </button>
          </div>
        </>
      );
    }

    if (turn.kind === "text") {
      return (
        <>
          <input
            className="mn-chat-q__text-input"
            type="text"
            maxLength={120}
            placeholder={turn.ph || ""}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onAnswer(textValue.trim(), textValue.trim() || "—");
              }
            }}
          />
          <div className="mn-chat-q__actions mn-chat-q__actions--inline">
            <button
              type="button"
              className="mn-chat-q__primary"
              onClick={() => void onAnswer(textValue.trim(), textValue.trim() || "—")}
            >
              {ui.confirm}
            </button>
            {turn.optional || turn.req === 0 || turn.opt ? (
              <button
                type="button"
                className="mn-chat-q__skip-link"
                onClick={() => void onSkip()}
              >
                {ui.skip}
              </button>
            ) : null}
          </div>
        </>
      );
    }

    if (turn.kind === "fitness") {
      return (
        <>
          <div className="mn-chat-q__fieldbox">
            <div className="mn-chat-q__fitgrid">
              <div className="mn-chat-q__field">
                <label htmlFor="cq-vo2">VO₂ max</label>
                <input
                  id="cq-vo2"
                  className="mn-chat-q__text-input"
                  type="number"
                  inputMode="decimal"
                  min={10}
                  max={90}
                  value={vo2}
                  onChange={(e) => setVo2(e.target.value)}
                />
              </div>
              <div className="mn-chat-q__field">
                <label htmlFor="cq-hrv">HRV</label>
                <input
                  id="cq-hrv"
                  className="mn-chat-q__text-input"
                  type="number"
                  inputMode="decimal"
                  min={5}
                  max={250}
                  value={hrv}
                  onChange={(e) => setHrv(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="mn-chat-q__actions mn-chat-q__actions--inline">
            <button
              type="button"
              className="mn-chat-q__primary"
              onClick={() => {
                if (!vo2.trim() && !hrv.trim()) {
                  void onSkip();
                  return;
                }

                void onAnswer({ vo2: vo2.trim(), hrv: hrv.trim() });
              }}
            >
              {ui.confirm}
            </button>
            <button
              type="button"
              className="mn-chat-q__skip-link"
              onClick={() => void onSkip()}
            >
              {ui.skip}
            </button>
          </div>
        </>
      );
    }

    if (turn.kind === "labs") {
      return (
        <>
          <div className="mn-chat-q__fieldbox">
            <div className="mn-chat-q__why">{ui.labsHint}</div>
            {definition.meta.labs.map((lab) => (
              <div key={lab.k} className="mn-chat-q__labrow">
                <span className="mn-chat-q__labname">{lab.n}</span>
                <input
                  className="mn-chat-q__text-input"
                  type="number"
                  inputMode="decimal"
                  value={labValues[lab.k] || ""}
                  aria-label={lab.n}
                  onChange={(e) =>
                    setLabValues((prev) => ({ ...prev, [lab.k]: e.target.value }))
                  }
                />
                <div className="mn-chat-q__unitseg">
                  {lab.u.map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      className={labUnits[lab.k] === unit ? "sel" : ""}
                      onClick={() =>
                        setLabUnits((prev) => ({ ...prev, [lab.k]: unit }))
                      }
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mn-chat-q__actions mn-chat-q__actions--inline">
            <button
              type="button"
              className="mn-chat-q__primary"
              onClick={() => {
                const payload: Record<string, string> = {};
                let any = false;
                for (const lab of definition.meta.labs) {
                  const v = (labValues[lab.k] || "").trim();
                  if (v) {
                    payload[lab.k] = v;
                    any = true;
                  }
                }

                if (!any) {
                  void onSkip();
                  return;
                }

                for (const lab of definition.meta.labs) {
                  const unitKey = `unit_${lab.k.slice(4)}`;
                  if (labUnits[lab.k]) {
                    payload[unitKey] = labUnits[lab.k]!;
                  }
                }

                void onAnswer(payload);
              }}
            >
              {ui.confirm}
            </button>
            <button
              type="button"
              className="mn-chat-q__skip-link"
              onClick={() => void onSkip()}
            >
              {ui.skip}
            </button>
          </div>
        </>
      );
    }

    return null;
  }

  if (uiScreen === "welcome") {
    return (
      <QuestionnaireWelcome locale={locale} onStart={beginFromWelcome} />
    );
  }

  if (uiScreen === "calculating") {
    return (
      <QuestionnaireCalculating
        locale={locale}
        status={calcStatus}
        onSeeResults={() => {
          const planId = readyPlanId.current;
          if (!planId) {
            return;
          }

          router.replace(resultsPath(locale, planId, paymentId));
        }}
        onRetry={() => {
          if (!state) {
            return;
          }

          finalizing.current = false;
          setCalcStatus("building");
          void finalize(state);
        }}
        onEmailSubmit={onFallbackEmail}
      />
    );
  }

  return (
    <div className="mn-chat-q" data-testid="chat-questionnaire">
      {stageFlash ? (
        <div
          className={`mn-quiz-stage mn-quiz-stage--${stageFlash.phase}`}
          aria-hidden
          data-testid="section-stage-overlay"
        >
          <div className="mn-quiz-stage__card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={nongPoseSrc(stageFlash.pose)}
              alt=""
              width={180}
              height={180}
            />
            {stageFlash.eyebrow ? (
              <div className="mn-quiz-stage__eyebrow">{stageFlash.eyebrow}</div>
            ) : null}
            <div className="mn-quiz-stage__title">{stageFlash.title}</div>
          </div>
        </div>
      ) : null}
      <div className="mn-chat-q__header" data-testid="quiz-progress-header">
        <div className="mn-chat-q__brandrow">
          <div className="mn-chat-q__brandcopy">
            <div className="mn-chat-q__brandsub">{chrome.brandsub}</div>
          </div>
          <span
            className={`mn-chat-q__saved${savedFlash ? " show" : ""}`}
            aria-live="polite"
          >
            {ui.saved ? `${ui.saved} ✓` : "Saved ✓"}
          </span>
          <button
            type="button"
            className="mn-chat-q__review-btn"
            data-testid="review-answers-btn"
            onClick={() => setReviewOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="mn-chat-q__review-btn-full">{chrome.reviewBtn}</span>
            <span className="mn-chat-q__review-btn-short">Review</span>
          </button>
        </div>
        <div className="mn-chat-q__vial" aria-label={progressMeta.partLabel}>
          <div className="mn-chat-q__vial-track">
            <div
              className="mn-chat-q__vial-fill"
              style={{ width: `${Math.max(6, progressMeta.barPct)}%` }}
            />
          </div>
          <div className="mn-chat-q__vial-pct">
            <b>{progressMeta.partLabel}</b>
            <small>{progressMeta.detail}</small>
          </div>
        </div>
      </div>

      <div className="mn-chat-q__frame">
        {/* Single scroll page: question + answers together (not a bottom dock). */}
        <div className="mn-chat-q__page" ref={logScrollRef}>
          <div className="mn-chat-q__log" role="log" aria-live="polite">
            {state?.log.map((msg, index) => renderLogItem(msg, index))}
            <div ref={logEndRef} />
          </div>

          <div
            className="mn-chat-q__composer mn-chat-q__composer--under-q"
            ref={composerRef}
            data-testid="question-answers"
          >
            <div className="mn-chat-q__composer-inner">{renderComposer()}</div>
          </div>
        </div>

        <p className="mn-chat-q__privacy-footer">
          {chrome.privacyFooter}{" "}
          <a href={`/${locale === "zh-CN" ? "en" : locale}/privacy`}>
            {chrome.privacyFooterLink}
          </a>
        </p>
      </div>

      {reviewOpen ? (
        <div
          className="mn-chat-q__review-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mn-chat-q-review-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setReviewOpen(false);
            }
          }}
        >
          <div className="mn-chat-q__review-panel">
            <div className="mn-chat-q__review-head">
              <h2 id="mn-chat-q-review-title">{chrome.reviewTitle}</h2>
              <button
                type="button"
                className="mn-chat-q__review-close"
                aria-label={chrome.reviewClose}
                onClick={() => setReviewOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="mn-chat-q__review-list">
              {reviewItems.length === 0 ? (
                <p className="mn-chat-q__review-empty">{chrome.reviewEmpty}</p>
              ) : (
                reviewItems.map((item) => (
                  <div key={item.key} className="mn-chat-q__review-item">
                    <div>
                      <b>{item.question}</b>
                      <div className="mn-chat-q__review-answer">{item.answer}</div>
                    </div>
                    <button
                      type="button"
                      className="mn-chat-q__review-edit"
                      onClick={() => onReviewEdit(item.key)}
                    >
                      {chrome.reviewEdit}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showDevShortcut && process.env.NODE_ENV !== "production" ? (
        <div style={{ padding: 8, fontSize: 12, opacity: 0.5 }}>
          chat-q v14 · {state?.phase} · t{state?.turnIndex} · {uiScreen}
        </div>
      ) : null}
    </div>
  );
}
