"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BeakerIcon,
  CheckIcon,
  ShieldCheckIcon
} from "@heroicons/react/20/solid";
import {
  OptionGrid,
  PillGroup,
  ProcessingPanel,
  Question,
  ScaleGroup,
  SectionCard,
  SkinToneGroup,
  cx
} from "@/components/nutrition-flow/ui";
import { HealthScorePaymentPanel } from "@/components/nutrition-flow/healthscore-panel";
import {
  ASSESSMENT_FIRST_NAME_MAX_LENGTH,
  normalizeAssessmentFirstName
} from "@/lib/assessment-first-name";
import { getBpmPayload, trackBpmEvent } from "@/lib/bpm-client";
import type { HealthScoreResult } from "@/lib/health-score";
import type { Locale } from "@/lib/i18n";
import {
  nutritionHealthScorePath,
  nutritionRevealPath
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
  budget: string;
  caffeine: string;
  country: string;
  diet: string;
  digCondition: string;
  digestion: string;
  disclosure: boolean;
  energy: string;
  family: string[];
  firstName: string;
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
  otherTracker: string;
  protein: string;
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
    firstName: string;
    firstNameHint: string;
    firstNameOptional: string;
    flow: string;
    flowOptions: Option[];
    honestyBody: string;
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
    trustItems: readonly Readonly<{
      body: string;
      title: string;
    }>[];
    weight: string;
  };
  coach: Record<string, string>;
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
    generate: string;
  };
  food: {
    allergies: string;
    allergyOptions: Option[];
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
    vo2Estimate: string;
    vo2EstimateButton: string;
    vo2EstimateNeeds: string;
    vo2EstimateReady: (value: number) => string;
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
  budget: "",
  caffeine: "",
  country: "TH",
  diet: "",
  digCondition: "",
  digestion: "",
  disclosure: false,
  energy: "",
  family: [],
  firstName: "",
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
  otherTracker: "",
  protein: "",
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

function clampFirstNameInput(value: string) {
  return Array.from(value).slice(0, ASSESSMENT_FIRST_NAME_MAX_LENGTH).join("");
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
    firstName:
      typeof prefill.firstName === "string"
        ? clampFirstNameInput(prefill.firstName)
        : initialAnswers.firstName,
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
    firstName: randomItem(["Alex", "Maya", "Niran"]),
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
    firstName: "First name",
    firstNameHint: "So we can personalise your Right Amount.",
    firstNameOptional: "Optional",
    honestyBody:
      "There are no right or wrong answers here, only true ones. The more honestly you answer, the more exactly your formula fits, and the safer it is alongside anything you already take.",
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
    sun: "Sun exposure ( Min / day )",
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
    ],
    trustItems: [
      {
        body: "Every formula is screened against your medicines, labs, and Thai FDA registration.",
        title: "Reviewed for safety"
      },
      {
        body: "Your answers stay tied to your plan. We do not sell them or share them with advertisers.",
        title: "Private by default"
      },
      {
        body: "Guidance to support your goals, always shareable with your doctor.",
        title: "Wellness, not diagnosis"
      }
    ]
  },
  coach: {
    allergies: "Food allergy context keeps the supplement brief practical without adding a free-text avoidance field.",
    foodFrequency: "Food frequency improves micronutrient gap estimates without adding food matching back into the active product engine.",
    goals: "Choose up to three. The formulation uses these as priorities rather than trying to optimise everything equally.",
    labs: "Units matter. We keep the number and unit together before sending data to AI.",
    medications: "This is not for diagnosis. It gives the AI and deterministic safety layer the context needed to add cautions.",
    precision: "These optional fields move the last 20% of the precision meter.",
    sex: "Sex and reproductive context affect dose caution, iron logic, and product audience filtering.",
    sun: "Skin tone, sun, and sunscreen help estimate vitamin D context more honestly."
  },
  daily: {
    title: "Your daily life",
    subtitle: "This turns the formula from a generic stack into something that fits your routine.",
    sleepHrs: "Sleep per night ( hours )",
    sleepOptions: [
      { label: "Under 5", value: "u5" },
      { label: "5-6", value: "5-6" },
      { label: "6-7", value: "6-7" },
      { label: "7-8", value: "7-8" },
      { label: "8-9", value: "8-9" },
      { label: "Over 9", value: "9+" }
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
    alcohol: "Alcohol ( Drinks / week )",
    alcoholOptions: [
      { label: "None", value: "none" },
      { label: "1-3", value: "1-3" },
      { label: "4-7", value: "4-7" },
      { label: "8+", value: "8+" }
    ],
    caffeine: "Caffeine ( Cups / day )",
    caffeineOptions: [
      { label: "None", value: "none" },
      { label: "1", value: "1" },
      { label: "2-3", value: "2-3" },
      { label: "4+", value: "4+" }
    ]
  },
  fixedAction: {
    generate: "Generate my health score"
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
      dairy: "Dairy ( Servings / day )",
      eggs: "Eggs",
      fish: "Fatty fish",
      fruitveg: "Fruit & veg ( Servings / day )",
      legumes: "Legumes / nuts",
      redmeat: "Red meat ( Servings / week )"
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
  precision: {
    title: "Your preferences",
    subtitle: "Set practical constraints first, then add optional precision if you have it.",
    budget: "Monthly supplement budget ( THB )",
    budgetOptions: [
      { label: "Under 1,000", value: "u1000" },
      { label: "1,000-2,500", value: "1000-2500" },
      { label: "2,500-5,000", value: "2500-5000" },
      { label: "5,000+", value: "5000+" }
    ],
    maxPills: "Max pills / capsules ( Per day )",
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
    protein: "Protein ( G / kg / day )",
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
    vo2Estimate: "VO2 estimator",
    vo2EstimateButton: "Use estimate",
    vo2EstimateNeeds: "Answer sex, age, height, weight and activity to estimate VO2.",
    vo2EstimateReady: (value) => `Estimated ${value} ml/kg/min from your current answers.`,
    hrv: "Average HRV",
    labs: "Recent lab values",
    labsHint: "Only if you have them. Units matter.",
    labFields
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
    "The more we understand you, the better our recommendations become.",
    "",
    "",
    "",
    "",
    ""
  ],
  stagePhases: ["It's all you", "Foundation", "Foundation", "Foundation", "Safety", "Personalise"],
  stages: ["About you", "Goals", "Daily life", "Food", "Safety", "Precision"]
};

const th: Copy = {
  ...en,
  about: {
    ...en.about,
    title: "ข้อมูลพื้นฐานของคุณ",
    subtitle: "เริ่มด้วยการแตะไม่กี่ครั้ง เพื่อวางพื้นฐานให้สูตรส่วนถัดไปแม่นยำขึ้น",
    firstName: "ชื่อเล่นหรือชื่อจริง",
    firstNameHint: "ใช้เพื่อปรับข้อความในแผนของคุณเท่านั้น",
    firstNameOptional: "ไม่บังคับ",
    honestyBody:
      "ไม่มีคำตอบที่ถูกหรือผิด มีแค่คำตอบที่ตรงกับคุณ ยิ่งตอบตามจริง สูตรก็ยิ่งเหมาะกับชีวิตจริงและปลอดภัยขึ้นเมื่อใช้ร่วมกับสิ่งที่คุณทานอยู่",
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
      { label: "สีผิว 1", value: "I" },
      { label: "สีผิว 2", value: "II" },
      { label: "สีผิว 3", value: "III" },
      { label: "สีผิว 4", value: "IV" },
      { label: "สีผิว 5", value: "V" },
      { label: "สีผิว 6", value: "VI" }
    ],
    country: "ประเทศ",
    countryOptions: [
      { label: "ประเทศไทย", value: "TH" },
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
      { label: "อื่น ๆ", value: "OTHER" }
    ],
    sun: "การได้รับแดด ( นาที / วัน )",
    sunOptions: [
      { label: "น้อยกว่า 15", value: "u15" },
      { label: "15-30", value: "15-30" },
      { label: "30-60", value: "30-60" },
      { label: "60+", value: "60+" }
    ],
    sunscreen: "การใช้กันแดด",
    sunscreenOptions: [
      { label: "แทบไม่ใช้", value: "rarely" },
      { label: "บางครั้ง", value: "sometimes" },
      { label: "ทุกวัน", value: "daily" }
    ],
    femaleTitle: "บริบทสุขภาพผู้หญิง",
    reproStatus: "สถานะตั้งครรภ์ / ให้นม",
    reproStatusOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "กำลังพยายามตั้งครรภ์", value: "ttc" },
      { label: "ตั้งครรภ์", value: "pregnant" },
      { label: "ให้นมบุตร", value: "breastfeeding" }
    ],
    menopause: "ช่วงวัยหมดประจำเดือน",
    menopauseOptions: [
      { label: "ก่อนวัยหมดประจำเดือน", value: "pre" },
      { label: "วัยใกล้หมดประจำเดือน", value: "peri" },
      { label: "หลังหมดประจำเดือน", value: "post" },
      { label: "ไม่แน่ใจ", value: "unsure" }
    ],
    flow: "ปริมาณประจำเดือน",
    flowOptions: [
      { label: "ไม่มีประจำเดือน", value: "none" },
      { label: "น้อย", value: "light" },
      { label: "ปานกลาง", value: "moderate" },
      { label: "มาก", value: "heavy" }
    ],
    trustItems: [
      {
        body: "สูตรถูกตรวจร่วมกับยา แล็บ และบริบททะเบียน อย. ไทย",
        title: "ตรวจเพื่อความปลอดภัย"
      },
      {
        body: "คำตอบผูกกับแผนของคุณ เราไม่ขายหรือส่งให้ผู้ลงโฆษณา",
        title: "เป็นส่วนตัวตั้งแต่ต้น"
      },
      {
        body: "คำแนะนำเพื่อสนับสนุนเป้าหมายสุขภาวะ และนำไปคุยกับแพทย์ได้",
        title: "สุขภาวะ ไม่ใช่การวินิจฉัย"
      }
    ]
  },
  coach: {
    allergies: "ข้อมูลแพ้อาหารช่วยให้คำแนะนำด้านอาหารเสริมเหมาะสมขึ้น โดยไม่ต้องกรอกข้อความเพิ่มเติม",
    foodFrequency: "ความถี่อาหารช่วยประเมินช่องว่างสารอาหาร โดยไม่เปิด food matching ในระบบผลิตภัณฑ์ตอนนี้",
    goals: "เลือกได้สูงสุด 3 ข้อ ระบบจะใช้เป็นลำดับความสำคัญ",
    labs: "หน่วยสำคัญมาก เราเก็บตัวเลขพร้อมหน่วยก่อนส่งให้ AI",
    medications: "ไม่ใช่การวินิจฉัย แต่ช่วยให้ AI และระบบตรวจความปลอดภัยเพิ่มข้อควรระวังได้",
    precision: "ช่องเสริมเหล่านี้เพิ่มความแม่นยำ 20% สุดท้าย",
    sex: "เพศและบริบทการตั้งครรภ์มีผลต่อข้อควรระวัง ธาตุเหล็ก และการกรองสินค้า",
    sun: "สีผิว แดด และกันแดดช่วยประเมินบริบทวิตามินดีอย่างซื่อตรงขึ้น"
  },
  fixedAction: {
    generate: "สร้างคะแนนสุขภาพของฉัน"
  },
  daily: {
    title: "ชีวิตประจำวันของคุณ",
    subtitle: "ข้อมูลส่วนนี้ช่วยให้สูตรไม่ใช่แค่ชุดทั่วไป แต่เข้ากับกิจวัตรของคุณจริง ๆ",
    sleepHrs: "เวลานอนต่อคืน ( ชั่วโมง )",
    sleepOptions: [
      { label: "น้อยกว่า 5", value: "u5" },
      { label: "5-6", value: "5-6" },
      { label: "6-7", value: "6-7" },
      { label: "7-8", value: "7-8" },
      { label: "8-9", value: "8-9" },
      { label: "มากกว่า 9", value: "9+" }
    ],
    energy: "ระดับพลังงาน",
    energyOptions: [
      { label: "หมดแรง", value: "drained", tone: "Low" },
      { label: "ต่ำ", value: "low", tone: "Low" },
      { label: "พอใช้", value: "ok", tone: "Mid" },
      { label: "ดี", value: "good", tone: "High" },
      { label: "ดีเยี่ยม", value: "excellent", tone: "High" }
    ],
    activity: "ระดับกิจกรรม",
    activityOptions: [
      { label: "นั่งเป็นส่วนใหญ่", value: "sitting" },
      { label: "เบา", value: "light" },
      { label: "ปานกลาง", value: "moderate" },
      { label: "กระฉับกระเฉง", value: "active" },
      { label: "นักกีฬา", value: "athlete" }
    ],
    stress: "ระดับความเครียด",
    stressOptions: [
      { label: "ต่ำมาก", value: "verylow", tone: "Low" },
      { label: "ต่ำ", value: "low", tone: "Low" },
      { label: "ปานกลาง", value: "moderate", tone: "Mid" },
      { label: "สูง", value: "high", tone: "High" },
      { label: "สูงมาก", value: "extreme", tone: "High" }
    ],
    digestion: "การย่อยอาหาร",
    digestionOptions: [
      { label: "ไม่มีปัญหา", value: "none" },
      { label: "ท้องอืด", value: "bloating" },
      { label: "ท้องผูก", value: "constipation" },
      { label: "ถ่ายเหลว", value: "loose" }
    ],
    digCondition: "ภาวะระบบทางเดินอาหาร",
    digConditionOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "ลำไส้แปรปรวน (IBS)", value: "ibs" },
      { label: "โรคเซลิแอค", value: "celiac" },
      { label: "ลำไส้อักเสบ (IBD)", value: "ibd" },
      { label: "เคยผ่าตัดลดน้ำหนัก", value: "bariatric" }
    ],
    smoking: "การสูบบุหรี่",
    smokingOptions: [
      { label: "ไม่เคย", value: "never" },
      { label: "เลิกมาเกิน 5 ปี", value: "ex5+" },
      { label: "เลิกไม่ถึง 5 ปี", value: "ex5" },
      { label: "สูบเป็นบางครั้ง", value: "occasional" },
      { label: "สูบทุกวัน", value: "daily" }
    ],
    alcohol: "แอลกอฮอล์ ( แก้ว / สัปดาห์ )",
    alcoholOptions: [
      { label: "ไม่ดื่ม", value: "none" },
      { label: "1-3", value: "1-3" },
      { label: "4-7", value: "4-7" },
      { label: "8+", value: "8+" }
    ],
    caffeine: "คาเฟอีน ( แก้ว / วัน )",
    caffeineOptions: [
      { label: "ไม่ดื่ม", value: "none" },
      { label: "1", value: "1" },
      { label: "2-3", value: "2-3" },
      { label: "4+", value: "4+" }
    ]
  },
  food: {
    title: "อาหารและโภชนาการ",
    subtitle: "บริบทอาหารช่วยให้คำแนะนำอาหารเสริมแม่นขึ้น แม้การจับคู่ผลิตภัณฑ์จะยังเน้นอาหารเสริมเท่านั้น",
    diet: "รูปแบบการกิน",
    dietOptions: [
      { label: "ไม่มีรูปแบบเฉพาะ", value: "none" },
      { label: "อาหารแปรรูปค่อนข้างมาก", value: "processed" },
      { label: "ค่อนข้างสมดุล", value: "balanced" },
      { label: "อาหารไม่แปรรูปเป็นหลัก", value: "whole" },
      { label: "เมดิเตอร์เรเนียน", value: "mediterranean" },
      { label: "เน้นพืช", value: "plant" },
      { label: "วีแกน", value: "vegan" },
      { label: "คาร์นิวอร์", value: "carnivore" }
    ],
    frequency: "คุณกินบ่อยแค่ไหน...",
    frequencyTitles: {
      dairy: "ผลิตภัณฑ์นม ( หน่วยบริโภค / วัน )",
      eggs: "ไข่",
      fish: "ปลาที่มีไขมัน",
      fruitveg: "ผักและผลไม้ ( หน่วยบริโภค / วัน )",
      legumes: "ถั่ว / ถั่วเปลือกแข็ง",
      redmeat: "เนื้อแดง ( หน่วยบริโภค / สัปดาห์ )"
    },
    frequencyOptions: {
      dairy: [
        { label: "ไม่เคย", value: "never" },
        { label: "1-2", value: "1-2" },
        { label: "3+", value: "3+" }
      ],
      eggs: [
        { label: "นาน ๆ ครั้ง", value: "rare" },
        { label: "ทุกสัปดาห์", value: "weekly" },
        { label: "เกือบทุกวัน", value: "most" }
      ],
      fish: [
        { label: "ไม่เคย", value: "never" },
        { label: "นาน ๆ ครั้ง", value: "rare" },
        { label: "ทุกสัปดาห์", value: "once" },
        { label: "บ่อย", value: "often" }
      ],
      fruitveg: [
        { label: "ไม่ทุกวัน", value: "notdaily" },
        { label: "1-2", value: "1-2" },
        { label: "3+", value: "3+" }
      ],
      legumes: [
        { label: "นาน ๆ ครั้ง", value: "rare" },
        { label: "ทุกสัปดาห์", value: "weekly" },
        { label: "เกือบทุกวัน", value: "most" }
      ],
      redmeat: [
        { label: "ไม่เคย", value: "never" },
        { label: "1-2", value: "1-2" },
        { label: "3+", value: "3+" }
      ]
    },
    allergies: "แพ้อาหาร",
    allergyOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "นม", value: "milk" },
      { label: "ไข่", value: "eggs" },
      { label: "ปลา", value: "fish" },
      { label: "หอยและอาหารทะเลเปลือกแข็ง", value: "shellfish" },
      { label: "ถั่วเปลือกแข็ง", value: "treenuts" },
      { label: "ถั่วลิสง", value: "peanuts" },
      { label: "ข้าวสาลี", value: "wheat" },
      { label: "ถั่วเหลือง", value: "soy" },
      { label: "งา", value: "sesame" }
    ],
    disclosureTitle: "ฉันยืนยันว่าได้เปิดเผยข้อมูลแพ้ ภาวะสุขภาพ ยา และข้อจำกัดด้านอาหารที่เกี่ยวข้องแล้ว",
    disclosureBody: "คำแนะนำของ MattaNutra สนับสนุนสุขภาวะทั่วไป และไม่แทนคำแนะนำทางการแพทย์"
  },
  goals: {
    title: "เป้าหมายและอาการของคุณ",
    subtitle: "เป้าหมายหลักและอาการปัจจุบันช่วยกำหนดลำดับความสำคัญของสูตร",
    goals: "เป้าหมายสุขภาพหลัก",
    goalHint: "เลือกได้สูงสุด 3 ข้อ",
    goalOptions: [
      { label: "พลังงาน", value: "energy" },
      { label: "การนอน", value: "sleep" },
      { label: "สมาธิ", value: "focus" },
      { label: "อายุยืนอย่างมีคุณภาพ", value: "longevity" },
      { label: "ภูมิคุ้มกัน", value: "immunity" },
      { label: "ฟิตเนส", value: "fitness" },
      { label: "น้ำหนัก", value: "weight" },
      { label: "อารมณ์", value: "mood" },
      { label: "หัวใจ", value: "heart" },
      { label: "ข้อและกระดูก", value: "joints" },
      { label: "ผิว", value: "skin" },
      { label: "ฮอร์โมน", value: "hormones" }
    ],
    symptoms: "อาการปัจจุบัน",
    symptomHint: "เลือกได้ทุกข้อที่ตรงกับคุณ หากไม่มีอาการเด่น ให้เลือก รู้สึกดี",
    symptomOptions: [
      { label: "อ่อนเพลีย", value: "fatigue" },
      { label: "สมองล้า / คิดไม่ชัด", value: "brainfog" },
      { label: "อารมณ์", value: "mood" },
      { label: "ปวดข้อ", value: "joint" },
      { label: "ระบบย่อย", value: "digestion" },
      { label: "นอนหลับไม่ดี", value: "sleep" },
      { label: "เครียด", value: "stress" },
      { label: "ผิว", value: "skin" },
      { label: "ผมร่วง", value: "hair" },
      { label: "ความต้องการทางเพศต่ำ", value: "libido" },
      { label: "เป็นหวัดบ่อย", value: "colds" },
      { label: "รู้สึกดี", value: "great" }
    ]
  },
  precision: {
    title: "ความชอบของคุณ",
    subtitle: "กำหนดข้อจำกัดที่ใช้งานจริงก่อน แล้วค่อยเพิ่มข้อมูลเสริมถ้าคุณมี",
    budget: "งบอาหารเสริมต่อเดือน ( THB )",
    budgetOptions: [
      { label: "ต่ำกว่า 1,000", value: "u1000" },
      { label: "1,000-2,500", value: "1000-2500" },
      { label: "2,500-5,000", value: "2500-5000" },
      { label: "5,000+", value: "5000+" }
    ],
    maxPills: "จำนวนเม็ด / แคปซูลสูงสุด ( ต่อวัน )",
    maxPillsOptions: [
      { label: "1-3", value: "1-3" },
      { label: "4-6", value: "4-6" },
      { label: "7-10", value: "7-10" },
      { label: "ไม่จำกัด", value: "nolimit" }
    ],
    form: "รูปแบบที่ชอบ",
    formOptions: [
      { label: "แคปซูล", value: "capsules" },
      { label: "ผง / เชค", value: "powder" },
      { label: "กัมมี่", value: "gummies" },
      { label: "แบบผสมได้", value: "mixed" }
    ],
    optionalBanner: "ระดับความแม่นยำเพิ่มเติม",
    optionalBody: "เพิ่มรายละเอียดที่คุณรู้ เพื่อเติมความแม่นยำ 20% สุดท้าย",
    protein: "โปรตีน ( กรัม / กก. / วัน )",
    proteinOptions: [
      { label: "ต่ำกว่า 1", value: "u1" },
      { label: "1-1.5", value: "1-1.5" },
      { label: "1.5-2", value: "1.5-2" },
      { label: "มากกว่า 2", value: "2+" }
    ],
    family: "ประวัติครอบครัว",
    familyOptions: [
      { label: "โรคหัวใจ", value: "heart" },
      { label: "อัลไซเมอร์", value: "alzheimers" },
      { label: "เบาหวาน", value: "diabetes" },
      { label: "มะเร็ง", value: "cancer" },
      { label: "กระดูกพรุน", value: "osteoporosis" },
      { label: "ไม่มี", value: "none" }
    ],
    tracker: "อุปกรณ์ติดตามสุขภาพ",
    trackerOptions: [
      { label: "ไม่มีอุปกรณ์", value: "none" },
      { label: "Garmin", value: "garmin" },
      { label: "Oura", value: "oura" },
      { label: "WHOOP", value: "whoop" },
      { label: "Apple Watch", value: "apple" },
      { label: "Fitbit", value: "fitbit" },
      { label: "อื่น ๆ", value: "other" }
    ],
    vo2: "VO2 max",
    vo2Estimate: "ตัวช่วยประเมิน VO2",
    vo2EstimateButton: "ใช้ค่าประเมิน",
    vo2EstimateNeeds: "ตอบเพศ อายุ ส่วนสูง น้ำหนัก และกิจกรรม เพื่อประเมิน VO2",
    vo2EstimateReady: (value) => `ประเมินได้ ${value} ml/kg/min จากคำตอบปัจจุบัน`,
    hrv: "ค่า HRV เฉลี่ย",
    labs: "ค่าแล็บล่าสุด",
    labsHint: "กรอกเฉพาะเมื่อมี หน่วยมีความสำคัญ",
    labFields: [
      { label: "วิตามิน D", value: "vitd", units: ["ng/mL", "nmol/L"] },
      { label: "วิตามิน B12", value: "b12", units: ["pg/mL", "pmol/L"] },
      { label: "เฟอร์ริติน", value: "ferritin", units: ["ng/mL", "ug/L"] },
      { label: "HbA1c", value: "hba1c", units: ["%", "mmol/mol"] },
      { label: "ดัชนีโอเมก้า-3", value: "o3", units: ["%"] },
      { label: "โฮโมซิสเทอีน", value: "homo", units: ["umol/L", "mg/L"] }
    ]
  },
  safety: {
    title: "ยาและข้อควรระวัง",
    subtitle: "ข้อมูลนี้ใช้สร้างข้อควรระวังและช่วยระบบตรวจความเหมาะสมแบบกำหนดตายตัว",
    medications: "คุณใช้ยาอยู่หรือไม่?",
    medicationHint: "ใช้เพื่อสร้างข้อควรระวังเท่านั้น",
    medicationOptions: [
      { label: "ไม่ใช้", value: "none" },
      { label: "ใช่", value: "yes" }
    ],
    medicationType: "ประเภทยา",
    medicationTypeOptions: [
      { label: "ยากลุ่มสแตติน", value: "statin" },
      { label: "เมตฟอร์มิน", value: "metformin" },
      { label: "ยา PPI / โอเมพราโซล", value: "ppi" },
      { label: "ยาขับปัสสาวะ", value: "diuretic" },
      { label: "ยาคุมกำเนิด", value: "contraceptive" },
      { label: "ยาต้านซึมเศร้า", value: "antidepressant" },
      { label: "ยาละลายลิ่มเลือด / แอสไพริน", value: "bloodthinner" },
      { label: "ยาไทรอยด์", value: "thyroid" },
      { label: "ยาความดัน", value: "bp" },
      { label: "คอร์ติโคสเตียรอยด์", value: "corticosteroid" },
      { label: "อื่น ๆ", value: "other" }
    ],
    otherMedPlaceholder: "โปรดระบุยาและใช้เพื่ออะไร",
    suppAllergies: "แพ้หรือไม่ทนต่อส่วนผสมอาหารเสริม",
    suppAllergyOptions: [
      { label: "ไม่ทราบว่ามี", value: "none" },
      { label: "ไอโอดีน", value: "iodine" },
      { label: "ธาตุเหล็ก", value: "iron" },
      { label: "CoQ10", value: "coq10" },
      { label: "วิตามินบี", value: "bvit" },
      { label: "มาจากถั่วเหลือง", value: "soyderived" },
      { label: "มาจากหอย / อาหารทะเลเปลือกแข็ง", value: "shellfishderived" },
      { label: "อื่น ๆ", value: "other" }
    ],
    kidney: "การทำงานของไต",
    kidneyOptions: [
      { label: "ไม่มีปัญหาที่ทราบ", value: "normal" },
      { label: "การทำงานลดลง", value: "reduced" },
      { label: "โรคไต", value: "disease" }
    ],
    liver: "ภาวะตับ",
    liverOptions: [
      { label: "ไม่มีปัญหาที่ทราบ", value: "normal" },
      { label: "มีภาวะเกี่ยวกับตับ", value: "condition" }
    ],
    surgery: "มีผ่าตัดใน 30 วันข้างหน้าหรือไม่?",
    surgeryOptions: [
      { label: "ไม่มี", value: "no" },
      { label: "มี", value: "yes" }
    ],
    antibiotics: "ใช้ยาปฏิชีวนะใน 3 เดือนที่ผ่านมาไหม?",
    antibioticsOptions: [
      { label: "ไม่", value: "no" },
      { label: "ใช่", value: "yes" }
    ],
    supplements: "อาหารเสริมที่ใช้อยู่ตอนนี้",
    supplementsOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "มัลติวิตามินพื้นฐาน", value: "basic" },
      { label: "วิตามิน D3 / โอเมก้า-3", value: "d3omega" },
      { label: "หลายตัวแบบเจาะจง", value: "targeted" }
    ]
  },
  sectionNotes: [
    "ไม่มีคำตอบที่ถูกหรือผิด มีเพียงคำตอบที่ตรงกับความจริง บริบทที่ซื่อตรงช่วยให้สูตรพอดีกับคุณมากขึ้น และปลอดภัยขึ้นเมื่อใช้ร่วมกับสิ่งที่คุณรับประทานอยู่แล้ว",
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

const gaugeLabelsByLocale = {
  en: ["Basic", "Essentials", "Precision"],
  th: ["พื้นฐาน", "ข้อมูลหลัก", "ความแม่นยำ"]
} satisfies Record<Locale, readonly [string, string, string]>;

const assessmentUiCopy = {
  en: {
    back: "Back",
    continue: "Continue",
    countryHint: "Used for local context and product availability.",
    devDefaults: "Dev defaults",
    formulaPrecision: "Formula precision",
    heightWeight: "Height and weight",
    infoLabel: "Note",
    nameGreeting: (name: string) => `Nice to meet you, ${name}.`,
    precisionHint: (progress: number, remaining: number) =>
      remaining > 0
        ? `${progress}% complete. ${remaining} essential signal${remaining === 1 ? "" : "s"} left before the precision layer.`
        : `${progress}% complete. Essentials are ready; optional precision data can refine the formula further.`,
    precisionMarks: ["Start", "Essentials -> 80%", "Precision -> 100%"],
    stagesAria: "Assessment stages",
    processingError: "We could not start processing. Please try again.",
    scoreProcessingSubtitle: "We are scoring your main wellness domains from your answers.",
    scoreProcessingTitle: "Preparing your HealthScore",
    scoreGate: {
      planDescription: "This is the deterministic HealthScore calculated from your answers.",
      title: "Your HealthScore is ready"
    },
    retry: "Try again",
    section: (current: number, total: number) => `Step ${current} / ${total}`,
    selectCountry: "Select country",
    sunHint: "Helps tune vitamin D and sun exposure context.",
    vo2Placeholder: "e.g. 45 ml/kg/min"
  },
  th: {
    back: "ย้อนกลับ",
    continue: "ต่อไป",
    countryHint: "ใช้เพื่อปรับบริบทพื้นที่และสินค้าที่พร้อมใช้งาน",
    devDefaults: "ค่าเริ่มต้นสำหรับพัฒนา",
    formulaPrecision: "ความแม่นยำของสูตร",
    heightWeight: "ส่วนสูงและน้ำหนัก",
    infoLabel: "หมายเหตุ",
    nameGreeting: (name: string) => `ยินดีที่ได้รู้จัก ${name}`,
    precisionHint: (progress: number, remaining: number) =>
      remaining > 0
        ? `เสร็จแล้ว ${progress}% ยังเหลือข้อมูลหลัก ${remaining} ข้อก่อนเข้าสู่ชั้นความแม่นยำ`
        : `เสร็จแล้ว ${progress}% ข้อมูลหลักพร้อมแล้ว ข้อมูลเสริมช่วยปรับสูตรให้ละเอียดขึ้น`,
    precisionMarks: ["เริ่มต้น", "ข้อมูลหลัก -> 80%", "ความแม่นยำ -> 100%"],
    stagesAria: "ขั้นตอนแบบประเมิน",
    processingError: "ไม่สามารถเริ่มการประมวลผลได้ โปรดลองอีกครั้ง",
    scoreProcessingSubtitle: "เรากำลังประเมินภาพรวมสุขภาพจากคำตอบของคุณ",
    scoreProcessingTitle: "กำลังเตรียมคะแนนสุขภาพของคุณ",
    scoreGate: {
      planDescription: "นี่คือคะแนนสุขภาพจากคำตอบของคุณ",
      title: "คะแนนสุขภาพของคุณพร้อมแล้ว"
    },
    retry: "ลองอีกครั้ง",
    section: (current: number, total: number) => `ขั้นตอน ${current} / ${total}`,
    selectCountry: "เลือกประเทศ",
    sunHint: "ช่วยปรับบริบทวิตามินดีและการได้รับแดด",
    vo2Placeholder: "เช่น 45 ml/kg/min"
  }
} satisfies Record<Locale, {
  back: string;
  continue: string;
  countryHint: string;
  devDefaults: string;
  formulaPrecision: string;
  heightWeight: string;
  infoLabel: string;
  nameGreeting: (name: string) => string;
  precisionHint: (progress: number, remaining: number) => string;
  precisionMarks: readonly [string, string, string];
  processingError: string;
  scoreProcessingSubtitle: string;
  scoreProcessingTitle: string;
  scoreGate: {
    planDescription: string;
    title: string;
  };
  retry: string;
  section: (current: number, total: number) => string;
  selectCountry: string;
  stagesAria: string;
  sunHint: string;
  vo2Placeholder: string;
}>;

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
  initialStage?: "healthscore" | "quiz";
  locale: Locale;
  paymentId?: string;
  prefillAnswers?: unknown;
  returningHealthScore?: HealthScoreResult | null;
  returningPlanId?: string;
}>;

