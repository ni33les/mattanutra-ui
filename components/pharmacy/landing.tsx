import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import landingPack from "@/content/questionnaire/v15-5/pharmacy-landing.json";
import welcomePack from "@/content/questionnaire/v6/welcome.json";
import styles from "./landing.module.css";

type PharmacyLandingProps = Readonly<{
  locale: Locale;
  slug: string;
  name: string;
  query?: Record<string, string | undefined>;
}>;

export function PharmacyLanding({ locale, slug, name, query = {} }: PharmacyLandingProps) {
  const language = locale === "zh-CN" ? "zh" : locale;
  const copy = landingPack[language];
  const legal = welcomePack[language];
  const quizPath = pharmacyPath(locale, slug, "quiz", query);

  return (
    <div className={styles.landing} lang={locale} data-testid="pharmacy-landing" aria-label={name}>
      <section className={styles.card} aria-labelledby="pharmacy-page-title">
        <div className={styles.hero}>
          <Image
            src="/assets/questionnaire/v15-5/nong-pharmacy-celebrate.webp"
            width={180}
            height={228}
            className={styles.mascot}
            alt={copy.mascotAlt}
            priority
            unoptimized
          />
          <div>
            {copy.eyebrow ? <p className={styles.eyebrow}>{copy.eyebrow}</p> : null}
            <h1 id="pharmacy-page-title" dangerouslySetInnerHTML={{ __html: copy.headline }} />
          </div>
        </div>
        <div className={styles.promise}>
          {copy.promise.map(([kind, text]) => (
            <p key={kind} className={styles[kind]} dangerouslySetInnerHTML={{ __html: text }} />
          ))}
        </div>
        <div className={styles.action}>
          <Link
            className={styles.cta}
            href={quizPath}
            data-bpm-event="pharmacy_landing_assessment_clicked"
            data-bpm-label={copy.cta}
            data-bpm-target={quizPath}
            data-bpm-type="funnel"
          >
            <span>{copy.cta}</span><span aria-hidden="true">→</span>
          </Link>
          <div className={styles.commitment}>
            {copy.commitment.map((text) => text === "FREE" || text === "ฟรี" || text === "免费"
              ? <strong key={text}>{text}</strong>
              : <span key={text}>{text}</span>)}
          </div>
          <p className={styles.privacy}>{copy.privacy}</p>
          <div className={styles.trust}>
            {copy.trust.map((text) => <span key={text}>{text}</span>)}
          </div>
          {locale === "zh-CN" ? <p className={styles.notice} role="status">{legal.zhNotice}</p> : null}
        </div>
      </section>
      <footer className={styles.footer}>
        <p>
          <strong>{copy.availNow}</strong> {copy.countries.join(" · ")}
          {" · "}<strong>{copy.availSoon}</strong> {copy.soon.join(" · ")}
        </p>
        <nav aria-label={legal.privacyFooterLink}>
          <Link href={`/${locale}/privacy`}>{legal.privacyFooterLink}</Link>
          <Link href={`/${locale}/terms`}>{legal.termsLink}</Link>
        </nav>
      </footer>
    </div>
  );
}
