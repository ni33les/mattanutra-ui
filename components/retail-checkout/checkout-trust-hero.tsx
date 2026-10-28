import Image from "next/image";
import { House, ShieldCheck, Stethoscope } from "lucide-react";
import copy from "@/content/checkout/web.json";
import type { Locale } from "@/lib/i18n";
import styles from "./checkout-trust-hero.module.css";

export function CheckoutPackaging({ locale, compact = false }: Readonly<{ locale: Locale; compact?: boolean }>) {
  const labels = copy[locale];
  return <figure className={`${styles.packaging}${compact ? ` ${styles.compactPackaging}` : ""}`}>
    <Image alt={labels.packagingAlt} src="/healthscore/v8-4/box.webp" width={1536} height={1024}
      sizes={compact ? "(max-width: 700px) 85vw, 280px" : "(max-width: 700px) 90vw, 430px"} priority={!compact} />
    <figcaption>{labels.packagingNote}</figcaption>
  </figure>;
}

export function CheckoutPharmacyCare({ locale, retailerName, compact = false }: Readonly<{
  locale: Locale; retailerName: string | null; compact?: boolean;
}>) {
  const labels = copy[locale];
  // The portrait belongs to Delight; other quotes must retain their actual supplier.
  const isDelight = /\bdelight\b/i.test(retailerName ?? "");
  return <div className={`${styles.care}${compact ? ` ${styles.compactCare}` : ""}`}>
    {isDelight ? <>
      <div className={styles.portrait}><Image alt="" src="/reveal/khun_dream.webp" width={64} height={64} /></div>
      <div className={styles.identity}><strong>{labels.pharmacistName}</strong><span>{labels.pharmacistRole}</span></div>
    </> : <div className={styles.identity}>
      <strong className={styles.genericCare}><Stethoscope aria-hidden="true" />{labels.careTitle}</strong>
      {retailerName ? <span>{retailerName}</span> : null}
    </div>}
    <p>{labels.careBody}</p>
  </div>;
}

export function CheckoutTrustHero({
  locale,
  retailerName
}: Readonly<{ locale: Locale; retailerName: string | null }>) {
  const labels = copy[locale];

  return (
    <section className={styles.hero} lang={locale} aria-labelledby="checkout-trust-title">
      <div className={styles.main}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{labels.heroEyebrow}</p>
          <h2 id="checkout-trust-title">
            {labels.heroTitle}<em>{labels.heroAccent}</em>
          </h2>
          <p className={styles.description}>
            {labels.fulfilledBy} <strong>{retailerName || labels.partnerPharmacy}</strong>.
            {" "}{labels.fulfillmentBody}
          </p>
          <ul className={styles.benefits}>
            <li><ShieldCheck aria-hidden="true" />{labels.pharmacyFulfilled}</li>
            <li><House aria-hidden="true" />{labels.homeDelivered}</li>
          </ul>
        </div>
        <CheckoutPackaging locale={locale} />
      </div>
      <CheckoutPharmacyCare locale={locale} retailerName={retailerName} />
    </section>
  );
}
