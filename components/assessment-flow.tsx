"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  BeakerIcon,
  CheckIcon,
  ShieldCheckIcon,
  SparklesIcon
} from "@heroicons/react/20/solid";
import { ChatChannelCards } from "@/components/chat-channel-cards";
import { HighlightedBrandText } from "@/components/highlighted-brand-text";
import {
  OptionGrid,
  PillGroup,
  ProcessingPanel,
  Question,
  ScaleGroup,
  SectionCard,
  SectionProgress,
  SkinToneGroup,
  cardOptionClasses,
  cx
} from "@/components/nutrition-flow/ui";
import {
  HealthScorePanel,
  localizeHealthScoreText
} from "@/components/nutrition-flow/healthscore-panel";
import { getBpmPayload, trackBpmEvent } from "@/lib/bpm-client";
import { normalizeLeadEmail, validateLeadEmail } from "@/lib/email-validation";
import type { BlogTestimonial } from "@/lib/blog";
import type { HealthScoreResult } from "@/lib/health-score";
import type { Locale } from "@/lib/i18n";
import {
  nutritionHealthScorePath,
  nutritionRefinePath
} from "@/lib/nutrition-paths";

type Option = Readonly<{
  label: string;
  value: string;
}>;

type ScaleOption = Option &
  Readonly<{
    tone: string;
  }>;

type LabField = Readonly<{
  label: string;
  units: readonly string[];
  value: string;
}>;

type FoodFrequencyKey =
  | "dairy"
  | "eggs"
  | "fish"
  | "fruitveg"
  | "legumes"
  | "redmeat";

type Answers = {
  activity: string;
  age: string;
  alcohol: string;
  allergies: string[];
  antibiotics: string;
  avoidNote: string;
  budget: string;
  caffeine: string;
  country: string;
  diet: string;
  digCondition: string;
  digestion: string;
  disclosure: boolean;
  energy: string;
  family: string[];
  flow: string;
  foodFrequency: Record<FoodFrequencyKey, string>;
  form: string;
  goals: string[];
  heightCm: string;
  hrv: string;
  kidney: string;
  labs: Record<string, string>;
  labUnits: Record<string, string>;
  liver: string;
  maxPills: string;
  meds: string;
  medTypes: string[];
  menopause: string;
  otherMed: string;
  otherSupp: string;
  otherTracker: string;
  protein: string;
  reassessmentEmail: string;
  reproStatus: string;
  sex: string;
  skin: string;
  sleepHrs: string;
  smoking: string;
  stress: string;
  sun: string;
  sunscreen: string;
  surgery: string;
  suppAllergies: string[];
  supplements: string;
  symptoms: string[];
  tracker: string;
  vo2: string;
  weightKg: string;
};

type Copy = Readonly<{
  about: {
    age: string;
    ageOptions: Option[];
    country: string;
    countryOptions: Option[];
    femaleTitle: string;
    flow: string;
    flowOptions: Option[];
    height: string;
    menopause: string;
    menopauseOptions: Option[];
    reproStatus: string;
    reproStatusOptions: Option[];
    sex: string;
    sexOptions: Option[];
    skin: string;
    skinOptions: Option[];
    subtitle: string;
    sun: string;
    sunOptions: Option[];
    sunscreen: string;
    sunscreenOptions: Option[];
    title: string;
    weight: string;
  };
  badges: string[];
  coach: Record<string, string>;
  common: {
    optional: string;
    required: string;
  };
  daily: {
    activity: string;
    activityOptions: Option[];
    alcohol: string;
    alcoholOptions: Option[];
    caffeine: string;
    caffeineOptions: Option[];
    digCondition: string;
    digConditionOptions: Option[];
    digestion: string;
    digestionOptions: Option[];
    energy: string;
    energyOptions: ScaleOption[];
    sleepHrs: string;
    sleepOptions: Option[];
    smoking: string;
    smokingOptions: Option[];
    stress: string;
    stressOptions: ScaleOption[];
    subtitle: string;
    title: string;
  };
  fixedAction: {
    complete: string;
    generate: string;
    remaining: (count: number) => string;
  };
  food: {
    allergies: string;
    allergyOptions: Option[];
    avoidNote: string;
    avoidPlaceholder: string;
    diet: string;
    dietOptions: Option[];
    disclosureBody: string;
    disclosureTitle: string;
    frequency: string;
    frequencyOptions: Record<FoodFrequencyKey, Option[]>;
    frequencyTitles: Record<FoodFrequencyKey, string>;
    subtitle: string;
    title: string;
  };
  goals: {
    goalHint: string;
    goalOptions: Option[];
    goals: string;
    subtitle: string;
    symptomHint: string;
    symptomOptions: Option[];
    symptoms: string;
    title: string;
  };
  hero: {
    description: string;
    time: string;
    title: string;
  };
  precision: {
    budget: string;
    budgetOptions: Option[];
    family: string;
    familyOptions: Option[];
    form: string;
    formOptions: Option[];
    hrv: string;
    labs: string;
    labsHint: string;
    labFields: LabField[];
    maxPills: string;
    maxPillsOptions: Option[];
    optionalBanner: string;
    optionalBody: string;
    protein: string;
    proteinOptions: Option[];
    subtitle: string;
    title: string;
    tracker: string;
    trackerOptions: Option[];
    vo2: string;
  };
  progress: {
    complete: string;
    label: string;
    markEnd: string;
    markMiddle: string;
    markStart: string;
    nearComplete: string;
    optional: string;
    partial: (progress: number) => string;
    start: string;
  };
  safety: {
    antibiotics: string;
    antibioticsOptions: Option[];
    kidney: string;
    kidneyOptions: Option[];
    liver: string;
    liverOptions: Option[];
    medications: string;
    medicationHint: string;
    medicationOptions: Option[];
    medicationType: string;
    medicationTypeOptions: Option[];
    otherMedPlaceholder: string;
    otherSuppPlaceholder: string;
    suppAllergies: string;
    suppAllergyOptions: Option[];
    supplements: string;
    supplementsOptions: Option[];
    surgery: string;
    surgeryOptions: Option[];
    subtitle: string;
    title: string;
  };
  stagePhases: string[];
  sectionNotes: string[];
  stages: string[];
}>;

const foodFrequencyKeys: FoodFrequencyKey[] = [
  "redmeat",
  "dairy",
  "fruitveg",
  "eggs",
  "legumes",
  "fish"
];

const countryOptions: Option[] = [
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
];

const labFields: LabField[] = [
  { label: "Vitamin D", value: "vitd", units: ["ng/mL", "nmol/L"] },
  { label: "Vitamin B12", value: "b12", units: ["pg/mL", "pmol/L"] },
  { label: "Ferritin", value: "ferritin", units: ["ng/mL", "ug/L"] },
  { label: "HbA1c", value: "hba1c", units: ["%", "mmol/mol"] },
  { label: "Omega-3 Index", value: "o3", units: ["%"] },
  { label: "Homocysteine", value: "homo", units: ["umol/L", "mg/L"] }
];

const initialAnswers: Answers = {
  activity: "",
  age: "",
  alcohol: "",
  allergies: [],
  antibiotics: "",
  avoidNote: "",
  budget: "",
  caffeine: "",
  country: "",
  diet: "",
  digCondition: "",
  digestion: "",
  disclosure: false,
  energy: "",
  family: [],
  flow: "",
  foodFrequency: {
    dairy: "",
    eggs: "",
    fish: "",
    fruitveg: "",
    legumes: "",
    redmeat: ""
  },
  form: "",
  goals: [],
  heightCm: "",
  hrv: "",
  kidney: "",
  labs: {},
  labUnits: Object.fromEntries(
    labFields.map((field) => [field.value, field.units[0]])
  ),
  liver: "",
  maxPills: "",
  meds: "",
  medTypes: [],
  menopause: "",
  otherMed: "",
  otherSupp: "",
  otherTracker: "",
  protein: "",
  reassessmentEmail: "",
  reproStatus: "",
  sex: "",
  skin: "",
  sleepHrs: "",
  smoking: "",
  stress: "",
  sun: "",
  sunscreen: "",
  surgery: "",
  suppAllergies: [],
  supplements: "",
  symptoms: [],
  tracker: "",
  vo2: "",
  weightKg: ""
};

function cleanStringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : fallback;
}

