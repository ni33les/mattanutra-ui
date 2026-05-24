export type LocaleCode = string;
export type LocaleDirection = "ltr" | "rtl";

export type SiteLocale = Readonly<{
  code: LocaleCode;
  direction: LocaleDirection;
  fallbackLocale: LocaleCode | null;
  htmlLang: string;
  isIndexable: boolean;
  isPublic: boolean;
  label: string;
  nativeLabel: string;
  sortOrder: number;
}>;

export const siteLocaleRegistry = [
  {
    code: "en",
    direction: "ltr",
    fallbackLocale: null,
    htmlLang: "en",
    isIndexable: true,
    isPublic: true,
    label: "EN",
    nativeLabel: "English",
    sortOrder: 10
  },
  {
    code: "th",
    direction: "ltr",
    fallbackLocale: "en",
    htmlLang: "th",
    isIndexable: true,
    isPublic: true,
    label: "TH",
    nativeLabel: "ไทย",
    sortOrder: 20
  }
] as const satisfies readonly SiteLocale[];

export type Locale = (typeof siteLocaleRegistry)[number]["code"];

export const defaultLocale: Locale = "en";

export const allLocales = siteLocaleRegistry
  .slice()
  .sort((first, second) => first.sortOrder - second.sortOrder)
  .map((locale) => locale.code) as Locale[];

export const publicLocales = siteLocaleRegistry
  .filter((locale) => locale.isPublic)
  .sort((first, second) => first.sortOrder - second.sortOrder)
  .map((locale) => locale.code) as Locale[];

export const indexableLocales = siteLocaleRegistry
  .filter((locale) => locale.isPublic && locale.isIndexable)
  .sort((first, second) => first.sortOrder - second.sortOrder)
  .map((locale) => locale.code) as Locale[];

// Existing pages import `locales`; keep that as the public route set.
export const locales = publicLocales;

const localeByCode = new Map<LocaleCode, SiteLocale>(
  siteLocaleRegistry.map((locale) => [locale.code, locale])
);

export const localeLabels = Object.fromEntries(
  siteLocaleRegistry.map((locale) => [locale.code, locale.label])
) as Record<Locale, string>;

const en = {
  meta: {
    title: "MattaNutra",
    description:
      "Personalized supplement recommendations tailored to your body, lifestyle, and goals."
  },
  hero: {
    eyebrow: "MattaNutra",
    title: "Hello",
    subtitle: "Know exactly what your body needs",
    subtitleAccent: "your body needs",
    subtitleMuted: "no guesswork",
    followOn:
      "AI powered plans for supplements, sleep, nutrition and more - Tailored to YOU",
    followOnAccent: "YOU",
    cta: "Design your future health",
    secondaryCta: "How it works",
    imageAlt: "Healthy and fit Asian couple outdoors",
    stack: "Next.js · TypeScript · Tailwind"
  },
  assessment: {
    eyebrow: "Smart Assessment",
    title: "Let’s understand your goals",
    description:
      "This is the starting point for the MattaNutra assessment. We’ll use this flow to capture your goals, lifestyle, preferences, and constraints before creating your supplement formulation.",
    stepLabel: "Step 1 of 3",
    prompt: "What would you like to improve first?",
    options: ["Energy", "Sleep", "Focus", "Calm", "Recovery", "Healthy aging"],
    helper: "Questionnaire controls and progress will be layered in next."
  },
  blog: {
    description:
      "Practical ideas on personalised nutrition, smarter supplement choices, and healthier routines.",
    title: "Insights"
  },
  featureSection: {
    eyebrow: "Personalized wellness",
    title: "From goals to supplement options",
    description:
      "MattaNutra turns a short conversation about your lifestyle, your body and preferences into a supplement formulation tailored specifically for you — then finds the closest matching products that meet your body’s needs.",
    features: [
      {
        name: "Smart Assessment",
        description:
          "Share your goals for energy, sleep, focus, calm, recovery, or healthy aging in a 2 minute questionnaire."
      },
      {
        name: "AI Powered Plan",
        description:
          "We generate a comprehensive AI powered supplement plan tailored to you."
      },
      {
        name: "Buy with confidence",
        description:
          "We discover the very best products that match your individual formulation."
      }
    ]
  },
  cta: {
    titleLine1: "Personalised today, healthier tomorrow",
    titleLine2: "",
    button: "START YOUR FREE ASSESSMENT NOW",
    reassurance: "Takes 2-3 minutes * No credit card required"
  },
  supportSection: {
    title: "Built around your health goals",
    features: [
      {
        name: "Personalised",
        description: "Plans built for your unique body and goals."
      },
      {
        name: "Backed by science",
        description: "Based on the latest research, not trends."
      },
      {
        name: "Save time & money",
        description:
          "No more trial and error, wasting time and money on the wrong supplements."
      },
      {
        name: "Live better longer",
        description: "Optimise today. Proactive for tomorrow."
      }
    ]
  },
  footer: {
    copyright: "© 2026 MattaNutra. Wellness information only. Not medical advice.",
    privacy: "Privacy Policy",
    recommended: "Recommended products on trusted sources",
    starsLabel: "Five stars",
    terms: "Terms of Service",
    trustedLine1: "Trusted by thousands",
    trustedLine2: "on their health journey"
  }
};

