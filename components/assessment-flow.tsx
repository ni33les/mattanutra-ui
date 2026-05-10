"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  BeakerIcon,
  CheckIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  SparklesIcon
} from "@heroicons/react/20/solid";
import { ChatChannelCards } from "@/components/chat-channel-cards";
import { HighlightedBrandText } from "@/components/highlighted-brand-text";
import { getBpmPayload, trackBpmEvent } from "@/lib/bpm-client";
import { normalizeLeadEmail, validateLeadEmail } from "@/lib/email-validation";
import type { BlogTestimonial } from "@/lib/blog";
import type {
  HealthScoreDomain,
  HealthScoreResult,
  LocalizedHealthScoreText
} from "@/lib/health-score";
import type { Locale } from "@/lib/i18n";

type Option = Readonly<{
  label: string;
  value: string;
}>;

type ScaleOption = Option &
  Readonly<{
    tone: string;
  }>;

type LabField = Readonly<{
  hint: string;
  label: string;
  placeholder: string;
  value: string;
}>;

type Copy = Readonly<{
  about: {
    activity: string;
    activityOptions: Option[];
    age: string;
    ageOptions: Option[];
    build: string;
    buildOptions: Option[];
    country: string;
    countryOptions: Option[];
    height: string;
    name: string;
    sex: string;
    sexOptions: Option[];
    skin: string;
    skinOptions: Option[];
    title: string;
    weight: string;
  };
  badges: string[];
  common: {
    required: string;
  };
  conditions: {
    options: Option[];
    prompt: string;
    title: string;
  };
  fixedAction: {
    complete: string;
    generate: string;
    remaining: (count: number) => string;
  };
  goals: {
    hint: string;
    options: Option[];
    prompt: string;
    title: string;
  };
  hero: {
    description: string;
    time: string;
    title: string;
  };
  lifestyle: {
    alcohol: string;
    alcoholOptions: Option[];
    coffee: string;
    coffeeOptions: Option[];
    diet: string;
    dietOptions: Option[];
    fish: string;
    fishOptions: Option[];
    lifestage: string;
    lifestageOptions: Option[];
    meds: string;
    medsHint: string;
    medType: string;
    medTypeOptions: Option[];
    medsOptions: Option[];
    smoke: string;
    smokeOptions: Option[];
    supps: string;
    suppsOptions: Option[];
    sun: string;
    sunOptions: Option[];
    title: string;
  };
  precision: {
    family: string;
    familyOptions: Option[];
    gut: string;
    gutOptions: Option[];
    helper: string;
    labs: string;
    labFields: LabField[];
    protein: string;
    proteinOptions: Option[];
    sleep: string;
    sleepOptions: ScaleOption[];
    stress: string;
    stressOptions: ScaleOption[];
    stressSource: string;
    stressSourceOptions: Option[];
    title: string;
    vo2Known: string;
    vo2KnownOptions: Option[];
    vo2Max: string;
    vo2Proxy: string;
    vo2ProxyOptions: Option[];
    wearable: string;
    wearableOptions: Option[];
  };
  preferences: {
    budget: string;
    budgetOptions: Option[];
    form: string;
    formOptions: Option[];
    pills: string;
    pillsOptions: Option[];
    title: string;
  };
  progress: {
    complete: string;
    start: string;
    status: (done: number, total: number) => string;
  };
  sleepBasics: {
    average: string;
    options: Option[];
    title: string;
  };
  symptoms: {
    energy: string;
    energyOptions: ScaleOption[];
    great: Option;
    hint: string;
    options: Option[];
    prompt: string;
    title: string;
  };
}>;

type Answers = {
  activity: string;
  alcohol: string;
  age: string;
  budget: string;
  build: string;
  coffee: string;
  conditions: string[];
  country: string;
  diet: string;
  energy: string;
  family: string[];
  fish: string;
  feelGreat: boolean;
  form: string;
  goals: string[];
  gut: string;
  heightCm: string;
  labs: Record<string, string>;
  lifestage: string;
  meds: string;
  medTypes: string[];
  name: string;
  notes: string;
  pills: string;
  protein: string;
  reassessmentEmail: string;
  sex: string;
  skin: string;
  sleep: string;
  sleepHours: string;
  smoke: string;
  stress: string;
  stressSource: string;
  sun: string;
  supps: string;
  symptoms: string[];
  vo2Known: string;
  vo2Max: string;
  vo2Proxy: string;
  wearable: string;
  weightKg: string;
};

const requiredGroups = [
  "sex",
  "age",
  "heightCm",
  "weightKg",
  "skin",
  "country",
  "sun",
  "activity",
  "goals",
  "symptoms",
  "sleepHours",
  "diet",
  "fish",
  "smoke",
  "alcohol",
  "meds",
  "budget",
  "pills"
] as const;

const initialAnswers: Answers = {
  activity: "",
  alcohol: "",
  age: "",
  budget: "",
  build: "",
  coffee: "",
  conditions: [],
  country: "TH",
  diet: "",
  energy: "",
  family: [],
  fish: "",
  feelGreat: false,
  form: "",
  goals: [],
  gut: "",
  heightCm: "170",
  labs: {},
  lifestage: "",
  meds: "",
  medTypes: [],
  name: "",
  notes: "",
  pills: "",
  protein: "",
  reassessmentEmail: "",
  sex: "",
  skin: "",
  sleep: "",
  sleepHours: "",
  smoke: "",
  stress: "",
  stressSource: "",
  sun: "",
  supps: "",
  symptoms: [],
  vo2Known: "",
  vo2Max: "",
  vo2Proxy: "",
  wearable: "",
  weightKg: "70"
};

function buildInitialAnswers(prefillAnswers?: unknown) {
  if (
    !prefillAnswers ||
    typeof prefillAnswers !== "object" ||
    Array.isArray(prefillAnswers)
  ) {
    return initialAnswers;
  }

  const prefill = prefillAnswers as Partial<Answers>;

  return {
    ...initialAnswers,
    ...prefill,
    conditions: Array.isArray(prefill.conditions)
      ? prefill.conditions
      : initialAnswers.conditions,
    family: Array.isArray(prefill.family)
      ? prefill.family
      : initialAnswers.family,
    goals: Array.isArray(prefill.goals)
      ? prefill.goals
      : initialAnswers.goals,
    labs:
      prefill.labs && typeof prefill.labs === "object"
        ? prefill.labs
        : initialAnswers.labs,
    medTypes: Array.isArray(prefill.medTypes)
      ? prefill.medTypes
      : initialAnswers.medTypes,
    symptoms: Array.isArray(prefill.symptoms)
      ? prefill.symptoms
      : initialAnswers.symptoms
  } satisfies Answers;
}

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function randomSubset<T>(items: readonly T[], count: number) {
  const shuffled = [...items].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, count);
}

function buildRandomDevAnswers(): Answers {
  const sex = randomItem(["female", "male"] as const);
  const meds = randomItem(["no", "yes"] as const);
  const vo2Known = randomItem(["no", "yes"] as const);
  const heightCm = String(Math.round(155 + Math.random() * 38));
  const weightKg = String(Math.round(52 + Math.random() * 42));

  return {
    activity: randomItem(["light", "moderate", "active", "athlete"]),
    alcohol: randomItem(["none", "low", "moderate"]),
    age: randomItem(["26-35", "36-45", "46-55", "56-65"]),
    budget: randomItem(["mid", "good", "high"]),
    build: randomItem(["average", "muscular", "slim"]),
    coffee: randomItem(["none", "1", "2-3"]),
    conditions: randomItem([["none"], ["joints"], ["cholesterol"], ["mood"]]),
    country: "TH",
    diet: randomItem(["balanced", "whole", "mediterranean", "plant"]),
    energy: randomItem(["2", "3", "4", "5"]),
    family: randomItem([["none"], ["heart"], ["diabetes"], ["bones"]]),
    fish: randomItem(["rarely", "weekly", "2-3pw", "daily"]),
    feelGreat: false,
    form: randomItem(["capsules", "powder", "mixed"]),
    goals: randomSubset(
      ["energy", "sleep", "focus", "longevity", "fitness", "mood"],
      3
    ),
    gut: randomItem(["great", "bloat", "constipation"]),
    heightCm,
    labs: {
      b12: String(Math.round(380 + Math.random() * 360)),
      ferritin: String(Math.round(45 + Math.random() * 90)),
      hba1c: (5 + Math.random() * 0.8).toFixed(1),
      hrv: String(Math.round(42 + Math.random() * 36)),
      omega3: (4.5 + Math.random() * 3.5).toFixed(1),
      vitaminD: String(Math.round(26 + Math.random() * 34))
    },
    lifestage:
      sex === "female" ? randomItem(["regular", "peri", "post"]) : "",
    meds,
    medTypes:
      meds === "yes"
        ? randomSubset(["statin", "metformin", "bp", "antidepressant"], 1)
        : [],
    name: "",
    notes: "Development shortcut generated this assessment.",
    pills: randomItem(["4-6", "7-10", "unlimited"]),
    protein: randomItem(["mid", "good", "high"]),
    reassessmentEmail: "dev@example.dev",
    sex,
    skin: randomItem(["II", "III", "IV", "V"]),
    sleep: randomItem(["3", "4", "5"]),
    sleepHours: randomItem(["6-7", "7-8", "8-9"]),
    smoke: randomItem(["never", "exlong", "occasional"]),
    stress: randomItem(["2", "3", "4"]),
    stressSource: randomItem(["none", "work", "life", "health"]),
    sun: randomItem(["low", "moderate", "high"]),
    supps: randomItem(["none", "basic", "several"]),
    symptoms: randomSubset(["fatigue", "brain", "sleep", "stress", "joints"], 2),
    vo2Known,
    vo2Max: vo2Known === "yes" ? String(Math.round(34 + Math.random() * 20)) : "",
    vo2Proxy:
      vo2Known === "no"
        ? randomItem(["moderate", "sustained", "athlete"])
        : "",
    wearable: randomItem(["none", "apple", "garmin", "fitbit"]),
    weightKg
  };
}

const en: Copy = {
  about: {
    title: "About you",
    name: "Name",
    sex: "Sex",
    sexOptions: [
      { label: "Male", value: "male" },
      { label: "Female", value: "female" }
    ],
    age: "Age",
    ageOptions: [
      { label: "18-25", value: "18-25" },
      { label: "26-35", value: "26-35" },
      { label: "36-45", value: "36-45" },
      { label: "46-55", value: "46-55" },
      { label: "56-65", value: "56-65" },
      { label: "66+", value: "66+" }
    ],
    height: "Height",
    weight: "Weight",
    skin: "Skin tone",
    skinOptions: [
      { label: "Skin tone 1", value: "I" },
      { label: "Skin tone 2", value: "II" },
      { label: "Skin tone 3", value: "III" },
      { label: "Skin tone 4", value: "IV" },
      { label: "Skin tone 5", value: "V" },
      { label: "Skin tone 6", value: "VI" }
    ],
    country: "Country",
    countryOptions: [
      { label: "Thailand", value: "TH" },
      { label: "Singapore", value: "SG" },
      { label: "Malaysia", value: "MY" },
      { label: "Indonesia", value: "ID" },
      { label: "Philippines", value: "PH" },
      { label: "Vietnam", value: "VN" },
      { label: "Myanmar", value: "MM" },
      { label: "United States", value: "US" },
      { label: "Australia", value: "AU" },
      { label: "United Kingdom", value: "GB" },
      { label: "Canada", value: "CA" },
      { label: "Germany", value: "DE" },
      { label: "France", value: "FR" },
      { label: "Japan", value: "JP" },
      { label: "South Korea", value: "KR" },
      { label: "India", value: "IN" },
      { label: "China", value: "CN" },
      { label: "Other", value: "OTHER" }
    ],
    activity: "Activity level",
    activityOptions: [
      { label: "Mostly sitting", value: "sedentary" },
      { label: "Light", value: "light" },
      { label: "Moderate", value: "moderate" },
      { label: "Active", value: "active" },
      { label: "Athlete", value: "athlete" }
    ],
    build: "My current build",
    buildOptions: [
      { label: "Slim", value: "slim" },
      { label: "Average", value: "average" },
      { label: "Overweight", value: "overweight" },
      { label: "Muscular", value: "muscular" }
    ]
  },
  badges: ["120+ ingredients", "Private and secure", "AI powered"],
  common: {
    required: "Required"
  },
  conditions: {
    title: "Known health considerations",
    prompt: "Anything we should account for? Select all that apply.",
    options: [
      { label: "None", value: "none" },
      { label: "High blood pressure", value: "hbp" },
      { label: "Blood sugar support", value: "blood-sugar" },
      { label: "Thyroid support", value: "thyroid" },
      { label: "Cholesterol support", value: "cholesterol" },
      { label: "Joint support", value: "joints" },
      { label: "Autoimmune considerations", value: "autoimmune" },
      { label: "Digestive condition", value: "digestive" },
      { label: "Bone density support", value: "bone" },
      { label: "Mood support", value: "mood" }
    ]
  },
  fixedAction: {
    complete: "All essentials answered - ready to generate.",
    generate: "Generate my health score",
    remaining: (count) =>
      `${count} required question${count === 1 ? "" : "s"} remaining`
  },
  goals: {
    title: "Goals",
    prompt: "Primary health goals",
    hint: "Pick up to 3",
    options: [
      { label: "More energy", value: "energy" },
      { label: "Better sleep", value: "sleep" },
      { label: "Brain / focus", value: "focus" },
      { label: "Longevity", value: "longevity" },
      { label: "Immunity", value: "immune" },
      { label: "Fitness / VO2", value: "fitness" },
      { label: "Weight loss", value: "weight" },
      { label: "Mood / calm", value: "mood" },
      { label: "Heart health", value: "heart" },
      { label: "Joints / bones", value: "joints" },
      { label: "Skin / hair", value: "skin" },
      { label: "Hormones", value: "hormones" }
    ]
  },
  hero: {
    title: "Your supplement formulation, personalised by AI",
    description:
      "Answer honestly. The more accurate you are, the more precise your formulation brief becomes.",
    time: "About 4 minutes"
  },
  lifestyle: {
    title: "Food, drinks, and habits",
    diet: "Diet pattern",
    dietOptions: [
      { label: "None", value: "none" },
      { label: "Processed", value: "western" },
      { label: "Balanced", value: "balanced" },
      { label: "Whole foods", value: "whole" },
      { label: "Mediterranean", value: "mediterranean" },
      { label: "Plant-based", value: "plant" },
      { label: "Vegan", value: "vegan" },
      { label: "Carnivore", value: "keto" }
    ],
    fish: "Fatty fish / week",
    fishOptions: [
      { label: "Never", value: "never" },
      { label: "Rarely", value: "rarely" },
      { label: "Once", value: "weekly" },
      { label: "Often", value: "2-3pw" },
      { label: "Daily", value: "daily" }
    ],
    sun: "Sun exposure (min)",
    sunOptions: [
      { label: "Under 15", value: "minimal" },
      { label: "15-30", value: "low" },
      { label: "30-60", value: "moderate" },
      { label: "60+", value: "high" }
    ],
    smoke: "Smoking",
    smokeOptions: [
      { label: "Never", value: "never" },
      { label: "Ex (>5 yrs)", value: "exlong" },
      { label: "Ex (<5 yrs)", value: "exrecent" },
      { label: "Occasional", value: "occasional" },
      { label: "Daily", value: "daily" }
    ],
    alcohol: "Alcoholic drinks / week",
    alcoholOptions: [
      { label: "None", value: "none" },
      { label: "1-3", value: "low" },
      { label: "4-7", value: "moderate" },
      { label: "8+", value: "high" }
    ],
    coffee: "Caffeine cups per day",
    coffeeOptions: [
      { label: "None", value: "none" },
      { label: "1", value: "1" },
      { label: "2-3", value: "2-3" },
      { label: "4+", value: "4+" }
    ],
    meds: "Medications?",
    medsHint:
      "Used for safety checks only.",
    medsOptions: [
      { label: "None", value: "no" },
      { label: "Yes", value: "yes" }
    ],
    medType: "Medication type(s)",
    medTypeOptions: [
      { label: "Statin", value: "statin" },
      { label: "Metformin", value: "metformin" },
      { label: "PPI / Omeprazole", value: "ppi" },
      { label: "Contraceptive pill", value: "ocp" },
      { label: "Antidepressant", value: "antidepressant" },
      { label: "Blood thinner / aspirin", value: "blood-thinner" },
      { label: "Thyroid medication", value: "thyroid" },
      { label: "Blood pressure", value: "bp" },
      { label: "Corticosteroid", value: "steroid" },
      { label: "Other", value: "other" }
    ],
    supps: "Supplements?",
    suppsOptions: [
      { label: "None", value: "none" },
      { label: "Basic multi", value: "basic" },
      { label: "D3 / Omega-3", value: "several" },
      { label: "Several targeted", value: "many" }
    ],
    lifestage: "My hormonal stage",
    lifestageOptions: [
      { label: "Regular cycle", value: "regular" },
      { label: "Perimenopause", value: "peri" },
      { label: "Post-menopause", value: "post" },
      { label: "Pregnant / nursing", value: "pregnant" }
    ]
  },
  precision: {
    title: "Precision",
    helper:
      "Optional. Answer any or all. These details can sharpen your formulation brief.",
    family: "Family history",
    familyOptions: [
      { label: "Heart disease", value: "heart" },
      { label: "Alzheimer's", value: "alzheimer" },
      { label: "Diabetes", value: "diabetes" },
      { label: "Cancer", value: "cancer" },
      { label: "Osteoporosis", value: "bones" },
      { label: "None", value: "none" }
    ],
    protein: "Protein / day",
    proteinOptions: [
      { label: "Under 1g / kg", value: "low" },
      { label: "1-1.5g / kg", value: "mid" },
      { label: "1.5-2g / kg", value: "good" },
      { label: "Over 2g / kg", value: "high" }
    ],
    sleep: "Wake refreshed?",
    sleepOptions: [
      { label: "Awful", value: "1", tone: "Low" },
      { label: "Poor", value: "2", tone: "Low" },
      { label: "OK", value: "3", tone: "Mid" },
      { label: "Good", value: "4", tone: "High" },
      { label: "Great", value: "5", tone: "High" }
    ],
    stress: "Stress level",
    stressOptions: [
      { label: "Very low", value: "1", tone: "Low" },
      { label: "Low", value: "2", tone: "Low" },
      { label: "Moderate", value: "3", tone: "Mid" },
      { label: "High", value: "4", tone: "High" },
      { label: "Extreme", value: "5", tone: "High" }
    ],
    stressSource: "Stress source",
    stressSourceOptions: [
      { label: "None", value: "none" },
      { label: "Work", value: "work" },
      { label: "Anxiety", value: "anxiety" },
      { label: "Burnout", value: "burnout" },
      { label: "Health", value: "health" },
      { label: "Life events", value: "life" }
    ],
    gut: "Digestion",
    gutOptions: [
      { label: "No issues", value: "great" },
      { label: "Bloating", value: "bloat" },
      { label: "Constipation", value: "constipation" },
      { label: "Loose stools", value: "loose" },
      { label: "IBS / mixed", value: "ibs" }
    ],
    wearable: "Fitness tracker?",
    wearableOptions: [
      { label: "No wearable", value: "none" },
      { label: "Garmin", value: "garmin" },
      { label: "Oura", value: "oura" },
      { label: "WHOOP", value: "whoop" },
      { label: "Apple Watch", value: "apple" },
      { label: "Fitbit", value: "fitbit" },
      { label: "Other", value: "other" }
    ],
    vo2Known: "Know your VO2 max?",
    vo2KnownOptions: [
      { label: "No, estimate it", value: "no" },
      { label: "Yes", value: "yes" }
    ],
    vo2Max: "VO2 max",
    vo2Proxy: "Cardio fitness",
    vo2ProxyOptions: [
      { label: "Winded on stairs", value: "winded" },
      { label: "Brisk walk is hard", value: "moderate" },
      { label: "20-30 min moderate", value: "sustained" },
      { label: "30+ min hard effort", value: "athlete" }
    ],
    labs: "My lab values, if I know them",
    labFields: [
      {
        label: "Vitamin D",
        value: "vitaminD",
        placeholder: "",
        hint: "ng/mL"
      },
      { label: "Vitamin B12", value: "b12", placeholder: "", hint: "pg/mL" },
      { label: "Ferritin", value: "ferritin", placeholder: "", hint: "ng/mL" },
      { label: "HbA1c", value: "hba1c", placeholder: "", hint: "%" },
      {
        label: "Omega-3 Index",
        value: "omega3",
        placeholder: "",
        hint: "%"
      },
      {
        label: "Homocysteine",
        value: "homocysteine",
        placeholder: "",
        hint: "umol/L"
      },
      {
        label: "Average HRV",
        value: "hrv",
        placeholder: "",
        hint: "ms"
      }
    ]
  },
  preferences: {
    title: "My preferences",
    budget: "Monthly supplement budget",
    budgetOptions: [
      { label: "Under ฿1,000", value: "low" },
      { label: "฿1,000-2,500", value: "mid" },
      { label: "฿2,500-5,000", value: "good" },
      { label: "฿5,000+", value: "high" }
    ],
    pills: "Max pills / capsules per day",
    pillsOptions: [
      { label: "1-3", value: "1-3" },
      { label: "4-6", value: "4-6" },
      { label: "7-10", value: "7-10" },
      { label: "No limit", value: "unlimited" }
    ],
    form: "Preferred form",
    formOptions: [
      { label: "Capsules", value: "capsules" },
      { label: "Powder / shake", value: "powder" },
      { label: "Gummies", value: "gummies" },
      { label: "Mixed is fine", value: "mixed" }
    ]
  },
  progress: {
    start: "Answer essentials to unlock your brief.",
    complete: "All essentials complete",
    status: (done, total) => `${done} of ${total} essentials answered`
  },
  sleepBasics: {
    title: "Sleep, energy, and activity",
    average: "Sleep (hours)",
    options: [
      { label: "Under 5", value: "under-5" },
      { label: "5-6", value: "5-6" },
      { label: "6-7", value: "6-7" },
      { label: "7-8", value: "7-8" },
      { label: "8-9", value: "8-9" },
      { label: "9+", value: "9-plus" }
    ]
  },
  symptoms: {
    title: "Symptoms",
    prompt: "Current symptoms",
    hint: "Select all that apply",
    great: { label: "Feeling great", value: "great" },
    options: [
      { label: "Fatigue", value: "fatigue" },
      { label: "Brain fog", value: "brain" },
      { label: "Mood", value: "mood" },
      { label: "Joint pain", value: "joints" },
      { label: "Digestion", value: "digestion" },
      { label: "Poor sleep", value: "sleep" },
      { label: "Stress / anxiety", value: "stress" },
      { label: "Skin", value: "skin" },
      { label: "Hair loss", value: "hair" },
      { label: "Low libido", value: "libido" },
      { label: "Frequent colds", value: "cold" }
    ],
    energy: "Energy level",
    energyOptions: [
      { label: "Drained", value: "1", tone: "Low" },
      { label: "Low", value: "2", tone: "Low" },
      { label: "OK", value: "3", tone: "Mid" },
      { label: "Good", value: "4", tone: "High" },
      { label: "Excellent", value: "5", tone: "High" }
    ]
  }
};

