import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { pharmacyCopy } from "@/lib/pharmacy-copy";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import styles from "./landing.module.css";

const headlines = {
  en: ["Stop guessing.", "Start knowing."],
  th: ["เลิกเดา", "เริ่มรู้จริง"],
  "zh-CN": ["不再猜测，", "开始了解。"]
};

export function PharmacyLanding({ locale, slug, name }: { locale: Locale; slug: string; name: string }) {
  const copy = pharmacyCopy[locale];
  const thai = locale === "th";
  return <div className={styles.landing} lang={locale} data-testid="pharmacy-landing" aria-label={name}>
    <section className="hero-section" aria-labelledby="pharmacy-page-title">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      {/* The exact handoff artwork; explicit dimensions preserve its original inline geometry. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/library/nong/nong-celebrate.webp" width={118} height={118} className="nong-matta"
        alt={thai ? "น้อง Matta ต้อนรับคุณ" : locale === "en" ? "Nong Matta welcoming you" : "Nong Matta 欢迎您"} />
      {!thai && <p className="eyebrow">{copy.eyebrow}</p>}
      <h1 id="pharmacy-page-title">{headlines[locale][0]}<br /><em>{headlines[locale][1]}</em></h1>
      {thai ? <div className="promise-card" aria-label="สิ่งที่คุณจะได้รับจากแบบประเมิน">
        <p className="intro-copy">ไม่แน่ใจว่าจะเลือกอาหารเสริมตัวไหนดี?</p>
        <p className="simple-step">ตอบคำถามเกี่ยวกับสุขภาพและการใช้ชีวิตของคุณ</p>
        <p className="simple-result">MattaNutra จะช่วยเลือกอาหารเสริมที่เหมาะกับคุณโดยเฉพาะ</p>
        <p className="hero-free">ฟรี</p>
      </div> : <>
        <p className="intro-copy">{copy.intro}</p>
        {locale === "en" ? <>
          <p className="science-copy">MattaNutra considers your answers alongside scientific evidence on <strong>160+ supplement ingredients</strong>, built-in safety checks, thoughtfully designed algorithms and AI-assisted analysis.</p>
          <p className="result-copy">The result is a supplement plan built around you.</p>
        </> : <p className="science-copy">{copy.body}</p>}
      </>}
      <Link className="primary-cta" href={pharmacyPath(locale, slug, "quiz")}>
        <span className="cta-label"><span>{copy.start}</span>{" "}<span>→</span></span>
      </Link>
      <div className="commitment-line" aria-label={thai ? "รายละเอียดแบบประเมิน" : locale === "en" ? "Assessment details" : "评估详情"}>
        <span>{copy.thorough}</span>{!thai && <span className="free-note">{copy.free}</span>}
      </div>
      <p className="privacy-line">{copy.privacy}</p>
      <div className="trust-line" aria-label={thai ? "เหตุผลที่คุณไว้วางใจ MattaNutra ได้" : locale === "en" ? "Why trust MattaNutra" : "信任 MattaNutra 的理由"}>
        {[copy.founded, copy.science, copy.registered].map(text => <span key={text}>{text}</span>)}
      </div>
    </section>
  </div>;
}