type Dictionary = typeof en;

const dictionaries: Partial<Record<Locale, Dictionary>> & { en: Dictionary } = {
  en,
  th: {
    meta: {
      title: "MattaNutra",
      description:
        "คำแนะนำอาหารเสริมเฉพาะบุคคลที่ปรับให้เข้ากับร่างกาย ไลฟ์สไตล์ และเป้าหมายของคุณ"
    },
    hero: {
      eyebrow: "MattaNutra",
      title: "สวัสดี",
      subtitle: "รู้ชัดว่าร่างกายของคุณต้องการอะไร",
      subtitleAccent: "ร่างกายของคุณต้องการอะไร",
      subtitleMuted: "ไม่ต้องเดา",
      followOn:
        "แผนด้วย AI สำหรับอาหารเสริม การนอนหลับ โภชนาการ และอื่นๆ - ออกแบบเพื่อคุณ",
      followOnAccent: "คุณ",
      cta: "ออกแบบสุขภาพอนาคตของคุณ",
      secondaryCta: "วิธีการทำงาน",
      imageAlt: "คู่รักชาวเอเชียที่สุขภาพดีและแข็งแรงกลางแจ้ง",
      stack: "Next.js · TypeScript · Tailwind"
    },
    assessment: {
      eyebrow: "การประเมินอัจฉริยะ",
      title: "มาเริ่มทำความเข้าใจเป้าหมายของคุณ",
      description:
        "นี่คือจุดเริ่มต้นของแบบประเมิน MattaNutra เราจะใช้ขั้นตอนนี้เพื่อเก็บเป้าหมาย ไลฟ์สไตล์ ความต้องการ และข้อจำกัดของคุณ ก่อนสร้างสูตรอาหารเสริมเฉพาะบุคคล",
      stepLabel: "ขั้นตอนที่ 1 จาก 3",
      prompt: "คุณอยากปรับปรุงเรื่องใดก่อน?",
      options: [
        "พลังงาน",
        "การนอนหลับ",
        "สมาธิ",
        "ความสงบ",
        "การฟื้นตัว",
        "สูงวัยอย่างมีสุขภาพดี"
      ],
      helper: "ส่วนควบคุมแบบสอบถามและแถบความคืบหน้าจะเพิ่มในขั้นตอนถัดไป"
    },
    blog: {
      description:
        "แนวคิดที่นำไปใช้ได้จริงเกี่ยวกับโภชนาการเฉพาะบุคคล การเลือกอาหารเสริม และกิจวัตรสุขภาพที่ดีขึ้น",
      title: "จากบทความ"
    },
    featureSection: {
      eyebrow: "สุขภาพเฉพาะบุคคล",
      title: "จากเป้าหมายสู่ตัวเลือกอาหารเสริม",
      description:
        "MattaNutra เปลี่ยนบทสนทนาสั้นๆ เกี่ยวกับไลฟ์สไตล์ ร่างกาย และความต้องการของคุณให้เป็นสูตรอาหารเสริมที่ปรับมาเพื่อคุณโดยเฉพาะ แล้วค้นหาผลิตภัณฑ์ที่ใกล้เคียงที่สุดกับสิ่งที่ร่างกายคุณต้องการ",
      features: [
        {
          name: "การประเมินอัจฉริยะ",
          description:
            "บอกเป้าหมายของคุณเรื่องพลังงาน การนอนหลับ สมาธิ ความสงบ การฟื้นตัว หรือการสูงวัยอย่างมีสุขภาพดี ผ่านแบบสอบถาม 2 นาที"
        },
        {
          name: "แผนจาก AI",
          description:
            "เราสร้างแผนอาหารเสริมด้วย AI ที่ครอบคลุมและปรับให้เหมาะกับคุณ"
        },
        {
          name: "ซื้อได้อย่างมั่นใจ",
          description:
            "เราค้นหาผลิตภัณฑ์ที่ดีที่สุดซึ่งตรงกับสูตรเฉพาะบุคคลของคุณ"
        }
      ]
    },
    cta: {
      titleLine1: "ดูแลวันนี้ สุขภาพดีขึ้นในวันพรุ่งนี้",
      titleLine2: "",
      button: "เริ่มประเมินฟรีตอนนี้",
      reassurance: "ใช้เวลา 2-3 นาที * ไม่ต้องใช้บัตรเครดิต"
    },
    supportSection: {
      title: "สร้างขึ้นรอบเป้าหมายสุขภาพของคุณ",
      features: [
        {
          name: "เฉพาะบุคคล",
          description: "แผนที่สร้างขึ้นเพื่อร่างกายและเป้าหมายเฉพาะของคุณ"
        },
        {
          name: "อิงหลักวิทยาศาสตร์",
          description: "อ้างอิงงานวิจัยล่าสุด ไม่ใช่กระแสชั่วคราว"
        },
        {
          name: "ประหยัดเวลาและเงิน",
          description:
            "ไม่ต้องลองผิดลองถูก เสียเวลาและเงินกับอาหารเสริมที่ไม่เหมาะกับคุณ"
        },
        {
          name: "ใช้ชีวิตดีขึ้น ยาวนานขึ้น",
          description: "ดูแลวันนี้ พร้อมวางแผนเชิงรุกเพื่อวันพรุ่งนี้"
        }
      ]
    },
    footer: {
      copyright:
        "© 2026 MattaNutra ข้อมูลเพื่อ wellness เท่านั้น ไม่ใช่คำแนะนำทางการแพทย์",
      privacy: "นโยบายความเป็นส่วนตัว",
      recommended: "ผลิตภัณฑ์ที่แนะนำจากแหล่งที่เชื่อถือได้",
      starsLabel: "ห้าดาว",
      terms: "เงื่อนไขการให้บริการ",
      trustedLine1: "ได้รับความไว้วางใจจากผู้ใช้หลายพันคน",
      trustedLine2: "บนเส้นทางสุขภาพของพวกเขา"
    }
  }
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && localeByCode.has(value);
}