type AssessmentQuestion = Readonly<{
  content: React.ReactNode;
  hint?: string;
  id: string;
  isAnswered: boolean;
  label: string;
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

const ASSESSMENT_REQUEST_TIMEOUT_MS = 30_000;

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
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
      { id: "results", state: "complete" }
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

function PrecisionGauge({
  ariaLabel,
  labels,
  progress
}: Readonly<{
  ariaLabel: string;
  labels: readonly [string, string, string];
  progress: number;
}>) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex justify-end">
        <span className="text-xs font-semibold tabular-nums text-[var(--mn-teal)]">
          {progress}%
        </span>
      </div>
      <progress
        aria-label={ariaLabel}
        className="mn-progress mn-progress--thin"
        max={100}
        value={progress}
      />
      <div className="mt-2 grid grid-cols-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span>{labels[0]}</span>
        <span className="text-center">{labels[1]}</span>
        <span className="text-right">{labels[2]}</span>
      </div>
    </div>
  );
}

type AssessmentUiLabels = (typeof assessmentUiCopy)[Locale];

function QuestionnairePrecisionMeter({
  precision,
  ui
}: Readonly<{
  precision: ReturnType<typeof precisionProgress>;
  ui: AssessmentUiLabels;
}>) {
  return (
    <aside className="mn-questionnaire-meter" aria-label={ui.formulaPrecision}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mn-questionnaire-meter__label">{ui.formulaPrecision}</p>
          <p className="mn-questionnaire-meter__hint">
            {ui.precisionHint(precision.progress, precision.essentialRemaining)}
          </p>
        </div>
        <p className="mn-questionnaire-meter__value">
          {precision.progress}
          <span>%</span>
        </p>
      </div>
      <progress
        aria-label={ui.formulaPrecision}
        className="mn-progress mn-progress--soft mt-4"
        max={100}
        value={precision.progress}
      />
      <div className="mn-questionnaire-meter__marks">
        <span>{ui.precisionMarks[0]}</span>
        <span>{ui.precisionMarks[1]}</span>
        <span>{ui.precisionMarks[2]}</span>
      </div>
    </aside>
  );
}

