export const locales = ["en", "es", "th"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeLabels: Record<Locale, string> = {
  en: "EN",
  es: "ES",
  th: "TH"
};

const en = {
  meta: {
    title: "Healthspan",
    description: "A blank Healthspan canvas built on Next.js and Tailwind CSS."
  },
  hero: {
    eyebrow: "Healthspan",
    title: "Hello",
    subtitle:
      "We create personalized, science-backed supplement protocols built specifically for your goals — with the right supplements at the exact dose your body needs.",
    followOn: "No guesswork, bespoke nutrition",
    cta: "Design your future health",
    stack: "Next.js · TypeScript · Tailwind"
  }
};

type Dictionary = typeof en;

const dictionaries: Record<Locale, Dictionary> = {
  en,
  es: {
    meta: {
      title: "Healthspan",
      description: "Un lienzo limpio de Healthspan creado con Next.js y Tailwind CSS."
    },
    hero: {
      eyebrow: "Healthspan",
      title: "Hola mundo.",
      subtitle: "Un lienzo limpio de Next.js para la experiencia Healthspan.",
      followOn: "",
      cta: "Listo para desplegar",
      stack: "Next.js · TypeScript · Tailwind"
    }
  },
  th: {
    meta: {
      title: "Healthspan",
      description:
        "เราสร้างโปรโตคอลอาหารเสริมเฉพาะบุคคลที่อิงหลักวิทยาศาสตร์ เพื่อเป้าหมายสุขภาพของคุณ"
    },
    hero: {
      eyebrow: "Healthspan",
      title: "Hello",
      subtitle:
        "เราสร้างโปรโตคอลอาหารเสริมเฉพาะบุคคลที่อิงหลักวิทยาศาสตร์ เพื่อเป้าหมายของคุณโดยเฉพาะ พร้อมอาหารเสริมที่เหมาะสมในปริมาณที่ร่างกายต้องการ",
      followOn: "ไม่ต้องเดา โภชนาการที่ออกแบบเฉพาะคุณ",
      cta: "ออกแบบสุขภาพอนาคตของคุณ",
      stack: "Next.js · TypeScript · Tailwind"
    }
  }
};

export function isLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}