const th: Copy = {
  ...en,
  about: {
    ...en.about,
    title: "เกี่ยวกับคุณ",
    name: "ชื่อ",
    sex: "เพศ",
    sexOptions: [
      { label: "ชาย", value: "male" },
      { label: "หญิง", value: "female" }
    ],
    age: "อายุ",
    ageOptions: en.about.ageOptions,
    height: "ส่วนสูง",
    weight: "น้ำหนัก",
    skin: "สีผิว",
    skinOptions: [
      { label: "สีผิวระดับ 1", value: "I" },
      { label: "สีผิวระดับ 2", value: "II" },
      { label: "สีผิวระดับ 3", value: "III" },
      { label: "สีผิวระดับ 4", value: "IV" },
      { label: "สีผิวระดับ 5", value: "V" },
      { label: "สีผิวระดับ 6", value: "VI" }
    ],
    country: "ประเทศ",
    countryOptions: [
      { label: "ไทย", value: "TH" },
      { label: "สิงคโปร์", value: "SG" },
      { label: "มาเลเซีย", value: "MY" },
      { label: "อินโดนีเซีย", value: "ID" },
      { label: "ฟิลิปปินส์", value: "PH" },
      { label: "เวียดนาม", value: "VN" },
      { label: "เมียนมา", value: "MM" },
      { label: "สหรัฐอเมริกา", value: "US" },
      { label: "ออสเตรเลีย", value: "AU" },
      { label: "สหราชอาณาจักร", value: "GB" },
      { label: "แคนาดา", value: "CA" },
      { label: "เยอรมนี", value: "DE" },
      { label: "ฝรั่งเศส", value: "FR" },
      { label: "ญี่ปุ่น", value: "JP" },
      { label: "เกาหลีใต้", value: "KR" },
      { label: "อินเดีย", value: "IN" },
      { label: "จีน", value: "CN" },
      { label: "อื่นๆ", value: "OTHER" }
    ],
    activity: "ระดับกิจกรรม",
    activityOptions: [
      { label: "นั่งเป็นส่วนใหญ่", value: "sedentary" },
      { label: "เบา", value: "light" },
      { label: "ปานกลาง", value: "moderate" },
      { label: "แอคทีฟ", value: "active" },
      { label: "นักกีฬา", value: "athlete" }
    ],
    build: "รูปร่างปัจจุบันของฉัน",
    buildOptions: [
      { label: "ผอม", value: "slim" },
      { label: "ปกติ", value: "average" },
      { label: "น้ำหนักเกิน", value: "overweight" },
      { label: "มีกล้ามเนื้อ", value: "muscular" }
    ]
  },
  badges: ["ส่วนผสม 120+", "เป็นส่วนตัวและปลอดภัย", "ขับเคลื่อนด้วย AI"],
  common: {
    required: "จำเป็น"
  },
  conditions: {
    title: "สิ่งที่ควรคำนึงด้านสุขภาพ",
    prompt: "มีเรื่องใดที่ควรคำนึงถึงหรือไม่? เลือกได้ทุกข้อที่ตรงกับคุณ",
    options: [
      { label: "ไม่มี", value: "none" },
      { label: "ความดันโลหิตสูง", value: "hbp" },
      { label: "ดูแลระดับน้ำตาล", value: "blood-sugar" },
      { label: "ดูแลไทรอยด์", value: "thyroid" },
      { label: "ดูแลคอเลสเตอรอล", value: "cholesterol" },
      { label: "ดูแลข้อต่อ", value: "joints" },
      { label: "ข้อควรระวังภูมิคุ้มกัน", value: "autoimmune" },
      { label: "ระบบย่อยอาหาร", value: "digestive" },
      { label: "ดูแลความหนาแน่นกระดูก", value: "bone" },
      { label: "ดูแลอารมณ์", value: "mood" }
    ]
  },
  fixedAction: {
    complete: "ตอบคำถามสำคัญครบแล้ว พร้อมสร้างบรีฟ",
    generate: "สร้าง HealthScore ของฉัน",
    remaining: (count) => `เหลือคำถามจำเป็น ${count} ข้อ`
  },
  goals: {
    title: "เป้าหมาย",
    prompt: "เป้าหมายสุขภาพหลัก",
    hint: "เลือกได้สูงสุด 3 ข้อ",
    options: [
      { label: "พลังงานมากขึ้น", value: "energy" },
      { label: "นอนหลับดีขึ้น", value: "sleep" },
      { label: "สมองและสมาธิ", value: "focus" },
      { label: "อายุยืน", value: "longevity" },
      { label: "สุขภาพภูมิคุ้มกัน", value: "immune" },
      { label: "ฟิตเนสและ VO2", value: "fitness" },
      { label: "ลดน้ำหนัก", value: "weight" },
      { label: "อารมณ์และความสงบ", value: "mood" },
      { label: "สุขภาพหัวใจ", value: "heart" },
      { label: "ข้อต่อและกระดูก", value: "joints" },
      { label: "ผิวและผม", value: "skin" },
      { label: "สมดุลฮอร์โมน", value: "hormones" }
    ]
  },
  hero: {
    title: "สูตรอาหารเสริมของคุณ ปรับให้เหมาะด้วย AI",
    description:
      "ตอบตามจริง ยิ่งข้อมูลแม่นยำ บรีฟสูตรอาหารเสริมของคุณก็ยิ่งเฉพาะเจาะจง",
    time: "ประมาณ 4 นาที"
  },
  lifestyle: {
    ...en.lifestyle,
    title: "อาหาร เครื่องดื่ม และพฤติกรรม",
    diet: "รูปแบบอาหาร",
    dietOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "แปรรูป", value: "western" },
      { label: "สมดุล", value: "balanced" },
      { label: "อาหารธรรมชาติ", value: "whole" },
      { label: "เมดิเตอร์เรเนียน", value: "mediterranean" },
      { label: "เน้นพืช", value: "plant" },
      { label: "วีแกน", value: "vegan" },
      { label: "คาร์นิวอร์", value: "keto" }
    ],
    fish: "ปลามัน / สัปดาห์",
    fishOptions: [
      { label: "ไม่เคย", value: "never" },
      { label: "นานๆ ครั้ง", value: "rarely" },
      { label: "1 ครั้ง", value: "weekly" },
      { label: "บ่อย", value: "2-3pw" },
      { label: "ทุกวัน", value: "daily" }
    ],
    sun: "แดด (นาที)",
    sunOptions: [
      { label: "น้อยกว่า 15", value: "minimal" },
      { label: "15-30", value: "low" },
      { label: "30-60", value: "moderate" },
      { label: "60+", value: "high" }
    ],
    smoke: "การสูบบุหรี่",
    smokeOptions: [
      { label: "ไม่เคย", value: "never" },
      { label: "เลิก >5 ปี", value: "exlong" },
      { label: "เลิก <5 ปี", value: "exrecent" },
      { label: "เป็นครั้งคราว", value: "occasional" },
      { label: "ทุกวัน", value: "daily" }
    ],
    alcohol: "แอลกอฮอล์ / สัปดาห์",
    alcoholOptions: [
      { label: "ไม่ดื่ม", value: "none" },
      { label: "1-3", value: "low" },
      { label: "4-7", value: "moderate" },
      { label: "8+", value: "high" }
    ],
    coffee: "คาเฟอีน แก้วต่อวัน",
    coffeeOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "1", value: "1" },
      { label: "2-3", value: "2-3" },
      { label: "4+", value: "4+" }
    ],
    meds: "ใช้ยา?",
    medsHint: "ใช้เพื่อตรวจความปลอดภัยเท่านั้น",
    medsOptions: [
      { label: "ไม่มี", value: "no" },
      { label: "ใช่", value: "yes" }
    ],
    medType: "ประเภทยา",
    medTypeOptions: [
      { label: "ยากลุ่มสแตติน", value: "statin" },
      { label: "เมตฟอร์มิน", value: "metformin" },
      { label: "PPI / โอเมพราโซล", value: "ppi" },
      { label: "ยาคุมกำเนิด", value: "ocp" },
      { label: "ยาต้านซึมเศร้า", value: "antidepressant" },
      { label: "ยาละลายลิ่มเลือด / แอสไพริน", value: "blood-thinner" },
      { label: "ยาไทรอยด์", value: "thyroid" },
      { label: "ยาความดัน", value: "bp" },
      { label: "คอร์ติโคสเตียรอยด์", value: "steroid" },
      { label: "อื่นๆ", value: "other" }
    ],
    supps: "อาหารเสริม?",
    suppsOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "มัลตวิตามินพื้นฐาน", value: "basic" },
      { label: "D3 / โอเมก้า-3", value: "several" },
      { label: "อาหารเสริมเฉพาะหลายตัว", value: "many" }
    ],
    lifestage: "ช่วงฮอร์โมนของฉัน",
    lifestageOptions: [
      { label: "รอบเดือนปกติ", value: "regular" },
      { label: "ก่อนวัยหมดประจำเดือน", value: "peri" },
      { label: "หลังวัยหมดประจำเดือน", value: "post" },
      { label: "ตั้งครรภ์ / ให้นม", value: "pregnant" }
    ]
  },
  precision: {
    ...en.precision,
    title: "ความแม่นยำ",
    helper: "ไม่บังคับ ตอบเท่าที่ทราบ รายละเอียดเหล่านี้ช่วยให้บรีฟแม่นขึ้น",
    family: "ประวัติครอบครัว",
    familyOptions: [
      { label: "โรคหัวใจ", value: "heart" },
      { label: "อัลไซเมอร์", value: "alzheimer" },
      { label: "เบาหวาน", value: "diabetes" },
      { label: "มะเร็ง", value: "cancer" },
      { label: "กระดูกพรุน", value: "bones" },
      { label: "ไม่มี", value: "none" }
    ],
    protein: "โปรตีน / วัน",
    proteinOptions: [
      { label: "ต่ำกว่า 1g / kg", value: "low" },
      { label: "1-1.5g / kg", value: "mid" },
      { label: "1.5-2g / kg", value: "good" },
      { label: "มากกว่า 2g / kg", value: "high" }
    ],
    sleep: "ตื่นแล้วสดชื่น?",
    sleepOptions: [
      { label: "แย่มาก", value: "1", tone: "Low" },
      { label: "ไม่ดี", value: "2", tone: "Low" },
      { label: "พอใช้", value: "3", tone: "Mid" },
      { label: "ดี", value: "4", tone: "High" },
      { label: "ดีมาก", value: "5", tone: "High" }
    ],
    stress: "ระดับความเครียด",
    stressOptions: [
      { label: "ต่ำมาก", value: "1", tone: "Low" },
      { label: "ต่ำ", value: "2", tone: "Low" },
      { label: "ปานกลาง", value: "3", tone: "Mid" },
      { label: "สูง", value: "4", tone: "High" },
      { label: "รุนแรงมาก", value: "5", tone: "High" }
    ],
    stressSource: "แหล่งความเครียด",
    stressSourceOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "งาน", value: "work" },
      { label: "กังวล", value: "anxiety" },
      { label: "หมดไฟ", value: "burnout" },
      { label: "สุขภาพ", value: "health" },
      { label: "เหตุการณ์ชีวิต", value: "life" }
    ],
    gut: "การย่อยอาหาร",
    gutOptions: [
      { label: "ไม่มีปัญหา", value: "great" },
      { label: "ท้องอืด", value: "bloat" },
      { label: "ท้องผูก", value: "constipation" },
      { label: "ถ่ายเหลว", value: "loose" },
      { label: "IBS / สลับกัน", value: "ibs" }
    ],
    wearable: "ใช้อุปกรณ์ติดตามฟิตเนส?",
    wearableOptions: [
      { label: "ไม่ใช้", value: "none" },
      { label: "Garmin", value: "garmin" },
      { label: "Oura", value: "oura" },
      { label: "WHOOP", value: "whoop" },
      { label: "Apple Watch", value: "apple" },
      { label: "Fitbit", value: "fitbit" },
      { label: "อื่นๆ", value: "other" }
    ],
    vo2Known: "ทราบ VO2 max?",
    vo2KnownOptions: [
      { label: "ไม่ทราบ", value: "no" },
      { label: "ทราบ", value: "yes" }
    ],
    vo2Max: "VO2 max",
    vo2Proxy: "ความฟิตคาร์ดิโอ",
    vo2ProxyOptions: [
      { label: "ขึ้นบันไดแล้วเหนื่อย", value: "winded" },
      { label: "เดินเร็วแล้วพูดยาก", value: "moderate" },
      { label: "ปานกลาง 20-30 นาที", value: "sustained" },
      { label: "หนัก 30+ นาที", value: "athlete" }
    ],
    labs: "ค่าตรวจเลือด หากทราบ",
    labFields: [
      { label: "วิตามินดี", value: "vitaminD", placeholder: "", hint: "ng/mL" },
      { label: "วิตามินบี12", value: "b12", placeholder: "", hint: "pg/mL" },
      { label: "เฟอร์ริติน", value: "ferritin", placeholder: "", hint: "ng/mL" },
      { label: "HbA1c", value: "hba1c", placeholder: "", hint: "%" },
      { label: "ดัชนีโอเมก้า-3", value: "omega3", placeholder: "", hint: "%" },
      {
        label: "โฮโมซิสเทอีน",
        value: "homocysteine",
        placeholder: "",
        hint: "umol/L"
      },
      {
        label: "ค่า HRV เฉลี่ย",
        value: "hrv",
        placeholder: "",
        hint: "ms"
      }
    ]
  },
  preferences: {
    ...en.preferences,
    title: "ความต้องการของฉัน",
    budget: "งบอาหารเสริมต่อเดือน",
    budgetOptions: [
      { label: "ต่ำกว่า ฿1,000", value: "low" },
      { label: "฿1,000-2,500", value: "mid" },
      { label: "฿2,500-5,000", value: "good" },
      { label: "฿5,000+", value: "high" }
    ],
    pills: "จำนวนเม็ด / แคปซูลสูงสุดต่อวัน",
    pillsOptions: [
      { label: "1-3", value: "1-3" },
      { label: "4-6", value: "4-6" },
      { label: "7-10", value: "7-10" },
      { label: "ไม่จำกัด", value: "unlimited" }
    ],
    form: "รูปแบบที่ต้องการ",
    formOptions: [
      { label: "แคปซูล", value: "capsules" },
      { label: "ผง / เชค", value: "powder" },
      { label: "กัมมี่", value: "gummies" },
      { label: "ผสมได้", value: "mixed" }
    ]
  },
  progress: {
    start: "ตอบคำถามสำคัญเพื่อปลดล็อกบรีฟ",
    complete: "ตอบคำถามสำคัญครบแล้ว",
    status: (done, total) => `ตอบแล้ว ${done} จาก ${total} ข้อสำคัญ`
  },
  sleepBasics: {
    title: "การนอนหลับ พลังงาน และกิจกรรม",
    average: "การนอน (ชั่วโมง)",
    options: [
      { label: "น้อยกว่า 5", value: "under-5" },
      { label: "5-6", value: "5-6" },
      { label: "6-7", value: "6-7" },
      { label: "7-8", value: "7-8" },
      { label: "8-9", value: "8-9" },
      { label: "9+", value: "9-plus" }
    ]
  },
  symptoms: {
    ...en.symptoms,
    title: "อาการ",
    prompt: "อาการปัจจุบัน",
    hint: "เลือกได้ทุกข้อ",
    great: { label: "รู้สึกดีมาก", value: "great" },
    options: [
      { label: "อ่อนเพลีย", value: "fatigue" },
      { label: "สมองล้า", value: "brain" },
      { label: "อารมณ์", value: "mood" },
      { label: "ปวดข้อ", value: "joints" },
      { label: "การย่อยอาหาร", value: "digestion" },
      { label: "นอนไม่ดี", value: "sleep" },
      { label: "เครียด / กังวล", value: "stress" },
      { label: "ผิว", value: "skin" },
      { label: "ผมร่วง", value: "hair" },
      { label: "ความต้องการทางเพศต่ำ", value: "libido" },
      { label: "ป่วยบ่อย", value: "cold" }
    ],
    energy: "ระดับพลังงาน",
    energyOptions: [
      { label: "หมดแรง", value: "1", tone: "Low" },
      { label: "ต่ำ", value: "2", tone: "Low" },
      { label: "พอใช้", value: "3", tone: "Mid" },
      { label: "ดี", value: "4", tone: "High" },
      { label: "ดีเยี่ยม", value: "5", tone: "High" }
    ]
  }
};