function buildInitialAnswers(prefillAnswers?: unknown): Answers {
  if (!prefillAnswers || typeof prefillAnswers !== "object" || Array.isArray(prefillAnswers)) {
    return initialAnswers;
  }

  const prefill = prefillAnswers as Partial<Answers>;

  return {
    ...initialAnswers,
    ...prefill,
    allergies: cleanStringArray(prefill.allergies, initialAnswers.allergies),
    family: cleanStringArray(prefill.family, initialAnswers.family),
    foodFrequency: {
      ...initialAnswers.foodFrequency,
      ...(prefill.foodFrequency && typeof prefill.foodFrequency === "object"
        ? prefill.foodFrequency
        : {})
    },
    goals: cleanStringArray(prefill.goals, initialAnswers.goals),
    labs:
      prefill.labs && typeof prefill.labs === "object" && !Array.isArray(prefill.labs)
        ? prefill.labs
        : initialAnswers.labs,
    labUnits:
      prefill.labUnits && typeof prefill.labUnits === "object" && !Array.isArray(prefill.labUnits)
        ? { ...initialAnswers.labUnits, ...prefill.labUnits }
        : initialAnswers.labUnits,
    medTypes: cleanStringArray(prefill.medTypes, initialAnswers.medTypes),
    suppAllergies: cleanStringArray(prefill.suppAllergies, initialAnswers.suppAllergies),
    symptoms: cleanStringArray(prefill.symptoms, initialAnswers.symptoms)
  };
}

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function randomSubset<T>(items: readonly T[], count: number) {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

function buildRandomDevAnswers(): Answers {
  const sex = randomItem(["female", "male"] as const);

  return {
    ...initialAnswers,
    age: randomItem(["26-35", "36-45", "46-55", "56-65"]),
    alcohol: randomItem(["none", "1-3", "4-7"]),
    antibiotics: randomItem(["no", "yes"]),
    activity: randomItem(["sitting", "light", "moderate", "active"]),
    budget: randomItem(["1000-2500", "2500-5000", "5000+"]),
    caffeine: randomItem(["1", "2-3", "4+"]),
    country: "TH",
    diet: randomItem(["balanced", "whole", "mediterranean", "plant"]),
    digCondition: "none",
    digestion: randomItem(["none", "bloating", "constipation"]),
    disclosure: true,
    energy: randomItem(["ok", "good", "excellent"]),
    family: randomItem([["none"], ["heart"], ["diabetes"]]),
    flow: sex === "female" ? randomItem(["none", "light", "moderate"]) : "",
    foodFrequency: {
      dairy: randomItem(["never", "1-2", "3+"]),
      eggs: randomItem(["rare", "weekly", "most"]),
      fish: randomItem(["rare", "once", "often"]),
      fruitveg: randomItem(["1-2", "3+"]),
      legumes: randomItem(["weekly", "most"]),
      redmeat: randomItem(["never", "1-2", "3+"])
    },
    form: randomItem(["capsules", "powder", "mixed"]),
    goals: randomSubset(["energy", "sleep", "focus", "longevity", "fitness", "mood"], 3),
    heightCm: String(Math.round(155 + Math.random() * 38)),
    hrv: String(Math.round(42 + Math.random() * 36)),
    kidney: "normal",
    labs: { b12: "520", ferritin: "80", hba1c: "5.3", o3: "6.2", vitd: "42" },
    liver: "normal",
    maxPills: randomItem(["4-6", "7-10", "nolimit"]),
    meds: randomItem(["none", "yes"]),
    medTypes: ["statin"],
    menopause: sex === "female" ? randomItem(["pre", "peri", "post", "unsure"]) : "",
    protein: randomItem(["1-1.5", "1.5-2", "2+"]),
    reassessmentEmail: "dev@example.dev",
    reproStatus: sex === "female" ? randomItem(["none", "ttc"]) : "",
    sex,
    skin: randomItem(["II", "III", "IV", "V"]),
    sleepHrs: randomItem(["6-7", "7-8", "8-9"]),
    smoking: randomItem(["never", "ex5+", "occasional"]),
    stress: randomItem(["low", "moderate", "high"]),
    sun: randomItem(["15-30", "30-60", "60+"]),
    sunscreen: randomItem(["rarely", "sometimes", "daily"]),
    surgery: randomItem(["no", "yes"]),
    supplements: randomItem(["none", "basic", "d3omega", "targeted"]),
    symptoms: randomSubset(["fatigue", "brainfog", "sleep", "stress", "joints"], 2),
    tracker: randomItem(["none", "apple", "garmin", "fitbit"]),
    vo2: String(Math.round(34 + Math.random() * 20)),
    weightKg: String(Math.round(52 + Math.random() * 42))
  };
}
const en: Copy = {
  about: {
    title: "First, the basics about you",
    subtitle: "A few quick taps to start. This sets the baseline the rest of your formula is built on.",
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
    countryOptions,
    sun: "Sun exposure (min/day)",
    sunOptions: [
      { label: "Under 15", value: "u15" },
      { label: "15-30", value: "15-30" },
      { label: "30-60", value: "30-60" },
      { label: "60+", value: "60+" }
    ],
    sunscreen: "Sunscreen use",
    sunscreenOptions: [
      { label: "Rarely", value: "rarely" },
      { label: "Sometimes", value: "sometimes" },
      { label: "Daily", value: "daily" }
    ],
    femaleTitle: "Female health context",
    reproStatus: "Pregnancy / breastfeeding status",
    reproStatusOptions: [
      { label: "None", value: "none" },
      { label: "Trying to conceive", value: "ttc" },
      { label: "Pregnant", value: "pregnant" },
      { label: "Breastfeeding", value: "breastfeeding" }
    ],
    menopause: "Menopause stage",
    menopauseOptions: [
      { label: "Pre-menopause", value: "pre" },
      { label: "Perimenopause", value: "peri" },
      { label: "Post-menopause", value: "post" },
      { label: "Unsure", value: "unsure" }
    ],
    flow: "Menstrual flow",
    flowOptions: [
      { label: "No periods", value: "none" },
      { label: "Light", value: "light" },
      { label: "Moderate", value: "moderate" },
      { label: "Heavy", value: "heavy" }
    ]
  },
  badges: ["V3 assessment", "Safety context captured", "AI powered"],
  coach: {
    allergies: "Allergies and avoidance answers are passed through to formulation so the AI can explain relevant cautions.",
    foodFrequency: "Food frequency improves micronutrient gap estimates without adding food matching back into the active product engine.",
    goals: "Choose up to three. The formulation uses these as priorities rather than trying to optimise everything equally.",
    labs: "Units matter. We keep the number and unit together before sending data to AI.",
    medications: "This is not for diagnosis. It gives the AI and deterministic safety layer the context needed to add cautions.",
    precision: "These optional fields move the last 20% of the precision meter.",
    sex: "Sex and reproductive context affect dose caution, iron logic, and product audience filtering.",
    sun: "Skin tone, sun, and sunscreen help estimate vitamin D context more honestly."
  },
  common: {
    optional: "Optional",
    required: "Required"
  },
  daily: {
    title: "Your daily life",
    subtitle: "This turns the formula from a generic stack into something that fits your routine.",
    sleepHrs: "Sleep per night (hours)",
    sleepOptions: [
      { label: "Under 5", value: "u5" },
      { label: "5-6", value: "5-6" },
      { label: "6-7", value: "6-7" },
      { label: "7-8", value: "7-8" },
      { label: "8-9", value: "8-9" },
      { label: "9+", value: "9+" }
    ],
    energy: "Energy level",
    energyOptions: [
      { label: "Drained", value: "drained", tone: "Low" },
      { label: "Low", value: "low", tone: "Low" },
      { label: "OK", value: "ok", tone: "Mid" },
      { label: "Good", value: "good", tone: "High" },
      { label: "Excellent", value: "excellent", tone: "High" }
    ],
    activity: "Activity level",
    activityOptions: [
      { label: "Mostly sitting", value: "sitting" },
      { label: "Light", value: "light" },
      { label: "Moderate", value: "moderate" },
      { label: "Active", value: "active" },
      { label: "Athlete", value: "athlete" }
    ],
    stress: "Stress level",
    stressOptions: [
      { label: "Very low", value: "verylow", tone: "Low" },
      { label: "Low", value: "low", tone: "Low" },
      { label: "Moderate", value: "moderate", tone: "Mid" },
      { label: "High", value: "high", tone: "High" },
      { label: "Extreme", value: "extreme", tone: "High" }
    ],
    digestion: "Digestion",
    digestionOptions: [
      { label: "No issue", value: "none" },
      { label: "Bloating", value: "bloating" },
      { label: "Constipation", value: "constipation" },
      { label: "Loose stools", value: "loose" }
    ],
    digCondition: "Digestive condition",
    digConditionOptions: [
      { label: "None", value: "none" },
      { label: "IBS", value: "ibs" },
      { label: "Celiac", value: "celiac" },
      { label: "IBD", value: "ibd" },
      { label: "Bariatric surgery", value: "bariatric" }
    ],
    smoking: "Smoking",
    smokingOptions: [
      { label: "Never", value: "never" },
      { label: "Ex >5 years", value: "ex5+" },
      { label: "Ex <5 years", value: "ex5" },
      { label: "Occasional", value: "occasional" },
      { label: "Daily", value: "daily" }
    ],
    alcohol: "Alcohol (drinks/week)",
    alcoholOptions: [
      { label: "None", value: "none" },
      { label: "1-3", value: "1-3" },
      { label: "4-7", value: "4-7" },
      { label: "8+", value: "8+" }
    ],
    caffeine: "Caffeine (cups/day)",
    caffeineOptions: [
      { label: "None", value: "none" },
      { label: "1", value: "1" },
      { label: "2-3", value: "2-3" },
      { label: "4+", value: "4+" }
    ]
  },
  fixedAction: {
    complete: "Ready to generate.",
    generate: "Generate my health score",
    remaining: (count) => `${count} context point${count === 1 ? "" : "s"} not answered`
  },
  food: {
    title: "Food & nutrition",
    subtitle: "Food context sharpens the supplement brief, even while product matching remains supplement-only.",
    diet: "Diet pattern",
    dietOptions: [
      { label: "No pattern", value: "none" },
      { label: "Processed", value: "processed" },
      { label: "Balanced", value: "balanced" },
      { label: "Whole foods", value: "whole" },
      { label: "Mediterranean", value: "mediterranean" },
      { label: "Plant-based", value: "plant" },
      { label: "Vegan", value: "vegan" },
      { label: "Carnivore", value: "carnivore" }
    ],
    frequency: "How often do you eat...",
    frequencyTitles: {
      dairy: "Dairy (servings/day)",
      eggs: "Eggs",
      fish: "Fatty fish",
      fruitveg: "Fruit & veg (servings/day)",
      legumes: "Legumes / nuts",
      redmeat: "Red meat (servings/week)"
    },
    frequencyOptions: {
      dairy: [
        { label: "Never", value: "never" },
        { label: "1-2", value: "1-2" },
        { label: "3+", value: "3+" }
      ],
      eggs: [
        { label: "Rarely", value: "rare" },
        { label: "Weekly", value: "weekly" },
        { label: "Most days", value: "most" }
      ],
      fish: [
        { label: "Never", value: "never" },
        { label: "Rarely", value: "rare" },
        { label: "Weekly", value: "once" },
        { label: "Often", value: "often" }
      ],
      fruitveg: [
        { label: "Not daily", value: "notdaily" },
        { label: "1-2", value: "1-2" },
        { label: "3+", value: "3+" }
      ],
      legumes: [
        { label: "Rarely", value: "rare" },
        { label: "Weekly", value: "weekly" },
        { label: "Most days", value: "most" }
      ],
      redmeat: [
        { label: "Never", value: "never" },
        { label: "1-2", value: "1-2" },
        { label: "3+", value: "3+" }
      ]
    },
    allergies: "Food allergies",
    allergyOptions: [
      { label: "None", value: "none" },
      { label: "Milk", value: "milk" },
      { label: "Eggs", value: "eggs" },
      { label: "Fish", value: "fish" },
      { label: "Shellfish", value: "shellfish" },
      { label: "Tree nuts", value: "treenuts" },
      { label: "Peanuts", value: "peanuts" },
      { label: "Wheat", value: "wheat" },
      { label: "Soy", value: "soy" },
      { label: "Sesame", value: "sesame" }
    ],
    avoidNote: "Foods to avoid or dislike",
    avoidPlaceholder: "e.g. no pork, dislike strong fishy taste",
    disclosureTitle: "I confirm I have disclosed relevant allergies, conditions, medications and dietary restrictions.",
    disclosureBody: "MattaNutra guidance supports general wellness and does not replace medical advice."
  },
  goals: {
    title: "Your goals & how you feel",
    subtitle: "Your top priorities and current symptoms guide the order of the formulation.",
    goals: "Primary health goals",
    goalHint: "Pick up to 3",
    goalOptions: [
      { label: "Energy", value: "energy" },
      { label: "Sleep", value: "sleep" },
      { label: "Focus", value: "focus" },
      { label: "Longevity", value: "longevity" },
      { label: "Immunity", value: "immunity" },
      { label: "Fitness", value: "fitness" },
      { label: "Weight", value: "weight" },
      { label: "Mood", value: "mood" },
      { label: "Heart", value: "heart" },
      { label: "Joints", value: "joints" },
      { label: "Skin", value: "skin" },
      { label: "Hormones", value: "hormones" }
    ],
    symptoms: "Current symptoms",
    symptomHint: "Select all that apply. Choose Feeling great by itself if nothing stands out.",
    symptomOptions: [
      { label: "Fatigue", value: "fatigue" },
      { label: "Brain fog", value: "brainfog" },
      { label: "Mood", value: "mood" },
      { label: "Joint pain", value: "joint" },
      { label: "Digestion", value: "digestion" },
      { label: "Poor sleep", value: "sleep" },
      { label: "Stress", value: "stress" },
      { label: "Skin", value: "skin" },
      { label: "Hair loss", value: "hair" },
      { label: "Low libido", value: "libido" },
      { label: "Frequent colds", value: "colds" },
      { label: "Feeling great", value: "great" }
    ]
  },
  hero: {
    title: "Your Right Amount Assessment",
    description: "Answer honestly. Your formula precision climbs as we capture the context that matters.",
    time: "About 4 minutes"
  },
  precision: {
    title: "Your preferences",
    subtitle: "Set practical constraints first, then add optional precision if you have it.",
    budget: "Monthly supplement budget (THB)",
    budgetOptions: [
      { label: "Under 1,000", value: "u1000" },
      { label: "1,000-2,500", value: "1000-2500" },
      { label: "2,500-5,000", value: "2500-5000" },
      { label: "5,000+", value: "5000+" }
    ],
    maxPills: "Max pills/capsules (per day)",
    maxPillsOptions: [
      { label: "1-3", value: "1-3" },
      { label: "4-6", value: "4-6" },
      { label: "7-10", value: "7-10" },
      { label: "No limit", value: "nolimit" }
    ],
    form: "Preferred form",
    formOptions: [
      { label: "Capsules", value: "capsules" },
      { label: "Powder / shake", value: "powder" },
      { label: "Gummies", value: "gummies" },
      { label: "Mixed is fine", value: "mixed" }
    ],
    optionalBanner: "Optional precision tier",
    optionalBody: "Add any details you know to move the final 20% of precision.",
    protein: "Protein (g/kg/day)",
    proteinOptions: [
      { label: "Under 1", value: "u1" },
      { label: "1-1.5", value: "1-1.5" },
      { label: "1.5-2", value: "1.5-2" },
      { label: "Over 2", value: "2+" }
    ],
    family: "Family history",
    familyOptions: [
      { label: "Heart disease", value: "heart" },
      { label: "Alzheimer's", value: "alzheimers" },
      { label: "Diabetes", value: "diabetes" },
      { label: "Cancer", value: "cancer" },
      { label: "Osteoporosis", value: "osteoporosis" },
      { label: "None", value: "none" }
    ],
    tracker: "Fitness tracker",
    trackerOptions: [
      { label: "No wearable", value: "none" },
      { label: "Garmin", value: "garmin" },
      { label: "Oura", value: "oura" },
      { label: "WHOOP", value: "whoop" },
      { label: "Apple Watch", value: "apple" },
      { label: "Fitbit", value: "fitbit" },
      { label: "Other", value: "other" }
    ],
    vo2: "VO2 max",
    hrv: "Average HRV",
    labs: "Recent lab values",
    labsHint: "Only if you have them. Units matter.",
    labFields
  },
  progress: {
    start: "Every answer sharpens your personalised formula. Let's begin.",
    complete: "Formula precision complete",
    label: "Formula precision",
    markEnd: "Precision",
    markMiddle: "Essentials",
    markStart: "Start",
    nearComplete: "Essentials complete. The optional precision tier can take you to 100%.",
    optional: "Optional precision",
    partial: (progress) => `You're at ${progress}% - keep going to complete the essentials.`
  },
  safety: {
    title: "Medications & safety",
    subtitle: "These answers are used for cautions and deterministic safety checks.",
    medications: "Do you take any medications?",
    medicationHint: "Used for cautions only.",
    medicationOptions: [
      { label: "None", value: "none" },
      { label: "Yes", value: "yes" }
    ],
    medicationType: "Medication type(s)",
    medicationTypeOptions: [
      { label: "Statin", value: "statin" },
      { label: "Metformin", value: "metformin" },
      { label: "PPI / Omeprazole", value: "ppi" },
      { label: "Diuretic", value: "diuretic" },
      { label: "Contraceptive pill", value: "contraceptive" },
      { label: "Antidepressant", value: "antidepressant" },
      { label: "Blood thinner / aspirin", value: "bloodthinner" },
      { label: "Thyroid medication", value: "thyroid" },
      { label: "Blood pressure", value: "bp" },
      { label: "Corticosteroid", value: "corticosteroid" },
      { label: "Other", value: "other" }
    ],
    otherMedPlaceholder: "Please describe the medication and what it is for",
    suppAllergies: "Supplement ingredient allergies or intolerances",
    suppAllergyOptions: [
      { label: "None known", value: "none" },
      { label: "Iodine", value: "iodine" },
      { label: "Iron", value: "iron" },
      { label: "CoQ10", value: "coq10" },
      { label: "B vitamins", value: "bvit" },
      { label: "Soy-derived", value: "soyderived" },
      { label: "Shellfish-derived", value: "shellfishderived" },
      { label: "Other", value: "other" }
    ],
    otherSuppPlaceholder: "Please describe the ingredient you react to",
    kidney: "Kidney function",
    kidneyOptions: [
      { label: "No known issue", value: "normal" },
      { label: "Reduced function", value: "reduced" },
      { label: "Kidney disease", value: "disease" }
    ],
    liver: "Liver condition",
    liverOptions: [
      { label: "No known issue", value: "normal" },
      { label: "Liver condition", value: "condition" }
    ],
    surgery: "Surgery in the next 30 days?",
    surgeryOptions: [
      { label: "No", value: "no" },
      { label: "Yes", value: "yes" }
    ],
    antibiotics: "Antibiotics in the last 3 months?",
    antibioticsOptions: [
      { label: "No", value: "no" },
      { label: "Yes", value: "yes" }
    ],
    supplements: "Supplements you take now",
    supplementsOptions: [
      { label: "None", value: "none" },
      { label: "Basic multi", value: "basic" },
      { label: "D3 / Omega-3", value: "d3omega" },
      { label: "Several targeted", value: "targeted" }
    ]
  },
  sectionNotes: [
    "There are no right or wrong answers here, only true ones. The more honestly you answer, the more exactly your formula fits — and the safer it is alongside anything you already take.",
    "",
    "",
    "",
    "",
    ""
  ],
  stagePhases: ["Foundation", "Foundation", "Foundation", "Foundation", "Safety", "Personalise"],
  stages: ["About you", "Goals", "Daily life", "Food", "Safety", "Precision"]
};

const th: Copy = {
  ...en,
  about: {
    ...en.about,
    title: "ข้อมูลพื้นฐานของคุณ",
    subtitle: "เริ่มด้วยการแตะไม่กี่ครั้ง เพื่อวางพื้นฐานให้สูตรส่วนถัดไปแม่นยำขึ้น",
    sex: "เพศ",
    sexOptions: [
      { label: "ชาย", value: "male" },
      { label: "หญิง", value: "female" }
    ],
    age: "อายุ",
    height: "ส่วนสูง",
    weight: "น้ำหนัก",
    skin: "สีผิว",
    country: "ประเทศ",
    sun: "การได้รับแดด",
    sunscreen: "การใช้กันแดด",
    femaleTitle: "บริบทสุขภาพผู้หญิง",
    reproStatus: "สถานะตั้งครรภ์ / ให้นม",
    menopause: "ช่วงวัยหมดประจำเดือน",
    flow: "ปริมาณประจำเดือน"
  },
  badges: ["แบบประเมิน V3", "เก็บบริบทข้อควรระวัง", "ขับเคลื่อนด้วย AI"],
  coach: {
    allergies: "ข้อมูลแพ้และหลีกเลี่ยงจะส่งต่อให้ AI เพื่ออธิบายข้อควรระวังที่เกี่ยวข้อง",
    foodFrequency: "ความถี่อาหารช่วยประเมินช่องว่างสารอาหาร โดยไม่เปิด food matching ในระบบผลิตภัณฑ์ตอนนี้",
    goals: "เลือกได้สูงสุด 3 ข้อ ระบบจะใช้เป็นลำดับความสำคัญ",
    labs: "หน่วยสำคัญมาก เราเก็บตัวเลขพร้อมหน่วยก่อนส่งให้ AI",
    medications: "ไม่ใช่การวินิจฉัย แต่ช่วยให้ AI และระบบตรวจความปลอดภัยเพิ่มข้อควรระวังได้",
    precision: "ช่องเสริมเหล่านี้เพิ่มความแม่นยำ 20% สุดท้าย",
    sex: "เพศและบริบทการตั้งครรภ์มีผลต่อข้อควรระวัง ธาตุเหล็ก และการกรองสินค้า",
    sun: "สีผิว แดด และกันแดดช่วยประเมินบริบทวิตามินดีอย่างซื่อตรงขึ้น"
  },
  common: {
    optional: "ไม่บังคับ",
    required: "จำเป็น"
  },
  fixedAction: {
    complete: "พร้อมสร้าง HealthScore",
    generate: "สร้าง HealthScore ของฉัน",
    remaining: (count) => `ยังไม่ได้ตอบข้อมูลบริบท ${count} ข้อ`
  },
  hero: {
    title: "แบบประเมิน Right Amount ของคุณ",
    description: "ตอบตามจริง ความแม่นยำของสูตรจะเพิ่มขึ้นเมื่อเราเก็บบริบทที่สำคัญครบขึ้น",
    time: "ประมาณ 4 นาที"
  },
  progress: {
    start: "ทุกคำตอบช่วยให้สูตรเฉพาะตัวแม่นยำขึ้น เริ่มได้เลย",
    complete: "ความแม่นยำของสูตรครบแล้ว",
    label: "ความแม่นยำของสูตร",
    markEnd: "ความแม่นยำ",
    markMiddle: "ข้อมูลหลัก",
    markStart: "เริ่มต้น",
    nearComplete: "ข้อมูลหลักครบแล้ว ข้อมูลเสริมจะช่วยเพิ่มความแม่นยำถึง 100%",
    optional: "ข้อมูลเสริม",
    partial: (progress) => `ตอนนี้อยู่ที่ ${progress}% - ตอบต่อเพื่อเติมข้อมูลหลักให้ครบ`
  },
  sectionNotes: [
    "ไม่มีคำตอบที่ถูกหรือผิด มีเพียงคำตอบที่ตรงกับความจริง ยิ่งตอบตรงกับตัวคุณมากเท่าไร สูตรก็จะยิ่งพอดีและเหมาะกับสิ่งที่คุณใช้อยู่แล้วมากขึ้น",
    "",
    "",
    "",
    "",
    ""
  ],
  stagePhases: ["พื้นฐาน", "พื้นฐาน", "พื้นฐาน", "พื้นฐาน", "ความปลอดภัย", "เฉพาะตัว"],
  stages: ["เกี่ยวกับคุณ", "เป้าหมาย", "ชีวิตประจำวัน", "อาหาร", "ความปลอดภัย", "ความแม่นยำ"]
};

const copies: Record<Locale, Copy> = { en, th };
const paywallFeatureIcons = [SparklesIcon, ShieldCheckIcon, ArrowPathIcon];
function hasText(value: string) {
  return value.trim().length > 0;
}

function hasAny(values: readonly string[]) {
  return values.length > 0;
}

function selectedOther(values: readonly string[]) {
  return values.includes("other");
}

function isPregnantOrBreastfeeding(answers: Answers) {
  return answers.reproStatus === "pregnant" || answers.reproStatus === "breastfeeding";
}

function reachableEssentialChecks(answers: Answers) {
  const checks: Array<{ answered: boolean; id: string }> = [
    { id: "sex", answered: hasText(answers.sex) },
    { id: "age", answered: hasText(answers.age) },
    { id: "heightWeight", answered: hasText(answers.heightCm) && hasText(answers.weightKg) },
    { id: "skin", answered: hasText(answers.skin) },
    { id: "country", answered: hasText(answers.country) },
    { id: "sun", answered: hasText(answers.sun) },
    { id: "sunscreen", answered: hasText(answers.sunscreen) },
    { id: "goals", answered: hasAny(answers.goals) },
    { id: "symptoms", answered: hasAny(answers.symptoms) },
    { id: "sleepHrs", answered: hasText(answers.sleepHrs) },
    { id: "energy", answered: hasText(answers.energy) },
    { id: "activity", answered: hasText(answers.activity) },
    { id: "stress", answered: hasText(answers.stress) },
    { id: "digestion", answered: hasText(answers.digestion) },
    { id: "digCondition", answered: hasText(answers.digCondition) },
    { id: "smoking", answered: hasText(answers.smoking) },
    { id: "alcohol", answered: hasText(answers.alcohol) },
    { id: "caffeine", answered: hasText(answers.caffeine) },
    { id: "diet", answered: hasText(answers.diet) },
    ...foodFrequencyKeys.map((key) => ({
      id: `food-${key}`,
      answered: hasText(answers.foodFrequency[key])
    })),
    { id: "allergies", answered: hasAny(answers.allergies) },
    { id: "disclosure", answered: answers.disclosure },
    { id: "meds", answered: hasText(answers.meds) },
    { id: "suppAllergies", answered: hasAny(answers.suppAllergies) },
    { id: "kidney", answered: hasText(answers.kidney) },
    { id: "liver", answered: hasText(answers.liver) },
    { id: "surgery", answered: hasText(answers.surgery) },
    { id: "antibiotics", answered: hasText(answers.antibiotics) },
    { id: "supplements", answered: hasText(answers.supplements) },
    { id: "budget", answered: hasText(answers.budget) },
    { id: "maxPills", answered: hasText(answers.maxPills) },
    { id: "form", answered: hasText(answers.form) }
  ];

  if (answers.sex === "female") {
    checks.push(
      { id: "reproStatus", answered: hasText(answers.reproStatus) },
      { id: "menopause", answered: hasText(answers.menopause) }
    );

    if (!isPregnantOrBreastfeeding(answers)) {
      checks.push({ id: "flow", answered: hasText(answers.flow) });
    }
  }

  if (answers.meds === "yes") {
    checks.push({ id: "medTypes", answered: hasAny(answers.medTypes) });

    if (selectedOther(answers.medTypes)) {
      checks.push({ id: "otherMed", answered: hasText(answers.otherMed) });
    }
  }

  if (selectedOther(answers.suppAllergies)) {
    checks.push({ id: "otherSupp", answered: hasText(answers.otherSupp) });
  }

  return checks;
}

function optionalChecks(answers: Answers) {
  return [
    hasText(answers.protein),
    hasAny(answers.family),
    hasText(answers.tracker),
    hasText(answers.vo2),
    hasText(answers.hrv),
    ...labFields.map((field) => hasText(answers.labs[field.value] ?? ""))
  ];
}

function precisionProgress(answers: Answers) {
  const essential = reachableEssentialChecks(answers);
  const essentialDone = essential.filter((item) => item.answered).length;
  const optional = optionalChecks(answers);
  const optionalDone = optional.filter(Boolean).length;
  const essentialPercent = essential.length > 0 ? (essentialDone / essential.length) * 80 : 0;
  const optionalPercent = optional.length > 0 ? (optionalDone / optional.length) * 20 : 0;

  return {
    essentialDone,
    essentialRemaining: essential.length - essentialDone,
    essentialTotal: essential.length,
    optionalDone,
    optionalTotal: optional.length,
    progress: Math.min(100, Math.round(essentialPercent + optionalPercent))
  };
}

function precisionMeterHint(copy: Copy["progress"], progress: number) {
  if (progress <= 0) {
    return copy.start;
  }

  if (progress < 80) {
    return copy.partial(progress);
  }

  if (progress < 100) {
    return copy.nearComplete;
  }

  return copy.complete;
}

function aboutComplete(answers: Answers) {
  const baseComplete = [answers.sex, answers.age, answers.heightCm, answers.weightKg, answers.skin, answers.country, answers.sun].every(hasText);

  if (!baseComplete) {
    return false;
  }

  if (answers.sex !== "female") {
    return true;
  }

  return hasText(answers.reproStatus);
}

function goalsComplete(answers: Answers) {
  return hasAny(answers.goals) && hasAny(answers.symptoms);
}

function dailyComplete(answers: Answers) {
  return [answers.sleepHrs, answers.activity, answers.digCondition, answers.smoking, answers.alcohol].every(hasText);
}

function foodComplete(answers: Answers) {
  return (
    hasText(answers.diet) &&
    foodFrequencyKeys.every((key) => hasText(answers.foodFrequency[key])) &&
    hasAny(answers.allergies) &&
    answers.disclosure
  );
}

function safetyComplete(answers: Answers) {
  if (![answers.meds, answers.kidney, answers.liver, answers.surgery, answers.antibiotics, answers.supplements].every(hasText)) {
    return false;
  }

  if (!hasAny(answers.suppAllergies)) {
    return false;
  }

  if (answers.meds === "yes" && !hasAny(answers.medTypes)) {
    return false;
  }

  if (answers.meds === "yes" && selectedOther(answers.medTypes) && !hasText(answers.otherMed)) {
    return false;
  }

  if (selectedOther(answers.suppAllergies) && !hasText(answers.otherSupp)) {
    return false;
  }

  return true;
}

function precisionRequiredComplete(answers: Answers) {
  return [answers.budget, answers.maxPills].every(hasText);
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
  initialStage?: "healthscore" | "quiz";
  locale: Locale;
  prefillAnswers?: unknown;
  returningHealthScore?: HealthScoreResult | null;
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
  complete: boolean;
  description: string;
  id: string;
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
const HEALTH_SCORE_ANALYSIS_POLL_INTERVAL_MS = 1500;
const HEALTH_SCORE_ANALYSIS_MAX_POLLS = 160;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ASSESSMENT_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getProcessingStepIndex(status: ProcessingStatus) {
  const failedIndex = status.steps.findIndex((step) => step.state === "failed");

  if (failedIndex >= 0) return failedIndex;

  const activeIndex = status.steps.findIndex((step) => step.state === "active");

  if (activeIndex >= 0) return activeIndex;

  return Math.max(
    0,
    status.steps.reduce((latest, step, index) => (step.state === "complete" ? index : latest), -1)
  );
}

function getInitialProcessingStepIndex(status: ProcessingStatus) {
  return getProcessingStepIndex(status);
}

function isStepComplete(status: ProcessingStatus, index: number) {
  return status.steps[index]?.state === "complete";
}

function getPacedProcessingStatus(target: ProcessingStatus, stepIndex: number, terminal = false): ProcessingStatus {
  return {
    ...target,
    status: terminal ? target.status : target.status === "failed" ? "failed" : "preparing",
    steps: target.steps.map((step, index) => {
      if (index < stepIndex) return { ...step, state: "complete" as const };
      if (index === stepIndex) {
        if (target.status === "failed" && step.state === "failed") return { ...step, state: "failed" as const };
        return { ...step, state: terminal && step.state === "complete" ? "complete" : "active" };
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
      { id: "results", state: "complete" }
    ]
  };
}

function buildReturningScoreGateStatus(planId: string, healthScore: HealthScoreResult): ProcessingStatus {
  return {
    healthScore,
    planId,
    queuePosition: 0,
    status: "ready",
    steps: [
      { id: "assessment", state: "complete" },
      { id: "score", state: "complete" },
      { id: "scoreAnalysis", state: "complete" },
      { id: "payment", state: "pending" },
      { id: "formulation", state: "pending" },
      { id: "results", state: "pending" }
    ]
  };
}

function healthScoreBpmFields(healthScore: HealthScoreResult | null | undefined) {
  const lowestDomain = healthScore?.domains.slice().sort((a, b) => a.score - b.score)[0];

  return {
    healthScore: healthScore?.score,
    lowestDomain: lowestDomain?.id,
    metrics: {
      domainScores: healthScore?.domains.reduce<Record<string, number>>((scores, domain) => {
        scores[domain.id] = domain.score;
        return scores;
      }, {})
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

function getPlanContent(locale: Locale): PlanContent {
  if (locale === "th") {
    return {
      back: "กลับไปที่แบบประเมิน",
      badge: "แนะนำ",
      eyebrow: "เลือกแผนบรีฟ",
      subtitle: "เลือกความละเอียดของคำแนะนำ แล้วเราจะเปิดหน้าแผนให้คำแนะนำเติมเข้ามาเมื่อพร้อม",
      title: "เลือกความละเอียดของคำแนะนำ",
      tiers: [
        {
          cta: "ไปต่อ",
          description: "แผนอาหารเสริมฉบับเต็ม พร้อมปรับขนาดและข้อควรระวังให้เข้ากับข้อมูลของคุณมากขึ้น",
          featured: true,
          features: [
            "คำแนะนำอาหารเสริมแบบครบถ้วน",
            "ช่วงปริมาณที่ปรับตามร่างกาย",
            "รวมข้อมูลยา แล็บ และข้อควรระวัง",
            "ลำดับความสำคัญที่นำไปใช้ได้จริง",
            "พร้อมเช็คอินซ้ำใน 60 วัน"
          ],
          id: "precision",
          name: "แผนความแม่นยำ",
          price: "฿399",
          priceSuffix: "ครั้งเดียว"
        },
        {
          cta: "ไปต่อ",
          description: "การดูแลต่อเนื่องพร้อม AI เอเจนต์ที่ช่วยปรับคำแนะนำให้เข้ากับความต้องการรายวัน",
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
    subtitle: "Choose the level of guidance you want, then we will open your plan page while each section fills in.",
    title: "Select the level of guidance",
    tiers: [
      {
        cta: "Go",
        description: "The full supplement guidance pack with more precise dosing logic and cautions.",
        featured: true,
        features: [
          "Complete supplement guidance",
          "Body-size adjusted dose ranges",
          "Medication and lab cautions included",
          "Practical priority order",
          "60-day reassessment prompt"
        ],
        id: "precision",
        name: "Precision Plan",
        price: "฿399",
        priceSuffix: "one time"
      },
      {
        cta: "Go",
        description: "Ongoing support with an AI agent that adapts the plan to day-to-day requirements.",
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
function textInputClasses() {
  return "mt-2 block w-full rounded-md border border-foreground/10 bg-white px-3 py-2 text-sm text-[#20343A] outline-none transition focus:border-[#1FA77A] focus:ring-2 focus:ring-[#1FA77A]/15";
}

function AssessmentStepper({
  currentIndex,
  onSelect,
  phases,
  sections,
  stages
}: Readonly<{
  currentIndex: number;
  onSelect: (index: number) => void;
  phases: readonly string[];
  sections: readonly AssessmentSection[];
  stages: readonly string[];
}>) {
  return (
    <nav aria-label="Assessment stages">
      <ol className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        {sections.map((section, index) => {
          const active = index === currentIndex;
          const done = index < currentIndex || section.complete;

          return (
            <li key={section.id}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                className={cx(
                  "flex h-full w-full flex-col gap-1 rounded-lg border bg-white px-3 py-3 text-left shadow-sm transition",
                  active
                    ? "border-[#1FA77A] bg-[#1FA77A]/5 shadow-md"
                    : done
                      ? "border-[#1FA77A]/30 hover:border-[#1FA77A]/60"
                      : "border-foreground/10 hover:border-[#3A7BD5]/35"
                )}
                onClick={() => onSelect(index)}
              >
                <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span
                    className={cx(
                      "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                      active
                        ? "bg-[#1FA77A] text-white"
                        : done
                          ? "bg-[#20343A] text-white"
                          : "bg-background text-muted-foreground"
                    )}
                  >
                    {done && !active ? (
                      <CheckIcon aria-hidden={true} className="size-3.5" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="hidden sm:inline">
                    {phases[index] ?? phases[0] ?? ""}
                  </span>
                </span>
                <span
                  className={cx(
                    "hidden text-sm font-semibold tracking-normal sm:block",
                    active || done ? "text-[#20343A]" : "text-muted-foreground"
                  )}
                >
                  {stages[index] ?? section.title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function AssessmentFlow({
  exampleTestimonial,
  initialStage = "quiz",
  locale,
  prefillAnswers,
  returningHealthScore,
  returningPlan,
  returningPlanId
}: AssessmentFlowProps) {
  const copy = copies[locale];
  const router = useRouter();
  const showDevShortcut = process.env.NEXT_PUBLIC_SHOW_DEV_SHORTCUT !== "false";
  const returningScoreStatus = returningPlanId && returningHealthScore
    ? buildReturningScoreGateStatus(returningPlanId, returningHealthScore)
    : null;
  const [answers, setAnswers] = useState<Answers>(() => buildInitialAnswers(prefillAnswers));
  const [sectionIndex, setSectionIndex] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [displayedProcessingStatus, setDisplayedProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [processingError, setProcessingError] = useState("");
  const [capturedStatus, setCapturedStatus] = useState<ProcessingStatus | null>(returningScoreStatus);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [showPlans, setShowPlans] = useState(Boolean(returningScoreStatus && (!returningPlan || initialStage === "healthscore")));
  const [showExampleExit, setShowExampleExit] = useState(false);
  const [processingMode, setProcessingMode] = useState<"example" | "formulation" | "score">("formulation");
  const [healthScore, setHealthScore] = useState<HealthScoreResult | null>(returningHealthScore ?? null);
  const [exampleEmail, setExampleEmail] = useState("");
  const [exampleError, setExampleError] = useState("");
  const [includeExampleReassessment, setIncludeExampleReassessment] = useState(true);
  const [exampleLoading, setExampleLoading] = useState(false);
  const [exampleRequest, setExampleRequest] = useState<{ email: string; planId: string; requestId: string } | null>(null);
  const captureInFlight = useRef<Promise<ProcessingStatus | null> | null>(null);
  const displayedStepStartedAt = useRef(0);
  const pollFailureCount = useRef(0);
  const assessmentStartedTracked = useRef(false);
  const healthScoreViewedTracked = useRef(false);
  const planGateTracked = useRef(false);
  const exampleExitTracked = useRef(false);
  const precision = precisionProgress(answers);
  const hasReturningProAccess = returningPlan === "pro";
  const reassessmentAlreadyOptedIn = validateLeadEmail(answers.reassessmentEmail).ok;
  const precisionHint = precisionMeterHint(copy.progress, precision.progress);

  const clearProcessingStatus = useCallback(() => {
    displayedStepStartedAt.current = 0;
    setDisplayedProcessingStatus(null);
    setProcessingStatus(null);
  }, []);

  useEffect(() => {
    if (assessmentStartedTracked.current || precision.essentialDone <= 0) return;

    assessmentStartedTracked.current = true;
    trackBpmEvent("assessment_started", {
      eventType: "funnel",
      locale,
      properties: {
        completedRequired: precision.essentialDone,
        returningPlan,
        returningPlanId: returningPlanId || undefined
      }
    });
  }, [locale, precision.essentialDone, returningPlan, returningPlanId]);

  useEffect(() => {
    if (!showPlans || planGateTracked.current) return;

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
    if (!showExampleExit || exampleExitTracked.current) return;

    exampleExitTracked.current = true;
    trackBpmEvent("free_example_exit_viewed", {
      eventType: "email",
      exampleRequestId: exampleRequest?.requestId,
      locale,
      planId: exampleRequest?.planId
    });
  }, [exampleRequest?.planId, exampleRequest?.requestId, locale, showExampleExit]);

  const ui = locale === "th"
    ? {
        back: "ย้อนกลับ",
        continue: "ต่อไป",
        infoLabel: "Note",
        optionalSection: "ความแม่นยำ",
        processingError: "ไม่สามารถเริ่มการประมวลผลได้ โปรดลองอีกครั้ง",
        processingSubtitle: "เราจะเปิดหน้าปรับคำแนะนำก่อน จากนั้นคุณค่อยส่งมอบแผนสุดท้ายเมื่อพร้อม",
        processingTitle: "กำลังเตรียมคำแนะนำของคุณ",
        scoreProcessingSubtitle: "เรากำลังประเมินภาพรวมสุขภาพจากคำตอบของคุณก่อนแสดงตัวเลือกแผน",
        scoreProcessingTitle: "กำลังเตรียม HealthScore ของคุณ",
        scoreGate: {
          emailButton: "ส่งแผนฟรี 3 ข้อ + HealthScore",
          emailDescription: "ใส่อีเมลของคุณ แล้วเราจะส่งแผนโภชนาการฟรี 3 ข้อที่ครอบคลุมพื้นฐานสำคัญ",
          emailDivider: "หรือรับแผนโภชนาการฟรี 3 ข้อทางอีเมล",
          emailError: "กรุณาใส่อีเมลที่ถูกต้อง",
          emailPlaceholder: "your@email.com",
          emailTitle: "ยังไม่พร้อมปลดล็อก?",
          planDescription: "เลือกระดับคำแนะนำที่ต้องการ ก่อนที่เราจะเปิดแผนโภชนาการของคุณ",
          planTitle: "ปลดล็อกแผนโภชนาการเฉพาะตัวของคุณ",
          preparing: "กำลังเตรียม...",
          proContinueCta: "ไปต่อ",
          proContinueDescription: "คุณมีสิทธิ์แผน Pro อยู่แล้ว เราจะเปิดแผนโภชนาการเวอร์ชันใหม่โดยไม่แสดงตัวเลือกชำระเงิน",
          proContinueTitle: "แผน Pro พร้อมใช้งาน",
          reassessmentDescription: "",
          reassessmentTitle: "รวมการประเมินซ้ำฟรีใน 60 วัน ยกเลิกได้ทุกเมื่อ",
          title: "HealthScore ของคุณพร้อมแล้ว"
        },
        exampleExit: {
          body: "เรากำลังเตรียมแผนฉบับเต็มอยู่เบื้องหลัง และจะส่งตัวอย่างแผนโภชนาการ 3 ข้อแบบสั้นไปยังอีเมลของคุณ",
          chatBody: "เลือกช่องทางที่สะดวกเพื่อคุยต่อกับ AI advisor",
          chatButton: "เปิดแชต",
          chatPlanLabel: "แผน",
          chatQrAlt: "QR code สำหรับเชื่อมต่อ MattaNutra AI advisor",
          chatTitle: "คุยกับ AI advisor ระหว่างรอตัวอย่างของคุณ",
          emailPrefix: "เราจะส่งไปที่",
          testimonialTitle: "ลูกค้าใช้ MattaNutra เพื่อเปลี่ยนข้อมูลสุขภาพให้เป็นขั้นตอนที่ทำได้จริง",
          title: "ตัวอย่างของคุณกำลังถูกจัดเตรียม"
        },
        exampleProcessingSubtitle: "เรากำลังเตรียมแผนฉบับเต็มก่อนคัดส่วนสำคัญเป็นตัวอย่างทางอีเมล",
        exampleProcessingTitle: "กำลังเตรียมตัวอย่างของคุณ",
        retry: "ลองอีกครั้ง",
        requiredSection: "บริบท",
        section: (current: number, total: number) => `ขั้นตอน ${current} / ${total}`,
        step: (current: number, total: number) => `คำถามที่ ${current} จาก ${total}`,
        validation: "",
        wellnessDisclaimer: "แบบประเมินนี้เป็นข้อมูลเพื่อ wellness เท่านั้น ไม่ใช่การวินิจฉัย การรักษา หรือคำแนะนำให้หยุดยา"
      }
    : {
        back: "Back",
        continue: "Continue",
        infoLabel: "Note",
        optionalSection: "Precision",
        processingError: "We could not start processing. Please try again.",
        processingSubtitle: "We will open the refinement page first. When you are ready, deliver the final plan from there.",
        processingTitle: "Preparing your guidance",
        scoreProcessingSubtitle: "We are scoring your main wellness domains before showing the plan options.",
        scoreProcessingTitle: "Preparing your HealthScore",
        scoreGate: {
          emailButton: "Send My Free 3-Point Plan + HealthScore",
          emailDescription: "Enter your email address and we'll send you a free 3-point nutrition plan covering the essentials.",
          emailDivider: "or get a free 3-point nutrition plan by email",
          emailError: "Enter a valid email address",
          emailPlaceholder: "your@email.com",
          emailTitle: "Not ready to unlock?",
          planDescription: "Choose the level of guidance you want before we open your nutrition plan.",
          planTitle: "Unlock your bespoke nutrition plan",
          preparing: "Preparing...",
          proContinueCta: "Continue",
          proContinueDescription: "Your Pro access is active, so we can open a new nutrition plan version without showing payment options.",
          proContinueTitle: "Pro plan active",
          reassessmentDescription: "",
          reassessmentTitle: "Include a free 60-day reassessment. Cancel anytime.",
          title: "Your HealthScore is ready"
        },
        exampleExit: {
          body: "We are preparing the full plan in the background and sending a focused 3-point nutrition example to your inbox.",
          chatBody: "Choose your preferred channel to continue with the specialist AI advisor.",
          chatButton: "Open chat",
          chatPlanLabel: "Plan",
          chatQrAlt: "QR code to connect with the MattaNutra AI advisor",
          chatTitle: "Chat with the AI advisor while you wait",
          emailPrefix: "We will send it to",
          testimonialTitle: "People use MattaNutra to turn wellness data into practical next steps",
          title: "Your example is being prepared"
        },
        exampleProcessingSubtitle: "We are preparing the full plan first, then selecting the key points for your email example.",
        exampleProcessingTitle: "Preparing your example",
        retry: "Try again",
        requiredSection: "Context",
        section: (current: number, total: number) => `Step ${current} / ${total}`,
        step: (current: number, total: number) => `Question ${current} of ${total}`,
        validation: "",
        wellnessDisclaimer: "This assessment provides wellness information only. It is not diagnosis, treatment, or advice to stop medication."
      };

  function setSingle(key: keyof Answers, value: string) {
    setAnswers((current) => ({
      ...current,
      [key]: value,
      ...(key === "sex" && value !== "female" ? { flow: "", menopause: "", reproStatus: "" } : {}),
      ...(key === "reproStatus" && (value === "pregnant" || value === "breastfeeding") ? { flow: "" } : {}),
      ...(key === "meds" && value !== "yes" ? { medTypes: [], otherMed: "" } : {}),
      ...(key === "tracker" && value !== "other" ? { otherTracker: "" } : {})
    }));
  }

  function toggleMulti(key: "allergies" | "family" | "goals" | "medTypes" | "suppAllergies" | "symptoms", value: string, max = 99) {
    setAnswers((current) => {
      const values = current[key];
      const selected = values.includes(value);

      if (!selected && values.length >= max) return current;

      if (key === "allergies" || key === "family" || key === "suppAllergies") {
        if (value === "none") {
          return { ...current, [key]: selected ? [] : ["none"] };
        }

        return {
          ...current,
          [key]: selected ? values.filter((item) => item !== value) : [...values.filter((item) => item !== "none"), value]
        };
      }

      if (key === "symptoms" && value === "great") {
        return { ...current, symptoms: selected ? [] : ["great"] };
      }

      return {
        ...current,
        [key]: selected ? values.filter((item) => item !== value) : [...values.filter((item) => item !== "great"), value]
      };
    });
  }

  function updateFoodFrequency(key: FoodFrequencyKey, value: string) {
    setAnswers((current) => ({
      ...current,
      foodFrequency: {
        ...current.foodFrequency,
        [key]: value
      }
    }));
  }

  function updateLabValue(key: string, value: string) {
    setAnswers((current) => ({
      ...current,
      labs: {
        ...current.labs,
        [key]: value
      }
    }));
  }

  function updateLabUnit(key: string, value: string) {
    setAnswers((current) => ({
      ...current,
      labUnits: {
        ...current.labUnits,
        [key]: value
      }
    }));
  }

  const rawSections: AssessmentSection[] = [
    {
      complete: aboutComplete(answers),
      description: copy.about.subtitle,
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
          isAnswered: hasText(answers.sex),
          label: copy.about.sex,
          why: copy.coach.sex
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
          isAnswered: hasText(answers.age),
          label: copy.about.age
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
          id: "body-size",
          isAnswered: hasText(answers.heightCm) && hasText(answers.weightKg),
          label: locale === "th" ? "ส่วนสูงและน้ำหนัก" : "Height and weight"
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
          isAnswered: hasText(answers.skin),
          label: copy.about.skin
        },
        {
          content: (
            <div className="grid gap-5 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.2fr)] md:items-start">
              <label className="block">
                <span className="text-sm font-semibold text-[#20343A]">
                  {copy.about.country}
                </span>
                <select
                  value={answers.country}
                  className="mt-3 block w-full rounded-md border border-foreground/10 bg-white px-4 py-3 text-sm font-semibold text-[#20343A] outline-none transition focus:border-[#1FA77A] focus:ring-2 focus:ring-[#1FA77A]/15"
                  onChange={(event) => setSingle("country", event.target.value)}
                >
                  <option value="">{locale === "th" ? "เลือกประเทศ" : "Select country"}</option>
                  {copy.about.countryOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <div>
                <p className="text-sm font-semibold text-[#20343A]">
                  {copy.about.sun}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {copy.coach.sun}
                </p>
                <div className="mt-3">
                  <PillGroup
                    options={copy.about.sunOptions}
                    selected={answers.sun}
                    onSelect={(value) => setSingle("sun", value)}
                  />
                </div>
              </div>
            </div>
          ),
          id: "country-sun",
          isAnswered: hasText(answers.country) && hasText(answers.sun),
          label: ""
        },
        {
          content: (
            <PillGroup
              options={copy.about.sunscreenOptions}
              selected={answers.sunscreen}
              onSelect={(value) => setSingle("sunscreen", value)}
            />
          ),
          id: "sunscreen",
          isAnswered: hasText(answers.sunscreen),
          label: copy.about.sunscreen
        },
        ...(answers.sex === "female"
          ? [
              {
                content: (
                  <div className="space-y-5 rounded-lg border border-[#1FA77A]/15 bg-[#1FA77A]/5 p-4">
                    <Question
                      infoLabel={ui.infoLabel}
                      label={copy.about.reproStatus}
                      why={copy.coach.sex}
                    >
                      <PillGroup
                        options={copy.about.reproStatusOptions}
                        selected={answers.reproStatus}
                        onSelect={(value) => setSingle("reproStatus", value)}
                      />
                    </Question>
                    <Question
                      infoLabel={ui.infoLabel}
                      label={copy.about.menopause}
                    >
                      <PillGroup
                        options={copy.about.menopauseOptions}
                        selected={answers.menopause}
                        onSelect={(value) => setSingle("menopause", value)}
                      />
                    </Question>
                    {!isPregnantOrBreastfeeding(answers) ? (
                      <Question
                        infoLabel={ui.infoLabel}
                        label={copy.about.flow}
                      >
                        <PillGroup
                          options={copy.about.flowOptions}
                          selected={answers.flow}
                          onSelect={(value) => setSingle("flow", value)}
                        />
                      </Question>
                    ) : null}
                  </div>
                ),
                id: "female-context",
                isAnswered:
                  hasText(answers.reproStatus) &&
                  hasText(answers.menopause) &&
                  (isPregnantOrBreastfeeding(answers) || hasText(answers.flow)),
                label: copy.about.femaleTitle
              }
            ]
          : [])
      ],
      title: copy.about.title
    },
    {
      complete: goalsComplete(answers),
      description: copy.goals.subtitle,
      id: "goals",
      questions: [
        {
          content: (
            <OptionGrid
              max={3}
              options={copy.goals.goalOptions}
              selected={answers.goals}
              onToggle={(value) => toggleMulti("goals", value, 3)}
            />
          ),
          hint: copy.goals.goalHint,
          id: "goals",
          isAnswered: hasAny(answers.goals),
          label: copy.goals.goals,
          why: copy.coach.goals
        },
        {
          content: (
            <OptionGrid
              options={copy.goals.symptomOptions}
              selected={answers.symptoms}
              onToggle={(value) => toggleMulti("symptoms", value)}
            />
          ),
          hint: copy.goals.symptomHint,
          id: "symptoms",
          isAnswered: hasAny(answers.symptoms),
          label: copy.goals.symptoms
        }
      ],
      title: copy.goals.title
    },
    {
      complete: dailyComplete(answers),
      description: copy.daily.subtitle,
      id: "daily",
      questions: [
        {
          content: <PillGroup options={copy.daily.sleepOptions} selected={answers.sleepHrs} onSelect={(value) => setSingle("sleepHrs", value)} />,
          id: "sleepHrs",
          isAnswered: hasText(answers.sleepHrs),
          label: copy.daily.sleepHrs
        },
        {
          content: <ScaleGroup options={copy.daily.energyOptions} selected={answers.energy} onSelect={(value) => setSingle("energy", value)} />,
          id: "energy",
          isAnswered: hasText(answers.energy),
          label: copy.daily.energy
        },
        {
          content: <PillGroup options={copy.daily.activityOptions} selected={answers.activity} onSelect={(value) => setSingle("activity", value)} />,
          id: "activity",
          isAnswered: hasText(answers.activity),
          label: copy.daily.activity
        },
        {
          content: <ScaleGroup options={copy.daily.stressOptions} selected={answers.stress} onSelect={(value) => setSingle("stress", value)} />,
          id: "stress",
          isAnswered: hasText(answers.stress),
          label: copy.daily.stress
        },
        {
          content: <PillGroup options={copy.daily.digestionOptions} selected={answers.digestion} onSelect={(value) => setSingle("digestion", value)} />,
          id: "digestion",
          isAnswered: hasText(answers.digestion),
          label: copy.daily.digestion
        },
        {
          content: <PillGroup options={copy.daily.digConditionOptions} selected={answers.digCondition} onSelect={(value) => setSingle("digCondition", value)} />,
          id: "digCondition",
          isAnswered: hasText(answers.digCondition),
          label: copy.daily.digCondition
        },
        {
          content: <PillGroup options={copy.daily.smokingOptions} selected={answers.smoking} onSelect={(value) => setSingle("smoking", value)} />,
          id: "smoking",
          isAnswered: hasText(answers.smoking),
          label: copy.daily.smoking
        },
        {
          content: <PillGroup options={copy.daily.alcoholOptions} selected={answers.alcohol} onSelect={(value) => setSingle("alcohol", value)} />,
          id: "alcohol",
          isAnswered: hasText(answers.alcohol),
          label: copy.daily.alcohol
        },
        {
          content: <PillGroup options={copy.daily.caffeineOptions} selected={answers.caffeine} onSelect={(value) => setSingle("caffeine", value)} />,
          id: "caffeine",
          isAnswered: hasText(answers.caffeine),
          label: copy.daily.caffeine
        }
      ],
      title: copy.daily.title
    },
    {
      complete: foodComplete(answers),
      description: copy.food.subtitle,
      id: "food",
      questions: [
        {
          content: <PillGroup options={copy.food.dietOptions} selected={answers.diet} onSelect={(value) => setSingle("diet", value)} />,
          id: "diet",
          isAnswered: hasText(answers.diet),
          label: copy.food.diet
        },
        {
          content: (
            <div className="space-y-4">
              {foodFrequencyKeys.map((key) => (
                <div key={key} className="rounded-lg border border-foreground/10 bg-white p-4">
                  <p className="mb-3 text-sm font-semibold text-[#20343A]">
                    {copy.food.frequencyTitles[key]}
                  </p>
                  <PillGroup
                    options={copy.food.frequencyOptions[key]}
                    selected={answers.foodFrequency[key]}
                    onSelect={(value) => updateFoodFrequency(key, value)}
                  />
                </div>
              ))}
            </div>
          ),
          id: "foodFrequency",
          isAnswered: foodFrequencyKeys.every((key) => hasText(answers.foodFrequency[key])),
          label: copy.food.frequency,
          why: copy.coach.foodFrequency
        },
        {
          content: (
            <div className="space-y-4">
              <PillGroup multi={true} options={copy.food.allergyOptions} selected={answers.allergies} onToggle={(value) => toggleMulti("allergies", value)} />
              <textarea
                className={textInputClasses()}
                placeholder={copy.food.avoidPlaceholder}
                value={answers.avoidNote}
                onChange={(event) => setSingle("avoidNote", event.target.value)}
              />
            </div>
          ),
          hint: copy.food.avoidNote,
          id: "allergies",
          isAnswered: hasAny(answers.allergies),
          label: copy.food.allergies,
          why: copy.coach.allergies
        },
        {
          content: (
            <label className="flex gap-3 rounded-lg border border-[#1FA77A]/20 bg-[#1FA77A]/5 p-4 text-sm leading-6 text-muted-foreground">
              <input
                checked={answers.disclosure}
                className="mt-1 size-4 rounded border-foreground/20 text-[#1FA77A] focus:ring-[#1FA77A]"
                type="checkbox"
                onChange={(event) => setAnswers((current) => ({ ...current, disclosure: event.target.checked }))}
              />
              <span>
                <span className="block font-medium text-[#20343A]">{copy.food.disclosureTitle}</span>
                <span className="mt-1 block">{copy.food.disclosureBody}</span>
              </span>
            </label>
          ),
          id: "disclosure",
          isAnswered: answers.disclosure,
          label: copy.food.disclosureTitle
        }
      ],
      title: copy.food.title
    },
    {
      complete: safetyComplete(answers),
      description: copy.safety.subtitle,
      id: "safety",
      questions: [
        {
          content: (
            <div className="space-y-4">
              <PillGroup options={copy.safety.medicationOptions} selected={answers.meds} onSelect={(value) => setSingle("meds", value)} />
              {answers.meds === "yes" ? (
                <div className="rounded-lg border border-[#1FA77A]/15 bg-[#1FA77A]/5 p-4">
                  <p className="mb-3 text-sm font-semibold text-[#20343A]">{copy.safety.medicationType}</p>
                  <PillGroup multi={true} options={copy.safety.medicationTypeOptions} selected={answers.medTypes} onToggle={(value) => toggleMulti("medTypes", value)} />
                  {selectedOther(answers.medTypes) ? (
                    <input
                      className={textInputClasses()}
                      placeholder={copy.safety.otherMedPlaceholder}
                      value={answers.otherMed}
                      onChange={(event) => setSingle("otherMed", event.target.value)}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ),
          hint: copy.safety.medicationHint,
          id: "meds",
          isAnswered: hasText(answers.meds) && (answers.meds !== "yes" || hasAny(answers.medTypes)),
          label: copy.safety.medications,
          why: copy.coach.medications
        },
        {
          content: <PillGroup options={copy.safety.kidneyOptions} selected={answers.kidney} onSelect={(value) => setSingle("kidney", value)} />,
          id: "kidney",
          isAnswered: hasText(answers.kidney),
          label: copy.safety.kidney
        },
        {
          content: <PillGroup options={copy.safety.liverOptions} selected={answers.liver} onSelect={(value) => setSingle("liver", value)} />,
          id: "liver",
          isAnswered: hasText(answers.liver),
          label: copy.safety.liver
        },
        {
          content: <PillGroup options={copy.safety.surgeryOptions} selected={answers.surgery} onSelect={(value) => setSingle("surgery", value)} />,
          id: "surgery",
          isAnswered: hasText(answers.surgery),
          label: copy.safety.surgery
        },
        {
          content: <PillGroup options={copy.safety.antibioticsOptions} selected={answers.antibiotics} onSelect={(value) => setSingle("antibiotics", value)} />,
          id: "antibiotics",
          isAnswered: hasText(answers.antibiotics),
          label: copy.safety.antibiotics
        },
        {
          content: <PillGroup options={copy.safety.supplementsOptions} selected={answers.supplements} onSelect={(value) => setSingle("supplements", value)} />,
          id: "supplements",
          isAnswered: hasText(answers.supplements),
          label: copy.safety.supplements
        },
        {
          content: (
            <div className="space-y-4">
              <PillGroup multi={true} options={copy.safety.suppAllergyOptions} selected={answers.suppAllergies} onToggle={(value) => toggleMulti("suppAllergies", value)} />
              {selectedOther(answers.suppAllergies) ? (
                <input
                  className={textInputClasses()}
                  placeholder={copy.safety.otherSuppPlaceholder}
                  value={answers.otherSupp}
                  onChange={(event) => setSingle("otherSupp", event.target.value)}
                />
              ) : null}
            </div>
          ),
          id: "suppAllergies",
          isAnswered: hasAny(answers.suppAllergies) && (!selectedOther(answers.suppAllergies) || hasText(answers.otherSupp)),
          label: copy.safety.suppAllergies
        }
      ],
      title: copy.safety.title
    },
    {
      complete: precisionRequiredComplete(answers),
      description: copy.precision.subtitle,
      id: "precision",
      questions: [
        {
          content: <PillGroup options={copy.precision.budgetOptions} selected={answers.budget} onSelect={(value) => setSingle("budget", value)} />,
          id: "budget",
          isAnswered: hasText(answers.budget),
          label: copy.precision.budget
        },
        {
          content: <PillGroup options={copy.precision.maxPillsOptions} selected={answers.maxPills} onSelect={(value) => setSingle("maxPills", value)} />,
          id: "maxPills",
          isAnswered: hasText(answers.maxPills),
          label: copy.precision.maxPills
        },
        {
          content: <PillGroup options={copy.precision.formOptions} selected={answers.form} onSelect={(value) => setSingle("form", value)} />,
          id: "form",
          isAnswered: hasText(answers.form),
          label: copy.precision.form
        },
        {
          content: (
            <div className="space-y-5 rounded-lg border border-[#3A7BD5]/15 bg-[#3A7BD5]/5 p-4">
              <div>
                <p className="text-sm font-semibold text-[#20343A]">{copy.precision.optionalBanner}</p>
                <p className="mt-1 text-sm text-muted-foreground">{copy.precision.optionalBody}</p>
              </div>
              <Question infoLabel={ui.infoLabel} label={copy.precision.protein} why={copy.coach.precision}>
                <PillGroup options={copy.precision.proteinOptions} selected={answers.protein} onSelect={(value) => setSingle("protein", value)} />
              </Question>
              <Question infoLabel={ui.infoLabel} label={copy.precision.family}>
                <OptionGrid options={copy.precision.familyOptions} selected={answers.family} onToggle={(value) => toggleMulti("family", value, 8)} />
              </Question>
              <Question infoLabel={ui.infoLabel} label={copy.precision.tracker}>
                <PillGroup options={copy.precision.trackerOptions} selected={answers.tracker} onSelect={(value) => setSingle("tracker", value)} />
                {answers.tracker === "other" ? (
                  <input className={textInputClasses()} value={answers.otherTracker} onChange={(event) => setSingle("otherTracker", event.target.value)} />
                ) : null}
              </Question>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-[#20343A]">{copy.precision.vo2}</span>
                  <input className={textInputClasses()} inputMode="decimal" value={answers.vo2} onChange={(event) => setSingle("vo2", event.target.value)} />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#20343A]">{copy.precision.hrv}</span>
                  <input className={textInputClasses()} inputMode="decimal" value={answers.hrv} onChange={(event) => setSingle("hrv", event.target.value)} />
                </label>
              </div>
              <Question infoLabel={ui.infoLabel} label={copy.precision.labs} hint={copy.precision.labsHint} why={copy.coach.labs}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {copy.precision.labFields.map((field) => (
                    <label key={field.value} className="block rounded-lg border border-foreground/10 bg-white p-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#20343A]">{field.label}</span>
                      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                        <input
                          className="min-w-0 rounded-md border border-foreground/10 px-3 py-2 text-sm outline-none focus:border-[#1FA77A] focus:ring-2 focus:ring-[#1FA77A]/15"
                          inputMode="decimal"
                          value={answers.labs[field.value] ?? ""}
                          onChange={(event) => updateLabValue(field.value, event.target.value)}
                        />
                        <select
                          className="rounded-md border border-foreground/10 bg-white px-2 py-2 text-xs font-semibold text-[#20343A] outline-none focus:border-[#1FA77A]"
                          value={answers.labUnits[field.value] ?? field.units[0]}
                          onChange={(event) => updateLabUnit(field.value, event.target.value)}
                        >
                          {field.units.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                    </label>
                  ))}
                </div>
              </Question>
              <label className="block">
                <span className="text-sm font-semibold text-[#20343A]">{locale === "th" ? "อีเมลสำหรับประเมินซ้ำ" : "Reassessment email"}</span>
                <input
                  className={textInputClasses()}
                  type="email"
                  value={answers.reassessmentEmail}
                  onChange={(event) => setSingle("reassessmentEmail", event.target.value)}
                />
              </label>
            </div>
          ),
          id: "optional-precision",
          isAnswered: optionalChecks(answers).some(Boolean),
          label: copy.precision.optionalBanner,
          why: copy.coach.precision
        }
      ],
      title: copy.precision.title
    }
  ];

  const sections: AssessmentSection[] = rawSections.map((section) => ({
    ...section,
    complete: section.questions.some((question) => question.isAnswered),
    questions: section.questions.map((question) => ({
      ...question,
      required: false
    }))
  }));


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
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  const currentSection = sections[Math.min(sectionIndex, sections.length - 1)];
  const renderedQuestions = currentSection.questions;
  const isFinalStep = sectionIndex === sections.length - 1;

  function sectionIsComplete(section: AssessmentSection) {
    return section.questions.some((question) => question.isAnswered);
  }

  function goBack() {
    setProcessingError("");
    setExampleError("");

    if (sectionIndex > 0) {
      setSectionIndex(sectionIndex - 1);
      return;
    }

    return;
  }

  function goToSection(index: number) {
    setProcessingError("");
    setExampleError("");
    setSectionIndex(Math.min(Math.max(index, 0), sections.length - 1));
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  function goNext() {
    if (isFinalStep) {
      void prepareHealthScoreGate(answers);
      return;
    }

    setSectionIndex(Math.min(sectionIndex + 1, sections.length - 1));
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

  const applyHealthScoreStatus = useCallback((status: ProcessingStatus) => {
    if (!status.healthScore) {
      return;
    }

    setHealthScore(status.healthScore);

    if (status.status !== "ready" || healthScoreViewedTracked.current) {
      return;
    }

    healthScoreViewedTracked.current = true;
    trackBpmEvent("healthscore_viewed", {
      eventType: "funnel",
      locale,
      planId: status.planId,
      ...healthScoreBpmFields(status.healthScore)
    });
  }, [locale]);

  async function prepareHealthScoreGate(answerPayload = answers) {
    setProcessingError("");
    setExampleError("");
    setShowPlans(false);
    setShowExampleExit(false);
    setExampleRequest(null);
    setProcessingMode("score");
    healthScoreViewedTracked.current = false;
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
        completedRequired: precision.essentialDone,
        requiredTotal: precision.essentialTotal
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

      applyHealthScoreStatus(captured);
      setCapturedStatus(captured);
      setProcessingStatus(captured);

      const readyScoreStatus = await waitForHealthScoreAnalysis(captured);

      applyHealthScoreStatus(readyScoreStatus);
      setCapturedStatus(readyScoreStatus);
      setProcessingStatus(readyScoreStatus);
      router.replace(nutritionHealthScorePath(locale, readyScoreStatus.planId));

    } catch {
      window.clearTimeout(analysisStepTimeout);
      clearProcessingStatus();
      setProcessingError(ui.processingError);
    }
  }

  async function waitForHealthScoreAnalysis(initialStatus: ProcessingStatus) {
    let status = initialStatus;

    for (let attempt = 0; attempt <= HEALTH_SCORE_ANALYSIS_MAX_POLLS; attempt += 1) {
      if (status.status === "ready") {
        return status;
      }

      if (status.status === "failed") {
        throw new Error("HealthScore analysis failed");
      }

      if (attempt > 0) {
        applyHealthScoreStatus(status);
        setCapturedStatus(status);
        setProcessingStatus(status);
      }

      await sleep(HEALTH_SCORE_ANALYSIS_POLL_INTERVAL_MS);

      const response = await fetchWithTimeout(
        `/api/assessment/${encodeURIComponent(status.planId)}?mode=score`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("Unable to fetch HealthScore analysis status");
      }

      status = (await response.json()) as ProcessingStatus;
    }

    throw new Error("HealthScore analysis timed out");
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
        { id: "score", state: "complete" },
        { id: "formulation", state: "active" },
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
        if (displayedProcessingStatus.planId) {
          router.replace(
            nutritionHealthScorePath(locale, displayedProcessingStatus.planId)
          );
        }
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
        router.push(nutritionRefinePath(locale, displayedProcessingStatus.planId));
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
    let pollTimeout: number | undefined;

    async function pollStatus() {
      try {
        if (processingMode === "example" && !exampleRequest?.requestId) {
          return;
        }

        const url =
          processingMode === "example"
            ? `/api/assessment/${encodeURIComponent(planId)}/example?requestId=${encodeURIComponent(exampleRequest?.requestId ?? "")}`
            : processingMode === "score"
              ? `/api/assessment/${encodeURIComponent(planId)}?mode=score`
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
          if (processingMode === "score") {
            applyHealthScoreStatus(status);
            setCapturedStatus(status);
          }
          setProcessingStatus(status);
        }
      } catch {
        if (!cancelled) {
          pollFailureCount.current += 1;

          if (pollFailureCount.current >= 3) {
            setProcessingError(ui.processingError);
          }
        }
      } finally {
        if (!cancelled) {
          pollTimeout = window.setTimeout(pollStatus, 1500);
        }
      }
    }

    pollTimeout = window.setTimeout(pollStatus, 0);

    return () => {
      cancelled = true;
      if (pollTimeout !== undefined) {
        window.clearTimeout(pollTimeout);
      }
    };
  }, [
    applyHealthScoreStatus,
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
            retryLabel={ui.retry}
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
            onEmailChange={setExampleEmail}
            onIncludeReassessmentChange={setIncludeExampleReassessment}
            onRequestExample={() => void requestExampleBrief()}
            onSelect={choosePlan}
            scoreContent={ui.scoreGate}
            proAccess={hasReturningProAccess}
            reassessmentAlreadyOptedIn={reassessmentAlreadyOptedIn}
          />
        ) : (
          <div className="space-y-6">
            <SectionProgress
              className="sticky top-[4.5rem] z-40 mb-2"
              hint={precisionHint}
              label={copy.progress.label}
              marks={[
                copy.progress.markStart,
                copy.progress.markMiddle,
                copy.progress.markEnd
              ]}
              progress={precision.progress}
            />

            <div>
              <AssessmentStepper
                currentIndex={sectionIndex}
                onSelect={goToSection}
                phases={copy.stagePhases}
                sections={sections}
                stages={copy.stages}
              />
            </div>

            <SectionCard
              description={currentSection.description}
              done={sectionIsComplete(currentSection)}
              footer={
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      disabled={sectionIndex === 0}
                      className="rounded-md border border-foreground/10 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-[#20343A] transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={goBack}
                    >
                      {ui.back}
                    </button>
                    {showDevShortcut ? (
                      <button
                        type="button"
                        className="rounded-md border border-foreground/10 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground transition hover:bg-background hover:text-[#20343A]"
                        onClick={fillRandomDefaultsAndFinalStep}
                      >
                        Random defaults
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1FA77A] px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-[#188a65]"
                    onClick={goNext}
                  >
                    {isFinalStep ? copy.fixedAction.generate : ui.continue}
                    {isFinalStep ? (
                      <BeakerIcon aria-hidden={true} className="size-5" />
                    ) : null}
                  </button>
                </div>
              }
              sectionLabel={copy.stagePhases[sectionIndex] ?? ""}
              stepLabel={ui.section(sectionIndex + 1, sections.length)}
              supportingNote={copy.sectionNotes[sectionIndex]}
              title={currentSection.title}
            >
              {renderedQuestions.map((question) => (
                <Question
                  key={question.id}
                  hint={question.hint}
                  infoLabel={ui.infoLabel}
                  label={question.label}
                  why={question.why}
                >
                  {question.content}
                </Question>
              ))}
            </SectionCard>

            {processingError ? (
              <p className="text-sm font-medium text-red-600">
                {processingError}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

type PlanSelectionPanelProps = Readonly<{
  content: PlanContent;
  email: string;
  emailError: string;
  exampleLoading: boolean;
  healthScore: HealthScoreResult | null;
  includeReassessment: boolean;
  locale: Locale;
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

      <div className="text-center">
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
        <div className="mt-12 rounded-3xl bg-white/80 px-6 py-8 ring-1 ring-[#3A7BD5]/10 sm:px-8">
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
        <div className="mt-14 rounded-3xl bg-[#20343A] p-8 text-center shadow-2xl ring-1 ring-gray-900/10 sm:p-10">
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
        <div className="mt-14 grid grid-cols-1 items-center gap-y-6 sm:mt-16 sm:gap-y-0 lg:grid-cols-2">
          {content.tiers.map((tier, tierIndex) => (
          <div
            key={tier.id}
            className={cx(
              "rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10",
              tier.featured
                ? "relative z-10 bg-[#20343A] shadow-2xl"
                : "bg-white/70",
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
    <section className="mt-8 rounded-3xl bg-white py-12 ring-1 ring-gray-900/10 sm:py-14">
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

function assessmentResultsHref(locale: Locale, planId: string) {
  return nutritionRefinePath(locale, planId);
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
    <div className="space-y-6">
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
              <a
                className="max-w-full truncate rounded-md bg-background px-2.5 py-1.5 font-mono text-[11px] font-medium text-[#3A7BD5] ring-1 ring-foreground/10 hover:text-[#2F67B8]"
                href={assessmentResultsHref(locale, planId)}
              >
                {planId}
              </a>
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
