"use client";

import { useMemo } from "react";
import type { Locale } from "@/lib/i18n";
import { NongPoseImage } from "@/components/chat-questionnaire/nong-pose-image";
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
  onDevFastForward?: () => void;
}>;

/**
 * Welcome content only — site TitleBar owns brand + language switching
 * so we do not double the header chrome on /nutrition/quiz.
 */
export function QuestionnaireWelcome({
  locale,
  onStart,
  onDevFastForward
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
              <NongPoseImage
                alt={copy.mascotAlt}
                className="mn-quiz-welcome__mascot"
                height={320}
                pose="celebrate"
                width={320}
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
                <div className="mn-quiz-welcome__stepicon" aria-hidden>
                  <svg viewBox="0 0 24 24">
                    <path d="M9 5h6M9 9h6M9 13h4" />
                    <rect x="5" y="3" width="14" height="18" rx="2" />
                    <path d="M8 3.5V2m8 1.5V2" />
                  </svg>
                </div>
                <strong>{copy.s1t}</strong>
                <small>{copy.s1d}</small>
              </div>
            </article>
            <i aria-hidden>→</i>
            <article>
              <span>2</span>
              <div>
                <div className="mn-quiz-welcome__stepicon" aria-hidden>
                  <svg viewBox="0 0 24 24">
                    <path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7" />
                    <path d="M3 20h18" />
                  </svg>
                </div>
                <strong>{copy.s2t}</strong>
                <small>{copy.s2d}</small>
              </div>
            </article>
            <i aria-hidden>→</i>
            <article>
              <span>3</span>
              <div>
                <div className="mn-quiz-welcome__stepicon" aria-hidden>
                  <svg viewBox="0 0 24 24">
                    <path d="M12 3l1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" />
                    <path d="M18.5 13.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
                    <path d="M5 14l.8 2.5L8.3 17l-2.5.8L5 20.3l-.8-2.5L1.7 17l2.5-.5L5 14Z" />
                  </svg>
                </div>
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
          {onDevFastForward ? (
            <button
              type="button"
              className="mn-quiz-welcome__dev"
              data-testid="dev-fill-questionnaire"
              onClick={onDevFastForward}
            >
              Fill questionnaire (DEV)
            </button>
          ) : null}
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