function AssessmentIntroNote({
  body,
  firstName,
  greeting
}: Readonly<{
  body: string;
  firstName: string | null;
  greeting: string;
}>) {
  return (
    <div className="mn-assessment-honesty">
      <div aria-hidden={true} className="mn-assessment-honesty__mark">&quot;</div>
      <div className="min-w-0">
        {firstName ? (
          <p className="mn-assessment-honesty__greeting">{greeting}</p>
        ) : null}
        <p>{body}</p>
      </div>
    </div>
  );
}

function AssessmentTrustStrip({
  items
}: Readonly<{
  items: Copy["about"]["trustItems"];
}>) {
  return (
    <div className="mn-assessment-trust-strip">
      {items.map((item) => (
        <div key={item.title} className="mn-assessment-trust-item">
          <ShieldCheckIcon aria-hidden={true} className="size-5 shrink-0" />
          <div className="min-w-0">
            <p className="mn-assessment-trust-item__title">{item.title}</p>
            <p className="mn-assessment-trust-item__body">{item.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function numericAnswer(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function ageEstimate(value: string) {
  const direct = numericAnswer(value);

  if (direct !== null) {
    return direct;
  }

  return {
    "18-25": 22,
    "26-35": 31,
    "36-45": 41,
    "46-55": 51,
    "56-65": 61,
    "66+": 66
  }[value] ?? null;
}

function estimateVo2Max(answers: Answers) {
  const age = ageEstimate(answers.age);
  const heightCm = numericAnswer(answers.heightCm);
  const weightKg = numericAnswer(answers.weightKg);
  const sexFactor = answers.sex === "male" ? 1 : answers.sex === "female" ? 0 : null;
  const activityRating = {
    active: 6,
    athlete: 7,
    light: 2,
    moderate: 4,
    sedentary: 0,
    sitting: 0
  }[answers.activity];

  if (
    age === null ||
    heightCm === null ||
    weightKg === null ||
    sexFactor === null ||
    activityRating === undefined ||
    heightCm <= 0 ||
    weightKg <= 0
  ) {
    return null;
  }

  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const estimate =
    56.363 +
    1.921 * activityRating -
    0.381 * age -
    0.754 * bmi +
    10.987 * sexFactor;

  return Math.min(70, Math.max(18, Math.round(estimate)));
}

function AssessmentStepper({
  ariaLabel,
  currentIndex,
  onSelect,
  phases,
  sections,
  stages
}: Readonly<{
  ariaLabel: string;
  currentIndex: number;
  onSelect: (index: number) => void;
  phases: readonly string[];
  sections: readonly AssessmentSection[];
  stages: readonly string[];
}>) {
  return (
    <nav aria-label={ariaLabel}>
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
                  "flex h-full w-full flex-col gap-1 rounded-[0.85rem] border px-3 py-3 text-left shadow-sm transition",
                  active
                    ? "border-[var(--mn-teal)] bg-[linear-gradient(180deg,#fff,var(--mn-mint))] text-[var(--mn-ink)] shadow-[0_14px_34px_-26px_rgba(45,143,114,0.6)]"
                    : done
                      ? "border-[var(--mn-teal-deep)] bg-[var(--mn-mint)] text-[var(--mn-ink)] hover:border-[var(--mn-teal)]"
                      : "border-[var(--mn-line)] bg-[var(--mn-paper)] hover:border-[color-mix(in_srgb,var(--mn-gold)_45%,transparent)]"
                )}
                onClick={() => onSelect(index)}
              >
                <span
                  className={cx(
                    "flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]",
                    active || done ? "text-[var(--mn-teal-deep)]" : "text-muted-foreground"
                  )}
                >
                  <span
                    className={cx(
                      "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                      active
                        ? "bg-[var(--mn-teal)] text-white"
                        : done
                          ? "bg-[var(--mn-teal-deep)] text-white"
                          : "bg-[var(--mn-cream-deep)] text-muted-foreground"
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
                    active || done ? "text-[var(--mn-ink)]" : "text-muted-foreground"
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
  initialStage = "quiz",
  locale,
  paymentId,
  prefillAnswers,
  returningHealthScore,
  returningPlanId
}: AssessmentFlowProps) {
  const copy = copies[locale];
  const router = useRouter();
  const showDevShortcut =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_SHOW_DEV_SHORTCUT === "true";
  const returningScoreStatus = returningPlanId && returningHealthScore
    ? buildReturningScoreGateStatus(returningPlanId, returningHealthScore)
    : null;
  const [answers, setAnswers] = useState<Answers>(() => buildInitialAnswers(prefillAnswers));
  const [sectionIndex, setSectionIndex] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [processingError, setProcessingError] = useState("");
  const [capturedStatus, setCapturedStatus] = useState<ProcessingStatus | null>(returningScoreStatus);
  const [showHealthScore, setShowHealthScore] = useState(Boolean(returningScoreStatus || initialStage === "healthscore"));
  const [healthScore, setHealthScore] = useState<HealthScoreResult | null>(returningHealthScore ?? null);
  const captureInFlight = useRef<Promise<ProcessingStatus | null> | null>(null);
  const assessmentStartedTracked = useRef(false);
  const healthScoreViewedTracked = useRef(false);
  const precision = precisionProgress(answers);
  const displayFirstName = normalizeAssessmentFirstName(answers.firstName);
  const vo2Estimate = estimateVo2Max(answers);
  const gaugeLabels = gaugeLabelsByLocale[locale];

  function clearProcessingStatus() {
    setProcessingStatus(null);
  }

  useEffect(() => {
    if (assessmentStartedTracked.current || precision.essentialDone <= 0) return;

    assessmentStartedTracked.current = true;
    trackBpmEvent("assessment_started", {
      eventType: "funnel",
      locale,
      properties: {
        completedRequired: precision.essentialDone,
        returningPlanId: returningPlanId || undefined
      }
    });
  }, [locale, precision.essentialDone, returningPlanId]);

  useEffect(() => {
    if (!showHealthScore || healthScoreViewedTracked.current) return;

    healthScoreViewedTracked.current = true;
    trackBpmEvent("healthscore_viewed", {
      eventType: "funnel",
      locale,
      planId: capturedStatus?.planId,
      properties: {
        returningPlanId: returningPlanId || undefined
      },
      ...healthScoreBpmFields(healthScore)
    });
  }, [capturedStatus?.planId, healthScore, locale, returningPlanId, showHealthScore]);

  const ui = assessmentUiCopy[locale];

  function setSingle(key: keyof Answers, value: string) {
    const nextValue = key === "firstName" ? clampFirstNameInput(value) : value;

    setAnswers((current) => ({
      ...current,
      [key]: nextValue,
      ...(key === "sex" && nextValue !== "female" ? { flow: "", menopause: "", reproStatus: "" } : {}),
      ...(key === "reproStatus" && (nextValue === "pregnant" || nextValue === "breastfeeding") ? { flow: "" } : {}),
      ...(key === "meds" && nextValue !== "yes" ? { medTypes: [], otherMed: "" } : {}),
      ...(key === "tracker" && nextValue !== "other" ? { otherTracker: "" } : {})
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

  const rawSections: Array<Omit<AssessmentSection, "complete">> = [
    {
      description: copy.about.subtitle,
      id: "about",
      questions: [
        {
          content: (
            <label className="block">
              <span className="mn-question__heading">
                <span className="mn-question__label">{copy.about.firstName}</span>
                <span className="mn-optional-badge">{copy.about.firstNameOptional}</span>
              </span>
              <span className="mn-question__hint">{copy.about.firstNameHint}</span>
              <input
                autoComplete="given-name"
                className="mn-text-input"
                maxLength={ASSESSMENT_FIRST_NAME_MAX_LENGTH}
                placeholder={copy.about.firstName}
                type="text"
                value={answers.firstName}
                onChange={(event) => setSingle("firstName", event.target.value)}
              />
            </label>
          ),
          id: "firstName",
          isAnswered: normalizeAssessmentFirstName(answers.firstName) !== null,
          label: ""
        },
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
                <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mn-ink)]">
                  <span>{copy.about.height}</span>
                  <span className="rounded-md bg-[color-mix(in_srgb,var(--mn-gold)_10%,transparent)] px-2 py-1 text-[var(--mn-gold)]">
                    {answers.heightCm || "170"} cm
                  </span>
                </span>
                <input
                  type="range"
                  min={120}
                  max={220}
                  step={1}
                  value={answers.heightCm || "170"}
                  className="mt-3 block w-full accent-[var(--mn-teal)]"
                  onChange={(event) => setSingle("heightCm", event.target.value)}
                />
                <span className="mt-2 flex justify-end">
                  <span className="rounded-md bg-[color-mix(in_srgb,var(--mn-gold)_10%,transparent)] px-2 py-1 text-xs font-semibold text-[var(--mn-gold)]">
                    {formatHeightImperial(answers.heightCm || "170")}
                  </span>
                </span>
              </label>
              <label className="block">
                <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mn-ink)]">
                  <span>{copy.about.weight}</span>
                  <span className="rounded-md bg-[color-mix(in_srgb,var(--mn-gold)_10%,transparent)] px-2 py-1 text-[var(--mn-gold)]">
                    {answers.weightKg || "70"} kg
                  </span>
                </span>
                <input
                  type="range"
                  min={35}
                  max={180}
                  step={1}
                  value={answers.weightKg || "70"}
                  className="mt-3 block w-full accent-[var(--mn-teal)]"
                  onChange={(event) => setSingle("weightKg", event.target.value)}
                />
                <span className="mt-2 flex justify-end">
                  <span className="rounded-md bg-[color-mix(in_srgb,var(--mn-gold)_10%,transparent)] px-2 py-1 text-xs font-semibold text-[var(--mn-gold)]">
                    {formatWeightImperial(answers.weightKg || "70")}
                  </span>
                </span>
              </label>
            </div>
          ),
          id: "body-size",
          isAnswered: hasText(answers.heightCm) && hasText(answers.weightKg),
          label: ui.heightWeight
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
              <div>
                <p className="text-sm font-semibold text-[var(--mn-ink)]">
                  {copy.about.sunscreen}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {ui.sunHint}
                </p>
                <div className="mt-3">
                  <PillGroup
                    options={copy.about.sunscreenOptions}
                    selected={answers.sunscreen}
                    onSelect={(value) => setSingle("sunscreen", value)}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--mn-ink)]">
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
          id: "sunscreen-sun",
          isAnswered: hasText(answers.sunscreen) && hasText(answers.sun),
          label: ""
        },
        {
          content: (
            <label className="block">
              <span className="text-sm font-semibold text-[var(--mn-ink)]">
                {copy.about.country}
              </span>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {ui.countryHint}
              </p>
              <select
                value={answers.country}
                className="mn-text-input mt-3 px-4 py-3 font-semibold"
                onChange={(event) => setSingle("country", event.target.value)}
              >
                <option value="">{ui.selectCountry}</option>
                {copy.about.countryOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ),
          id: "country",
          isAnswered: hasText(answers.country),
          label: ""
        },
        ...(answers.sex === "female"
          ? [
              {
                content: (
                  <div className="space-y-5 rounded-lg border border-[color-mix(in_srgb,var(--mn-teal)_15%,transparent)] bg-[color-mix(in_srgb,var(--mn-teal)_5%,transparent)] p-4">
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
      description: copy.food.subtitle,
      id: "food",
      questions: [
        {
          content: <PillGroup options={copy.food.dietOptions} selected={answers.diet} onSelect={(value) => setSingle("diet", value)} />,
          id: "diet",
          isAnswered: hasText(answers.diet),
          label: copy.food.diet
        },
        ...foodFrequencyKeys.map((key) => ({
          content: (
            <PillGroup
              options={copy.food.frequencyOptions[key]}
              selected={answers.foodFrequency[key]}
              onSelect={(value) => updateFoodFrequency(key, value)}
            />
          ),
          id: `food-${key}`,
          isAnswered: hasText(answers.foodFrequency[key]),
          label: copy.food.frequencyTitles[key]
        })),
        {
          content: (
            <PillGroup multi={true} options={copy.food.allergyOptions} selected={answers.allergies} onToggle={(value) => toggleMulti("allergies", value)} />
          ),
          id: "allergies",
          isAnswered: hasAny(answers.allergies),
          label: copy.food.allergies,
          why: copy.coach.allergies
        },
        {
          content: (
            <label className="mn-disclosure-card">
              <input
                checked={answers.disclosure}
                className="mt-1 size-4 rounded border-foreground/20 text-[var(--mn-teal)] focus:ring-[var(--mn-teal)]"
                type="checkbox"
                onChange={(event) => setAnswers((current) => ({ ...current, disclosure: event.target.checked }))}
              />
              <span>
                <span className="block font-medium text-[var(--mn-ink)]">{copy.food.disclosureTitle}</span>
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
      description: copy.safety.subtitle,
      id: "safety",
      questions: [
        {
          content: (
            <div className="space-y-4">
              <PillGroup options={copy.safety.medicationOptions} selected={answers.meds} onSelect={(value) => setSingle("meds", value)} />
              {answers.meds === "yes" ? (
                <div className="rounded-lg border border-[color-mix(in_srgb,var(--mn-teal)_15%,transparent)] bg-[color-mix(in_srgb,var(--mn-teal)_5%,transparent)] p-4">
                  <p className="mb-3 text-sm font-semibold text-[var(--mn-ink)]">{copy.safety.medicationType}</p>
                  <PillGroup multi={true} options={copy.safety.medicationTypeOptions} selected={answers.medTypes} onToggle={(value) => toggleMulti("medTypes", value)} />
                  {selectedOther(answers.medTypes) ? (
                    <input
                      className="mn-text-input"
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
          content: <PillGroup multi={true} options={copy.safety.suppAllergyOptions} selected={answers.suppAllergies} onToggle={(value) => toggleMulti("suppAllergies", value)} />,
          id: "suppAllergies",
          isAnswered: hasAny(answers.suppAllergies),
          label: copy.safety.suppAllergies
        }
      ],
      title: copy.safety.title
    },
    {
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
            <div className="space-y-5 rounded-lg border border-[color-mix(in_srgb,var(--mn-gold)_15%,transparent)] bg-[color-mix(in_srgb,var(--mn-gold)_5%,transparent)] p-4">
              <div>
                <p className="text-sm font-semibold text-[var(--mn-ink)]">{copy.precision.optionalBanner}</p>
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
                  <input className="mn-text-input" value={answers.otherTracker} onChange={(event) => setSingle("otherTracker", event.target.value)} />
                ) : null}
              </Question>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="block">
                  <label className="block">
                    <span className="text-sm font-semibold text-[var(--mn-ink)]">{copy.precision.vo2}</span>
                    <input
                      className="mn-text-input"
                      inputMode="decimal"
                      placeholder={ui.vo2Placeholder}
                      value={answers.vo2}
                      onChange={(event) => setSingle("vo2", event.target.value)}
                    />
                  </label>
                  <div className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--mn-teal)_15%,transparent)] bg-[var(--mn-paper)] p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--mn-ink)]">{copy.precision.vo2Estimate}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {vo2Estimate === null
                            ? copy.precision.vo2EstimateNeeds
                            : copy.precision.vo2EstimateReady(vo2Estimate)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={vo2Estimate === null}
                        className="mn-soft-action-button"
                        onClick={() => {
                          if (vo2Estimate !== null) {
                            setSingle("vo2", String(vo2Estimate));
                          }
                        }}
                      >
                        {copy.precision.vo2EstimateButton}
                      </button>
                    </div>
                  </div>
                </div>
                <label className="block">
                  <span className="text-sm font-semibold text-[var(--mn-ink)]">{copy.precision.hrv}</span>
                  <input className="mn-text-input" inputMode="decimal" value={answers.hrv} onChange={(event) => setSingle("hrv", event.target.value)} />
                </label>
              </div>
              <Question infoLabel={ui.infoLabel} label={copy.precision.labs} hint={copy.precision.labsHint} why={copy.coach.labs}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {copy.precision.labFields.map((field) => (
                    <label key={field.value} className="block rounded-lg border border-foreground/10 bg-[var(--mn-paper)] p-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mn-ink)]">{field.label}</span>
                      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                        <input
                          className="mn-lab-input"
                          inputMode="decimal"
                          value={answers.labs[field.value] ?? ""}
                          onChange={(event) => updateLabValue(field.value, event.target.value)}
                        />
                        <select
                          className="mn-lab-unit"
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
    complete: section.questions.some((question) => question.isAnswered)
  }));


  function fillRandomDefaultsAndFinalStep() {
    setAnswers(buildRandomDevAnswers());
    setProcessingError("");
    setShowHealthScore(false);
    clearProcessingStatus();
    setCapturedStatus(null);
    captureInFlight.current = null;
    setSectionIndex(sections.length - 1);
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  const currentSection = sections[Math.min(sectionIndex, sections.length - 1)];
  const renderedQuestions = currentSection.questions;
  const isFinalStep = sectionIndex === sections.length - 1;
  const disclosureRequiredForAction = ["food", "safety", "precision"].includes(currentSection.id);
  const primaryActionDisabled =
    disclosureRequiredForAction && !answers.disclosure;

  function goBack() {
    setProcessingError("");

    if (sectionIndex > 0) {
      setSectionIndex(sectionIndex - 1);
      return;
    }

    return;
  }

  function goToSection(index: number) {
    setProcessingError("");
    setSectionIndex(Math.min(Math.max(index, 0), sections.length - 1));
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  function goNext() {
    if (primaryActionDisabled) {
      return;
    }

    if (isFinalStep) {
      void prepareHealthScoreGate(answers);
      return;
    }

    setSectionIndex(Math.min(sectionIndex + 1, sections.length - 1));
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  async function prepareHealthScoreGate(answerPayload = answers) {
    setProcessingError("");
    setProcessingStatus({
      planId: "",
      queuePosition: 0,
      status: "preparing",
      steps: [
        { id: "assessment", state: "complete" },
        { id: "score", state: "active" },
        { id: "results", state: "pending" }
      ]
    });
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

      if (!captured?.planId) {
        throw new Error("Unable to capture assessment");
      }

      let readyStatus = captured;

      if (readyStatus.status !== "ready") {
        setProcessingStatus(readyStatus);
        readyStatus = await waitForHealthScoreAnalysis(readyStatus.planId);
      }

      if (!readyStatus.healthScore) {
        throw new Error("Assessment capture did not return a HealthScore");
      }

      setHealthScore(readyStatus.healthScore);
      setCapturedStatus(readyStatus);
      setProcessingStatus(null);
      setShowHealthScore(true);
      router.replace(
        paymentId
          ? nutritionRevealPath(locale, readyStatus.planId)
          : nutritionHealthScorePath(locale, readyStatus.planId)
      );
    } catch {
      clearProcessingStatus();
      setProcessingError(ui.processingError);
    }
  }

  async function waitForHealthScoreAnalysis(planId: string) {
    let latestStatus: ProcessingStatus | null = null;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await fetchWithTimeout(
        `/api/assessment/${encodeURIComponent(planId)}?view=healthscore`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("Unable to load HealthScore analysis status");
      }

      latestStatus = (await response.json()) as ProcessingStatus;
      setProcessingStatus(latestStatus);

      if (latestStatus.status === "ready") {
        return latestStatus;
      }

      if (latestStatus.status === "failed") {
        throw new Error("HealthScore analysis failed");
      }

      await sleep(1500);
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
                  locale,
                  paymentId
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
                locale,
                paymentId
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

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-10 sm:px-8 sm:pb-16 lg:pt-14">
        {processingStatus ? (
          <ProcessingPanel
            error={
              processingStatus.status === "failed"
                ? ui.processingError
                : processingError
            }
            onRetry={() => void prepareHealthScoreGate()}
            retryLabel={ui.retry}
            subtitle={ui.scoreProcessingSubtitle}
            title={ui.scoreProcessingTitle}
          />
	        ) : showHealthScore ? (
	          <HealthScoreOnlyPanel
	            firstName={displayFirstName}
	            healthScore={healthScore}
	            locale={locale}
	            planId={capturedStatus?.planId ?? returningPlanId ?? undefined}
	          />
	        ) : (
	          <div className="space-y-6">
            <QuestionnairePrecisionMeter precision={precision} ui={ui} />
            <div className="py-3">
              <AssessmentStepper
                ariaLabel={ui.stagesAria}
                currentIndex={sectionIndex}
                onSelect={goToSection}
                phases={copy.stagePhases}
                sections={sections}
                stages={copy.stages}
              />
            </div>

            <SectionCard
              description={currentSection.description}
              done={currentSection.complete}
              footer={
                <div className="space-y-4">
                  <PrecisionGauge
                    ariaLabel={ui.formulaPrecision}
                    labels={gaugeLabels}
                    progress={precision.progress}
                  />
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        disabled={sectionIndex === 0}
                        className="mn-secondary-button"
                        onClick={goBack}
                      >
                        {ui.back}
                      </button>
                      {showDevShortcut ? (
                        <button
                          type="button"
                          className="mn-secondary-button mn-secondary-button--compact"
                          onClick={fillRandomDefaultsAndFinalStep}
                        >
                          {ui.devDefaults}
                        </button>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      disabled={primaryActionDisabled}
                      className="mn-assessment-continue-button"
                      onClick={goNext}
                    >
                      {isFinalStep ? copy.fixedAction.generate : ui.continue}
                      {isFinalStep ? (
                        <BeakerIcon aria-hidden={true} className="size-5" />
                      ) : null}
                    </button>
                  </div>
                </div>
              }
              sectionLabel={copy.stagePhases[sectionIndex] ?? ""}
              stepLabel={ui.section(sectionIndex + 1, sections.length)}
              supportingNote={sectionIndex === 0 ? undefined : copy.sectionNotes[sectionIndex]}
              title={currentSection.title}
            >
              <div
                className="space-y-7"
              >
                {sectionIndex === 0 ? (
                  <AssessmentIntroNote
                    body={copy.about.honestyBody}
                    firstName={displayFirstName}
                    greeting={displayFirstName ? ui.nameGreeting(displayFirstName) : ""}
                  />
                ) : null}
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
                {sectionIndex === 0 ? (
                  <AssessmentTrustStrip items={copy.about.trustItems} />
                ) : null}
              </div>
            </SectionCard>

            {processingError ? (
              <p className="text-sm font-medium text-red-600">
                {processingError}
              </p>
            ) : null}
          </div>
        )}
    </main>
  );
}

function HealthScoreOnlyPanel({
  firstName,
  healthScore,
  locale,
  planId
}: Readonly<{
  firstName?: string | null;
  healthScore: HealthScoreResult | null;
  locale: Locale;
  planId?: string;
}>) {
  if (!healthScore) return null;

  return (
    <HealthScorePaymentPanel
      firstName={firstName ?? undefined}
      locale={locale}
      planId={planId}
      result={healthScore}
    />
  );
}
