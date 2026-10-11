"use client";

import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import welcomePack from "@/content/questionnaire/v6/welcome.json";
import styles from "./questionnaire-welcome.module.css";

export type WelcomeLang = "en" | "th" | "zh";
type WelcomeCopy = (typeof welcomePack)["en"];

function welcomeKeyForLocale(locale: Locale): WelcomeLang {
  return locale === "zh-CN" ? "zh" : locale;
}

export function getWelcomeCopy(locale: Locale): WelcomeCopy {
  return welcomePack[welcomeKeyForLocale(locale)] as WelcomeCopy;
}

type QuestionnaireWelcomeProps = Readonly<{
  locale: Locale;
  onStart: () => void;
  onDevFastForward?: () => void;
}>;

/** The existing TitleBar owns the logo and language switch, including journey parameters. */
export function QuestionnaireWelcome({
  locale,
  onStart,
  onDevFastForward
}: QuestionnaireWelcomeProps) {
  const copy = getWelcomeCopy(locale);

  return (
    <section
      className={styles.welcome}
      lang={locale}
      aria-labelledby="mn-quiz-welcome-title"
      data-testid="questionnaire-welcome"
    >
      <div className={styles.hero}>
        <Image
          alt={copy.mascotAlt}
          className={styles.mascot}
          height={118}
          width={118}
          src="/assets/questionnaire/v15-5/nong-celebrate.webp"
          priority
          unoptimized
        />
        <p className={styles.eyebrow}>{copy.badge}</p>
        <h1
          id="mn-quiz-welcome-title"
          className={styles.headline}
          dangerouslySetInnerHTML={{ __html: copy.headlineHtml }}
        />
        <p className={styles.intro}>{copy.brandline}</p>
        <p className={styles.science} dangerouslySetInnerHTML={{ __html: copy.ledeHtml }} />
        <p className={styles.result}>{copy.result}</p>
        <button
          type="button"
          className={styles.cta}
          data-testid="questionnaire-welcome-cta"
          onClick={onStart}
        >
          <span>{copy.cta}</span>
          <span aria-hidden="true">→</span>
        </button>
        <div className={styles.commitment}>
          <span>{copy.metaA}</span>
          <span>{copy.metaB}</span>
          <strong>{copy.free}</strong>
        </div>
        <p className={styles.privacy}>{copy.private}</p>
        <div className={styles.trust} aria-label={copy.trustAria}>
          {[copy.trust1, copy.trust2, copy.trust3].map((text) => <span key={text}>{text}</span>)}
        </div>
        {locale === "zh-CN" ? <p className={styles.notice} role="status">{copy.zhNotice}</p> : null}
        {onDevFastForward ? (
          <button
            type="button"
            className={styles.dev}
            data-testid="dev-fill-questionnaire"
            onClick={onDevFastForward}
          >
            Fill questionnaire (DEV)
          </button>
        ) : null}
      </div>
      <footer className={styles.footer}>
        <p className={styles.availability}>
          <strong>{copy.availNow}</strong> {copy.countries}
          {" · "}<strong>{copy.availSoon}</strong> {copy.soon}
        </p>
        <div className={styles.legal}>
          <p>{copy.legal}</p>
          <span dangerouslySetInnerHTML={{ __html: copy.copyright }} />
        </div>
        <nav className={styles.links} aria-label={copy.privacyFooterLink}>
          <Link href={`/${locale}/privacy`}>{copy.privacyFooterLink}</Link>
          <Link href={`/${locale}/terms`}>{copy.termsLink}</Link>
        </nav>
      </footer>
    </section>
  );
}
