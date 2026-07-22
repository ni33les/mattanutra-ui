import { publicLocales, type Locale } from "@/lib/i18n";
import { getNamespace } from "@/lib/i18n-messages";

export const assets = {
  heroFigure: "/v15/hero-emblem.png",
  logo: "/v15/logo.png",
  clarity: [
    "/v15/clarity-overwhelmed.jpg",
    "/v15/clarity-path.jpg",
    "/v15/clarity-narrowed.jpg",
    "/v15/clarity-enough.jpg",
  ],
  foodBowl: "/v15/food-bowl.jpg",
  origin: [
    "/v15/origin-stage-1.png",
    "/v15/origin-stage-2.png",
    "/v15/origin-stage-3.png",
    "/v15/origin-stage-4.png",
    "/v15/origin-stage-5.png",
  ],
  testimonials: [
    "/v15/testimonial-daniel.jpg",
    "/v15/testimonial-meilin.jpg",
    "/v15/testimonial-wanida.jpg",
    "/v15/testimonial-malee.jpg",
  ],
} as const;

type LandingContent = Readonly<{
  readonly bridge: Readonly<{
    readonly body: string;
    readonly cta: string;
    readonly note: string;
    readonly title: string;
  }>;
  readonly clarity: Readonly<{
    readonly accent: string;
    readonly body: string;
    readonly cards: readonly (Readonly<{
      readonly body: string;
      readonly image: string;
      readonly imageAlt: string;
      readonly title: string;
    }>)[];
    readonly eyebrow: string;
    readonly title: string;
  }>;
  readonly difference: Readonly<{
    readonly accent: string;
    readonly eyebrow: string;
    readonly paragraphs: readonly string[];
    readonly title: string;
  }>;
  readonly faq: Readonly<{
    readonly accent: string;
    readonly eyebrow: string;
    readonly items: readonly (readonly [string, string])[];
    readonly title: string;
  }>;
  readonly final: Readonly<{
    readonly accent: string;
    readonly body: string;
    readonly primary: string;
    readonly quote: string;
    readonly secondary: string;
    readonly title: string;
  }>;
  readonly food: Readonly<{
    readonly accent: string;
    readonly cards: readonly (readonly [string, string, readonly string[]])[];
    readonly eyebrow: string;
    readonly imageAlt: string;
    readonly intro: string;
    readonly note: string;
    readonly title: string;
  }>;
  readonly hero: Readonly<{
    readonly accent: string;
    readonly checks: readonly string[];
    readonly eyebrow: string;
    readonly figureAlt: string;
    readonly ingredientPills: readonly string[];
    readonly intro: string;
    readonly microcopy: string;
    readonly pali: string;
    readonly paliTitle: string;
    readonly primary: string;
    readonly secondary: string;
    readonly title: string;
  }>;
  readonly how: Readonly<{
    readonly accent: string;
    readonly eyebrow: string;
    readonly intro: string;
    readonly steps: readonly (readonly string[])[];
    readonly title: string;
  }>;
  readonly journal: Readonly<{
    readonly accent: string;
    readonly browse: string;
    readonly eyebrow: string;
    readonly fallback: readonly (readonly string[])[];
    readonly readMore: string;
    readonly tag: string;
    readonly title: string;
  }>;
  readonly origin: Readonly<{
    readonly accent: string;
    readonly body: string;
    readonly body2: string;
    readonly buildAlt: string;
    readonly eyebrow: string;
    readonly founderParagraphs: readonly string[];
    readonly founders: string;
    readonly signoff: string;
    readonly tagline: string;
    readonly title: string;
  }>;
  readonly practice: Readonly<{
    readonly accent: string;
    readonly eyebrow: string;
    readonly intro: string;
    readonly steps: readonly (readonly [string, string, readonly string[]])[];
    readonly title: string;
  }>;
  readonly pricing: Readonly<{
    readonly accent: string;
    readonly eyebrow: string;
    readonly intro: string;
    readonly offer: string;
    readonly plans: readonly [Readonly<{
      readonly badge: string;
      readonly best: string;
      readonly cta: string;
      readonly currency: string;
      readonly desc: string;
      readonly features: readonly string[];
      readonly guarantee: string;
      readonly guaranteeTitle: string;
      readonly name: string;
      readonly originalPrice: string;
      readonly plan: string;
      readonly price: string;
      readonly saving: string;
      readonly term: string;
      readonly termLabel: string;
    }>, Readonly<{
      readonly badge: string;
      readonly best: string;
      readonly cta: string;
      readonly currency: string;
      readonly desc: string;
      readonly features: readonly string[];
      readonly guarantee: string;
      readonly guaranteeTitle: string;
      readonly name: string;
      readonly originalPrice: string;
      readonly plan: string;
      readonly popular: string;
      readonly price: string;
      readonly saving: string;
      readonly term: string;
      readonly termLabel: string;
    }>];
    readonly title: string;
    readonly trust: readonly (readonly [string, string])[];
  }>;
  readonly problem: Readonly<{
    readonly accent: string;
    readonly body: string;
    readonly body2: string;
    readonly eyebrow: string;
    readonly imageAlt: string;
    readonly title: string;
  }>;
  readonly promises: Readonly<{
    readonly accent: string;
    readonly cards: readonly (readonly [string, string])[];
    readonly eyebrow: string;
    readonly intro: string;
    readonly title: string;
  }>;
  readonly proof: readonly (Readonly<{
    readonly body: string;
    readonly title: string;
  }>)[];
  readonly protocol: Readonly<{
    readonly accent: string;
    readonly active: string;
    readonly basedOn: string;
    readonly channel: string;
    readonly chat: readonly string[];
    readonly eyebrow: string;
    readonly foodNudge: string;
    readonly foodTags: readonly string[];
    readonly intro: string;
    readonly primary: string;
    readonly reasoning: readonly string[];
    readonly reasoningLabel: string;
    readonly secondary: string;
    readonly ticks: readonly string[];
    readonly title: string;
    readonly tripTitle: string;
    readonly updateLabel: string;
    readonly updates: readonly string[];
    readonly vitaminAnswer: string;
    readonly vitaminQuestion: string;
  }>;
  readonly protocolBand: Readonly<{
    readonly accent: string;
    readonly body: string;
    readonly title: string;
  }>;
  readonly questionnaire: Readonly<{
    readonly body: string;
    readonly bottom: string;
    readonly cardLabel: string;
    readonly cta: string;
    readonly eyebrow: string;
    readonly foundation: string;
    readonly insight: string;
    readonly privateLabel: string;
    readonly progress: string;
    readonly progressNote: string;
    readonly progressPath: string;
    readonly quote: string;
    readonly reassurance: string;
    readonly sampleBody: string;
    readonly sampleLabel: string;
    readonly sections: readonly string[];
    readonly sectionsLabel: string;
    readonly skinBody: string;
    readonly skinTone: string;
    readonly sunExposure: string;
    readonly sunOptions: readonly string[];
    readonly sunscreen: string;
    readonly sunscreenOptions: readonly string[];
    readonly title: string;
  }>;
  readonly results: Readonly<{
    readonly cta: string;
    readonly eyebrow: string;
    readonly fallback: readonly (Readonly<{
      readonly id: string;
      readonly image: string;
      readonly imageAlt: string;
      readonly name: string;
      readonly place: string;
      readonly quote: string;
      readonly role: string;
    }>)[];
    readonly intro: string;
    readonly join: string;
    readonly title: string;
  }>;
}>;

export function getLandingPageCopy(locale: Locale): LandingContent {
  return getNamespace<LandingContent>(locale, "customer.landing");
}

export const content = Object.fromEntries(
  publicLocales.map((locale) => [locale, getLandingPageCopy(locale)])
) as Record<Locale, LandingContent>;