export function isPublicLocale(value: unknown): value is Locale {
  return isLocale(value) && Boolean(localeByCode.get(value)?.isPublic);
}

export function isIndexableLocale(value: unknown): value is Locale {
  return isLocale(value) && Boolean(localeByCode.get(value)?.isIndexable);
}

export function getLocaleConfig(locale: LocaleCode | null | undefined) {
  return localeByCode.get(locale ?? "") ?? localeByCode.get(defaultLocale)!;
}

export function localeLabel(locale: LocaleCode) {
  return getLocaleConfig(locale).label;
}

export function localeNativeLabel(locale: LocaleCode) {
  return getLocaleConfig(locale).nativeLabel;
}

export function localeHtmlLang(locale: LocaleCode) {
  return getLocaleConfig(locale).htmlLang;
}

export function localeDirection(locale: LocaleCode) {
  return getLocaleConfig(locale).direction;
}

export function getDictionary(locale: LocaleCode) {
  return dictionaries[isLocale(locale) ? locale : defaultLocale] ?? dictionaries.en;
}

export type LocalizedTextMap = Record<LocaleCode, string>;
export type LocalizedTextValue = string | Partial<LocalizedTextMap> | null | undefined;

export function resolveLocalizedText(
  value: LocalizedTextValue,
  locale: LocaleCode,
  fallbackLocale: LocaleCode = defaultLocale
) {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const localeConfig = getLocaleConfig(locale);
  const fallbackChain = [
    locale,
    localeConfig.fallbackLocale,
    fallbackLocale,
    defaultLocale,
    "en",
    "th"
  ].filter((item): item is string => Boolean(item));

  for (const key of [...new Set(fallbackChain)]) {
    const text = value[key];

    if (typeof text === "string" && text.trim()) {
      return text;
    }
  }

  return Object.values(value).find((text) => typeof text === "string" && text.trim()) ?? "";
}

export function localizedTextSearchValue(value: LocalizedTextValue) {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  return Object.values(value).filter(Boolean).join(" ");
}
