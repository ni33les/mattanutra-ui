"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Locale } from "@/lib/i18n";
import { nutritionQuizPath } from "@/lib/nutrition-paths";
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

function localeForWelcomeLang(lang: WelcomeLang): Locale {
  if (lang === "th") {
    return "th";
  }

  if (lang === "zh") {
    return "zh-CN";
  }

  return "en";
}

export function getWelcomeCopy(locale: Locale): WelcomeCopy {
  return welcomePack[welcomeKeyForLocale(locale)] as WelcomeCopy;
}

type QuestionnaireWelcomeProps = Readonly<{
  locale: Locale;
  onStart: () => void;
  paymentId?: string;
  returningPlanId?: string;
  resumeToken?: string;
}>;

function quizHref(
  locale: Locale,
  paymentId?: string,
  returningPlanId?: string,
  resumeToken?: string
) {
  return nutritionQuizPath(locale, returningPlanId, {
    payment: paymentId,
    resume: resumeToken
  });
}

export function QuestionnaireWelcome({
  locale,
  onStart,
  paymentId,
  returningPlanId,
  resumeToken
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
        <header className="mn-quiz-welcome__top">
          <Link
            className="mn-quiz-welcome__brand"
            href={`/${locale}`}
            aria-label={copy.brandHomeAria}
          >
            <span className="mn-quiz-welcome__wordmark">
              Matta<b>Nutra</b>
            </span>
          </Link>
          <div className="mn-quiz-welcome__lang" role="group" aria-label={copy.langAria}>
            {(
              [
                { lang: "en" as const, label: "EN" },
                { lang: "th" as const, label: "ไทย" },
                { lang: "zh" as const, label: "中文" }
              ] as const
            ).map(({ lang, label }) => {
              const targetLocale = localeForWelcomeLang(lang);
              const href = quizHref(
                targetLocale,
                paymentId,
                returningPlanId,
                resumeToken
              );
              const isActive = activeLang === lang;

              return (
                <Link
                  key={lang}
                  href={href}
                  className={`mn-quiz-welcome__lang-btn${isActive ? " is-active" : ""}`}
                  aria-current={isActive ? "true" : undefined}
                  prefetch={false}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </header>

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
