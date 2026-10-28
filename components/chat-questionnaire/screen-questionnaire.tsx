"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getWelcomeCopy, QuestionnaireWelcome } from "./questionnaire-welcome";
import { combinedCopy } from "@/components/pharmacy/combined-copy";
import { QuestionnaireCalculating } from "./questionnaire-calculating";
import { useQuestionnaireCapture } from "./use-questionnaire-capture";
import { useQuestionnaireTelemetry } from "./use-questionnaire-telemetry";
import type { ChatQuestionnaireProps } from "./chat-questionnaire";
import { chatDraftStorageKey, parseChatDraft, resolveChatDraft, updateChatDraft, type ChatDraft } from "@/lib/questionnaire/browser-draft";
import { advanceScreen, createScreenState, fastForwardScreens, firstMissingScreen, labsValid, migrateScreenState, openScreen, previousScreen, questionnaireScreens, screenComplete, screenCopy, screenDefinition, screenProgress, screenQuestionnaireComplete, screenTurns, toggleScreenChoice, updateScreenAnswer, visibleScreens, SCREEN_QUESTIONNAIRE_VERSION } from "@/lib/questionnaire/screens";
import { questionnaireAttemptContext } from "@/lib/questionnaire/telemetry";
import type { QuestionnaireState, TurnDef } from "@/lib/questionnaire/types";
import { ASSESSMENT_FIRST_NAME_MAX_LENGTH } from "@/lib/assessment-first-name";
import { assessmentContactEmailError, normalizeAssessmentContactEmail } from "@/lib/assessment-contact";
import { getBpmPayload, trackBpmEvent } from "@/lib/bpm-client";
import { trackMetaEvent } from "@/lib/meta-client";
import { WEB_PRODUCT_JOURNEY_VERSION } from "@/lib/web-product-journey";
import { nutritionHealthScorePath, nutritionRevealPath } from "@/lib/nutrition-paths";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { requestHealthScoreEmail } from "@/lib/healthscore-copy-client";
import styles from "./screen-questionnaire.module.css";