const copies: Record<Locale, Copy> = { en, th };
const heroBadgeIcons = [BeakerIcon, ShieldCheckIcon, SparklesIcon];
const paywallFeatureIcons = [SparklesIcon, ShieldCheckIcon, ArrowPathIcon];
const assessmentHeroImageUrl = "/final.png";
const assessmentHeroFade =
  "radial-gradient(ellipse at bottom left, rgba(243, 248, 255, 0.98) 0%, rgba(243, 248, 255, 0.76) 18%, rgba(243, 248, 255, 0.28) 34%, rgba(243, 248, 255, 0) 52%)";
const fitzpatrickSkinToneColors: Record<string, string> = {
  I: "#f8dfc8",
  II: "#eec29a",
  III: "#d6a071",
  IV: "#a66c45",
  V: "#744222",
  VI: "#3b2116"
};

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function countRequired(answers: Answers) {
  return requiredGroups.reduce((count, group) => {
    if (group === "goals") {
      return count + (answers.goals.length > 0 ? 1 : 0);
    }

    if (group === "symptoms") {
      return count + (answers.symptoms.length > 0 || answers.feelGreat ? 1 : 0);
    }

    return count + (answers[group] ? 1 : 0);
  }, 0);
}

function pillClasses(selected: boolean) {
  return cx(
    "rounded-md border px-4 py-2 text-sm font-semibold transition",
    selected
      ? "border-[#1FA77A] bg-[#1FA77A] text-white"
      : "border-foreground/10 bg-white text-[#20343A] hover:border-[#1FA77A]/40 hover:bg-[#1FA77A]/5"
  );
}

function cardOptionClasses(selected: boolean) {
  return cx(
    "rounded-md border px-4 py-3 text-left text-sm font-semibold transition",
    selected
      ? "border-[#1FA77A] bg-[#1FA77A] text-white"
      : "border-foreground/10 bg-white text-[#20343A] hover:border-[#1FA77A]/40 hover:bg-[#1FA77A]/5"
  );
}

function formatHeightImperial(value: string) {
  const cm = Number(value);

  if (!Number.isFinite(cm) || cm <= 0) {
    return "";
  }

  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;

  return `${feet} ft ${inches} in`;
}

function formatWeightImperial(value: string) {
  const kg = Number(value);

  if (!Number.isFinite(kg) || kg <= 0) {
    return "";
  }

  return `${Math.round(kg * 2.20462)} lb`;
}

type AssessmentFlowProps = Readonly<{
  exampleTestimonial?: BlogTestimonial | null;
  locale: Locale;
  prefillAnswers?: unknown;
  returningPlan?: "precision" | "pro" | null;
  returningPlanId?: string;
}>;

type AssessmentQuestion = Readonly<{
  content: React.ReactNode;
  hint?: string;
  id: string;
  isAnswered: boolean;
  label: string;
  required?: boolean;
  why?: string;
}>;

type AssessmentSection = Readonly<{
  description: string;
  id: string;
  optional?: boolean;
  questions: AssessmentQuestion[];
  title: string;
}>;

type ProcessingStepState = "active" | "complete" | "failed" | "pending";

type ProcessingStatus = Readonly<{
  healthScore?: HealthScoreResult;
  planId: string;
  queuePosition: number;
  status: "failed" | "preparing" | "queued" | "ready";
  steps: Array<
    Readonly<{
      id: string;
      state: ProcessingStepState;
    }>
  >;
}>;

const PROCESSING_STEP_MIN_MS = 1000;
const PROCESSING_COMPLETE_HOLD_MS = 1000;
const ASSESSMENT_REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    ASSESSMENT_REQUEST_TIMEOUT_MS
  );

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function getProcessingStepIndex(status: ProcessingStatus) {
  const failedIndex = status.steps.findIndex((step) => step.state === "failed");

  if (failedIndex >= 0) {
    return failedIndex;
  }

  const activeIndex = status.steps.findIndex((step) => step.state === "active");

  if (activeIndex >= 0) {
    return activeIndex;
  }

  const completeIndex = status.steps.reduce(
    (latest, step, index) => (step.state === "complete" ? index : latest),
    -1
  );

  return Math.max(0, completeIndex);
}

function getInitialProcessingStepIndex(status: ProcessingStatus) {
  return getProcessingStepIndex(status);
}

function isStepComplete(status: ProcessingStatus, index: number) {
  return status.steps[index]?.state === "complete";
}

function getPacedProcessingStatus(
  target: ProcessingStatus,
  stepIndex: number,
  terminal = false
): ProcessingStatus {
  return {
    ...target,
    status: terminal ? target.status : target.status === "failed" ? "failed" : "preparing",
    steps: target.steps.map((step, index) => {
      if (index < stepIndex) {
        return { ...step, state: "complete" as const };
      }

      if (index === stepIndex) {
        if (target.status === "failed" && step.state === "failed") {
          return { ...step, state: "failed" as const };
        }

        return {
          ...step,
          state: terminal && step.state === "complete" ? "complete" : "active"
        };
      }

      return { ...step, state: "pending" as const };
    })
  };
}

function buildExampleProcessingStatus(planId: string): ProcessingStatus {
  return {
    planId,
    queuePosition: 0,
    status: "preparing",
    steps: [
      { id: "assessment", state: "complete" },
      { id: "score", state: "complete" },
      { id: "scoreAnalysis", state: "complete" },
      { id: "payment", state: "complete" },
      { id: "formulation", state: "active" },
      { id: "safety", state: "pending" },
      { id: "results", state: "pending" }
    ]
  };
}

function buildExampleQueuedStatus(planId: string): ProcessingStatus {
  return {
    planId,
    queuePosition: 0,
    status: "ready",
    steps: [
      { id: "assessment", state: "complete" },
      { id: "score", state: "complete" },
      { id: "scoreAnalysis", state: "complete" },
      { id: "payment", state: "complete" },
      { id: "formulation", state: "complete" },
      { id: "safety", state: "pending" },
      { id: "results", state: "pending" }
    ]
  };
}

function healthScoreBpmFields(healthScore: HealthScoreResult | null | undefined) {
  const lowestDomain = healthScore?.domains
    .slice()
    .sort((a, b) => a.score - b.score)[0];

  return {
    healthScore: healthScore?.score,
    lowestDomain: lowestDomain?.id,
    metrics: {
      domainScores: healthScore?.domains.reduce<Record<string, number>>(
        (scores, domain) => {
          scores[domain.id] = domain.score;
          return scores;
        },
        {}
      )
    },
    scoreBand: healthScore?.band
  };
}

type PlanTier = Readonly<{
  cta: string;
  description: string;
  featured?: boolean;
  features: string[];
  id: string;
  name: string;
  price: string;
  priceSuffix: string;
  tierBadge?: string;
}>;

type PlanContent = Readonly<{
  back: string;
  badge: string;
  eyebrow: string;
  subtitle: string;
  tiers: PlanTier[];
  title: string;
}>;

type QuestionWhyMap = Record<string, string>;

const questionWhyEn: QuestionWhyMap = {
  activity:
    "Activity level changes recovery, protein, electrolyte, and performance support needs.",
  age:
    "Age changes baseline needs for bone, muscle, metabolic, and recovery support.",
  alcohol:
    "Alcohol intake can affect B-vitamin and magnesium needs, and shapes safety notes.",
  budget:
    "Budget keeps recommendations realistic and prevents an overbuilt stack.",
  coffee: "Caffeine gives context for sleep, stress, and energy patterns.",
  conditions:
    "Known considerations help us avoid mismatched recommendations and flag extra caution.",
  country:
    "Country helps infer climate, latitude, marketplace, and product availability.",
  diet:
    "Diet pattern helps identify likely gaps and avoid recommending things you already get regularly.",
  energy:
    "Energy level helps cross-check goals against how you feel day to day.",
  family:
    "Family history adds useful risk context for long-term wellness priorities.",
  fish: "Fatty fish intake is the simplest proxy for omega-3 intake.",
  form: "Preferred format helps match products you are likely to stick with.",
  goals:
    "Goals set the priority order so the brief focuses on what matters most.",
  gut: "Digestion affects comfort, nutrient absorption, and product tolerance.",
  "height-weight":
    "Body size helps estimate practical dose ranges and avoid generic recommendations.",
  labs:
    "Lab values make the brief more precise than symptom-based estimates alone.",
  lifestage:
    "Hormonal stage can change iron, bone, sleep, and symptom priorities.",
  meds:
    "Medications are essential for safety screening and avoiding interaction risks.",
  name:
    "This is only used to personalise the brief. It is completely okay to stay anonymous.",
  pills: "Capsule limit helps keep the plan usable day to day.",
  protein:
    "Protein intake helps interpret activity, recovery, muscle, and satiety needs.",
  review:
    "This is your chance to add context that structured questions might miss.",
  sex:
    "Some nutrient ranges, hormonal considerations, and safety checks differ by biological sex.",
  skin:
    "Skin tone affects how much vitamin D your body may produce from sunlight.",
  sleep:
    "Sleep quality adds detail beyond hours, showing whether rest is actually restorative.",
  "sleep-hours":
    "Sleep duration is a major recovery signal and helps prioritize the brief.",
  smoke:
    "Smoking status changes antioxidant and vitamin C considerations.",
  stress: "Stress level helps prioritize recovery and calm support.",
  "stress-source":
    "The source of stress helps separate lifestyle context from supplement support.",
  sun:
    "Sun exposure influences how strongly vitamin D support should be considered.",
  supps:
    "Current supplements help avoid duplicate products and unnecessary spend.",
  symptoms:
    "Symptoms help distinguish current friction points from longer-term goals.",
  vo2:
    "VO2 max is a useful proxy for cardiorespiratory fitness and long-term health capacity.",
  wearable:
    "Wearable data can sharpen recovery and activity interpretation."
};

const questionWhyTh: QuestionWhyMap = {
  activity:
    "กิจกรรมมีผลต่อการฟื้นตัว โปรตีน อิเล็กโทรไลต์ และการสนับสนุนสมรรถภาพ",
  age:
    "อายุมีผลต่อความต้องการด้านกระดูก กล้ามเนื้อ เมตาบอลิซึม และการฟื้นตัว",
  alcohol:
    "แอลกอฮอล์อาจเกี่ยวกับวิตามิน B แมกนีเซียม และหมายเหตุด้านความปลอดภัย",
  budget: "งบประมาณทำให้คำแนะนำใช้งานจริง ไม่ใหญ่เกินจำเป็น",
  coffee: "คาเฟอีนช่วยอธิบายรูปแบบการนอน ความเครียด และพลังงาน",
  conditions:
    "ข้อมูลสุขภาพช่วยหลีกเลี่ยงคำแนะนำที่ไม่เหมาะและเพิ่มข้อควรระวัง",
  country:
    "ประเทศช่วยประเมินภูมิอากาศ ละติจูด ตลาด และสินค้าที่หาได้",
  diet:
    "รูปแบบอาหารช่วยเห็นช่องว่างที่เป็นไปได้และหลีกเลี่ยงสิ่งที่คุณได้รับเพียงพอแล้ว",
  energy:
    "ระดับพลังงานช่วยเทียบเป้าหมายกับความรู้สึกจริงในแต่ละวัน",
  family:
    "ประวัติครอบครัวเพิ่มบริบทความเสี่ยงสำหรับเป้าหมายสุขภาพระยะยาว",
  fish: "ปลามันเป็นตัวแทนง่ายๆ ของปริมาณโอเมก้า-3 จากอาหาร",
  form:
    "รูปแบบที่ชอบช่วยเลือกผลิตภัณฑ์ที่คุณมีแนวโน้มจะใช้ต่อเนื่อง",
  goals: "เป้าหมายช่วยจัดลำดับความสำคัญของบรีฟ",
  gut: "การย่อยมีผลต่อความสบาย การดูดซึม และความทนต่อผลิตภัณฑ์",
  "height-weight":
    "ขนาดร่างกายช่วยประเมินช่วงปริมาณให้เหมาะขึ้น ไม่ใช่คำแนะนำแบบทั่วไป",
  labs:
    "ค่าตรวจช่วยให้บรีฟแม่นกว่าการประเมินจากอาการอย่างเดียว",
  lifestage:
    "ช่วงฮอร์โมนอาจมีผลต่อธาตุเหล็ก กระดูก การนอน และอาการต่างๆ",
  meds:
    "ข้อมูลยาจำเป็นต่อการตรวจความปลอดภัยและลดความเสี่ยงจากปฏิกิริยาระหว่างกัน",
  name:
    "ใช้เพื่อให้บรีฟเป็นส่วนตัวขึ้นเท่านั้น คุณสามารถไม่ระบุตัวตนได้",
  pills: "จำนวนเม็ดสูงสุดช่วยให้แผนทำตามได้จริงในชีวิตประจำวัน",
  protein:
    "โปรตีนช่วยตีความกิจกรรม การฟื้นตัว กล้ามเนื้อ และความอิ่ม",
  review:
    "ส่วนนี้ให้คุณเพิ่มบริบทที่คำถามแบบเลือกตอบอาจเก็บไม่ครบ",
  sex:
    "สารอาหารบางช่วง ฮอร์โมน และข้อควรระวังแตกต่างกันตามเพศชีวภาพ",
  skin: "สีผิวมีผลต่อการสร้างวิตามินดีจากแสงแดด",
  sleep:
    "คุณภาพการนอนบอกได้ว่าเวลานอนนั้นฟื้นตัวจริงแค่ไหน",
  "sleep-hours":
    "เวลานอนเป็นสัญญาณสำคัญของการฟื้นตัวและการจัดลำดับคำแนะนำ",
  smoke:
    "การสูบบุหรี่มีผลต่อการพิจารณาสารต้านอนุมูลอิสระและวิตามิน C",
  stress: "ความเครียดช่วยจัดลำดับการฟื้นตัวและการสนับสนุนความสงบ",
  "stress-source":
    "แหล่งความเครียดช่วยแยกบริบทชีวิตจากสิ่งที่อาหารเสริมช่วยได้",
  sun: "แดดที่ได้รับมีผลต่อการพิจารณาวิตามินดี",
  supps:
    "อาหารเสริมที่ใช้อยู่ช่วยหลีกเลี่ยงการซ้ำซ้อนและค่าใช้จ่ายไม่จำเป็น",
  symptoms:
    "อาการปัจจุบันช่วยแยกสิ่งที่ควรดูแลก่อนจากเป้าหมายระยะยาว",
  vo2:
    "VO2 max เป็นตัวชี้วัดสมรรถภาพหัวใจและปอดที่มีประโยชน์",
  wearable:
    "ข้อมูลจากอุปกรณ์ช่วยเพิ่มความแม่นยำเรื่องการฟื้นตัวและกิจกรรม"
};

function getQuestionWhy(locale: Locale, id: string) {
  return (locale === "th" ? questionWhyTh : questionWhyEn)[id];
}

function useCompactAssessment() {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsCompact(query.matches);

    update();
    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
  }, []);

  return isCompact;
}

function getPlanContent(locale: Locale): PlanContent {
  if (locale === "th") {
    return {
      back: "กลับไปที่แบบประเมิน",
      badge: "แนะนำ",
      eyebrow: "เลือกแผนบรีฟ",
      subtitle:
        "ตอนนี้ทุกแผนจะพาไปยังคิวสร้างสูตรเดียวกัน เพื่อให้เราทดสอบขั้นตอนการชำระเงินได้ก่อน",
      title: "เลือกความละเอียดของคำแนะนำ",
      tiers: [
        {
          cta: "ไปต่อ",
          description:
            "บรีฟสูตรเต็ม พร้อมปรับขนาดและตัวเลือกผลิตภัณฑ์ให้เหมาะกับข้อมูลของคุณมากขึ้น",
          featured: true,
          features: [
            "บรีฟสูตรอาหารเสริมแบบครบถ้วน",
            "ช่วงปริมาณที่ปรับตามร่างกาย",
            "รวมข้อมูลยา แล็บ และข้อควรระวัง",
            "ตัวเลือกผลิตภัณฑ์และทางเลือกทดแทน",
            "พร้อมเช็คอินซ้ำใน 60 วัน"
          ],
          id: "precision",
          name: "แผนความแม่นยำ",
          price: "฿399",
          priceSuffix: "ครั้งเดียว"
        },
        {
          cta: "ไปต่อ",
          description:
            "การดูแลต่อเนื่องพร้อม AI เอเจนต์ที่ช่วยปรับคำแนะนำให้เข้ากับความต้องการรายวัน",
          features: [
            "ทุกอย่างในแผนความแม่นยำ",
            "AI เอเจนต์สำหรับความต้องการรายวัน",
            "ปรับเวลาทานและกิจวัตร",
            "รองรับการเดินทาง การฝึก และการนอน",
            "ทบทวนลำดับความสำคัญเมื่อข้อมูลเปลี่ยน"
          ],
          id: "pro",
          name: "โปร",
          price: "฿1,490",
          priceSuffix: "/เดือน",
          tierBadge: "มี AI เอเจนต์"
        }
      ]
    };
  }

  return {
    back: "Back to assessment",
    badge: "Recommended",
    eyebrow: "Choose your brief",
    subtitle:
      "Choose the level of guidance you want before we prepare your formulation.",
    title: "Select the level of guidance",
    tiers: [
      {
        cta: "Go",
        description:
          "The full formulation brief with more precise dosing logic and practical product matching.",
        featured: true,
        features: [
          "Complete supplement formulation brief",
          "Body-size adjusted dose ranges",
          "Medication and lab flags included",
          "Recommended products and alternatives",
          "60-day reassessment prompt"
        ],
        id: "precision",
        name: "Precision Plan",
        price: "฿399",
        priceSuffix: "one time"
      },
      {
        cta: "Go",
        description:
          "Ongoing support with an AI agent that adapts the plan to day-to-day requirements.",
        features: [
          "Everything in Precision Plan",
          "AI agent for daily needs",
          "Routine and timing adjustments",
          "Travel, training, and sleep adaptation",
          "Priority review as your data changes"
        ],
        id: "pro",
        name: "Pro Plan",
        price: "฿1,490",
        priceSuffix: "/month",
        tierBadge: "AI agent included"
      }
    ]
  };
}

