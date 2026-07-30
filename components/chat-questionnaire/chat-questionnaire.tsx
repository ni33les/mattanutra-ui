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
  serializeState,
  skipTurn,
  startQuestionnaire
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
import "./chat-questionnaire.css";

const ASSESSMENT_REQUEST_TIMEOUT_MS = 30_000;

type ChatQuestionnaireProps = Readonly<{
  locale: Locale;
  paymentId?: string;
  returningPlanId?: string;
  resumeToken?: string;
  showDevShortcut?: boolean;
}>;

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
  const [state, setState] = useState<QuestionnaireState | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [composerFocusPulse, setComposerFocusPulse] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [textValue, setTextValue] = useState("");
  const [height, setHeight] = useState(175);
  const [weight, setWeight] = useState(72);
  const [vo2, setVo2] = useState("");
  const [hrv, setHrv] = useState("");
  const [labValues, setLabValues] = useState<Record<string, string>>({});
  const [labUnits, setLabUnits] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [processingError, setProcessingError] = useState("");
  const finalizing = useRef(false);

  const definition = useMemo(
    () => (state ? getDefinition(state) : getDefinition(createInitialState({ locale }))),
    [state, locale]
  );
  const ui = definition.ui;
  const prompt = state ? getNextPrompt(state) : null;
  const precision = state ? computePrecision(definition, state) : 8;
  const currentTurn: TurnDef | null = prompt?.turn ?? null;

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

  // Boot
  useEffect(() => {
    const saved = loadLocalState(locale);
    trackBpmEvent("chat_view", {
      eventType: "funnel",
      locale,
      properties: { channel: "web", questionnaireVersion: "v6-conversational" }
    });

    if (
      saved &&
      saved.version === "v6-conversational" &&
      Object.keys(saved.answers).length > 0 &&
      saved.phase !== "complete"
    ) {
      setState({
        ...saved,
        phase: "resume_prompt",
        locale: locale as typeof saved.locale,
        autoFilled: saved.autoFilled ?? [],
        halfwayDone: saved.halfwayDone ?? false,
        sinceAck: saved.sinceAck ?? 0
      });
      return;
    }

    const initial = createInitialState({
      locale,
      channel: "web",
      planId: returningPlanId ?? null
    });
    const started = startQuestionnaire(initial);
    setState(started.state);
    void track(started.events);
    saveLocalState(locale, started.state);
  }, [locale, returningPlanId, track]);

  useEffect(() => {
    const scroller = logScrollRef.current;
    if (scroller) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    } else {
      logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [state?.log.length, currentTurn?.k]);

  // Reset composer draft when turn changes + pull focus to answers
  useEffect(() => {
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

    // Draw attention to answer controls after each new question
    const focusTimer = window.setTimeout(() => {
      const root = composerRef.current;
      if (!root || state?.phase !== "active") {
        return;
      }

      setComposerFocusPulse(true);
      window.setTimeout(() => setComposerFocusPulse(false), 900);

      const target = root.querySelector<HTMLElement>(
        "button.mn-chat-q__chip, button.mn-chat-q__swatch, button.mn-chat-q__primary, input, button.mn-chat-q__ghost"
      );
      target?.focus({ preventScroll: true });
      root.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);

    return () => window.clearTimeout(focusTimer);
  }, [currentTurn?.k, currentTurn?.kind, definition.meta, state?.answers, state?.phase]);

  const finalize = useCallback(
    async (completed: QuestionnaireState) => {
      setProcessing(true);
      setProcessingError("");
      trackBpmEvent("assessment_submitted", {
        eventType: "funnel",
        locale,
        properties: {
          channel: "web",
          questionnaireVersion: "v6-conversational",
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
          bpm: getBpmPayload(),
          fetchImpl: fetchWithTimeout as typeof fetch
        });

        if (!captured.ok || !captured.planId) {
          throw new Error(captured.error || "Capture failed");
        }

        let healthScore = captured.healthScore;
        let status = captured.status;

        if (status !== "ready" || !healthScore) {
          for (let attempt = 0; attempt < 40; attempt += 1) {
            const response = await fetchWithTimeout(
              `/api/assessment/${encodeURIComponent(captured.planId)}?view=healthscore&locale=${encodeURIComponent(locale)}`,
              { cache: "no-store" }
            );

            if (!response.ok) {
              throw new Error("Unable to load HealthScore");
            }

            const payload = (await response.json()) as {
              status?: string;
              healthScore?: unknown;
            };
            status = payload.status;
            healthScore = payload.healthScore;

            if (status === "ready" && healthScore) {
              break;
            }

            if (status === "failed") {
              throw new Error("HealthScore analysis failed");
            }

            await sleep(1500);
          }
        }

        if (!healthScore) {
          throw new Error("HealthScore missing");
        }

        clearLocalState(locale);
        trackBpmEvent("healthscore_ready", {
          eventType: "funnel",
          locale,
          planId: captured.planId,
          properties: { channel: "web", questionnaireVersion: "v6-conversational" }
        });

        router.replace(
          paymentId
            ? nutritionRevealPath(locale, captured.planId)
            : nutritionHealthScorePath(locale, captured.planId)
        );
      } catch {
        finalizing.current = false;
        setProcessing(false);
        setProcessingError(ui.processingError || "Something went wrong");
        setState((prev) => (prev ? { ...prev, phase: "complete" } : prev));
      }
    },
    [locale, paymentId, resumeToken, returningPlanId, router, ui.processingError]
  );

  const commitState = useCallback(
    async (
      next: QuestionnaireState,
      events: readonly QuestionnaireEvent[]
    ) => {
      setState(next);
      void track(events);
      const sectionDone = events.find((e) => e.type === "chat_section_done");
      const partBreak = events.find((e) => e.type === "chat_part_break");
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
        await finalize(next);
      }
    },
    [finalize, persistCheckpoint, track]
  );

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
    const initial = createInitialState({
      locale,
      channel: "web",
      planId: returningPlanId ?? null
    });
    const started = startQuestionnaire(initial);
    setState(started.state);
    void track(started.events);
    saveLocalState(locale, started.state);
  }

  function renderLogItem(msg: LogMessage, index: number) {
    if (msg.kind === "intro") {
      return (
        <div key={`intro-${index}`} className="mn-chat-q__row mn-chat-q__row--bot">
          <div className="mn-chat-q__avatar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nongPoseSrc(msg.pose)} alt="" />
          </div>
          <div className="mn-chat-q__bubble">
            <div className="mn-chat-q__q">{msg.text}</div>
            {msg.hint ? <div className="mn-chat-q__hint">{msg.hint}</div> : null}
          </div>
        </div>
      );
    }

    if (msg.kind === "section") {
      return (
        <div key={`sec-${msg.sectionIndex}-${index}`} className="mn-chat-q__row mn-chat-q__row--bot mn-chat-q__row--sec">
          <div className="mn-chat-q__avatar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nongPoseSrc(msg.pose)} alt="" />
          </div>
          <div className="mn-chat-q__bubble">
            <div className="mn-chat-q__sec-eyebrow">{msg.eyebrow}</div>
            <div className="mn-chat-q__sec-title">{msg.title}</div>
            <div className="mn-chat-q__sec-lead">
              {msg.leadIn || ui.inThisSection || "In this section we…"}
            </div>
            <div className="mn-chat-q__sec-desc">{msg.desc}</div>
          </div>
        </div>
      );
    }

    if (msg.kind === "bot") {
      return (
        <div key={`bot-${msg.turnKey}-${index}`} className="mn-chat-q__row mn-chat-q__row--bot">
          <div className="mn-chat-q__avatar">
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

    if (msg.kind === "user") {
      return (
        <div key={`user-${msg.turnKey}-${index}`} className="mn-chat-q__row mn-chat-q__row--user">
          <div className="mn-chat-q__bubble">
            <div className="mn-chat-q__q" style={{ fontWeight: 500 }}>
              {msg.label}
            </div>
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
          <div className="mn-chat-q__avatar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nongPoseSrc(msg.pose)} alt="" />
          </div>
          <div className="mn-chat-q__bubble">
            <div className="mn-chat-q__q">{msg.text}</div>
          </div>
        </div>
      );
    }

    if (msg.kind === "system") {
      return (
        <div key={`sys-${index}`} className="mn-chat-q__row mn-chat-q__row--bot mn-chat-q__row--sec">
          <div className="mn-chat-q__bubble">
            <div className="mn-chat-q__sec-desc">{msg.text}</div>
          </div>
        </div>
      );
    }

    return null;
  }

  function renderComposer() {
    if (!state || processing) {
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
              const capped = Boolean(max && multiSel.length >= max && !selected);
              return (
                <button
                  key={o.v}
                  type="button"
                  className={`mn-chat-q__chip${selected ? " mn-chat-q__chip--sel" : ""}${capped ? " mn-chat-q__chip--disabled" : ""}`}
                  onClick={() => {
                    setMultiSel((prev) => {
                      if (prev.includes(o.v)) {
                        return prev.filter((x) => x !== o.v);
                      }

                      let next = [...prev];
                      if (excl.includes(o.v)) {
                        next = [];
                      } else {
                        next = next.filter((x) => !excl.includes(x));
                      }

                      if (max && next.length >= max) {
                        setComposerError(ui.pickMax3 || "");
                        return prev;
                      }

                      return [...next, o.v];
                    });
                  }}
                >
                  {o.l}
                </button>
              );
            })}
          </div>
          <div className="mn-chat-q__actions">
            <button
              type="button"
              className="mn-chat-q__primary"
              disabled={multiSel.length === 0}
              onClick={() => {
                const labels =
                  turn.opts
                    ?.filter((o) => multiSel.includes(o.v))
                    .map((o) => o.l)
                    .join(" · ") || multiSel.join(" · ");
                void onAnswer(multiSel, labels);
              }}
            >
              {ui.confirm}
            </button>
          </div>
          {composerError ? <div className="mn-chat-q__err">{composerError}</div> : null}
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
                  { h: String(height), w: String(weight) },
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
                void onAnswer(textValue.trim());
              }
            }}
          />
          <div className="mn-chat-q__actions">
            <button
              type="button"
              className="mn-chat-q__primary"
              onClick={() => void onAnswer(textValue.trim())}
            >
              {ui.confirm}
            </button>
            {turn.optional || turn.req === 0 ? (
              <button type="button" className="mn-chat-q__ghost" onClick={() => void onSkip()}>
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
              <div>
                <label htmlFor="cq-vo2">VO₂ max</label>
                <input
                  id="cq-vo2"
                  type="number"
                  inputMode="decimal"
                  min={10}
                  max={90}
                  value={vo2}
                  onChange={(e) => setVo2(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="cq-hrv">HRV</label>
                <input
                  id="cq-hrv"
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
          <div className="mn-chat-q__actions">
            <button
              type="button"
              className="mn-chat-q__primary"
              onClick={() => {
                if (!vo2 && !hrv) {
                  void onSkip();
                  return;
                }

                void onAnswer({ vo2: vo2 || undefined, hrv: hrv || undefined });
              }}
            >
              {ui.confirm}
            </button>
            <button type="button" className="mn-chat-q__ghost" onClick={() => void onSkip()}>
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
                  type="number"
                  inputMode="decimal"
                  value={labValues[lab.k] || ""}
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
          <div className="mn-chat-q__actions">
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

                // stash units on state via answers merge in onAnswer object
                for (const lab of definition.meta.labs) {
                  const unitKey = `unit_${lab.k.slice(4)}`;
                  if (labUnits[lab.k]) {
                    // applied via extended object
                    (payload as Record<string, string>)[unitKey] = labUnits[lab.k]!;
                  }
                }

                void onAnswer(payload);
              }}
            >
              {ui.confirm}
            </button>
            <button type="button" className="mn-chat-q__ghost" onClick={() => void onSkip()}>
              {ui.skip}
            </button>
          </div>
        </>
      );
    }

    return null;
  }

  return (
    <div className="mn-chat-q" data-testid="chat-questionnaire">
      <div className="mn-chat-q__header">
        <div className="mn-chat-q__brandrow">
          <div className="mn-chat-q__wordmark">
            Matta<b>Nutra</b>
          </div>
          <span className={`mn-chat-q__saved${savedFlash ? " show" : ""}`}>
            {ui.saved || "Saved"}
          </span>
        </div>
        <div className="mn-chat-q__vial" aria-label="Precision">
          <div className="mn-chat-q__vial-track">
            <div
              className="mn-chat-q__vial-fill"
              style={{ width: `${precision}%` }}
            />
          </div>
          <div className="mn-chat-q__vial-pct">
            {precision}
            <small>%</small>
          </div>
        </div>
      </div>

      <div className="mn-chat-q__frame">
        <div
          className="mn-chat-q__log"
          role="log"
          aria-live="polite"
          ref={logScrollRef}
        >
          {state?.log.map((msg, index) => renderLogItem(msg, index))}
          {processing ? (
            <div className="mn-chat-q__processing" aria-live="polite">
              <span className="mn-chat-q__processing-dot" aria-hidden />
            </div>
          ) : null}
          <div ref={logEndRef} />
        </div>

        <div
          className={`mn-chat-q__composer${composerFocusPulse ? " mn-chat-q__composer--focus" : ""}`}
          ref={composerRef}
        >
          <div className="mn-chat-q__composer-inner">{renderComposer()}</div>
        </div>
      </div>

      {showDevShortcut && process.env.NODE_ENV !== "production" ? (
        <div style={{ padding: 8, fontSize: 12, opacity: 0.5 }}>
          chat-q v6 · {state?.phase} · t{state?.turnIndex}
        </div>
      ) : null}
    </div>
  );
}
