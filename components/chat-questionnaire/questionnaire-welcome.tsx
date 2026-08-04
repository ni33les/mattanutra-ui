"use client";

import { useMemo } from "react";
import type { Locale } from "@/lib/i18n";
import { nongPoseSrc } from "@/lib/questionnaire/poses";
import welcomePack from "@/content/questionnaire/v6/welcome.json";

export type WelcomeLang = "en" | "th" | "zh";

type WelcomeCopy = (typeof welcomePack)["en"];

function welcomeKeyForLocale(locale: Locale): WelcomeLang {
  if (locale === "th") {
    return "th";
  }

  if (locale === "zh-CN") {
    return "zh";
  }

  return "en";
}

export function getWelcomeCopy(locale: Locale): WelcomeCopy {
  return welcomePack[welcomeKeyForLocale(locale)] as WelcomeCopy;
}

type QuestionnaireWelcomeProps = Readonly<{
  locale: Locale;
  onStart: () => void;
}>;

/**
 * Welcome content only — site TitleBar owns brand + language switching
 * so we do not double the header chrome on /nutrition/quiz.
 */
export function QuestionnaireWelcome({
  locale,
  onStart
}: QuestionnaireWelcomeProps) {
  const activeLang = welcomeKeyForLocale(locale);
  const copy = useMemo(() => getWelcomeCopy(locale), [locale]);
  const showZhNotice = activeLang === "zh";

  return (
    <section
      className="mn-quiz-welcome"
      aria-labelledby="mn-quiz-welcome-title"
      data-testid="questionnaire-welcome"
    >
      <div className="mn-quiz-welcome__shell">
        <main className="mn-quiz-welcome__card">
          <section className="mn-quiz-welcome__hero">
            <div className="mn-quiz-welcome__mascot-wrap">
              <div className="mn-quiz-welcome__glow" aria-hidden />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="mn-quiz-welcome__mascot"
                src={nongPoseSrc("celebrate")}
                alt={copy.mascotAlt}
              />
            </div>
            <div className="mn-quiz-welcome__copy">
              <div className="mn-quiz-welcome__badge">{copy.badge}</div>
              <h1
                id="mn-quiz-welcome-title"
                className="mn-quiz-welcome__headline"
                dangerouslySetInnerHTML={{ __html: copy.headlineHtml }}
              />
              <p className="mn-quiz-welcome__brandline">{copy.brandline}</p>
              <p className="mn-quiz-welcome__lede">{copy.lede}</p>
            </div>
          </section>

          <section className="mn-quiz-welcome__trust" aria-label={copy.trustAria}>
            <article>
              <span className="mn-quiz-welcome__icon" aria-hidden>
                ◷
              </span>
              <div>
                <strong>{copy.t1a}</strong>
                <small>{copy.t1b}</small>
              </div>
            </article>
            <article>
              <span className="mn-quiz-welcome__icon" aria-hidden>
                ⌂
              </span>
              <div>
                <strong>{copy.t2a}</strong>
                <small>{copy.t2b}</small>
              </div>
            </article>
            <article>
              <span className="mn-quiz-welcome__icon" aria-hidden>
                ✚
              </span>
              <div>
                <strong>{copy.t3a}</strong>
                <small>{copy.t3b}</small>
              </div>
            </article>
          </section>

          <section className="mn-quiz-welcome__journey" aria-label={copy.journeyAria}>
            <article>
              <span>1</span>
              <div>
                <strong>{copy.s1t}</strong>
                <small>{copy.s1d}</small>
              </div>
            </article>
            <i aria-hidden>→</i>
            <article>
              <span>2</span>
              <div>
                <strong>{copy.s2t}</strong>
                <small>{copy.s2d}</small>
              </div>
            </article>
            <i aria-hidden>→</i>
            <article>
              <span>3</span>
              <div>
                <strong>{copy.s3t}</strong>
                <small>{copy.s3d}</small>
              </div>
            </article>
          </section>

          <div className="mn-quiz-welcome__precision">
            <span aria-hidden>◎</span>
            <p>{copy.precision}</p>
          </div>

          <p className="mn-quiz-welcome__anticipation">{copy.anticipation}</p>
          <button
            type="button"
            className="mn-quiz-welcome__cta"
            data-testid="questionnaire-welcome-cta"
            onClick={onStart}
          >
            <span>{copy.cta}</span>
            <span className="mn-quiz-welcome__cta-arrow" aria-hidden>
              →
            </span>
          </button>
          <p className="mn-quiz-welcome__meta">{copy.meta}</p>
          <p className="mn-quiz-welcome__private">{copy.private}</p>
          {showZhNotice ? (
            <p className="mn-quiz-welcome__notice" role="status">
              {copy.zhNotice}
            </p>
          ) : null}
        </main>
      </div>
    </section>
  );
}