export function AssessmentFlow({
  exampleTestimonial,
  locale,
  prefillAnswers,
  returningPlan,
  returningPlanId
}: AssessmentFlowProps) {
  const copy = copies[locale];
  const router = useRouter();
  const showDevShortcut = process.env.NEXT_PUBLIC_SHOW_DEV_SHORTCUT !== "false";
  const [answers, setAnswers] = useState<Answers>(() =>
    buildInitialAnswers(prefillAnswers)
  );
  const [sectionIndex, setSectionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [processingStatus, setProcessingStatus] =
    useState<ProcessingStatus | null>(null);
  const [displayedProcessingStatus, setDisplayedProcessingStatus] =
    useState<ProcessingStatus | null>(null);
  const [processingError, setProcessingError] = useState("");
  const [capturedStatus, setCapturedStatus] =
    useState<ProcessingStatus | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [showPlans, setShowPlans] = useState(false);
  const [showExampleExit, setShowExampleExit] = useState(false);
  const [processingMode, setProcessingMode] =
    useState<"example" | "formulation" | "score">("formulation");
  const [healthScore, setHealthScore] = useState<HealthScoreResult | null>(
    null
  );
  const [exampleEmail, setExampleEmail] = useState("");
  const [exampleError, setExampleError] = useState("");
  const [includeExampleReassessment, setIncludeExampleReassessment] =
    useState(true);
  const [exampleLoading, setExampleLoading] = useState(false);
  const [exampleRequest, setExampleRequest] = useState<{
    email: string;
    planId: string;
    requestId: string;
  } | null>(null);
  const captureInFlight = useRef<Promise<ProcessingStatus | null> | null>(null);
  const displayedStepStartedAt = useRef(0);
  const pollFailureCount = useRef(0);
  const assessmentStartedTracked = useRef(false);
  const planGateTracked = useRef(false);
  const exampleExitTracked = useRef(false);
  const isCompact = useCompactAssessment();

  const clearProcessingStatus = useCallback(() => {
    displayedStepStartedAt.current = 0;
    setDisplayedProcessingStatus(null);
    setProcessingStatus(null);
  }, []);

  const completed = countRequired(answers);
  const requiredTotal = requiredGroups.length;
  const progress = Math.round((completed / requiredTotal) * 100);
  const canGenerate = completed === requiredTotal;
  const hasReturningProAccess = returningPlan === "pro";
  const reassessmentAlreadyOptedIn = validateLeadEmail(
    answers.reassessmentEmail
  ).ok;
  const progressLabel = canGenerate
    ? copy.progress.complete
    : copy.progress.status(completed, requiredTotal);

  useEffect(() => {
    if (assessmentStartedTracked.current || completed <= 0) {
      return;
    }

    assessmentStartedTracked.current = true;
    trackBpmEvent("assessment_started", {
      eventType: "funnel",
      locale,
      properties: {
        completedRequired: completed,
        returningPlan,
        returningPlanId: returningPlanId || undefined
      }
    });
  }, [completed, locale, returningPlan, returningPlanId]);

  useEffect(() => {
    if (!showPlans || planGateTracked.current) {
      return;
    }

    planGateTracked.current = true;
    trackBpmEvent("plan_gate_viewed", {
      eventType: "funnel",
      locale,
      properties: {
        returningPlan,
        returningPlanId: returningPlanId || undefined
      },
      ...healthScoreBpmFields(healthScore)
    });
  }, [healthScore, locale, returningPlan, returningPlanId, showPlans]);

  useEffect(() => {
    if (!showExampleExit || exampleExitTracked.current) {
      return;
    }

    exampleExitTracked.current = true;
    trackBpmEvent("free_example_exit_viewed", {
      eventType: "email",
      exampleRequestId: exampleRequest?.requestId,
      locale,
      planId: exampleRequest?.planId
    });
  }, [exampleRequest?.planId, exampleRequest?.requestId, locale, showExampleExit]);
  const ui =
    locale === "th"
      ? {
          back: "ย้อนกลับ",
          close: "ปิด",
          continue: "ต่อไป",
          currentStep: "ขั้นตอนปัจจุบัน",
          infoLabel: "ทำไมคำถามนี้สำคัญ",
          optionalSection: "ความแม่นยำ",
          requiredSection: "พื้นฐาน",
          processingError: "ไม่สามารถเริ่มการประมวลผลได้ โปรดลองอีกครั้ง",
          processingQueue: (count: number) =>
            count > 0
              ? `มี ${count} คนอยู่ในคิวก่อนคุณ`
              : "กำลังจัดเตรียมสูตรของคุณ",
          processingSteps: {
            assessment: "ทำแบบประเมินเสร็จแล้ว",
            score: "กำลังเตรียม HealthScore",
            scoreAnalysis: "กำลังวิเคราะห์ HealthScore",
            payment: "กำลังประมวลผลการชำระเงิน",
            formulation: "กำลังเตรียมสูตร",
            safety: "กำลังปรับสูตรให้เหมาะสม",
            results: "เสร็จสมบูรณ์"
          },
          processingSubtitle:
            "เราได้รับคำตอบของคุณแล้ว และกำลังจัดคิวเพื่อสร้างสูตรอาหารเสริม",
          processingTitle: "กำลังประมวลผลแบบประเมินของคุณ",
          scoreProcessingQueue: "กำลังเตรียมคะแนนสุขภาพของคุณ",
          scoreProcessingSteps: {
            assessment: "ทำแบบประเมินเสร็จแล้ว",
            score: "กำลังเตรียม HealthScore",
            scoreAnalysis: "กำลังวิเคราะห์ HealthScore",
            payment: "กำลังประมวลผลการชำระเงิน",
            formulation: "กำลังเตรียมสูตร",
            safety: "กำลังปรับสูตรให้เหมาะสม",
            results: "เสร็จสมบูรณ์"
          },
          scoreProcessingSubtitle:
            "เรากำลังประเมินภาพรวมสุขภาพจากคำตอบของคุณก่อนแสดงตัวเลือกแผน",
          scoreProcessingTitle: "กำลังเตรียม HealthScore ของคุณ",
          scoreGate: {
            emailButton: "ส่งแผนฟรี 3 ข้อ + HealthScore",
            emailDescription:
              "ใส่อีเมลของคุณ แล้วเราจะส่งแผนโภชนาการฟรี 3 ข้อที่ครอบคลุมพื้นฐานสำคัญ เพื่อช่วยเริ่มต้นเส้นทาง wellness ของคุณ",
            emailDivider: "หรือรับแผนโภชนาการฟรี 3 ข้อทางอีเมล",
            emailError: "กรุณาใส่อีเมลที่ถูกต้อง",
            emailPlaceholder: "your@email.com",
            emailTitle: "ยังไม่พร้อมปลดล็อก?",
            planDescription:
              "เลือกระดับคำแนะนำที่ต้องการ ก่อนที่เราจะเตรียมสูตรของคุณ",
            planTitle: "ปลดล็อกแผนโภชนาการเฉพาะตัวของคุณ",
            preparing: "กำลังเตรียม...",
            proContinueCta: "ไปต่อ",
            proContinueDescription:
              "คุณมีสิทธิ์แผน Pro อยู่แล้ว เราจะไปต่อเพื่อสร้างสูตรเวอร์ชันใหม่โดยไม่แสดงตัวเลือกชำระเงิน",
            proContinueTitle: "แผน Pro พร้อมใช้งาน",
            reassessmentDescription: "",
            reassessmentTitle:
              "รวมการประเมินซ้ำฟรีใน 60 วัน ยกเลิกได้ทุกเมื่อ",
            title: "HealthScore ของคุณพร้อมแล้ว"
          },
          exampleExit: {
            body:
              "เรากำลังเตรียมสูตรฉบับเต็มอยู่เบื้องหลัง และจะส่งตัวอย่างแผนโภชนาการ 3 ข้อแบบสั้นไปยังอีเมลของคุณ",
            chatBody:
              "เลือกช่องทางที่สะดวกเพื่อคุยต่อกับ AI advisor เฉพาะทาง WhatsApp สามารถเปิดพร้อม plan ได้ และ Telegram ทำได้เมื่อใช้ลิงก์ bot ส่วน LINE อาจต้องส่ง plan ที่แสดงอยู่ด้านล่าง หากยังไม่ได้ตั้งค่า LIFF deep link",
            chatButton: "เปิดแชต",
            chatPlanLabel: "แผน",
            chatQrAlt: "QR code สำหรับเชื่อมต่อ MattaNutra AI advisor",
            chatTitle:
              "คุยกับ AI advisor ระหว่างรอตัวอย่างของคุณ",
            emailPrefix: "เราจะส่งไปที่",
            testimonialTitle: "ลูกค้าใช้ MattaNutra เพื่อเปลี่ยนข้อมูลสุขภาพให้เป็นขั้นตอนที่ทำได้จริง",
            title: "ตัวอย่างของคุณกำลังถูกจัดเตรียม"
          },
          exampleProcessingQueue: "กำลังเตรียมอีเมลตัวอย่างของคุณ",
          exampleProcessingSteps: {
            assessment: "ทำแบบประเมินเสร็จแล้ว",
            score: "กำลังเตรียม HealthScore",
            scoreAnalysis: "กำลังวิเคราะห์ HealthScore",
            payment: "กำลังประมวลผลการชำระเงิน",
            formulation: "กำลังส่งคำขอสูตร",
            safety: "กำลังปรับสูตรให้เหมาะสม",
            results: "เสร็จสมบูรณ์"
          },
          exampleProcessingSubtitle:
            "เรากำลังเตรียมสูตรฉบับเต็มก่อนคัดส่วนสำคัญเป็นตัวอย่างทางอีเมล",
          exampleProcessingTitle: "กำลังเตรียมตัวอย่างของคุณ",
          retry: "ลองอีกครั้ง",
          statusLabels: {
            active: "ตอนนี้",
            complete: "เสร็จแล้ว",
            failed: "ไม่สำเร็จ",
            pending: "รอดำเนินการ"
          },
          section: (current: number, total: number) =>
            `ส่วนที่ ${current} จาก ${total}`,
          sectionHint: "ตอบคำถามในส่วนนี้เพื่อไปต่อ",
          skipOptional: "ข้ามขั้นตอนเสริม",
          step: (current: number, total: number) =>
            `คำถามที่ ${current} จาก ${total}`,
          validation: "ตอบคำถามจำเป็นเพื่อไปต่อ",
          wellnessDisclaimer:
            "แบบประเมินนี้เป็นข้อมูลเพื่อ wellness เท่านั้น ไม่ใช่การวินิจฉัย การรักษา หรือคำแนะนำให้หยุดยา"
        }
      : {
          back: "Back",
          close: "Close",
          continue: "Continue",
          currentStep: "Current step",
          infoLabel: "Why this matters",
          optionalSection: "Precision",
          requiredSection: "Foundation",
          processingError: "We could not start processing. Please try again.",
          processingQueue: (count: number) =>
            count > 0
              ? `${count} ${count === 1 ? "person is" : "people are"} queued ahead of you`
              : "Your formulation is being prepared",
          processingSteps: {
            assessment: "Assessment complete",
            score: "Preparing your HealthScore",
            scoreAnalysis: "Analyzing HealthScore",
            payment: "Processing Payment",
            formulation: "Preparing Formulation",
            safety: "Refining Formulation",
            results: "Complete"
          },
          processingSubtitle:
            "We have received your preferences and queued them for formulation.",
          processingTitle: "Processing your assessment",
          scoreProcessingQueue: "Preparing your HealthScore",
          scoreProcessingSteps: {
            assessment: "Assessment complete",
            score: "Preparing your HealthScore",
            scoreAnalysis: "Analyzing HealthScore",
            payment: "Processing Payment",
            formulation: "Preparing Formulation",
            safety: "Refining Formulation",
            results: "Complete"
          },
          scoreProcessingSubtitle:
            "We are scoring your main wellness domains before showing the plan options.",
          scoreProcessingTitle: "Preparing your HealthScore",
          scoreGate: {
            emailButton: "Send My Free 3-Point Plan + HealthScore",
            emailDescription:
              "Enter your email address and we'll send you a free 3-point nutrition plan covering the essentials to help you on your wellness journey.",
            emailDivider: "or get a free 3-point nutrition plan by email",
            emailError: "Enter a valid email address",
            emailPlaceholder: "your@email.com",
            emailTitle: "Not ready to unlock?",
            planDescription:
              "Choose the level of guidance you want before we prepare your formulation.",
            planTitle: "Unlock your bespoke nutrition plan",
            preparing: "Preparing...",
            proContinueCta: "Continue",
            proContinueDescription:
              "Your Pro access is active, so we can prepare a new formulation version without showing payment options.",
            proContinueTitle: "Pro plan active",
            reassessmentDescription: "",
            reassessmentTitle:
              "Include a free 60-day reassessment. Cancel anytime.",
            title: "Your HealthScore is ready"
          },
          exampleExit: {
            body:
              "We are preparing the full formulation in the background and sending a focused 3-point nutrition example to your inbox.",
            chatBody:
              "Choose your preferred channel to continue with the specialist AI advisor. WhatsApp can open with your plan attached, and Telegram can do the same when it uses a bot link. LINE may need you to send the plan shown below unless a LIFF deep link is configured.",
            chatButton: "Open chat",
            chatPlanLabel: "Plan",
            chatQrAlt: "QR code to connect with the MattaNutra AI advisor",
            chatTitle: "Chat with the AI advisor while you wait",
            emailPrefix: "We will send it to",
            testimonialTitle:
              "People use MattaNutra to turn wellness data into practical next steps",
            title: "Your example is being prepared"
          },
          exampleProcessingQueue: "Preparing your email example",
          exampleProcessingSteps: {
            assessment: "Assessment complete",
            score: "Preparing your HealthScore",
            scoreAnalysis: "Analyzing HealthScore",
            payment: "Processing Payment",
            formulation: "Requesting Formulation",
            safety: "Refining Formulation",
            results: "Complete"
          },
          exampleProcessingSubtitle:
            "We are preparing the full formulation first, then selecting the key points for your email example.",
          exampleProcessingTitle: "Preparing your example",
          retry: "Try again",
          statusLabels: {
            active: "Now",
            complete: "Complete",
            failed: "Failed",
            pending: "Pending"
          },
          section: (current: number, total: number) =>
            `Section ${current} of ${total}`,
          sectionHint: "Complete the required questions in this section to continue.",
          skipOptional: "Skip optional",
          step: (current: number, total: number) =>
            `Question ${current} of ${total}`,
          validation: "Answer the required questions to continue",
          wellnessDisclaimer:
            "This assessment provides wellness information only. It is not diagnosis, treatment, or advice to stop medication."
        };

  function setSingle(key: keyof Answers, value: string) {
    setAnswers((current) => ({
      ...current,
      [key]: value,
      ...(key === "sex" && value !== "female" ? { lifestage: "" } : {}),
      ...(key === "meds" && value !== "yes" ? { medTypes: [] } : {}),
      ...(key === "vo2Known" && value === "yes" ? { vo2Proxy: "" } : {}),
      ...(key === "vo2Known" && value !== "yes" ? { vo2Max: "" } : {})
    }));
  }

  function toggleMulti(
    key: "conditions" | "family" | "goals" | "medTypes" | "symptoms",
    value: string,
    max = 99
  ) {
    setAnswers((current) => {
      const values = current[key];
      const selected = values.includes(value);

      if (!selected && values.length >= max) {
        return current;
      }

      if (key === "conditions" || key === "family") {
        if (value === "none") {
          return {
            ...current,
            [key]: selected ? [] : ["none"]
          };
        }

        return {
          ...current,
          [key]: selected
            ? values.filter((item) => item !== value)
            : [...values.filter((item) => item !== "none"), value]
        };
      }

      return {
        ...current,
        [key]: selected
          ? values.filter((item) => item !== value)
          : [...values, value],
        ...(key === "symptoms" ? { feelGreat: false } : {})
      };
    });
  }

  function markFeelingGreat() {
    setAnswers((current) => ({
      ...current,
      feelGreat: !current.feelGreat,
      symptoms: []
    }));
  }

  const sections: AssessmentSection[] = [
    {
      description:
        locale === "th"
          ? "ข้อมูลพื้นฐานช่วยให้เราปรับแผนให้เหมาะกับร่างกายและไลฟ์สไตล์ของคุณ"
          : "A few basics help us shape the plan around your body and lifestyle.",
      id: "about",
      questions: [
        {
          content: (
            <PillGroup
              options={copy.about.sexOptions}
              selected={answers.sex}
              onSelect={(value) => setSingle("sex", value)}
            />
          ),
          id: "sex",
          isAnswered: Boolean(answers.sex),
          label: copy.about.sex,
          required: true
        },
        {
          content: (
            <PillGroup
              options={copy.about.ageOptions}
              selected={answers.age}
              onSelect={(value) => setSingle("age", value)}
            />
          ),
          id: "age",
          isAnswered: Boolean(answers.age),
          label: copy.about.age,
          required: true
        },
        {
          content: (
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#20343A]">
                  <span>{copy.about.height}</span>
                  <span className="rounded-md bg-[#3A7BD5]/10 px-2 py-1 text-[#3A7BD5]">
                    {answers.heightCm || "170"} cm
                  </span>
                </span>
                <input
                  type="range"
                  min={120}
                  max={220}
                  step={1}
                  value={answers.heightCm || "170"}
                  className="mt-3 block w-full accent-[#1FA77A]"
                  onChange={(event) => setSingle("heightCm", event.target.value)}
                />
                <span className="mt-2 flex justify-end">
                  <span className="rounded-md bg-[#3A7BD5]/10 px-2 py-1 text-xs font-semibold text-[#3A7BD5]">
                    {formatHeightImperial(answers.heightCm || "170")}
                  </span>
                </span>
              </label>
              <label className="block">
                <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#20343A]">
                  <span>{copy.about.weight}</span>
                  <span className="rounded-md bg-[#3A7BD5]/10 px-2 py-1 text-[#3A7BD5]">
                    {answers.weightKg || "70"} kg
                  </span>
                </span>
                <input
                  type="range"
                  min={35}
                  max={180}
                  step={1}
                  value={answers.weightKg || "70"}
                  className="mt-3 block w-full accent-[#1FA77A]"
                  onChange={(event) => setSingle("weightKg", event.target.value)}
                />
                <span className="mt-2 flex justify-end">
                  <span className="rounded-md bg-[#3A7BD5]/10 px-2 py-1 text-xs font-semibold text-[#3A7BD5]">
                    {formatWeightImperial(answers.weightKg || "70")}
                  </span>
                </span>
              </label>
            </div>
          ),
          id: "height-weight",
          isAnswered: Boolean(answers.heightCm && answers.weightKg),
          label:
            locale === "th"
              ? "ส่วนสูงและน้ำหนัก"
              : "Height and weight",
          required: true
        },
        {
          content: (
            <SkinToneGroup
              options={copy.about.skinOptions}
              selected={answers.skin}
              onSelect={(value) => setSingle("skin", value)}
            />
          ),
          id: "skin",
          isAnswered: Boolean(answers.skin),
          label: copy.about.skin,
          required: true
        },
        {
          content: (
            <select
              value={answers.country}
              className="block w-full rounded-md border border-foreground/10 bg-white px-4 py-3 text-sm font-semibold text-[#20343A] outline-none transition focus:border-[#1FA77A] focus:ring-2 focus:ring-[#1FA77A]/15"
              onChange={(event) => setSingle("country", event.target.value)}
            >
              <option value="">
                {locale === "th" ? "เลือกประเทศ" : "Select country"}
              </option>
              {copy.about.countryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ),
          id: "country",
          isAnswered: Boolean(answers.country),
          label: copy.about.country,
          required: true
        },
        {
          content: (
            <PillGroup
              options={copy.lifestyle.sunOptions}
              selected={answers.sun}
              onSelect={(value) => setSingle("sun", value)}
            />
          ),
          id: "sun",
          isAnswered: Boolean(answers.sun),
          label: copy.lifestyle.sun,
          required: true
        }
      ],
      title: copy.about.title
    },
    {
      description:
        locale === "th"
          ? "เลือกสิ่งที่สำคัญที่สุด เพื่อให้สูตรมีทิศทางชัดเจนตั้งแต่ต้น"
          : "Choose what matters most so the formulation has a clear direction.",
      id: "goals",
      questions: [
        {
          content: (
            <OptionGrid
              max={3}
              options={copy.goals.options}
              selected={answers.goals}
              onToggle={(value) => toggleMulti("goals", value, 3)}
            />
          ),
          hint: copy.goals.hint,
          id: "goals",
          isAnswered: answers.goals.length > 0,
          label: copy.goals.prompt,
          required: true
        }
      ],
      title: copy.goals.title
    },
    {
      description:
        locale === "th"
          ? "บอกเราว่าตอนนี้คุณรู้สึกอย่างไร เพื่อแยกสิ่งที่ควรสนับสนุนเป็นอันดับแรก"
          : "Tell us how you feel right now so we can separate priorities from nice-to-haves.",
      id: "symptoms",
      questions: [
        {
          content: (
            <>
              <OptionGrid
                options={copy.symptoms.options}
                selected={answers.symptoms}
                onToggle={(value) => toggleMulti("symptoms", value)}
              />
              <div className="mt-3">
                <button
                  type="button"
                  className={cardOptionClasses(answers.feelGreat)}
                  onClick={markFeelingGreat}
                >
                  {copy.symptoms.great.label}
                </button>
              </div>
            </>
          ),
          hint: copy.symptoms.hint,
          id: "symptoms",
          isAnswered: answers.symptoms.length > 0 || answers.feelGreat,
          label: copy.symptoms.prompt,
          required: true
        }
      ],
      title: copy.symptoms.title
    },
    {
      description:
        locale === "th"
          ? "เวลานอนเฉลี่ยเป็นพื้นฐานสำคัญก่อนเพิ่มรายละเอียดคุณภาพการนอนในขั้นตอนเสริม"
          : "Average sleep duration gives us the baseline before optional sleep-quality detail.",
      id: "sleep-basics",
      questions: [
        {
          content: (
            <PillGroup
              options={copy.sleepBasics.options}
              selected={answers.sleepHours}
              onSelect={(value) => setSingle("sleepHours", value)}
            />
          ),
          id: "sleep-hours",
          isAnswered: Boolean(answers.sleepHours),
          label: copy.sleepBasics.average,
          required: true
        },
        {
          content: (
            <ScaleGroup
              options={copy.symptoms.energyOptions}
              selected={answers.energy}
              onSelect={(value) => setSingle("energy", value)}
            />
          ),
          id: "energy",
          isAnswered: Boolean(answers.energy),
          label: copy.symptoms.energy
        },
        {
          content: (
            <PillGroup
              options={copy.about.activityOptions}
              selected={answers.activity}
              onSelect={(value) => setSingle("activity", value)}
            />
          ),
          id: "activity",
          isAnswered: Boolean(answers.activity),
          label: copy.about.activity,
          required: true
        }
      ],
      title: copy.sleepBasics.title
    },
    {
      description:
        locale === "th"
          ? "อาหาร เครื่องดื่ม และการสูบบุหรี่ช่วยให้เราปรับบรีฟให้เหมาะกับกิจวัตรจริง"
          : "Food, beverages, and smoking context keep the brief grounded in real habits.",
      id: "lifestyle",
      questions: [
        {
          content: (
            <PillGroup
              options={copy.lifestyle.dietOptions}
              selected={answers.diet}
              onSelect={(value) => setSingle("diet", value)}
            />
          ),
          id: "diet",
          isAnswered: Boolean(answers.diet),
          label: copy.lifestyle.diet,
          required: true
        },
        {
          content: (
            <PillGroup
              options={copy.lifestyle.fishOptions}
              selected={answers.fish}
              onSelect={(value) => setSingle("fish", value)}
            />
          ),
          id: "fish",
          isAnswered: Boolean(answers.fish),
          label: copy.lifestyle.fish,
          required: true
        },
        {
          content: (
            <PillGroup
              options={copy.lifestyle.smokeOptions}
              selected={answers.smoke}
              onSelect={(value) => setSingle("smoke", value)}
            />
          ),
          id: "smoke",
          isAnswered: Boolean(answers.smoke),
          label: copy.lifestyle.smoke,
          required: true
        },
        {
          content: (
            <PillGroup
              options={copy.lifestyle.alcoholOptions}
              selected={answers.alcohol}
              onSelect={(value) => setSingle("alcohol", value)}
            />
          ),
          id: "alcohol",
          isAnswered: Boolean(answers.alcohol),
          label: copy.lifestyle.alcohol,
          required: true
        },
        {
          content: (
            <PillGroup
              options={copy.lifestyle.coffeeOptions}
              selected={answers.coffee}
              onSelect={(value) => setSingle("coffee", value)}
            />
          ),
          id: "coffee",
          isAnswered: Boolean(answers.coffee),
          label: copy.lifestyle.coffee
        }
      ],
      title: copy.lifestyle.title
    },
    {
      description:
        locale === "th"
          ? "ยาและอาหารเสริมที่ใช้อยู่ช่วยให้เราตรวจทานความซ้ำซ้อนและข้อควรระวัง"
          : "Medication and supplement context helps us check safety flags and avoid doubling up.",
      id: "medications-supplements",
      questions: [
        {
          content: (
            <>
              <PillGroup
                options={copy.lifestyle.medsOptions}
                selected={answers.meds}
                onSelect={(value) => setSingle("meds", value)}
              />
              {answers.meds === "yes" ? (
                <div className="mt-4 rounded-lg border border-[#1FA77A]/20 bg-[#1FA77A]/5 p-4">
                  <p className="text-sm font-semibold text-[#20343A]">
                    {copy.lifestyle.medType}
                  </p>
                  <div className="mt-3">
                    <PillGroup
                      multi={true}
                      options={copy.lifestyle.medTypeOptions}
                      selected={answers.medTypes}
                      onToggle={(value) => toggleMulti("medTypes", value)}
                    />
                  </div>
                </div>
              ) : null}
            </>
          ),
          hint: copy.lifestyle.medsHint,
          id: "meds",
          isAnswered: Boolean(answers.meds),
          label: copy.lifestyle.meds,
          required: true
        },
        {
          content: (
            <PillGroup
              options={copy.lifestyle.suppsOptions}
              selected={answers.supps}
              onSelect={(value) => setSingle("supps", value)}
            />
          ),
          id: "supps",
          isAnswered: Boolean(answers.supps),
          label: copy.lifestyle.supps
        },
        ...(answers.sex === "female"
          ? [
              {
                content: (
                  <PillGroup
                    options={copy.lifestyle.lifestageOptions}
                    selected={answers.lifestage}
                    onSelect={(value) => setSingle("lifestage", value)}
                  />
                ),
                id: "lifestage",
                isAnswered: Boolean(answers.lifestage),
                label: copy.lifestyle.lifestage
              }
            ]
          : [])
      ],
      title: locale === "th" ? "ยาและอาหารเสริม" : "Medications and supplements"
    },
    {
      description:
        locale === "th"
          ? "กำหนดงบ รูปแบบ และความสะดวก เพื่อให้คำแนะนำเหมาะกับการใช้จริง"
          : "Set budget, format, and convenience constraints so the plan can be practical.",
      id: "preferences",
      questions: [
        {
          content: (
            <PillGroup
              options={copy.preferences.budgetOptions}
              selected={answers.budget}
              onSelect={(value) => setSingle("budget", value)}
            />
          ),
          id: "budget",
          isAnswered: Boolean(answers.budget),
          label: copy.preferences.budget,
          required: true
        },
        {
          content: (
            <PillGroup
              options={copy.preferences.pillsOptions}
              selected={answers.pills}
              onSelect={(value) => setSingle("pills", value)}
            />
          ),
          id: "pills",
          isAnswered: Boolean(answers.pills),
          label: copy.preferences.pills,
          required: true
        },
        {
          content: (
            <PillGroup
              options={copy.preferences.formOptions}
              selected={answers.form}
              onSelect={(value) => setSingle("form", value)}
            />
          ),
          id: "form",
          isAnswered: Boolean(answers.form),
          label: copy.preferences.form
        }
      ],
      title: copy.preferences.title
    },
    {
      description: copy.precision.helper,
      id: "precision",
      optional: true,
      questions: [
        {
          content: (
            <PillGroup
              options={copy.precision.proteinOptions}
              selected={answers.protein}
              onSelect={(value) => setSingle("protein", value)}
            />
          ),
          id: "protein",
          isAnswered: Boolean(answers.protein),
          label: copy.precision.protein
        },
        {
          content: (
            <ScaleGroup
              options={copy.precision.sleepOptions}
              selected={answers.sleep}
              onSelect={(value) => setSingle("sleep", value)}
            />
          ),
          id: "sleep",
          isAnswered: Boolean(answers.sleep),
          label: copy.precision.sleep
        },
        {
          content: (
            <ScaleGroup
              options={copy.precision.stressOptions}
              selected={answers.stress}
              onSelect={(value) => setSingle("stress", value)}
            />
          ),
          id: "stress",
          isAnswered: Boolean(answers.stress),
          label: copy.precision.stress
        },
        {
          content: (
            <PillGroup
              options={copy.precision.stressSourceOptions}
              selected={answers.stressSource}
              onSelect={(value) => setSingle("stressSource", value)}
            />
          ),
          id: "stress-source",
          isAnswered: Boolean(answers.stressSource),
          label: copy.precision.stressSource
        },
        {
          content: (
            <PillGroup
              options={copy.precision.gutOptions}
              selected={answers.gut}
              onSelect={(value) => setSingle("gut", value)}
            />
          ),
          id: "gut",
          isAnswered: Boolean(answers.gut),
          label: copy.precision.gut
        },
        {
          content: (
            <PillGroup
              options={copy.precision.wearableOptions}
              selected={answers.wearable}
              onSelect={(value) => setSingle("wearable", value)}
            />
          ),
          id: "wearable",
          isAnswered: Boolean(answers.wearable),
          label: copy.precision.wearable
        },
        {
          content: (
            <>
              <PillGroup
                options={copy.precision.vo2KnownOptions}
                selected={answers.vo2Known}
                onSelect={(value) => setSingle("vo2Known", value)}
              />
              {answers.vo2Known === "yes" ? (
                <label className="mt-4 block max-w-xs">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#20343A]">
                    {copy.precision.vo2Max}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={answers.vo2Max}
                    className="mt-2 block w-full rounded-md border border-foreground/10 bg-white px-3 py-2 text-sm text-[#20343A] outline-none transition focus:border-[#1FA77A] focus:ring-2 focus:ring-[#1FA77A]/15"
                    onChange={(event) => setSingle("vo2Max", event.target.value)}
                  />
                </label>
              ) : null}
              {answers.vo2Known === "no" ? (
                <div className="mt-4">
                  <p className="mb-3 text-sm font-semibold text-[#20343A]">
                    {copy.precision.vo2Proxy}
                  </p>
                  <PillGroup
                    options={copy.precision.vo2ProxyOptions}
                    selected={answers.vo2Proxy}
                    onSelect={(value) => setSingle("vo2Proxy", value)}
                  />
                </div>
              ) : null}
            </>
          ),
          id: "vo2",
          isAnswered:
            Boolean(answers.vo2Known) &&
            (answers.vo2Known === "yes"
              ? Boolean(answers.vo2Max)
              : answers.vo2Known === "no"
                ? Boolean(answers.vo2Proxy)
                : true),
          label: copy.precision.vo2Known
        }
      ],
      title: copy.precision.title
    },
    {
      description:
        locale === "th"
          ? "เพิ่มบริบทด้านความปลอดภัยและค่าตรวจที่คุณมี ข้ามได้ทุกข้อถ้ายังไม่ทราบ"
          : "Add safety context and any lab values you know. Skip anything you do not have.",
      id: "health-context",
      optional: true,
      questions: [
        {
          content: (
            <PillGroup
              multi={true}
              options={copy.conditions.options}
              selected={answers.conditions}
              onToggle={(value) => toggleMulti("conditions", value)}
            />
          ),
          id: "conditions",
          isAnswered: answers.conditions.length > 0,
          label: copy.conditions.prompt
        },
        {
          content: (
            <OptionGrid
              options={copy.precision.familyOptions}
              selected={answers.family}
              onToggle={(value) => toggleMulti("family", value, 8)}
            />
          ),
          id: "family",
          isAnswered: answers.family.length > 0,
          label: copy.precision.family
        },
        {
          content: (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {copy.precision.labFields.map((field) => (
                <label key={field.value} className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#20343A]">
                    {field.label}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={answers.labs[field.value] ?? ""}
                    className="mt-2 block w-full rounded-md border border-foreground/10 bg-white px-3 py-2 text-sm text-[#20343A] outline-none transition focus:border-[#1FA77A] focus:ring-2 focus:ring-[#1FA77A]/15"
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        labs: {
                          ...current.labs,
                          [field.value]: event.target.value
                        }
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          ),
          id: "labs",
          isAnswered: Object.values(answers.labs).some(Boolean),
          label: copy.precision.labs
        }
      ],
      title: copy.conditions.title
    }
  ];

  function fillRandomDefaultsAndFinalStep() {
    setAnswers(buildRandomDevAnswers());
    setProcessingError("");
    setExampleError("");
    setShowPlans(false);
    setShowExampleExit(false);
    clearProcessingStatus();
    setCapturedStatus(null);
    setExampleRequest(null);
    captureInFlight.current = null;
    setSectionIndex(sections.length - 1);
    setQuestionIndex(0);
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  const currentSection = sections[Math.min(sectionIndex, sections.length - 1)];
  const currentQuestionIndex = Math.min(
    questionIndex,
    currentSection.questions.length - 1
  );
  const currentQuestion = currentSection.questions[currentQuestionIndex];
  const renderedQuestions = isCompact
    ? [currentQuestion]
    : currentSection.questions;
  const requiredQuestions = isCompact
    ? [currentQuestion]
    : currentSection.questions;
  const currentStepComplete =
    currentSection.optional ||
    requiredQuestions.every((question) => !question.required || question.isAnswered);
  const isFinalSection = sectionIndex === sections.length - 1;
  const isFinalStep =
    isFinalSection &&
    (!isCompact || currentQuestionIndex >= currentSection.questions.length - 1);
  const canMoveForward = isFinalStep ? canGenerate : currentStepComplete;
  const flowStepTotal = isCompact
    ? sections.reduce((total, section) => total + section.questions.length, 0)
    : sections.length;
  const flowStepCurrent = isCompact
    ? sections
        .slice(0, sectionIndex)
        .reduce((total, section) => total + section.questions.length, 0) +
      currentQuestionIndex +
      1
    : sectionIndex + 1;

  function sectionIsComplete(section: AssessmentSection) {
    if (section.optional) {
      return section.questions.some((question) => question.isAnswered);
    }

    return section.questions.every(
      (question) => !question.required || question.isAnswered
    );
  }

  function goBack() {
    setProcessingError("");
    setExampleError("");

    if (isCompact && currentQuestionIndex > 0) {
      setQuestionIndex(currentQuestionIndex - 1);
      return;
    }

    if (sectionIndex > 0) {
      const previousSection = sections[sectionIndex - 1];
      setSectionIndex(sectionIndex - 1);
      setQuestionIndex(isCompact ? previousSection.questions.length - 1 : 0);
      return;
    }

    return;
  }

  function closePlanGate() {
    setProcessingError("");
    setExampleError("");
    setShowPlans(false);
    setShowExampleExit(false);
    clearProcessingStatus();
    setExampleRequest(null);
  }

  function goNext() {
    if (!canMoveForward) {
      return;
    }

    if (isCompact && currentQuestionIndex < currentSection.questions.length - 1) {
      setQuestionIndex(currentQuestionIndex + 1);
      return;
    }

    if (isFinalStep) {
      void prepareHealthScoreGate(answers);
      return;
    }

    setSectionIndex(Math.min(sectionIndex + 1, sections.length - 1));
    setQuestionIndex(0);
  }

  function skipOptionalSection() {
    if (isFinalStep) {
      void prepareHealthScoreGate(answers);
      return;
    }

    setSectionIndex(Math.min(sectionIndex + 1, sections.length - 1));
    setQuestionIndex(0);
  }

  function choosePlan(planId: string) {
    setSelectedPlan(planId);
    setShowPlans(false);
    setShowExampleExit(false);
    setExampleRequest(null);
    setProcessingMode("formulation");
    trackBpmEvent("plan_selected_clicked", {
      eventType: "plan",
      locale,
      properties: {
        plan: planId
      },
      selectedPlan: planId,
      ...healthScoreBpmFields(healthScore)
    });
    void startProcessing(planId);
  }

  function showProcessingStatus(status: ProcessingStatus) {
    displayedStepStartedAt.current = Date.now();
    setDisplayedProcessingStatus(
      getPacedProcessingStatus(status, getInitialProcessingStepIndex(status))
    );
    setProcessingStatus(status);
  }

  async function prepareHealthScoreGate(answerPayload = answers) {
    setProcessingError("");
    setExampleError("");
    setShowPlans(false);
    setShowExampleExit(false);
    setExampleRequest(null);
    setProcessingMode("score");
    const scoreStatus: ProcessingStatus = {
      planId: "",
      queuePosition: 0,
      status: "preparing",
      steps: [
        { id: "assessment", state: "complete" },
        { id: "score", state: "active" },
        { id: "scoreAnalysis", state: "pending" },
        { id: "payment", state: "pending" },
        { id: "formulation", state: "pending" },
        { id: "safety", state: "pending" },
        { id: "results", state: "pending" }
      ]
    };
    const analysisStatus: ProcessingStatus = {
      ...scoreStatus,
      steps: [
        { id: "assessment", state: "complete" },
        { id: "score", state: "complete" },
        { id: "scoreAnalysis", state: "active" },
        { id: "payment", state: "pending" },
        { id: "formulation", state: "pending" },
        { id: "safety", state: "pending" },
        { id: "results", state: "pending" }
      ]
    };
    const analysisStepTimeout = window.setTimeout(() => {
      setProcessingStatus(analysisStatus);
    }, PROCESSING_STEP_MIN_MS);

    showProcessingStatus(scoreStatus);
    window.scrollTo({ behavior: "smooth", top: 0 });
    trackBpmEvent("assessment_submitted", {
      eventType: "funnel",
      locale,
      properties: {
        completedRequired: completed,
        requiredTotal
      }
    });

    try {
      const captured = await captureAssessment(true, answerPayload);
      window.clearTimeout(analysisStepTimeout);

      if (!captured?.planId) {
        throw new Error("Unable to capture assessment before plan selection");
      }

      if (!captured.healthScore) {
        throw new Error("Assessment capture did not return a HealthScore");
      }

      setHealthScore(captured.healthScore);
      trackBpmEvent("healthscore_viewed", {
        eventType: "funnel",
        locale,
        planId: captured.planId,
        ...healthScoreBpmFields(captured.healthScore)
      });
      setProcessingStatus({
        ...captured,
        healthScore: captured.healthScore,
        planId: "",
        queuePosition: 0,
        status: "ready",
        steps: [
          { id: "assessment", state: "complete" },
          { id: "score", state: "complete" },
          { id: "scoreAnalysis", state: "complete" },
          { id: "payment", state: "pending" },
          { id: "formulation", state: "pending" },
          { id: "safety", state: "pending" },
          { id: "results", state: "pending" }
        ]
      });

    } catch {
      window.clearTimeout(analysisStepTimeout);
      clearProcessingStatus();
      setProcessingError(ui.processingError);
    }
  }

  async function captureAssessment(force = false, answerPayload = answers) {
    if (!force && capturedStatus?.planId) {
      return capturedStatus;
    }

    if (captureInFlight.current) {
      return captureInFlight.current;
    }

    captureInFlight.current = (async () => {
      try {
        const response = returningPlanId
          ? await fetchWithTimeout(
              `/api/assessment/${encodeURIComponent(returningPlanId)}`,
              {
                body: JSON.stringify({
                  answers: answerPayload,
                  bpm: getBpmPayload(),
                  intent: "capture",
                  locale
                }),
                cache: "no-store",
                headers: {
                  "content-type": "application/json"
                },
                method: "PATCH"
              }
            )
          : await fetchWithTimeout("/api/assessment", {
              body: JSON.stringify({
                answers: answerPayload,
                bpm: getBpmPayload(),
                intent: "capture",
                locale
              }),
              cache: "no-store",
              headers: {
                "content-type": "application/json"
              },
              method: "POST"
            });

        if (!response.ok) {
          throw new Error("Unable to capture assessment plan");
        }

        const status = (await response.json()) as ProcessingStatus;
        setCapturedStatus(status);
        return status;
      } catch {
        return null;
      } finally {
        captureInFlight.current = null;
      }
    })();

    return captureInFlight.current;
  }

  async function startProcessing(planId = selectedPlan || "precision") {
    setProcessingError("");
    pollFailureCount.current = 0;
    setProcessingMode("formulation");
    showProcessingStatus({
      planId: "",
      queuePosition: 0,
      status: "queued",
      steps: [
        { id: "assessment", state: "complete" },
        { id: "score", state: "complete" },
        { id: "scoreAnalysis", state: "complete" },
        { id: "payment", state: "active" },
        { id: "formulation", state: "pending" },
        { id: "safety", state: "pending" },
        { id: "results", state: "pending" }
      ]
    });

    try {
      const captured = captureInFlight.current
        ? await captureInFlight.current
        : capturedStatus ?? (await captureAssessment());
      const response = captured?.planId
        ? await fetchWithTimeout(
            `/api/assessment/${encodeURIComponent(captured.planId)}`,
            {
              body: JSON.stringify({
                answers,
                bpm: getBpmPayload(),
                locale,
                plan: planId
              }),
              cache: "no-store",
              headers: {
                "content-type": "application/json"
              },
              method: "PATCH"
            }
          )
        : await fetchWithTimeout("/api/assessment", {
            body: JSON.stringify({
              answers,
              bpm: getBpmPayload(),
              intent: "process",
              locale,
              plan: planId
            }),
            cache: "no-store",
            headers: {
              "content-type": "application/json"
            },
            method: "POST"
          });

      if (!response.ok) {
        throw new Error("Unable to create assessment plan");
      }

      const status = (await response.json()) as ProcessingStatus;
      setCapturedStatus(status);
      setProcessingStatus(status);
    } catch {
      setProcessingError(ui.processingError);
      clearProcessingStatus();
    }
  }

  async function requestExampleBrief() {
    const emailValidation = validateLeadEmail(exampleEmail);

    if (!emailValidation.ok) {
      setExampleError(ui.scoreGate.emailError);
      return;
    }

    const email = normalizeLeadEmail(emailValidation.email);

    setExampleLoading(true);
    setExampleError("");
    trackBpmEvent("free_email_requested_clicked", {
      email,
      eventType: "email",
      locale,
      planId: capturedStatus?.planId,
      properties: {
        includeReassessment:
          includeExampleReassessment && !reassessmentAlreadyOptedIn
      },
      ...healthScoreBpmFields(healthScore)
    });

    try {
      const captured = capturedStatus?.planId
        ? capturedStatus
        : await captureAssessment(true);

      if (!captured?.planId) {
        throw new Error("Unable to capture assessment before example request");
      }

      const response = await fetchWithTimeout(
        `/api/assessment/${encodeURIComponent(captured.planId)}/example`,
        {
          body: JSON.stringify({
            bpm: getBpmPayload(),
            email,
            includeReassessment:
              includeExampleReassessment && !reassessmentAlreadyOptedIn,
            locale
          }),
          cache: "no-store",
          headers: {
            "content-type": "application/json"
          },
          method: "POST"
        }
      );

      if (!response.ok) {
        throw new Error("Unable to request example brief");
      }

      const result = (await response.json()) as {
        planId?: string;
        requestId?: string;
      };
      const planId = result.planId ?? captured.planId;
      const requestId = result.requestId ?? "";

      if (!requestId) {
        throw new Error("Example request did not return a request id");
      }

      setExampleRequest({ email, planId, requestId });
      setProcessingMode("example");
      setShowPlans(false);
      setShowExampleExit(false);
      showProcessingStatus(buildExampleProcessingStatus(planId));
      window.scrollTo({ behavior: "smooth", top: 0 });
      setProcessingStatus(buildExampleQueuedStatus(planId));
    } catch {
      setExampleError(ui.processingError);
    } finally {
      setExampleLoading(false);
    }
  }

  useEffect(() => {
    if (!processingStatus) {
      displayedStepStartedAt.current = 0;
      return;
    }

    if (processingStatus.status === "failed") {
      const timeout = window.setTimeout(() => {
        displayedStepStartedAt.current = Date.now();
        setDisplayedProcessingStatus(processingStatus);
      }, 0);

      return () => window.clearTimeout(timeout);
    }

    if (!displayedProcessingStatus) {
      const timeout = window.setTimeout(() => {
        displayedStepStartedAt.current = Date.now();
        setDisplayedProcessingStatus(
          getPacedProcessingStatus(
            processingStatus,
            getInitialProcessingStepIndex(processingStatus)
          )
        );
      }, 0);

      return () => window.clearTimeout(timeout);
    }

    const displayedStepIndex = getProcessingStepIndex(displayedProcessingStatus);
    const targetStepIndex = getProcessingStepIndex(processingStatus);
    const elapsed = Date.now() - displayedStepStartedAt.current;
    const wait = Math.max(0, PROCESSING_STEP_MIN_MS - elapsed);

    if (targetStepIndex > displayedStepIndex) {
      const timeout = window.setTimeout(() => {
        displayedStepStartedAt.current = Date.now();
        setDisplayedProcessingStatus(
          getPacedProcessingStatus(processingStatus, displayedStepIndex + 1)
        );
      }, wait);

      return () => window.clearTimeout(timeout);
    }

    const targetStepComplete = isStepComplete(
      processingStatus,
      displayedStepIndex
    );
    const displayedStepComplete = isStepComplete(
      displayedProcessingStatus,
      displayedStepIndex
    );
    const targetReadyAtDisplayedStep =
      processingStatus.status === "ready" &&
      targetStepIndex === displayedStepIndex &&
      targetStepComplete;

    if (targetReadyAtDisplayedStep && !displayedStepComplete) {
      const timeout = window.setTimeout(() => {
        setDisplayedProcessingStatus(
          getPacedProcessingStatus(processingStatus, displayedStepIndex, true)
        );
      }, wait);

      return () => window.clearTimeout(timeout);
    }
  }, [displayedProcessingStatus, processingStatus]);

  useEffect(() => {
    if (!displayedProcessingStatus || displayedProcessingStatus.status !== "ready") {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (processingMode === "score") {
        clearProcessingStatus();
        setShowPlans(true);
        return;
      }

      if (processingMode === "example") {
        clearProcessingStatus();
        setShowExampleExit(true);
        return;
      }

      if (displayedProcessingStatus.planId) {
        router.push(
          `/${locale}/assessment/results?plan=${displayedProcessingStatus.planId}`
        );
      }
    }, PROCESSING_COMPLETE_HOLD_MS);

    return () => window.clearTimeout(timeout);
  }, [
    clearProcessingStatus,
    displayedProcessingStatus,
    locale,
    processingMode,
    router
  ]);

  useEffect(() => {
    if (!processingStatus?.planId) {
      return;
    }

    if (processingStatus.status === "ready") {
      return;
    }

    if (processingStatus.status === "failed") {
      return;
    }

    const planId = processingStatus.planId;
    let cancelled = false;

    async function pollStatus() {
      try {
        if (processingMode === "example" && !exampleRequest?.requestId) {
          return;
        }

        const url =
          processingMode === "example"
            ? `/api/assessment/${encodeURIComponent(planId)}/example?requestId=${encodeURIComponent(exampleRequest?.requestId ?? "")}`
            : `/api/assessment/${encodeURIComponent(planId)}`;
        const response = await fetchWithTimeout(
          url,
          {
            cache: "no-store"
          }
        );

        if (!response.ok) {
          throw new Error("Unable to fetch assessment plan");
        }

        const status = (await response.json()) as ProcessingStatus;

        if (!cancelled) {
          pollFailureCount.current = 0;
          setProcessingError(
            status.status === "failed" ? ui.processingError : ""
          );
          setProcessingStatus(status);
        }
      } catch {
        if (!cancelled) {
          pollFailureCount.current += 1;

          if (pollFailureCount.current >= 3) {
            setProcessingError(ui.processingError);
          }
        }
      }
    }

    const interval = window.setInterval(pollStatus, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    exampleRequest?.requestId,
    locale,
    processingMode,
    processingStatus?.planId,
    processingStatus?.status,
    ui.processingError
  ]);

  const visibleProcessingStatus =
    displayedProcessingStatus ?? processingStatus;

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-6 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-10 sm:px-8 sm:pb-16 lg:pt-14">
        {visibleProcessingStatus ? (
          <ProcessingPanel
            error={
              visibleProcessingStatus.status === "failed"
                ? ui.processingError
                : processingError
            }
            onRetry={() =>
              processingMode === "score"
                ? void prepareHealthScoreGate()
                : processingMode === "example"
                  ? void requestExampleBrief()
                  : void startProcessing()
            }
            queueLabel={
              processingMode === "score"
                ? ui.scoreProcessingQueue
                : processingMode === "example"
                  ? ui.exampleProcessingQueue
                  : ui.processingQueue(visibleProcessingStatus.queuePosition)
            }
            retryLabel={ui.retry}
            status={visibleProcessingStatus}
            statusLabels={ui.statusLabels}
            stepLabels={
              processingMode === "score"
                ? ui.scoreProcessingSteps
                : processingMode === "example"
                  ? ui.exampleProcessingSteps
                  : ui.processingSteps
            }
            subtitle={
              processingMode === "score"
                ? ui.scoreProcessingSubtitle
                : processingMode === "example"
                  ? ui.exampleProcessingSubtitle
                  : ui.processingSubtitle
            }
            title={
              processingMode === "score"
                ? ui.scoreProcessingTitle
                : processingMode === "example"
                  ? ui.exampleProcessingTitle
                  : ui.processingTitle
            }
          />
        ) : showExampleExit ? (
          <ExampleExitPanel
            content={ui.exampleExit}
            dbTestimonial={exampleTestimonial}
            email={exampleRequest?.email ?? exampleEmail}
            locale={locale}
            planId={exampleRequest?.planId ?? capturedStatus?.planId ?? ""}
          />
        ) : showPlans ? (
          <PlanSelectionPanel
            content={getPlanContent(locale)}
            email={exampleEmail}
            emailError={exampleError}
            exampleLoading={exampleLoading}
            healthScore={healthScore}
            includeReassessment={includeExampleReassessment}
            locale={locale}
            onBack={closePlanGate}
            onEmailChange={setExampleEmail}
            onIncludeReassessmentChange={setIncludeExampleReassessment}
            onRequestExample={() => void requestExampleBrief()}
            onSelect={choosePlan}
            scoreContent={ui.scoreGate}
            proAccess={hasReturningProAccess}
            reassessmentAlreadyOptedIn={reassessmentAlreadyOptedIn}
          />
        ) : (
          <div className="mx-auto max-w-4xl space-y-6">
            {sectionIndex === 0 ? (
              <section className="relative overflow-hidden rounded-lg bg-[#3A7BD5]/5 p-6 ring-1 ring-[#3A7BD5]/10 sm:p-8 lg:p-10">
                <Image
                  src={assessmentHeroImageUrl}
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 1024px) 896px, 100vw"
                  className="object-cover object-center opacity-18"
                />
                <div
                  aria-hidden={true}
                  className="pointer-events-none absolute inset-0"
                  style={{ background: assessmentHeroFade }}
                />
                <div
                  aria-hidden={true}
                  className="pointer-events-none absolute inset-0 bg-[#F3F8FF]/65"
                />
                <div className="relative">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#3A7BD5]">
                    {copy.hero.time}
                  </p>
                  <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-5xl">
                    {copy.hero.title}
                  </h1>
                  <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                    {copy.hero.description}
                  </p>

                  <div className="mt-6 grid gap-2 sm:grid-cols-3">
                    {copy.badges.map((badge, index) => {
                      const BadgeIcon =
                        heroBadgeIcons[index] ?? CheckCircleIcon;

                      return (
                        <div
                          key={badge}
                          className="flex items-center gap-3 rounded-md border border-foreground/10 bg-background/90 px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#20343A] shadow-sm backdrop-blur-sm sm:text-sm"
                        >
                          <BadgeIcon
                            aria-hidden={true}
                            className="size-4 flex-none text-[#3A7BD5]"
                          />
                          <span>{badge}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-5 max-w-2xl text-xs font-medium leading-5 text-muted-foreground">
                    {ui.wellnessDisclaimer}
                  </p>
                  {showDevShortcut ? (
                    <button
                      type="button"
                      className="mt-6 inline-flex items-center justify-center rounded-md border border-[#3A7BD5]/25 bg-white/85 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#245f9f] shadow-sm backdrop-blur-sm transition hover:bg-white"
                      onClick={fillRandomDefaultsAndFinalStep}
                    >
                      Dev: random defaults
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}

            <div>
              <SectionCard
                done={sectionIsComplete(currentSection)}
                number={sectionIndex + 1}
                sectionLabel={
                  currentSection.optional
                    ? ui.optionalSection
                    : ui.requiredSection
                }
                stepLabel={
                  isCompact
                    ? ui.step(flowStepCurrent, flowStepTotal)
                    : ui.section(sectionIndex + 1, sections.length)
                }
                title={currentSection.title}
              >
                {renderedQuestions.map((question) => (
                  <Question
                    key={question.id}
                    hint={question.hint}
                    infoLabel={ui.infoLabel}
                    label={question.label}
                    required={question.required}
                    requiredLabel={copy.common.required}
                    why={question.why ?? getQuestionWhy(locale, question.id)}
                  >
                    {question.content}
                  </Question>
                ))}
              </SectionCard>

              {!canMoveForward ? (
                <p className="mt-3 text-sm font-medium text-muted-foreground">
                  {ui.validation}
                </p>
              ) : null}
              {processingError ? (
                <p className="mt-3 text-sm font-medium text-red-600">
                  {processingError}
                </p>
              ) : null}

              <SectionProgress
                className="mt-5"
                framed={true}
                progress={progress}
                progressLabel={progressLabel}
              />

              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  disabled={sectionIndex === 0 && currentQuestionIndex === 0}
                  className="rounded-md border border-foreground/10 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-[#20343A] transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={goBack}
                >
                  {ui.back}
                </button>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {currentSection.optional && !isFinalStep ? (
                    <button
                      type="button"
                      className="rounded-md px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground transition hover:text-[#20343A]"
                      onClick={skipOptionalSection}
                    >
                      {ui.skipOptional}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={!canMoveForward}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1FA77A] px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-sm transition enabled:hover:bg-[#188a65] disabled:cursor-not-allowed disabled:bg-foreground/15 disabled:text-muted-foreground"
                    onClick={goNext}
                  >
                    {isFinalStep ? copy.fixedAction.generate : ui.continue}
                    {isFinalStep ? (
                      <BeakerIcon aria-hidden={true} className="size-5" />
                    ) : null}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

type SectionCardProps = Readonly<{
  children: React.ReactNode;
  done: boolean;
  number: number;
  sectionLabel: string;
  stepLabel: string;
  title: string;
}>;

type SectionProgressProps = Readonly<{
  className?: string;
  framed?: boolean;
  progress: number;
  progressLabel: string;
}>;

type ProcessingPanelProps = Readonly<{
  error: string;
  onRetry: () => void;
  queueLabel: string;
  retryLabel: string;
  status: ProcessingStatus;
  statusLabels: Record<ProcessingStepState, string>;
  stepLabels: Record<string, string>;
  subtitle: string;
  title: string;
}>;

type PlanSelectionPanelProps = Readonly<{
  content: PlanContent;
  email: string;
  emailError: string;
  exampleLoading: boolean;
  healthScore: HealthScoreResult | null;
  includeReassessment: boolean;
  locale: Locale;
  onBack: () => void;
  onEmailChange: (value: string) => void;
  onIncludeReassessmentChange: (value: boolean) => void;
  onRequestExample: () => void;
  onSelect: (planId: string) => void;
  proAccess: boolean;
  reassessmentAlreadyOptedIn: boolean;
  scoreContent: {
    emailButton: string;
    emailDescription: string;
    emailDivider: string;
    emailError: string;
    emailPlaceholder: string;
    emailTitle: string;
    planDescription: string;
    planTitle: string;
    preparing: string;
    proContinueCta: string;
    proContinueDescription: string;
    proContinueTitle: string;
    reassessmentDescription: string;
    reassessmentTitle: string;
    title: string;
  };
}>;

function PlanSelectionPanel({
  content,
  email,
  emailError,
  exampleLoading,
  healthScore,
  includeReassessment,
  locale,
  onBack,
  onEmailChange,
  onIncludeReassessmentChange,
  onRequestExample,
  onSelect,
  proAccess,
  reassessmentAlreadyOptedIn,
  scoreContent
}: PlanSelectionPanelProps) {
  const personalizedEyebrow = localizeHealthScoreText(
    healthScore?.advice?.paywallEyebrow,
    locale
  );
  const personalizedTitle = localizeHealthScoreText(
    healthScore?.advice?.paywallTitle,
    locale
  );
  const personalizedDescription = localizeHealthScoreText(
    healthScore?.advice?.paywallSubtitle,
    locale
  );
  const lowestDomain = healthScore?.domains
    .slice()
    .sort((a, b) => a.score - b.score)[0];
  const fallbackFeatures =
    locale === "th"
      ? [
          {
            description:
              lowestDomain
                ? `เริ่มจาก ${lowestDomain.label} (${lowestDomain.score}/100) เพื่อให้แผนเน้นจุดที่มีผลต่อ HealthScore มากที่สุด`
                : "จัดลำดับคำแนะนำตามจุดที่คะแนนของคุณบอกว่าควรเริ่มก่อน",
            name: lowestDomain ? `โฟกัส ${lowestDomain.label}` : "โฟกัสตามคะแนนของคุณ"
          },
          {
            description:
              healthScore
                ? `ใช้คะแนน ${healthScore.score}/100 เพื่อจัดลำดับสิ่งที่คุ้มค่าก่อน ลดการซื้อแบบเดาสุ่ม`
                : "ช่วยให้เห็นภาพว่าควรสนับสนุนร่างกายในปริมาณที่เหมาะสม ไม่ใช่เดาสุ่ม",
            name: "แนวทางปริมาณที่เหมาะสม"
          },
          {
            description:
              "เปลี่ยนผลลัพธ์จากแบบประเมินให้เป็นขั้นตอนที่ทำตามได้จริง พร้อมจังหวะทบทวนเมื่อข้อมูลเปลี่ยน",
            name: "เหมาะกับชีวิตประจำวัน"
          }
        ]
      : [
          {
            description:
              lowestDomain
                ? `Starts with ${lowestDomain.label} (${lowestDomain.score}/100), so the plan focuses on the area most likely to move your HealthScore.`
                : "Prioritises the areas your HealthScore suggests deserve attention first.",
            name: lowestDomain ? `${lowestDomain.label} focus` : "Score-led priorities"
          },
          {
            description:
              healthScore
                ? `Uses your ${healthScore.score}/100 score to prioritise fewer, better-targeted moves and reduce wasted supplement spend.`
                : "Shows what your body may need in sensible amounts, without guesswork.",
            name: "Right-amount guidance"
          },
          {
            description:
              "Turns the assessment into practical next steps you can fit into your routine, then refine as your data changes.",
            name: "Built around your day"
          }
        ];
  const personalizedFeatures =
    healthScore?.advice?.paywallFeatures
      ?.map((feature) => ({
        description: localizeHealthScoreText(feature.description, locale),
        name: localizeHealthScoreText(feature.name, locale)
      }))
      .filter((feature) => feature.description && feature.name)
      .slice(0, 3) ?? [];
  const paywallFeatures =
    !proAccess && personalizedFeatures.length === 3
      ? personalizedFeatures
      : fallbackFeatures;
  const planTitle = proAccess
    ? scoreContent.proContinueTitle
    : personalizedTitle || scoreContent.planTitle;
  const planDescription = proAccess
    ? scoreContent.proContinueDescription
    : personalizedDescription || scoreContent.planDescription;
  const heroEyebrow =
    !proAccess && personalizedEyebrow ? personalizedEyebrow : content.eyebrow;
  const heroSubtitle =
    !proAccess && personalizedDescription
      ? personalizedDescription
      : content.subtitle;

  return (
    <section className="relative isolate overflow-hidden rounded-lg bg-white px-6 py-16 ring-1 ring-foreground/10 sm:py-20 lg:px-8">
      <div
        aria-hidden={true}
        className="absolute inset-x-0 -top-3 -z-10 transform-gpu overflow-hidden px-12 blur-3xl sm:px-36"
      >
        <div
          className="mx-auto aspect-[1155/678] w-[72rem] bg-linear-to-tr from-[#EAF5FF] to-[#DDF7EC] opacity-70"
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)"
          }}
        />
      </div>

      <div className="mx-auto max-w-4xl text-center">
        <p className="text-base/7 font-semibold text-[#3A7BD5]">
          {heroEyebrow}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance text-gray-900 sm:text-6xl">
          <HighlightedBrandText text={scoreContent.title} />
        </h1>
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-lg font-medium text-pretty text-gray-600 sm:text-xl/8">
        {heroSubtitle}
      </p>

      {healthScore ? (
        <HealthScorePanel locale={locale} result={healthScore} />
      ) : null}

      <div className="mx-auto mt-10 max-w-2xl text-center">
        <h2 className="text-xl font-semibold text-[#20343A]">
          <HighlightedBrandText text={planTitle} />
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {planDescription}
        </p>
      </div>

      {!proAccess ? (
        <div className="mx-auto mt-12 max-w-5xl rounded-3xl bg-white/80 px-6 py-8 ring-1 ring-[#3A7BD5]/10 sm:px-8">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-3">
            {paywallFeatures.map((feature, index) => {
              const Icon = paywallFeatureIcons[index] ?? ArrowPathIcon;

              return (
                <div key={feature.name} className="flex flex-col">
                  <dt className="flex items-center gap-x-3 text-base/7 font-semibold text-[#20343A]">
                    <Icon
                      aria-hidden={true}
                      className="size-5 flex-none text-[#1FA77A]"
                    />
                    {feature.name}
                  </dt>
                  <dd className="mt-4 text-sm/6 text-gray-600">
                    {feature.description}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ) : null}

      {proAccess ? (
        <div className="mx-auto mt-14 max-w-xl rounded-3xl bg-[#20343A] p-8 text-center shadow-2xl ring-1 ring-gray-900/10 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8BC6FF]">
            Pro
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {scoreContent.proContinueTitle}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base/7 text-gray-300">
            {scoreContent.proContinueDescription}
          </p>
          <button
            type="button"
            className="mt-8 rounded-md bg-[#1FA77A] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#188a65] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1FA77A]"
            onClick={() => onSelect("pro")}
          >
            {scoreContent.proContinueCta}
          </button>
        </div>
      ) : (
        <div className="mx-auto mt-14 grid max-w-lg grid-cols-1 items-center gap-y-6 sm:mt-16 sm:gap-y-0 lg:max-w-4xl lg:grid-cols-2">
          {content.tiers.map((tier, tierIndex) => (
          <div
            key={tier.id}
            className={cx(
              "rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10",
              tier.featured
                ? "relative z-10 bg-[#20343A] shadow-2xl"
                : "bg-white/70 sm:mx-8 lg:mx-0",
              !tier.featured && tierIndex === 0
                ? "rounded-t-3xl sm:rounded-b-none lg:rounded-bl-3xl lg:rounded-tr-none"
                : undefined,
              !tier.featured && tierIndex !== 0
                ? "sm:rounded-t-none lg:rounded-bl-none lg:rounded-tr-3xl"
                : undefined
            )}
          >
            <div className="flex w-full flex-col">
              <h2
                id={tier.id}
                className={cx(
                  tier.featured ? "text-[#8BC6FF]" : "text-[#3A7BD5]",
                  "text-base/7 font-semibold"
                )}
              >
                {tier.name}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {tier.featured ? (
                  <p className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                    {content.badge}
                  </p>
                ) : null}
                {tier.tierBadge ? (
                  <p
                    className={cx(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                      tier.featured
                        ? "bg-[#1FA77A]/20 text-[#DDF7EC]"
                        : "bg-[#1FA77A]/10 text-[#126b4f]"
                    )}
                  >
                    {tier.tierBadge}
                  </p>
                ) : null}
              </div>
              <p className="mt-4 flex items-baseline gap-x-2">
                <span
                  className={cx(
                    tier.featured ? "text-white" : "text-gray-900",
                    "text-5xl font-semibold tracking-tight"
                  )}
                >
                  {tier.price}
                </span>
                {tier.priceSuffix ? (
                  <span
                    className={cx(
                      tier.featured ? "text-gray-400" : "text-gray-500",
                      "text-base"
                    )}
                  >
                    {tier.priceSuffix}
                  </span>
                ) : null}
              </p>
              <p
                className={cx(
                  tier.featured ? "text-gray-300" : "text-gray-600",
                  "mt-6 min-h-24 text-base/7"
                )}
              >
                {tier.description}
              </p>
              <ul
                role="list"
                className={cx(
                  tier.featured ? "text-gray-300" : "text-gray-600",
                  "mt-8 space-y-3 text-sm/6 sm:mt-10"
                )}
              >
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <CheckIcon
                      aria-hidden={true}
                      className={cx(
                        tier.featured ? "text-[#8BC6FF]" : "text-[#3A7BD5]",
                        "h-6 w-5 flex-none"
                      )}
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                aria-describedby={tier.id}
                className={cx(
                  tier.featured
                    ? "bg-[#1FA77A] text-white shadow-sm hover:bg-[#188a65]"
                    : "text-[#126b4f] inset-ring inset-ring-[#1FA77A]/25 hover:inset-ring-[#1FA77A]/40",
                  "mt-8 block rounded-md px-3.5 py-2.5 text-center text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1FA77A] sm:mt-10"
                )}
                onClick={() => onSelect(tier.id)}
              >
                {tier.cta}
              </button>
            </div>
          </div>
          ))}
        </div>
      )}

      <div className="mx-auto mt-14 max-w-2xl">
        <div className="flex items-center gap-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <span className="h-px flex-1 bg-gray-200" />
          <span>{scoreContent.emailDivider}</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>
      </div>

      <FreePreviewEmailSection
        content={scoreContent}
        email={email}
        emailError={emailError}
        exampleLoading={exampleLoading}
        includeReassessment={includeReassessment}
        onEmailChange={onEmailChange}
        onIncludeReassessmentChange={onIncludeReassessmentChange}
        onRequestExample={onRequestExample}
        reassessmentAlreadyOptedIn={reassessmentAlreadyOptedIn}
      />

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          className="rounded-md bg-white/70 px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-[#20343A] ring-1 ring-foreground/10 transition hover:bg-white"
          onClick={onBack}
        >
          {content.back}
        </button>
      </div>
    </section>
  );
}

function FreePreviewEmailSection({
  content,
  email,
  emailError,
  exampleLoading,
  includeReassessment,
  onEmailChange,
  onIncludeReassessmentChange,
  onRequestExample,
  reassessmentAlreadyOptedIn
}: Readonly<{
  content: PlanSelectionPanelProps["scoreContent"];
  email: string;
  emailError: string;
  exampleLoading: boolean;
  includeReassessment: boolean;
  onEmailChange: (value: string) => void;
  onIncludeReassessmentChange: (value: boolean) => void;
  onRequestExample: () => void;
  reassessmentAlreadyOptedIn: boolean;
}>) {
  return (
    <section className="mx-auto mt-8 max-w-4xl rounded-3xl bg-white py-12 ring-1 ring-gray-900/10 sm:py-14">
      <div className="mx-auto grid grid-cols-1 gap-8 px-6 lg:grid-cols-12 lg:gap-8 lg:px-8">
        <div className="lg:col-span-7">
          <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance text-[#20343A] sm:text-4xl">
            {content.emailTitle}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
            {content.emailDescription}
          </p>
        </div>
        <form
          className="w-full max-w-md lg:col-span-5 lg:pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            onRequestExample();
          }}
        >
          <div className="flex flex-col gap-3">
            <label htmlFor="free-preview-email" className="sr-only">
              {content.emailPlaceholder}
            </label>
            <input
              id="free-preview-email"
              name="email"
              type="email"
              required={true}
              value={email}
              placeholder={content.emailPlaceholder}
              autoComplete="email"
              className="min-w-0 flex-auto rounded-md bg-white px-3.5 py-2.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 transition placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-[#1FA77A] sm:text-sm/6"
              onChange={(event) => onEmailChange(event.target.value)}
            />
            <button
              type="submit"
              disabled={exampleLoading}
              className="w-full rounded-md bg-[#1FA77A] px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#188a65] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1FA77A] disabled:cursor-wait disabled:opacity-70"
            >
              {exampleLoading ? content.preparing : content.emailButton}
            </button>
          </div>
          {emailError ? (
            <p className="mt-3 text-sm font-medium text-red-600">
              {emailError}
            </p>
          ) : null}
          {reassessmentAlreadyOptedIn ? null : (
            <button
              type="button"
              aria-pressed={includeReassessment}
              className="mt-4 flex w-full items-start gap-3 text-left text-sm/6 text-gray-900"
              onClick={() => onIncludeReassessmentChange(!includeReassessment)}
            >
              <span
                className={cx(
                  "relative mt-0.5 inline-flex h-6 w-11 flex-none items-center rounded-full transition",
                  includeReassessment ? "bg-[#1FA77A]" : "bg-gray-300"
                )}
              >
                <span className="sr-only">{content.reassessmentTitle}</span>
                <span
                  className={cx(
                    "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition",
                    includeReassessment ? "translate-x-5" : "translate-x-1"
                  )}
                />
              </span>
              <span>
                <span className="font-semibold text-[#20343A]">
                  {content.reassessmentTitle}
                </span>{" "}
                {content.reassessmentDescription ? (
                  <span className="text-gray-600">
                    {content.reassessmentDescription}
                  </span>
                ) : null}
              </span>
            </button>
          )}
        </form>
      </div>
    </section>
  );
}

function getDomainTone(score: number) {
  if (score >= 80) {
    return {
      bar: "bg-[#3A7BD5]",
      bg: "bg-[#EAF5FF]",
      ring: "ring-[#3A7BD5]/20",
      text: "text-[#2563EB]"
    };
  }

  if (score >= 50) {
    return {
      bar: "bg-[#1FA77A]",
      bg: "bg-[#EFFBF5]",
      ring: "ring-[#1FA77A]/20",
      text: "text-[#126b4f]"
    };
  }

  return {
    bar: "bg-red-500",
    bg: "bg-red-50",
    ring: "ring-red-200",
    text: "text-red-600"
  };
}

const healthScoreChartColors = [
  "#3A7BD5",
  "#1FA77A",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4"
];

function polarPoint(center: number, radius: number, angleDegrees: number) {
  const angleRadians = ((angleDegrees - 90) * Math.PI) / 180;

  return {
    x: center + radius * Math.cos(angleRadians),
    y: center + radius * Math.sin(angleRadians)
  };
}

function radarPolygonPoints(
  domains: HealthScoreResult["domains"],
  center: number,
  radius: number,
  scale = 1
) {
  return domains
    .map((domain, index) => {
      const point = polarPoint(
        center,
        radius * scale * (domain.score / 100),
        (360 / domains.length) * index
      );

      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(" ");
}

function HealthScoreRadar({
  result
}: Readonly<{
  result: HealthScoreResult;
}>) {
  const size = 260;
  const center = size / 2;
  const radius = 88;
  const domainCount = Math.max(result.domains.length, 1);

  return (
    <div className="flex h-full rounded-2xl bg-white p-2 ring-1 ring-[#3A7BD5]/10 sm:p-3">
      <div className="flex flex-1 items-center justify-center">
        <svg
          aria-label="Domain shape"
          className="h-[14rem] w-full max-w-[40rem] sm:h-[17.5rem] lg:h-[16.75rem]"
          role="img"
          viewBox={`0 0 ${size} ${size}`}
        >
          {[0.25, 0.5, 0.75, 1].map((level) => (
            <polygon
              key={level}
              fill="none"
              points={radarPolygonPoints(result.domains, center, radius, level)}
              stroke="#B9D3EE"
              strokeWidth="1.4"
            />
          ))}
          {result.domains.map((domain, index) => {
            const outer = polarPoint(
              center,
              radius,
              (360 / domainCount) * index
            );

            return (
              <line
                key={domain.id}
                stroke="#B9D3EE"
                strokeWidth="1.4"
                x1={center}
                x2={outer.x}
                y1={center}
                y2={outer.y}
              />
            );
          })}
          <polygon
            fill="rgba(31, 167, 122, 0.22)"
            points={radarPolygonPoints(result.domains, center, radius)}
            stroke="#1FA77A"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          {result.domains.map((domain, index) => {
            const point = polarPoint(
              center,
              radius * (domain.score / 100),
              (360 / domainCount) * index
            );

            return (
              <circle
                key={domain.id}
                cx={point.x}
                cy={point.y}
                fill={
                  healthScoreChartColors[
                    index % healthScoreChartColors.length
                  ]
                }
                r="4.5"
                stroke="#ffffff"
                strokeWidth="2"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function HealthScoreVisuals({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const labels =
    locale === "th"
      ? {
          domains: "ภาพรวม 6 ด้าน"
        }
      : {
          domains: "6-domain snapshot"
        };

  return (
    <div className="mt-5 sm:mt-6">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-[#3A7BD5]/10 sm:p-6">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#20343A]">
          {labels.domains}
        </p>
        <div className="mt-4">
          <DomainSnapshot result={result} />
        </div>
      </div>
    </div>
  );
}

function DomainSnapshot({
  result
}: Readonly<{
  result: HealthScoreResult;
}>) {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {result.domains.map((domain, index) => {
          const tone = getDomainTone(domain.score);
          const accent =
            healthScoreChartColors[index % healthScoreChartColors.length];

          return (
            <div
              key={domain.id}
              className="min-w-0 rounded-xl border p-3"
              style={{
                backgroundColor: `${accent}14`,
                borderColor: `${accent}33`
              }}
            >
              <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
                <span className="min-w-0 font-semibold text-[#20343A]">
                  {domain.label}
                </span>
                <span className={cx("font-semibold", tone.text)}>
                  {domain.score}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80">
                <div
                  className={cx("h-full rounded-full", tone.bar)}
                  style={{ width: `${domain.score}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function lowestDomainAdvice(domain: HealthScoreDomain, locale: Locale) {
  if (locale === "th") {
    return `คะแนนด้าน ${domain.label} ของคุณ (${domain.score}/100) ยังมีพื้นที่ให้ปรับปรุง ${domain.description} จุดนี้เป็นพื้นที่ที่ชัดที่สุดในการเริ่มปรับแผนสุขภาพของคุณ`;
  }

  return `Your ${domain.label} score (${domain.score}/100) has room to improve. ${domain.description} This is the clearest place to focus first.`;
}

function localizeHealthScoreText(
  value: LocalizedHealthScoreText | undefined,
  locale: Locale
) {
  if (typeof value === "string") {
    return value;
  }

  if (!value) {
    return "";
  }

  return value[locale] || value.en || value.th || "";
}

function HealthScoreAdvice({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const lowest = [...result.domains].sort((a, b) => a.score - b.score)[0];
  const fallbackImprovement =
    (locale === "th"
      ? `${result.headline} ใช้คะแนนนี้เป็นจุดเริ่มต้น โดยรักษาด้านที่ทำได้ดีไว้ และให้ความสำคัญกับพื้นที่คะแนนต่ำสุดก่อน`
      : `${result.headline} Use this as a practical starting point: protect the areas already working well, then focus first on this lowest-scoring domain.`);
  const legacyFocus = localizeHealthScoreText(
    result.advice?.focusArea,
    locale
  );
  const legacyImprovement = localizeHealthScoreText(
    result.advice?.howToImprove,
    locale
  );
  const fallbackFocus = legacyFocus || lowestDomainAdvice(lowest, locale);
  const fallbackHowToImprove = legacyImprovement || fallbackImprovement;
  const overview =
    localizeHealthScoreText(result.advice?.overview, locale) ||
    `${fallbackFocus} ${fallbackHowToImprove}`;

  return (
    <div className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-[#3A7BD5]/10 sm:mt-6 sm:p-6">
      <div className="flex gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FFF8E8]">
          <ExclamationTriangleIcon
            aria-hidden={true}
            className="size-5 text-[#D97706]"
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm leading-6 text-muted-foreground">
            {overview}
          </p>
        </div>
      </div>
    </div>
  );
}

function HealthScorePanel({
  locale,
  result
}: Readonly<{
  locale: Locale;
  result: HealthScoreResult;
}>) {
  const labels =
    locale === "th"
      ? {
          domains: "ภาพรวม 6 ด้าน",
          score: "คะแนนสุขภาพ"
        }
      : {
          domains: "6-domain snapshot",
          score: "HealthScore"
        };

  return (
    <div className="mx-auto mt-10 max-w-4xl rounded-2xl bg-[#F7FAFD] p-4 ring-1 ring-[#3A7BD5]/10 sm:p-7">
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-stretch">
        <div className="flex min-w-0 flex-col">
          <div className="flex h-full min-h-[14rem] flex-col justify-between rounded-2xl bg-white p-5 text-center ring-1 ring-[#3A7BD5]/10 sm:min-h-0 sm:p-8">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#20343A]">
              {labels.score}
            </p>
            <div className="flex items-end justify-center gap-3">
              <span className="text-6xl font-semibold tracking-normal text-[#20343A] sm:text-8xl">
                {result.score}
              </span>
              <span className="pb-2 text-lg font-semibold text-muted-foreground sm:pb-3 sm:text-xl">
                /100
              </span>
            </div>
            <p className="inline-flex self-center rounded-full bg-[#1FA77A]/10 px-4 py-1.5 text-sm font-semibold text-[#126b4f]">
              {result.band}
            </p>
          </div>
        </div>

        <HealthScoreRadar result={result} />
      </div>
      <HealthScoreVisuals locale={locale} result={result} />
      <HealthScoreAdvice locale={locale} result={result} />
    </div>
  );
}

function getExampleTestimonial(locale: Locale) {
  return locale === "th"
    ? {
        meta: "ออกกำลังกาย 4 วันต่อสัปดาห์",
        name: "เมย์",
        quote:
          "ชอบที่ MattaNutra ผูกคำแนะนำกับการนอน อาหาร และการฟื้นตัวจริง ไม่ใช่แค่รายการอาหารเสริม ทำให้รู้ว่าควรเริ่มตรงไหนก่อน"
      }
    : {
        meta: "Trains 4 days a week",
        name: "May",
        quote:
          "MattaNutra connected the guidance to my sleep, food, and recovery, not just a supplement list. It made the next steps feel practical instead of generic."
      };
}

function mapExampleTestimonial(
  dbTestimonial: BlogTestimonial | null | undefined,
  locale: Locale
) {
  if (!dbTestimonial) {
    const fallback = getExampleTestimonial(locale);

    return {
      imageAlt: "",
      imageUrl: "",
      meta: fallback.meta,
      name: fallback.name,
      quote: fallback.quote
    };
  }

  return {
    imageAlt: dbTestimonial.authorImageAlt,
    imageUrl: dbTestimonial.authorImageUrl,
    meta: dbTestimonial.authorTitle || dbTestimonial.authorHandle,
    name: dbTestimonial.authorName,
    quote: dbTestimonial.quote
  };
}

function ExampleExitPanel({
  content,
  dbTestimonial,
  email,
  locale,
  planId
}: Readonly<{
  content: {
    body: string;
    chatBody: string;
    chatButton: string;
    chatPlanLabel: string;
    chatQrAlt: string;
    chatTitle: string;
    emailPrefix: string;
    testimonialTitle: string;
    title: string;
  };
  dbTestimonial?: BlogTestimonial | null;
  email: string;
  locale: Locale;
  planId: string;
}>) {
  const testimonial = mapExampleTestimonial(dbTestimonial, locale);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-lg bg-white ring-1 ring-foreground/10">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="p-8 text-center sm:p-10 lg:text-left">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#1FA77A]/10 lg:mx-0">
              <CheckIcon aria-hidden={true} className="size-7 text-[#1FA77A]" />
            </div>
            <h1 className="mt-6 text-3xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-4xl">
              {content.title}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              {content.body}
            </p>
            {email ? (
              <p className="mt-5 inline-flex max-w-full rounded-md bg-[#1FA77A]/10 px-3 py-2 text-sm font-semibold text-[#126b4f]">
                <span className="truncate">
                  {content.emailPrefix} {email}
                </span>
              </p>
            ) : null}
          </div>
          <div className="relative min-h-72 bg-[#EAF5FF]">
            <Image
              alt=""
              fill
              sizes="(min-width: 1024px) 480px, 100vw"
              src="/mainphoto.png"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-br from-[#EAF5FF]/15 via-transparent to-[#20343A]/20" />
          </div>
        </div>
      </section>

      <section className="isolate overflow-hidden rounded-lg bg-white px-6 ring-1 ring-foreground/10 lg:px-8">
        <div className="relative mx-auto max-w-2xl py-16 sm:py-20 lg:max-w-4xl">
          <div className="absolute left-1/2 top-0 -z-10 h-[32rem] w-[64rem] -translate-x-1/2 bg-[radial-gradient(50%_100%_at_top,#DDF7EC,white)] opacity-40 lg:left-36" />
          <div className="absolute inset-y-0 right-1/2 -z-10 mr-12 w-[150vw] origin-bottom-left skew-x-[-30deg] bg-white shadow-xl shadow-[#3A7BD5]/10 ring-1 ring-[#EAF5FF] sm:mr-20 md:mr-0 lg:right-full lg:-mr-36 lg:origin-center" />
          <figure className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-6 gap-y-8 sm:grid-cols-[5rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-x-10">
            <div className="relative col-start-2 row-start-1 lg:row-start-2">
              <svg
                fill="none"
                viewBox="0 0 162 128"
                aria-hidden={true}
                className="absolute -top-12 left-0 -z-10 h-32 stroke-[#20343A]/10"
              >
                <path
                  d="M65.5697 118.507L65.8918 118.89C68.9503 116.314 71.367 113.253 73.1386 109.71C74.9162 106.155 75.8027 102.28 75.8027 98.0919C75.8027 94.237 75.16 90.6155 73.8708 87.2314C72.5851 83.8565 70.8137 80.9533 68.553 78.5292C66.4529 76.1079 63.9476 74.2482 61.0407 72.9536C58.2795 71.4949 55.276 70.767 52.0386 70.767C48.9935 70.767 46.4686 71.1668 44.4872 71.9924L44.4799 71.9955L44.4726 71.9988C42.7101 72.7999 41.1035 73.6831 39.6544 74.6492C38.2407 75.5916 36.8279 76.455 35.4159 77.2394L35.4047 77.2457L35.3938 77.2525C34.2318 77.9787 32.6713 78.3634 30.6736 78.3634C29.0405 78.3634 27.5131 77.2868 26.1274 74.8257C24.7483 72.2185 24.0519 69.2166 24.0519 65.8071C24.0519 60.0311 25.3782 54.4081 28.0373 48.9335C30.703 43.4454 34.3114 38.345 38.8667 33.6325C43.5812 28.761 49.0045 24.5159 55.1389 20.8979C60.1667 18.0071 65.4966 15.6179 71.1291 13.7305C73.8626 12.8145 75.8027 10.2968 75.8027 7.38572C75.8027 3.6497 72.6341 0.62247 68.8814 1.1527C61.1635 2.2432 53.7398 4.41426 46.6119 7.66522C37.5369 11.6459 29.5729 17.0612 22.7236 23.9105C16.0322 30.6019 10.618 38.4859 6.47981 47.558L6.47976 47.558L6.47682 47.5647C2.4901 56.6544 0.5 66.6148 0.5 77.4391C0.5 84.2996 1.61702 90.7679 3.85425 96.8404L3.8558 96.8445C6.08991 102.749 9.12394 108.02 12.959 112.654L12.959 112.654L12.9646 112.661C16.8027 117.138 21.2829 120.739 26.4034 123.459L26.4033 123.459L26.4144 123.465C31.5505 126.033 37.0873 127.316 43.0178 127.316C47.5035 127.316 51.6783 126.595 55.5376 125.148L55.5376 125.148L55.5477 125.144C59.5516 123.542 63.0052 121.456 65.9019 118.881L65.5697 118.507Z"
                  id="example-testimonial-quote"
                />
                <use x={86} href="#example-testimonial-quote" />
              </svg>
              <p className="text-sm font-semibold leading-6 text-[#3A7BD5]">
                <HighlightedBrandText text={content.testimonialTitle} />
              </p>
              <blockquote className="mt-5 text-xl/8 font-semibold text-[#20343A] sm:text-2xl/9">
                <p>
                  <HighlightedBrandText text={testimonial.quote} />
                </p>
              </blockquote>
            </div>
            <div className="col-start-1 row-start-1 w-16 sm:w-20 lg:row-span-4 lg:w-72">
              {testimonial.imageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={testimonial.imageAlt}
                    src={testimonial.imageUrl}
                    className="aspect-square rounded-xl bg-[#EAF5FF] object-cover lg:rounded-3xl"
                  />
                </>
              ) : (
                <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-[#EAF5FF] text-lg font-semibold text-[#3A7BD5] lg:rounded-3xl lg:text-5xl">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_24%,#DDF7EC,transparent_38%),radial-gradient(circle_at_78%_74%,#CFE8FF,transparent_44%)]" />
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0_44%,rgba(31,167,122,0.18)_45%_47%,transparent_48%),linear-gradient(45deg,transparent_0_56%,rgba(58,123,213,0.12)_57%_59%,transparent_60%)]" />
                  <span className="relative">
                    {testimonial.name
                      .split(/\s+/)
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <figcaption className="col-start-2 row-start-2 text-base lg:row-start-3">
              <div className="font-semibold text-[#20343A]">
                {testimonial.name}
              </div>
              <div className="mt-1 text-muted-foreground">
                {testimonial.meta}
              </div>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="rounded-lg bg-white p-6 ring-1 ring-foreground/10 sm:p-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-3xl">
              {content.chatTitle}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              {content.chatBody}
            </p>
          </div>
          {planId ? (
            <div className="flex max-w-full flex-wrap items-center gap-2 text-xs lg:justify-end">
              <span className="font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {content.chatPlanLabel}
              </span>
              <code className="max-w-full truncate rounded-md bg-background px-2.5 py-1.5 font-mono text-[11px] font-medium text-muted-foreground ring-1 ring-foreground/10">
                {planId}
              </code>
            </div>
          ) : null}
        </div>

        <ChatChannelCards
          buttonLabel={content.chatButton}
          className="mt-7"
          planId={planId}
          qrAlt={content.chatQrAlt}
        />
      </section>
    </div>
  );
}

function ProcessingPanel({
  error,
  onRetry,
  queueLabel,
  retryLabel,
  status,
  statusLabels,
  stepLabels,
  subtitle,
  title
}: ProcessingPanelProps) {
  return (
    <section className="mx-auto max-w-3xl rounded-lg bg-white p-6 ring-1 ring-foreground/10 sm:p-8">
      <div className="mx-auto flex size-12 items-center justify-center rounded-md bg-[#3A7BD5]/10">
        <BeakerIcon
          aria-hidden={true}
          className="size-6 text-[#3A7BD5]"
        />
      </div>
      <h1 className="mt-6 text-center text-3xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-4xl">
        <HighlightedBrandText text={title} />
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-base leading-7 text-muted-foreground">
        {subtitle}
      </p>
      <p className="mt-6 rounded-md bg-background px-4 py-3 text-center text-sm font-semibold text-[#20343A]">
        <HighlightedBrandText text={queueLabel} />
      </p>

      <div className="mt-8 flow-root">
        <ul role="list" className="-mb-8">
          {status.steps.map((step, index) => {
            const complete = step.state === "complete";
            const active = step.state === "active";
            const failed = step.state === "failed";
            const StepIcon = complete
              ? CheckIcon
              : active
                ? ArrowPathIcon
                : failed
                  ? ExclamationTriangleIcon
                  : ClockIcon;

            return (
              <li key={step.id}>
                <div className="relative pb-8">
                  {index !== status.steps.length - 1 ? (
                    <span
                      aria-hidden={true}
                      className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-foreground/10"
                    />
                  ) : null}
                  <div className="relative flex gap-3">
                    <span
                      className={cx(
                        "flex size-8 items-center justify-center rounded-full ring-8 ring-white",
                        complete
                          ? "bg-[#1FA77A]"
                          : active
                            ? "bg-[#3A7BD5]"
                            : failed
                              ? "bg-red-500"
                              : "bg-foreground/20"
                      )}
                    >
                      <StepIcon
                        aria-hidden={true}
                        className={cx(
                          "size-5 text-white",
                          active && "animate-spin"
                        )}
                      />
                    </span>
                    <div className="flex min-w-0 flex-1 justify-between gap-4 pt-1">
                      <p
                        className={cx(
                          "text-sm font-medium",
                          complete || active
                            ? "text-[#20343A]"
                            : "text-muted-foreground"
                        )}
                      >
                        {stepLabels[step.id] ?? step.id}
                      </p>
                      <p className="whitespace-nowrap text-right text-sm text-muted-foreground">
                        {complete
                          ? statusLabels.complete
                          : active
                            ? statusLabels.active
                            : failed
                              ? statusLabels.failed
                              : statusLabels.pending}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {error ? (
        <div className="mt-6 text-center">
          <p className="text-sm font-medium text-red-600">{error}</p>
          <button
            type="button"
            className="mt-3 rounded-md bg-[#1FA77A] px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#188a65]"
            onClick={onRetry}
          >
            {retryLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SectionProgress({
  className,
  framed = false,
  progress,
  progressLabel
}: SectionProgressProps) {
  return (
    <div
      className={cx(
        framed
          ? "rounded-lg border border-foreground/10 bg-white px-4 py-3 shadow-sm"
          : "px-1 py-1",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {progressLabel}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#20343A]">
          {progress}%
        </p>
      </div>
      <div className="mt-1.5 h-1 rounded-md bg-background">
        <div
          className="h-full rounded-md bg-[#1FA77A] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function SectionCard({
  children,
  done,
  number,
  sectionLabel,
  stepLabel,
  title
}: SectionCardProps) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-foreground/10 sm:p-6">
      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cx(
                "flex size-8 items-center justify-center rounded-md text-sm font-semibold text-white",
                done ? "bg-[#1FA77A]" : "bg-[#3A7BD5]"
              )}
            >
              {done ? "✓" : number}
            </div>
            <h2 className="text-lg font-semibold text-[#20343A]">{title}</h2>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#3A7BD5]">
              {stepLabel}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {sectionLabel}
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

type QuestionProps = Readonly<{
  children: React.ReactNode;
  hint?: string;
  infoLabel: string;
  label: string;
  required?: boolean;
  requiredLabel?: string;
  why?: string;
}>;

function Question({
  children,
  hint,
  infoLabel,
  label,
  required = false,
  requiredLabel,
  why
}: QuestionProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {why ? (
          <QuestionLabelPopover
            infoLabel={infoLabel}
            label={label}
            text={why}
          />
        ) : (
          <p className="text-sm font-semibold text-[#20343A]">{label}</p>
        )}
        {required ? (
          <span className="rounded-full bg-[#1FA77A]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1FA77A]">
            {requiredLabel}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function QuestionLabelPopover({
  infoLabel,
  label,
  text
}: Readonly<{ infoLabel: string; label: string; text: string }>) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span
      className="relative inline-flex max-w-full"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={`${infoLabel}: ${label}`}
        className="cursor-help rounded-sm text-left text-sm font-semibold text-[#20343A] underline decoration-foreground/20 decoration-dotted underline-offset-4 transition hover:text-[#245f9f] focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]/25"
        onBlur={() => setIsOpen(false)}
        onClick={() => setIsOpen((current) => !current)}
        onFocus={() => setIsOpen(true)}
      >
        {label}
      </button>
      <span
        role="tooltip"
        className={cx(
          "absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-md bg-[#20343A] px-3 py-2 text-left text-xs font-medium normal-case leading-5 tracking-normal text-white shadow-lg sm:left-1/2 sm:-translate-x-1/2",
          isOpen ? "block" : "hidden"
        )}
      >
        {text}
      </span>
    </span>
  );
}

type PillGroupProps = Readonly<{
  multi?: boolean;
  onSelect?: (value: string) => void;
  onToggle?: (value: string) => void;
  options: readonly Option[];
  selected: string | string[];
}>;

function PillGroup({
  multi = false,
  onSelect,
  onToggle,
  options,
  selected
}: PillGroupProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = Array.isArray(selected)
          ? selected.includes(option.value)
          : selected === option.value;

        return (
          <button
            key={option.value}
            type="button"
            className={pillClasses(isSelected)}
            onClick={() =>
              multi ? onToggle?.(option.value) : onSelect?.(option.value)
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type SkinToneGroupProps = Readonly<{
  onSelect: (value: string) => void;
  options: readonly Option[];
  selected: string;
}>;

function SkinToneGroup({ onSelect, options, selected }: SkinToneGroupProps) {
  const hasSelection = Boolean(selected);

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {options.map((option) => {
        const isSelected = selected === option.value;

        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            className={cx(
              "aspect-square rounded-md border-2 bg-white p-1 transition duration-150 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]/25",
              isSelected
                ? "border-[#1FA77A] shadow-sm ring-2 ring-[#1FA77A]/25"
                : cx(
                    "border-foreground/10 hover:border-[#1FA77A]/40 hover:bg-[#1FA77A]/5 hover:opacity-100",
                    hasSelection && "opacity-35 saturate-75"
                  )
            )}
            onClick={() => onSelect(option.value)}
          >
            <span
              aria-hidden={true}
              className="block size-full rounded-[4px] border border-black/10"
              style={{
                backgroundColor:
                  fitzpatrickSkinToneColors[option.value] ?? "#f8dfc8"
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

type OptionGridProps = Readonly<{
  max?: number;
  onToggle: (value: string) => void;
  options: readonly Option[];
  selected: string[];
}>;

function OptionGrid({ max, onToggle, options, selected }: OptionGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((option) => {
        const isSelected = selected.includes(option.value);
        const blocked = Boolean(max && selected.length >= max && !isSelected);

        return (
          <button
            key={option.value}
            type="button"
            disabled={blocked}
            className={cx(
              cardOptionClasses(isSelected),
              blocked && "cursor-not-allowed opacity-45"
            )}
            onClick={() => onToggle(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type ScaleGroupProps = Readonly<{
  onSelect: (value: string) => void;
  options: readonly ScaleOption[];
  selected: string;
}>;

function ScaleGroup({ onSelect, options, selected }: ScaleGroupProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected === option.value;

        return (
          <button
            key={option.value}
            type="button"
            className={pillClasses(isSelected)}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
