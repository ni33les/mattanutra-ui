"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  BeakerIcon,
  CheckIcon,
  CheckCircleIcon,
  ClockIcon,
  ShieldCheckIcon,
  SparklesIcon
} from "@heroicons/react/20/solid";
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
    optional: string;
    required: string;
  };
  conditions: {
    options: Option[];
    prompt: string;
    title: string;
  };
  emailModal: {
    button: string;
    emailPlaceholder: string;
    privacy: string;
    previewTitle: string;
    title: string;
    subtitle: string;
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
  hook: {
    detail: string;
    title: string;
    toggle: string;
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
  thankYou: {
    steps: Array<Readonly<{ body: string; title: string }>>;
    title: string;
    body: string;
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
    optional: "Optional",
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
  emailModal: {
    title: "Almost there",
    subtitle: "Your assessment is ready. Where should we send the summary?",
    previewTitle: "Assessment preview",
    emailPlaceholder: "your@email.com",
    button: "Send my assessment",
    privacy: "We never share your data. Unsubscribe anytime."
  },
  fixedAction: {
    complete: "All essentials answered - ready to generate.",
    generate: "Continue",
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
  hook: {
    title: "Stay on track with free monthly updates",
    detail:
      "Your body and routine change over time. Opt in for a quick monthly check-in to keep your formulation tuned as you progress.",
    toggle: "Send me monthly formulation updates"
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
    title: "Precision boost",
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
  },
  thankYou: {
    title: "Your assessment is ready",
    body:
      "Next, we’ll turn your answers into a wellness-focused formulation brief and prepare matched supplement options.",
    steps: [
      {
        title: "Formulation brief",
        body: "A clear summary of your goals, constraints, and supplement preferences."
      },
      {
        title: "Matched products",
        body: "We’ll use the brief to find the closest matching products."
      },
      {
        title: "Monthly tuning",
        body: "Optional check-ins can help keep your formulation aligned over time."
      }
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
    optional: "ไม่บังคับ",
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
  emailModal: {
    title: "อีกนิดเดียว",
    subtitle: "แบบประเมินของคุณพร้อมแล้ว ต้องการให้ส่งสรุปไปที่ไหน?",
    previewTitle: "ตัวอย่างสรุปแบบประเมิน",
    emailPlaceholder: "your@email.com",
    button: "ส่งแบบประเมินของฉัน",
    privacy: "เราไม่แบ่งปันข้อมูลของคุณ และยกเลิกได้ทุกเมื่อ"
  },
  fixedAction: {
    complete: "ตอบคำถามสำคัญครบแล้ว พร้อมสร้างบรีฟ",
    generate: "ดำเนินการต่อ",
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
  hook: {
    title: "ติดตามความคืบหน้าด้วยอัปเดตรายเดือนฟรี",
    detail:
      "ร่างกายและกิจวัตรของคุณเปลี่ยนได้เสมอ เลือกรับเช็คอินรายเดือนสั้นๆ เพื่อให้สูตรยังสอดคล้องกับคุณ",
    toggle: "ส่งอัปเดตสูตรรายเดือนให้ฉัน"
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
    title: "เพิ่มความแม่นยำ",
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
  },
  thankYou: {
    title: "แบบประเมินของคุณพร้อมแล้ว",
    body:
      "ต่อไปเราจะเปลี่ยนคำตอบของคุณเป็นบรีฟสูตรอาหารเสริมเพื่อสุขภาพ และเตรียมตัวเลือกผลิตภัณฑ์ที่เหมาะสม",
    steps: [
      {
        title: "บรีฟสูตรอาหารเสริม",
        body: "สรุปเป้าหมาย ข้อจำกัด และความต้องการของคุณอย่างชัดเจน"
      },
      {
        title: "ผลิตภัณฑ์ที่ตรงกัน",
        body: "เราจะใช้บรีฟเพื่อค้นหาผลิตภัณฑ์ที่ใกล้เคียงที่สุด"
      },
      {
        title: "ปรับแต่งรายเดือน",
        body: "เช็คอินเสริมช่วยให้สูตรสอดคล้องกับคุณเมื่อเวลาผ่านไป"
      }
    ]
  }
};

const copies: Record<Locale, Copy> = { en, th };
const heroBadgeIcons = [BeakerIcon, ShieldCheckIcon, SparklesIcon];
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

function getOptionLabel(options: readonly Option[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function buildPreviewTags(copy: Copy, answers: Answers) {
  const tags: string[] = [];
  const add = (label: string, value: string | undefined) => {
    if (value) {
      tags.push(`${label}: ${value}`);
    }
  };
  const addOptions = (
    label: string,
    options: readonly Option[],
    values: readonly string[]
  ) => {
    values.forEach((value) => add(label, getOptionLabel(options, value)));
  };
  const heightImperial = formatHeightImperial(answers.heightCm);
  const weightImperial = formatWeightImperial(answers.weightKg);

  add(copy.about.name, answers.name.trim());
  add(copy.about.sex, answers.sex ? getOptionLabel(copy.about.sexOptions, answers.sex) : "");
  add(copy.about.age, answers.age ? getOptionLabel(copy.about.ageOptions, answers.age) : "");
  add(
    copy.about.height,
    answers.heightCm
      ? `${answers.heightCm} cm${heightImperial ? ` / ${heightImperial}` : ""}`
      : ""
  );
  add(
    copy.about.weight,
    answers.weightKg
      ? `${answers.weightKg} kg${weightImperial ? ` / ${weightImperial}` : ""}`
      : ""
  );
  add(copy.about.skin, answers.skin ? getOptionLabel(copy.about.skinOptions, answers.skin) : "");
  add(copy.about.country, answers.country ? getOptionLabel(copy.about.countryOptions, answers.country) : "");
  add(copy.lifestyle.sun, answers.sun ? getOptionLabel(copy.lifestyle.sunOptions, answers.sun) : "");
  add(copy.about.activity, answers.activity ? getOptionLabel(copy.about.activityOptions, answers.activity) : "");
  addOptions(copy.goals.title, copy.goals.options, answers.goals);

  if (answers.feelGreat) {
    add(copy.symptoms.title, copy.symptoms.great.label);
  } else {
    addOptions(copy.symptoms.title, copy.symptoms.options, answers.symptoms);
  }

  add(copy.sleepBasics.average, answers.sleepHours ? getOptionLabel(copy.sleepBasics.options, answers.sleepHours) : "");
  add(copy.lifestyle.diet, answers.diet ? getOptionLabel(copy.lifestyle.dietOptions, answers.diet) : "");
  add(copy.lifestyle.fish, answers.fish ? getOptionLabel(copy.lifestyle.fishOptions, answers.fish) : "");
  add(copy.lifestyle.smoke, answers.smoke ? getOptionLabel(copy.lifestyle.smokeOptions, answers.smoke) : "");
  add(copy.lifestyle.alcohol, answers.alcohol ? getOptionLabel(copy.lifestyle.alcoholOptions, answers.alcohol) : "");
  add(copy.lifestyle.meds, answers.meds ? getOptionLabel(copy.lifestyle.medsOptions, answers.meds) : "");
  addOptions(copy.lifestyle.medType, copy.lifestyle.medTypeOptions, answers.medTypes);
  add(copy.preferences.budget, answers.budget ? getOptionLabel(copy.preferences.budgetOptions, answers.budget) : "");
  add(copy.preferences.pills, answers.pills ? getOptionLabel(copy.preferences.pillsOptions, answers.pills) : "");
  add(copy.symptoms.energy, answers.energy ? getOptionLabel(copy.symptoms.energyOptions, answers.energy) : "");
  add(copy.lifestyle.coffee, answers.coffee ? getOptionLabel(copy.lifestyle.coffeeOptions, answers.coffee) : "");
  add(copy.lifestyle.supps, answers.supps ? getOptionLabel(copy.lifestyle.suppsOptions, answers.supps) : "");
  add(copy.preferences.form, answers.form ? getOptionLabel(copy.preferences.formOptions, answers.form) : "");
  add(copy.lifestyle.lifestage, answers.lifestage ? getOptionLabel(copy.lifestyle.lifestageOptions, answers.lifestage) : "");
  addOptions(copy.conditions.title, copy.conditions.options, answers.conditions);
  addOptions(copy.precision.family, copy.precision.familyOptions, answers.family);

  Object.entries(answers.labs).forEach(([key, value]) => {
    const field = copy.precision.labFields.find((item) => item.value === key);
    add(field?.label ?? key, value ? `${value}${field?.hint ? ` ${field.hint}` : ""}` : "");
  });

  return tags;
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
  locale: Locale;
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

type ProcessingStepState = "active" | "complete" | "pending";

type ProcessingStatus = Readonly<{
  jobId: string;
  queuePosition: number;
  status: "preparing" | "queued" | "ready";
  steps: Array<
    Readonly<{
      id: "sent" | "preparing" | "ready";
      state: ProcessingStepState;
    }>
  >;
}>;

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
      back: "กลับไปที่บรีฟ",
      badge: "แนะนำ",
      eyebrow: "เลือกแผนบรีฟ",
      subtitle:
        "ตอนนี้ทุกแผนจะพาไปยังคิวสร้างสูตรเดียวกัน เพื่อให้เราทดสอบขั้นตอนการชำระเงินได้ก่อน",
      title: "เลือกความละเอียดของคำแนะนำ",
      tiers: [
        {
          cta: "ไปต่อ",
          description:
            "บรีฟสูตรแบบกระชับจากคำถามพื้นฐาน เหมาะสำหรับเริ่มเห็นภาพรวมทันที",
          features: [
            "ลำดับความสำคัญหลักจากคำตอบของคุณ",
            "หมวดอาหารเสริมพื้นฐาน",
            "หมายเหตุความปลอดภัยทั่วไป",
            "ตัวอย่างผลลัพธ์เบื้องต้น"
          ],
          id: "free-basic",
          name: "แผนพื้นฐาน",
          price: "฿0",
          priceSuffix: "",
          tierBadge: "ฟรี"
        },
        {
          cta: "ไปต่อ",
          description:
            "บรีฟสูตรเต็ม พร้อมปรับขนาดและตัวเลือกผลิตภัณฑ์ให้เหมาะกับข้อมูลของคุณมากขึ้น",
          featured: true,
          features: [
            "ทุกอย่างในแผนพื้นฐานฟรี",
            "ช่วงปริมาณที่ปรับตามร่างกาย",
            "รวมข้อมูลยา แล็บ และข้อควรระวัง",
            "ตัวเลือกผลิตภัณฑ์และทางเลือกทดแทน",
            "พร้อมเช็คอินซ้ำใน 60 วัน"
          ],
          id: "optimal-precision",
          name: "ความแม่นยำสูง",
          price: "฿399",
          priceSuffix: "ครั้งเดียว"
        },
        {
          cta: "ไปต่อ",
          description:
            "การดูแลต่อเนื่องพร้อม AI เอเจนต์ที่ช่วยปรับคำแนะนำให้เข้ากับความต้องการรายวัน",
          features: [
            "ทุกอย่างในแผนความแม่นยำสูง",
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
    back: "Back to brief",
    badge: "Recommended",
    eyebrow: "Choose your brief",
    subtitle:
      "For now, every plan continues to the same mocked formulation queue while we test the purchase step.",
    title: "Select the level of guidance",
    tiers: [
      {
        cta: "Go",
        description:
          "A concise formulation brief from the basic questions, useful for a quick starting point.",
        features: [
          "Core priorities from your answers",
          "Basic supplement categories",
          "General safety notes",
          "Preview of your results"
        ],
        id: "free-basic",
        name: "Basic Plan",
        price: "฿0",
        priceSuffix: "",
        tierBadge: "Free"
      },
      {
        cta: "Go",
        description:
          "The full formulation brief with more precise dosing logic and practical product matching.",
        featured: true,
        features: [
          "Everything in Free Basic",
          "Body-size adjusted dose ranges",
          "Medication and lab flags included",
          "Recommended products and alternatives",
          "60-day reassessment prompt"
        ],
        id: "optimal-precision",
        name: "Optimal Precision",
        price: "฿399",
        priceSuffix: "one time"
      },
      {
        cta: "Go",
        description:
          "Ongoing support with an AI agent that adapts the plan to day-to-day requirements.",
        features: [
          "Everything in Optimal Precision",
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

export function AssessmentFlow({ locale }: AssessmentFlowProps) {
  const copy = copies[locale];
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [processingStatus, setProcessingStatus] =
    useState<ProcessingStatus | null>(null);
  const [processingError, setProcessingError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [showPlans, setShowPlans] = useState(false);
  const isCompact = useCompactAssessment();

  const completed = countRequired(answers);
  const requiredTotal = requiredGroups.length;
  const progress = Math.round((completed / requiredTotal) * 100);
  const canGenerate = completed === requiredTotal;
  const previewTags = buildPreviewTags(copy, answers);
  const progressLabel = canGenerate
    ? copy.progress.complete
    : copy.progress.status(completed, requiredTotal);
  const ui =
    locale === "th"
      ? {
          back: "ย้อนกลับ",
          close: "ปิด",
          continue: "ต่อไป",
          currentStep: "ขั้นตอนปัจจุบัน",
          infoLabel: "ทำไมคำถามนี้สำคัญ",
          notesHint: "เพิ่มได้ถ้ามีรายละเอียดสำคัญ เช่น ความไวต่อส่วนผสม ข้อจำกัด หรือสิ่งที่อยากหลีกเลี่ยง",
          notesLabel: "มีอะไรเพิ่มเติมที่เราควรรู้ไหม?",
          optionalSection: "เพิ่มความแม่นยำ",
          requiredSection: "คำถามพื้นฐาน",
          processingError: "ไม่สามารถเริ่มการประมวลผลได้ โปรดลองอีกครั้ง",
          processingQueue: (count: number) =>
            count > 0
              ? `มี ${count} คนอยู่ในคิวก่อนคุณ`
              : "กำลังจัดเตรียมสูตรของคุณ",
          processingSteps: {
            sent: "ส่งความต้องการเพื่อประมวลผลแล้ว",
            preparing: "กำลังเตรียมสูตรของคุณ",
            ready: "สูตรพร้อมแล้ว"
          },
          processingSubtitle:
            "เราได้รับคำตอบของคุณแล้ว และกำลังจัดคิวเพื่อสร้างสูตรอาหารเสริม",
          processingTitle: "กำลังประมวลผลแบบประเมินของคุณ",
          retry: "ลองอีกครั้ง",
          statusLabels: {
            active: "ตอนนี้",
            complete: "เสร็จแล้ว",
            pending: "รอดำเนินการ"
          },
          reviewDescription:
            "ตรวจสอบสรุปเบื้องต้น แล้วสร้างบรีฟสูตรอาหารเสริมของคุณ",
          reviewQuestion: "ตรวจสอบบรีฟของคุณ",
          reviewSafety:
            "อาหารเสริมเป็นผลิตภัณฑ์เพื่อสุขภาพ ไม่ใช่การวินิจฉัย การรักษา หรือคำแนะนำให้หยุดยา",
          reviewTitle: "ตรวจสอบและสร้างบรีฟ",
          section: (current: number, total: number) =>
            `ส่วนที่ ${current} จาก ${total}`,
          sectionHint: "ตอบคำถามในส่วนนี้เพื่อไปต่อ",
          skipOptional: "ข้ามขั้นตอนเสริม",
          summaryTitle: "สรุปบรีฟของคุณ",
          step: (current: number, total: number) =>
            `คำถามที่ ${current} จาก ${total}`,
          validation: "ตอบคำถามจำเป็นเพื่อไปต่อ"
        }
      : {
          back: "Back",
          close: "Close",
          continue: "Continue",
          currentStep: "Current step",
          infoLabel: "Why this matters",
          notesHint:
            "Add anything useful, such as sensitivities, constraints, products you already use, or ingredients you want to avoid.",
          notesLabel: "Anything else we should know?",
          optionalSection: "Optional precision",
          requiredSection: "Basic questions",
          processingError: "We could not start processing. Please try again.",
          processingQueue: (count: number) =>
            count > 0
              ? `${count} ${count === 1 ? "person is" : "people are"} queued ahead of you`
              : "Your formulation is being prepared",
          processingSteps: {
            sent: "Preferences sent for processing",
            preparing: "Preparing your formulation",
            ready: "Formulation ready"
          },
          processingSubtitle:
            "We have received your preferences and queued them for formulation.",
          processingTitle: "Processing your assessment",
          retry: "Try again",
          statusLabels: {
            active: "Now",
            complete: "Complete",
            pending: "Pending"
          },
          reviewDescription:
            "Review your draft profile, then generate the formulation brief.",
          reviewQuestion: "Review your brief",
          reviewSafety:
            "Supplements are optional wellness products, not diagnosis, treatment, or advice to stop medication.",
          reviewTitle: "Review and generate",
          section: (current: number, total: number) =>
            `Section ${current} of ${total}`,
          sectionHint: "Complete the required questions in this section to continue.",
          skipOptional: "Skip optional",
          summaryTitle: "Your brief overview",
          step: (current: number, total: number) =>
            `Question ${current} of ${total}`,
          validation: "Answer the required questions to continue"
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
    },
    {
      description: ui.reviewDescription,
      id: "review",
      questions: [
        {
          content: (
            <>
              <div className="rounded-lg bg-background p-4">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#20343A]">
                  {ui.summaryTitle}
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {previewTags.length > 0 ? (
                    previewTags.map((tag, index) => (
                      <span
                        key={`${tag}-${index}`}
                        className="rounded-full bg-[#3A7BD5]/10 px-3 py-1 text-xs font-semibold text-[#20343A]"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {copy.progress.start}
                    </span>
                  )}
                </div>
              </div>

              <label className="mt-5 block">
                <span className="text-sm font-semibold text-[#20343A]">
                  {ui.notesLabel}
                </span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  {ui.notesHint}
                </span>
                <textarea
                  value={answers.notes}
                  rows={5}
                  className="mt-3 block w-full resize-y rounded-md border border-foreground/10 bg-white px-4 py-3 text-sm leading-6 text-[#20343A] outline-none transition focus:border-[#1FA77A] focus:ring-2 focus:ring-[#1FA77A]/15"
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      notes: event.target.value
                    }))
                  }
                />
              </label>

              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {ui.reviewSafety}
              </p>
            </>
          ),
          id: "review",
          isAnswered: canGenerate,
          label: ui.reviewQuestion,
          required: true
        }
      ],
      title: ui.reviewTitle
    }
  ];

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
  const isReview = currentSection.id === "review";
  const canMoveForward = isReview ? canGenerate : currentStepComplete;
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
    if (section.id === "review") {
      return canGenerate;
    }

    if (section.optional) {
      return section.questions.some((question) => question.isAnswered);
    }

    return section.questions.every(
      (question) => !question.required || question.isAnswered
    );
  }

  function goBack() {
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

  function goNext() {
    if (!canMoveForward) {
      return;
    }

    if (isReview) {
      setShowPlans(true);
      window.scrollTo({ behavior: "smooth", top: 0 });
      return;
    }

    if (isCompact && currentQuestionIndex < currentSection.questions.length - 1) {
      setQuestionIndex(currentQuestionIndex + 1);
      return;
    }

    setSectionIndex(Math.min(sectionIndex + 1, sections.length - 1));
    setQuestionIndex(0);
  }

  function skipOptionalSection() {
    setSectionIndex(Math.min(sectionIndex + 1, sections.length - 1));
    setQuestionIndex(0);
  }

  function choosePlan(planId: string) {
    setSelectedPlan(planId);
    setShowPlans(false);
    void startProcessing(planId);
  }

  async function startProcessing(planId = selectedPlan || "free-basic") {
    setProcessingError("");
    setProcessingStatus({
      jobId: "",
      queuePosition: 0,
      status: "queued",
      steps: [
        { id: "sent", state: "active" },
        { id: "preparing", state: "pending" },
        { id: "ready", state: "pending" }
      ]
    });

    try {
      const response = await fetch("/api/assessment", {
        body: JSON.stringify({ answers, locale, plan: planId }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("Unable to create assessment job");
      }

      const status = (await response.json()) as ProcessingStatus;
      setProcessingStatus(status);
    } catch {
      setProcessingError(ui.processingError);
      setProcessingStatus(null);
    }
  }

  useEffect(() => {
    if (!processingStatus?.jobId) {
      return;
    }

    const jobId = processingStatus.jobId;

    if (processingStatus.status === "ready") {
      const timeout = window.setTimeout(() => {
        router.push(`/${locale}/assessment/results?job=${jobId}`);
      }, 1200);

      return () => window.clearTimeout(timeout);
    }

    let cancelled = false;

    async function pollStatus() {
      try {
        const response = await fetch(`/api/assessment/${jobId}`);

        if (!response.ok) {
          throw new Error("Unable to fetch assessment job");
        }

        const status = (await response.json()) as ProcessingStatus;

        if (!cancelled) {
          setProcessingStatus(status);
        }
      } catch {
        if (!cancelled) {
          setProcessingError(ui.processingError);
        }
      }
    }

    const interval = window.setInterval(pollStatus, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    locale,
    processingStatus?.jobId,
    processingStatus?.status,
    router,
    ui.processingError
  ]);

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10 sm:px-8 lg:pt-14">
        {processingStatus ? (
          <ProcessingPanel
            error={processingError}
            onRetry={() => void startProcessing()}
            queueLabel={ui.processingQueue(processingStatus.queuePosition)}
            retryLabel={ui.retry}
            status={processingStatus}
            statusLabels={ui.statusLabels}
            stepLabels={ui.processingSteps}
            subtitle={ui.processingSubtitle}
            title={ui.processingTitle}
          />
        ) : showPlans ? (
          <PlanSelectionPanel
            content={getPlanContent(locale)}
            onBack={() => setShowPlans(false)}
            onSelect={choosePlan}
          />
        ) : (
          <div className="mx-auto max-w-4xl space-y-6">
            {sectionIndex === 0 ? (
              <section className="rounded-lg bg-[#3A7BD5]/5 p-6 ring-1 ring-[#3A7BD5]/10 sm:p-8 lg:p-10">
              <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#3A7BD5]">
                    {copy.hero.time}
                  </p>
                  <h1 className="mt-5 text-4xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-5xl">
                    {copy.hero.title}
                  </h1>
                  <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                    {copy.hero.description}
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 lg:min-w-80 lg:grid-cols-1">
                  {copy.badges.map((badge, index) => {
                    const BadgeIcon = heroBadgeIcons[index] ?? CheckCircleIcon;

                    return (
                      <div
                        key={badge}
                        className="flex items-center gap-3 rounded-md border border-foreground/10 bg-background px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#20343A] sm:text-sm"
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
              </div>
            </section>
            ) : null}

            <div>
              <SectionProgress
                progress={progress}
                progressLabel={progressLabel}
              />
              <SectionCard
                done={sectionIsComplete(currentSection)}
                number={sectionIndex + 1}
                sectionLabel={
                  currentSection.optional || currentSection.id === "review"
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
                  {currentSection.optional ? (
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
                    {isReview ? copy.fixedAction.generate : ui.continue}
                    {isReview ? (
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
  stepLabels: Record<ProcessingStatus["steps"][number]["id"], string>;
  subtitle: string;
  title: string;
}>;

type PlanSelectionPanelProps = Readonly<{
  content: PlanContent;
  onBack: () => void;
  onSelect: (planId: string) => void;
}>;

function PlanSelectionPanel({
  content,
  onBack,
  onSelect
}: PlanSelectionPanelProps) {
  return (
    <section className="mx-auto max-w-6xl rounded-lg bg-white px-5 py-8 ring-1 ring-foreground/10 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#3A7BD5]">
          {content.eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-4xl">
          {content.title}
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          {content.subtitle}
        </p>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {content.tiers.map((tier) => (
          <div
            key={tier.id}
            className={cx(
              "flex rounded-lg p-6 ring-1 transition",
              tier.featured
                ? "bg-[#3A7BD5]/5 ring-2 ring-[#3A7BD5]"
                : "bg-white ring-foreground/10"
            )}
          >
            <div className="flex w-full flex-col">
              <div>
                <h2
                  id={tier.id}
                  className={cx(
                    "text-lg font-semibold text-[#20343A]",
                    tier.featured && "text-[#3A7BD5]"
                  )}
                >
                  {tier.name}
                </h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tier.featured ? (
                    <p className="inline-flex rounded-full bg-[#3A7BD5]/10 px-2.5 py-1 text-xs font-semibold text-[#3A7BD5]">
                      {content.badge}
                    </p>
                  ) : null}
                  {tier.tierBadge ? (
                    <p className="inline-flex rounded-full bg-[#1FA77A]/10 px-2.5 py-1 text-xs font-semibold text-[#126b4f]">
                      {tier.tierBadge}
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="mt-4 min-h-20 text-sm leading-6 text-muted-foreground">
                {tier.description}
              </p>
              <p className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-normal text-[#20343A]">
                  {tier.price}
                </span>
                {tier.priceSuffix ? (
                  <span className="text-sm font-semibold text-muted-foreground">
                    {tier.priceSuffix}
                  </span>
                ) : null}
              </p>
              <button
                type="button"
                aria-describedby={tier.id}
                className={cx(
                  "mt-6 rounded-md px-3 py-3 text-center text-sm font-semibold uppercase tracking-[0.08em] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1FA77A]",
                  tier.featured
                    ? "bg-[#1FA77A] text-white shadow-sm hover:bg-[#188a65]"
                    : "border border-[#1FA77A]/25 bg-white text-[#126b4f] hover:border-[#1FA77A]/50 hover:bg-[#1FA77A]/5"
                )}
                onClick={() => onSelect(tier.id)}
              >
                {tier.cta}
              </button>
              <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <CheckIcon
                      aria-hidden={true}
                      className="mt-0.5 size-5 flex-none text-[#1FA77A]"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          className="rounded-md border border-foreground/10 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-[#20343A] transition hover:bg-background"
          onClick={onBack}
        >
          {content.back}
        </button>
      </div>
    </section>
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
        {title}
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-base leading-7 text-muted-foreground">
        {subtitle}
      </p>
      <p className="mt-6 rounded-md bg-background px-4 py-3 text-center text-sm font-semibold uppercase tracking-[0.08em] text-[#20343A]">
        {queueLabel}
      </p>

      <div className="mt-8 flow-root">
        <ul role="list" className="-mb-8">
          {status.steps.map((step, index) => {
            const complete = step.state === "complete";
            const active = step.state === "active";
            const StepIcon = complete ? CheckIcon : active ? ArrowPathIcon : ClockIcon;

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
                        {stepLabels[step.id]}
                      </p>
                      <p className="whitespace-nowrap text-right text-sm text-muted-foreground">
                        {complete
                          ? statusLabels.complete
                          : active
                            ? statusLabels.active
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

function SectionProgress({ progress, progressLabel }: SectionProgressProps) {
  return (
    <div className="mb-3 px-1 py-1">
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