export function ScreenQuestionnaire({ locale, sessionId, reviewRequested = false, serverDraft, paymentId, pharmacyId,
  returningPlanId, resumeToken, showDevShortcut, skipHealthScore = false }: ChatQuestionnaireProps) {
  const router = useRouter();
  const skipHealthScoreStep = skipHealthScore || Boolean(pharmacyId);
  const newPublicWebJourney = skipHealthScore && !pharmacyId && !returningPlanId && !reviewRequested && !paymentId;
  const [state, setState] = useState<QuestionnaireState | null>(null);
  const [mode, setMode] = useState<"loading" | "welcome" | "resume" | "quiz" | "calculating">("loading");
  const [saveFailed, setSaveFailed] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<ChatDraft | null>(null);
  const captureInFlight = useRef(false);
  const sessionRef = useRef(sessionId || returningPlanId || paymentId || crypto.randomUUID());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = screenCopy(locale);
  const x = copy.x;
  const definition = state ? screenDefinition(state) : null;
  const current = questionnaireScreens.find(screen => screen.id === state?.screenId) ?? questionnaireScreens[0];
  const turns = state ? screenTurns(state, current) : [];
  const telemetry = useQuestionnaireTelemetry({ state, turns, visible: mode === "quiz" && !state?.screenReview,
    locale, review: reviewRequested, planId: returningPlanId });
  const save = useCallback((draft: ChatDraft) => {
    draftRef.current = draft;
    try { localStorage.setItem(chatDraftStorageKey(draft.state.sessionId), JSON.stringify(draft)); setSaveFailed(false); }
    catch { setSaveFailed(true); }
  }, []);
  const resultPath = useCallback((id: string) => pharmacyId ? pharmacyPath(locale, pharmacyId, "reveal", { plan: id })
    : paymentId || draftRef.current?.paymentId || skipHealthScore ? nutritionRevealPath(locale, id) : nutritionHealthScorePath(locale, id), [locale, pharmacyId, paymentId, skipHealthScore]);
  const capture = useQuestionnaireCapture({ locale, paymentId, pharmacyId, returningPlanId, resumeToken,
    skipHealthScore: skipHealthScoreStep, draft: draftRef, save,
    onReady: id => router.replace(resultPath(id)) });
  const runCapture = capture.run;
  const inlineCapture = mode === "calculating" && skipHealthScoreStep;
  const inlineBusy = inlineCapture && capture.status !== "error";
  const captureCopy = getWelcomeCopy(locale);
  const showEmailCapture = skipHealthScore && !pharmacyId;
  const emailInvalid = Boolean(assessmentContactEmailError(contactEmail));

  const commit = useCallback((next: QuestionnaireState) => {
    setState(next);
    const previous = draftRef.current ?? resolveChatDraft({ locale, sessionId: next.sessionId });
    save(updateChatDraft(previous, next));
  }, [locale, save]);

  useEffect(() => {
    const base = resolveChatDraft({ locale, sessionId: sessionRef.current, server: serverDraft });
    let local: ChatDraft | null = null;
    try { local = parseChatDraft(localStorage.getItem(chatDraftStorageKey(base.state.sessionId))); } catch { /* The server draft is still available. */ }
    const draft = resolveChatDraft({ locale, sessionId: sessionRef.current, server: serverDraft, local });
    setContactEmail(draft.contactEmail ?? ""); setEmailTouched(false);
    // Completed legacy captures keep their original receipt and recovery path.
    if (!reviewRequested && ["complete", "completing", "failed"].includes(draft.state.phase)) {
      save(draft); setState(draft.state); setMode("calculating"); void runCapture(draft.state); return;
    }
    let next = migrateScreenState(draft.state);
    const hasAnswers = screenDefinition(next).turns.some(turn => {
      if (turn.kind === "measurements") return ["height", "weight"].some(key => ["known", "unknown"].includes(String(next.answers[`${key}Status`])));
      if (turn.kind === "labs") return Boolean(next.answers.labsHave);
      const value = next.answers[turn.k];
      return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "" && value !== false;
    });
    const hasStarted = hasAnswers || Boolean(draft.state.completedScreens?.length) || Boolean(draft.state.startedAt && !pharmacyId);
    if (reviewRequested) next = { ...next, phase: "active", screenReview: true };
    else if (!hasStarted && pharmacyId) next = { ...openScreen(next, "name"), startedAt: draft.state.startedAt ?? Date.now() };
    save(updateChatDraft(draft, next)); setState(next);
    setMode(reviewRequested || !hasStarted && pharmacyId ? "quiz" : hasStarted ? "resume" : "welcome");
    trackBpmEvent("chat_view", { eventType: "funnel", locale, properties: { channel: "web", questionnaireVersion: SCREEN_QUESTIONNAIRE_VERSION, uxVersion: "v15.5-screens", pharmacyId } });
    if (!hasStarted && pharmacyId) trackBpmEvent("chat_start", { eventType: "funnel", locale, properties: questionnaireAttemptContext(next) });
  }, [locale, pharmacyId, reviewRequested, serverDraft, save, runCapture]);

  useEffect(() => {
    if (mode !== "quiz") return;
    window.scrollTo({ top: 0, behavior: "instant" }); headingRef.current?.focus({ preventScroll: true });
  }, [mode, state?.screenId, state?.screenReview]);
  const progress = state ? screenProgress(state) : 0;
  useEffect(() => {
    if (mode === "quiz") for (const checkpoint of [25, 50, 75]) if (progress >= checkpoint) {
      void trackMetaEvent("QuizProgress", { locale, progress: checkpoint, assessmentAttemptId: state?.sessionId, stage: "assessment" });
    }
  }, [mode, progress, locale, state?.sessionId]);

  function begin(restart = false) {
    if (!state) return;
    const initial = restart ? { ...createScreenState(locale, state.sessionId), planId: state.planId } : state;
    const next = { ...openScreen(initial, restart ? "name" : initial.screenId ?? "name"), startedAt: restart ? Date.now() : initial.startedAt ?? Date.now() };
    commit(next); setMode("quiz"); telemetry.close();
    trackBpmEvent("chat_start", { eventType: "funnel", locale, properties: { ...questionnaireAttemptContext(next),
      ...(newPublicWebJourney ? { journeyVersion: WEB_PRODUCT_JOURNEY_VERSION, channel: "web" } : {}) } });
  }
  function change(key: string, value: unknown) {
    if (!state) return;
    telemetry.activity(); commit(updateScreenAnswer(state, key, value));
  }
  function nextScreen() {
    if (!state || !screenComplete(state, current)) return;
    for (const turn of turns) {
      const display = telemetry.displayFor(turn.k);
      trackBpmEvent(state.answers[turn.k] === undefined && !turn.req ? "chat_skip" : "chat_answer", { eventType: "funnel", locale, planId: returningPlanId,
        properties: { ...questionnaireAttemptContext(state, reviewRequested), ...display, turnKey: turn.k,
          turnIndex: definition!.turns.findIndex(item => item.k === turn.k), sectionIndex: turn.sec,
          valueType: Array.isArray(state.answers[turn.k]) ? "array" : typeof state.answers[turn.k], ...telemetry.stamp() } });
    }
    const next = advanceScreen(state); commit(next); telemetry.close();
    const nextSection = questionnaireScreens.find(screen => screen.id === next.screenId)?.sec;
    if (next.screenReview || nextSection !== current.sec) {
      trackBpmEvent("chat_section_done", { eventType: "funnel", locale, properties: { ...questionnaireAttemptContext(next), sectionIndex: current.sec, ...telemetry.stamp() } });
      if (!next.screenReview) trackBpmEvent("chat_part_break", { eventType: "funnel", locale, properties: { ...questionnaireAttemptContext(next), sectionIndex: nextSection, ...telemetry.stamp() } });
      void fetch("/api/questionnaire/session", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "checkpoint", locale, channel: "web", sectionIndex: current.sec, planId: returningPlanId, state: JSON.stringify(next), bpm: getBpmPayload() }), keepalive: true }).catch(() => {});
    }
  }
  function submit() {
    if (!state || captureInFlight.current || mode === "calculating") return;
    if (!screenQuestionnaireComplete(state)) { const missing = firstMissingScreen(state); if (missing) commit(openScreen(state, missing.id)); return; }
    if (showEmailCapture && emailInvalid) { setEmailTouched(true); emailInputRef.current?.focus(); return; }
    if (showEmailCapture && draftRef.current) {
      const email = normalizeAssessmentContactEmail(contactEmail);
      save({ ...draftRef.current, contactEmail: email, updatedAt: Date.now() });
      setContactEmail(email ?? "");
    }
    const next: QuestionnaireState = { ...state, phase: "complete", completedAt: Date.now() };
    commit(next); telemetry.close(); setMode("calculating");
    trackBpmEvent("chat_complete", { eventType: "funnel", locale, properties: { ...questionnaireAttemptContext(next), completionPct: 100, ...telemetry.stamp() } });
    captureInFlight.current = true;
    void runCapture(next).finally(() => { captureInFlight.current = false; });
  }
  function retryInlineCapture() {
    if (!state || captureInFlight.current || capture.status !== "error") return;
    captureInFlight.current = true;
    void runCapture(state).finally(() => { captureInFlight.current = false; });
  }
  const fallbackEmail = useCallback(async (email: string) => {
    const id = draftRef.current?.captured?.planId;
    if (!id) throw new Error(screenCopy(locale).x.retry);
    const receipt = await requestHealthScoreEmail(id, locale, email);
    if (draftRef.current) save({ ...draftRef.current, contactEmail: email, updatedAt: Date.now() });
    return receipt;
  }, [locale, save]);
  function devFill() { if (state) { commit(fastForwardScreens(state)); setMode("quiz"); } }

  if (mode === "loading" || !state || !definition) return <div className={styles.shell} aria-busy="true" />;
  if (mode === "welcome") return <QuestionnaireWelcome locale={locale} trackingSessionId={newPublicWebJourney ? state.sessionId : undefined} onStart={() => begin()} onDevFastForward={showDevShortcut ? devFill : undefined} />;
  if (mode === "calculating" && !skipHealthScoreStep) return <QuestionnaireCalculating locale={locale} status={capture.status} canOpenResults={capture.status === "ready"}
    onSeeResults={() => { if (capture.planId) router.replace(resultPath(capture.planId)); }}
    onRetryCapture={!capture.planId ? () => { void runCapture(state); } : undefined}
    onRetryAnalysis={capture.planId ? () => { void runCapture(state, true); } : undefined}
    onEmailSubmit={fallbackEmail} />;
  if (mode === "resume") return <div className={styles.shell}><section className={`${styles.card} ${styles.resume}`}>
    <h1 className={styles.title}>{copy.ui.resumeQ}</h1><div className={styles.resumeActions}>
      <button type="button" className={styles.primary} data-testid="questionnaire-resume" onClick={() => { commit(state.screenReview ? { ...state, phase: "active" } : openScreen(state, state.screenId ?? "name", state.screenEdit)); setMode("quiz"); }}>{copy.ui.resumeYes}</button>
      <button type="button" className={styles.secondary} data-testid="questionnaire-restart" onClick={() => begin(true)}>{copy.ui.resumeNo}</button>
    </div></section></div>;

  const section = definition.sections[state.screenReview ? 5 : current.sec];
  const currentIndex = visibleScreens(state).findIndex(screen => screen.id === state.screenId);
  function renderQuestion(turn: TurnDef) {
    const value = state!.answers[turn.k];
    const optional = !turn.req;
    const optionsClass = `${styles.options} ${turn.layout === "stack" ? styles.stack : turn.layout === "grid3" || turn.layout === "food3" ? styles.three : ""} ${turn.kind === "multi" ? styles.multi : ""}`;
    let control;
    if (turn.kind === "text") control = <input id={`question-${turn.k}`} className={styles.input} type="text" value={typeof value === "string" ? value : ""}
      maxLength={turn.k === "firstName" ? ASSESSMENT_FIRST_NAME_MAX_LENGTH : 500} autoComplete={turn.k === "firstName" ? "given-name" : "off"}
      placeholder={turn.ph} onChange={event => change(turn.k, event.target.value)} aria-label={turn.q} />;
    else if (turn.kind === "confirm") control = <label className={styles.check}><input type="checkbox" checked={value === true} onChange={event => change(turn.k, event.target.checked)} /><span>{turn.btn}</span></label>;
    else if (turn.kind === "measurements") control = <><p className={styles.hint}>{x.measurementHint}</p><div className={styles.measurements}>
      {(["height", "weight"] as const).map(key => { const unknown = state!.answers[`${key}Status`] === "unknown"; const val = state!.answers[key];
        const invalid = !unknown && val !== undefined && val !== null && val !== "" && (!Number.isFinite(Number(val)) || Number(val) <= 0);
        return <div key={key}><label htmlFor={key} className={styles.label}>{x[key]} ({key === "height" ? copy.ui.cm : copy.ui.kg})</label>
          <input id={key} className={styles.input} type="number" min="0.1" step="any" inputMode="decimal" disabled={unknown} value={unknown ? "" : String(val ?? "")}
            aria-invalid={invalid} aria-describedby={invalid ? `${key}-error` : undefined} onChange={event => change(key, event.target.value)} />
          <label className={styles.check}><input id={`${key}-unknown`} type="checkbox" checked={unknown} onChange={event => change(`${key}Status`, event.target.checked ? "unknown" : "unanswered")} /><span>{x.notSure}</span></label>
          {invalid ? <p id={`${key}-error`} className={styles.error} role="alert">{x.measurementError}</p> : null}</div>; })}</div></>;
    else if (turn.kind === "swatch") control = <div className={styles.swatches}>{definition!.meta.skinValues.map((skin, index) => <button type="button" key={skin} aria-pressed={value === skin} data-value={skin}
      className={`${styles.option} ${styles.swatch}`} onClick={() => change(turn.k, skin)}><span className={styles.swatchColor} style={{ backgroundColor: definition!.meta.skinColors[index] }} />{x.skinLabels[index]}</button>)}</div>;
    else if (turn.kind === "labs") control = <><div className={`${styles.options} ${styles.stack}`}>
      {[["yes", x.labsYes], ["no", x.labsNo], ["notnow", x.labsNotNow]].map(([answer, label]) => <button key={answer} type="button" className={styles.option} data-value={answer}
        aria-pressed={state!.answers.labsHave === answer} onClick={() => change("labsHave", answer)}><span className={styles.tick} aria-hidden="true">✓</span>{label}</button>)}</div>
      {state!.answers.labsHave === "yes" ? <><p className={styles.hint}>{copy.ui.labsHint}</p>{definition!.meta.labs.map(lab => {
        const labValue = state!.answers[lab.k]; const invalid = labValue !== undefined && labValue !== "" && (!Number.isFinite(Number(labValue)) || Number(labValue) <= 0);
        return <div key={lab.k} className={styles.lab}><label className={styles.label} htmlFor={lab.k}>{lab.n}</label><div className={styles.labRow}>
          <input id={lab.k} className={styles.input} type="number" inputMode="decimal" min="0.0001" step="any" value={String(labValue ?? "")} aria-invalid={invalid} onChange={event => change(lab.k, event.target.value)} />
          <select className={styles.select} aria-label={`${lab.n} — ${x.unit}`} value={String(state!.answers[`unit_${lab.k.slice(4)}`] ?? lab.u[0])} onChange={event => change(`unit_${lab.k.slice(4)}`, event.target.value)}>{lab.u.map(unit => <option key={unit}>{unit}</option>)}</select>
        </div></div>; })}<div className={styles.lab}><label className={styles.label} htmlFor="lab-date">{x.labDate}</label><input id="lab-date" className={styles.input} type="date" max={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })}
          value={String(state!.answers.labDate ?? "")} onChange={event => change("labDate", event.target.value)} /></div>
        {!labsValid(state!) ? <p className={styles.error} role="alert">{String(state!.answers.labDate ?? "") > new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) ? x.dateError : x.labError}</p> : null}</> : null}</>;
    else control = <div className={optionsClass}>{turn.opts?.map(option => {
      const selected = turn.kind === "multi" ? Array.isArray(value) && value.includes(option.v) : value === option.v;
      const disabled = turn.kind === "multi" && !selected && Boolean(turn.max && Array.isArray(value) && value.length >= turn.max);
      return <button type="button" key={option.v} className={styles.option} aria-pressed={selected} disabled={disabled} data-value={option.v}
        onClick={() => { if (turn.kind === "multi") { telemetry.activity(); commit(toggleScreenChoice(state!, turn, option.v)); } else change(turn.k, option.v); }}>
        <span className={styles.tick} aria-hidden="true">✓</span><span>{option.short ?? option.l}</span></button>; })}</div>;
    return <fieldset key={turn.k} className={styles.question} data-question={turn.k}>
      <legend className={styles.questionTitle}>{turn.emoji ? `${turn.emoji} ` : ""}{turn.q}{!optional ? <span className="sr-only"> {x.required}</span> : null}</legend>
      {turn.why ? <details className={styles.why}><summary>{x.whyWeAsk}</summary><p>{turn.why}</p></details> : null}{control}
    </fieldset>;
  }
  function answerLabel(turn: TurnDef) {
    const value = state!.answers[turn.k];
    if (turn.kind === "measurements") return (["height", "weight"] as const).map(key => `${x[key]}: ${state!.answers[`${key}Status`] === "unknown" ? x.notSure : state!.answers[key] ?? x.notAnswered}${state!.answers[`${key}Status`] === "known" ? key === "height" ? " cm" : " kg" : ""}`).join(" · ");
    if (turn.kind === "labs") return state!.answers.labsHave === "no" ? x.labsNo : state!.answers.labsHave === "notnow" ? x.labsNotNow : definition!.meta.labs.filter(lab => state!.answers[lab.k]).map(lab => `${lab.n}: ${state!.answers[lab.k]} ${state!.answers[`unit_${lab.k.slice(4)}`] ?? lab.u[0]}`).join(" · ") || x.notAnswered;
    if (turn.kind === "confirm") return value === true ? x.consentDone : x.notAnswered;
    if (turn.kind === "swatch") return x.skinLabels[Number(value) - 1] ?? x.notAnswered;
    if (Array.isArray(value)) return value.map(answer => turn.opts?.find(option => option.v === answer)?.l ?? answer).join(", ");
    return turn.opts?.find(option => option.v === value)?.l ?? (value ? String(value) : x.notAnswered);
  }
  return <div className={styles.shell} data-testid="chat-questionnaire" data-screen={state.screenReview ? "review" : current.id} onPointerDown={telemetry.activity} onKeyDown={telemetry.activity}>
    <div className={styles.progress} data-testid="quiz-progress-header"><div className={styles.progressInner}>
      <div className={styles.progressText}><span>{section.eyebrow} · {progress}%</span><span aria-live="polite">{saveFailed ? x.saveUnavailable : x.savedTag}</span></div>
      <div className={styles.bar} role="progressbar" aria-label={x.progressLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className={styles.fill} style={{ width: `${progress}%` }} /></div>
    </div></div>
    <div className={`${styles.main} ${current.id === "name" && !state.screenReview ? styles.name : ""}`}>
      <header className={styles.heading}><p className={styles.eyebrow}>{section.eyebrow}</p><h1 ref={headingRef} tabIndex={-1} className={styles.title}>{state.screenReview ? x.reviewTitle : current.id === "name" ? x.introTitle : section.title}</h1>
        {current.id !== "name" && !state.screenReview ? <p className={styles.description}>{section.desc}</p> : null}</header>
      {state.screenReview || current.nong ? <div className={styles.nong}><Image width={84} height={120} alt="" src={`/assets/questionnaire/v15-5/nong-${state.screenReview ? "wai" : current.nong === "safety" ? "reassuring" : current.nong === "final" ? "sincere" : "open"}.webp`} />
        <p>{state.screenReview ? x.summaryText : current.id === "name" ? copy.ui.introHi : current.nong === "final" ? x.finalDetails.replace("{n}", "") : section.desc}</p></div> : null}
      <fieldset disabled={inlineCapture} style={{ display: "contents" }}>
      {state.screenReview ? <div data-testid="questionnaire-review">
        <section className={`${styles.card} ${styles.question}`}><h2 className={styles.questionTitle}>{definition.turns.find(turn => turn.k === "disclosure")!.q}</h2>
          <label className={styles.check}><input type="checkbox" data-testid="questionnaire-disclosure" checked={state.answers.disclosure === true} onChange={event => change("disclosure", event.target.checked)} /><span>{x.disclosureLabel}</span></label>
          <p className={styles.hint}>{x.reviewHint}</p></section>
        <details className={`${styles.card} ${styles.review}`} open={reviewRequested}><summary>{x.reviewExpand}</summary>
          {definition.sections.map((group, index) => <section key={index} className={styles.reviewGroup}><h2 className={styles.label}>{group.title}</h2>
            {questionnaireScreens.filter(screen => screen.sec === index).flatMap(screen => screenTurns(state, screen, true).map(turn => <div className={styles.reviewRow} key={turn.k}>
              <div><strong>{turn.q}</strong><p>{answerLabel(turn)}</p>{state.autoFilled.includes(turn.k) ? <p>{x.inferred}</p> : null}</div>
              <button type="button" className={styles.link} data-edit-screen={screen.id} aria-label={`${x.edit}: ${turn.q}`} onClick={() => { telemetry.close(); commit(openScreen(state, screen.id, true)); }}>{x.edit}</button>
            </div>))}</section>)}
        </details><p className={styles.hint}>{x.unknownNotice}</p>
        {showEmailCapture ? <section className={`${styles.card} ${styles.emailCard}`} aria-labelledby="questionnaire-email-title" data-testid="questionnaire-email-card">
          <h2 id="questionnaire-email-title" className={styles.questionTitle}>{x.emailTitle}</h2>
          <p id="questionnaire-email-hint" className={styles.hint}>{x.emailHint}</p>
          <label className={styles.label} htmlFor="questionnaire-contact-email">{x.emailLabel}</label>
          <input ref={emailInputRef} id="questionnaire-contact-email" className={styles.input} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            maxLength={254} placeholder={x.emailPlaceholder} value={contactEmail} aria-invalid={emailTouched && emailInvalid}
            aria-describedby={`questionnaire-email-hint${emailTouched && emailInvalid ? " questionnaire-email-error" : ""}`}
            onBlur={() => setEmailTouched(true)} onChange={event => {
              const email = event.target.value; setContactEmail(email);
              if (draftRef.current) save({ ...draftRef.current, contactEmail: email, updatedAt: Date.now() });
            }} />
          {emailTouched && emailInvalid ? <p id="questionnaire-email-error" className={styles.error} role="alert">{x.emailError}</p> : null}
        </section> : null}
      </div> : <><div className={styles.card} data-testid="question-answers">{turns.map(renderQuestion)}</div>
        {current.id === "diet" && state.autoFilled.length ? <div className={`${styles.card} ${styles.review}`}><p className={styles.hint}>{x.inferred}</p>
          {state.autoFilled.map(key => { const turn = definition.turns.find(item => item.k === key)!; return <p key={key} className={styles.hint}>{turn.q} — {answerLabel(turn)}</p>; })}</div> : null}</>}
      {showDevShortcut ? <button type="button" className={styles.dev} data-testid="dev-fill-questionnaire" onClick={devFill}>{x.devFill}</button> : null}
      </fieldset>
      {inlineCapture && capture.status === "error" ? <p className={styles.error} role="alert" data-testid="questionnaire-capture-error">{captureCopy.calcCaptureFailed}</p> : null}
    </div>
    <div className={styles.footer}><div className={styles.footerInner}>
      {currentIndex > 0 || state.screenReview || state.screenEdit ? <button type="button" data-testid="questionnaire-back" className={styles.secondary} disabled={inlineCapture} onClick={() => { telemetry.close(); commit(previousScreen(state)); }}>{x.back}</button> : null}
      {inlineCapture ? <button type="button" data-testid="questionnaire-submit" className={styles.primary} disabled={inlineBusy} aria-busy={inlineBusy} onClick={retryInlineCapture}>{inlineBusy ? combinedCopy[locale].saving : captureCopy.calcRetryCapture}</button>
        : state.screenReview ? <button type="button" data-testid="questionnaire-submit" className={styles.primary} disabled={!screenQuestionnaireComplete(state)} onClick={submit}>{x.submit}</button>
        : <button type="button" data-testid="questionnaire-next" className={styles.primary} disabled={!screenComplete(state, current)} onClick={nextScreen}>{currentIndex === visibleScreens(state).length - 1 ? x.reviewBtn : x.next}</button>}
    </div></div>
  </div>;
}
