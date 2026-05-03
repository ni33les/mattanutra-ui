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
    subtitle: "Know exactly what your body needs",
    subtitleAccent: "your body needs",
    subtitleMuted: "no guesswork",
    followOn:
      "AI powered plans for supplements, sleep, nutrition and more - Tailored to YOU",
    followOnAccent: "YOU",
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
      subtitle: "Sepa exactamente lo que su cuerpo necesita",
      subtitleAccent: "su cuerpo necesita",
      subtitleMuted: "sin conjeturas",
      followOn:
        "Planes con IA para suplementos, sueño, nutrición y más - adaptados a TI",
      followOnAccent: "TI",
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
      subtitle: "รู้ชัดว่าร่างกายของคุณต้องการอะไร",
      subtitleAccent: "ร่างกายของคุณต้องการอะไร",
      subtitleMuted: "ไม่ต้องเดา",
      followOn:
        "แผนด้วย AI สำหรับอาหารเสริม การนอนหลับ โภชนาการ และอื่นๆ - ออกแบบเพื่อคุณ",
      followOnAccent: "คุณ",
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
