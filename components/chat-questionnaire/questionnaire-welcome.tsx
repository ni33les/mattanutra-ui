"use client";

import Image from "next/image";
import { ArrowRight, Check, Clock3, ShieldCheck, Stethoscope } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import quizStartPack from "@/content/questionnaire/quiz-start.json";
import welcomePack from "@/content/questionnaire/v6/welcome.json";
import styles from "./questionnaire-welcome.module.css";

export type WelcomeLang = "en" | "th" | "zh";
type WelcomeCopy = (typeof welcomePack)["en"];

function welcomeKeyForLocale(locale: Locale): WelcomeLang {
  return locale === "zh-CN" ? "zh" : locale;
}

// Capture, recovery and review screens continue to use their existing copy pack.
export function getWelcomeCopy(locale: Locale): WelcomeCopy {
  return welcomePack[welcomeKeyForLocale(locale)] as WelcomeCopy;
}

type QuizStartCopy = Readonly<{
  eyebrow: string;
  free: string;
  headline: string;
  headlineAccent: string;
  lede: string;
  cta: string;
  duration: string;
  obligation: string;
  subscription: string;
  physician: string;
  products: string;
  trustAria: string;
  mascotAlt: string;
  languageNotice: string;
}>;

const quizStartCopy: Readonly<Record<Locale, QuizStartCopy>> = quizStartPack;

type QuestionnaireWelcomeProps = Readonly<{
  locale: Locale;
  onStart: () => void;
  onDevFastForward?: () => void;
}>;

/** The route owns the standard platform header, locale switcher and footer. */
export function QuestionnaireWelcome({
  locale,
  onStart,
  onDevFastForward
}: QuestionnaireWelcomeProps) {
  const copy = quizStartCopy[locale];

  return (
    <section
      className={styles.welcome}
      lang={locale}
      aria-labelledby="mn-quiz-welcome-title"
      data-testid="questionnaire-welcome"
    >
      <div className={styles.screen}>
        <div className={styles.leaves} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className={styles.hero}>
          <Image
            alt={copy.mascotAlt}
            className={styles.mascot}
            height={270}
            width={213}
            src="/assets/questionnaire/v15-5/nong-celebrate.webp"
            priority
            unoptimized
          />
          <p className={styles.eyebrow}>
            {copy.eyebrow} <strong>{copy.free}</strong>
          </p>
          <h1 id="mn-quiz-welcome-title" className={styles.headline}>
            {copy.headline}
            <em>{copy.headlineAccent}</em>
          </h1>
          <p className={styles.lede}>{copy.lede}</p>
          <button
            type="button"
            className={styles.cta}
            data-cta="start"
            data-testid="questionnaire-welcome-cta"
            onClick={onStart}
          >
            <span>{copy.cta}</span>
            <ArrowRight aria-hidden="true" strokeWidth={2.3} />
          </button>
          <ul className={styles.promise}>
            <li><Clock3 aria-hidden="true" /><span>{copy.duration}</span></li>
            <li><Check aria-hidden="true" /><span>{copy.obligation}</span></li>
            <li><Check aria-hidden="true" /><span>{copy.subscription}</span></li>
          </ul>
          <div className={styles.trust} aria-label={copy.trustAria}>
            <span><Stethoscope aria-hidden="true" /><span>{copy.physician}</span></span>
            <span><ShieldCheck aria-hidden="true" /><span>{copy.products}</span></span>
          </div>
          {copy.languageNotice ? (
            <p className={styles.notice} role="status">{copy.languageNotice}</p>
          ) : null}
        </div>
        <span className={styles.scrollHint} aria-hidden="true" />
      </div>
      {onDevFastForward ? (
        <div className={styles.devArea}>
          <button
            type="button"
            className={styles.dev}
            data-testid="dev-fill-questionnaire"
            onClick={onDevFastForward}
          >
            Fill questionnaire (DEV)
          </button>
        </div>
      ) : null}
    </section>
  );
}
