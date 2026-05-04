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
    sex: string;
    sexOptions: Option[];
    title: string;
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
    sun: string;
    sunOptions: Option[];
    title: string;
  };
  precision: {
    gut: string;
    gutOptions: Option[];
    helper: string;
    labs: string;
    labFields: LabField[];
    region: string;
    regionOptions: Option[];
    sleep: string;
    sleepOptions: ScaleOption[];
    stress: string;
    stressOptions: ScaleOption[];
    title: string;
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
  symptoms: {
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
  age: string;
  budget: string;
  build: string;
  conditions: string[];
  diet: string;
  fish: string;
  feelGreat: boolean;
  form: string;
  goals: string[];
  gut: string;
  labs: Record<string, string>;
  lifestage: string;
  meds: string;
  medTypes: string[];
  notes: string;
  pills: string;
  region: string;
  sex: string;
  sleep: string;
  stress: string;
  sun: string;
  symptoms: string[];
};

const requiredGroups = [
  "sex",
  "age",
  "activity",
  "goals",
  "symptoms",
  "diet",
  "fish",
  "sun",
  "meds",
  "budget",
  "pills"
] as const;

const initialAnswers: Answers = {
  activity: "",
  age: "",
  budget: "",
  build: "",
  conditions: [],
  diet: "",
  fish: "",
  feelGreat: false,
  form: "",
  goals: [],
  gut: "",
  labs: {},
  lifestage: "",
  meds: "",
  medTypes: [],
  notes: "",
  pills: "",
  region: "",
  sex: "",
  sleep: "",
  stress: "",
  sun: "",
  symptoms: []
};

const en: Copy = {
  about: {
    title: "About you",
    sex: "I am",
    sexOptions: [
      { label: "Male", value: "male" },
      { label: "Female", value: "female" }
    ],
    age: "My age",
    ageOptions: [
      { label: "18-30", value: "18-30" },
      { label: "31-45", value: "31-45" },
      { label: "46-60", value: "46-60" },
      { label: "61+", value: "61+" }
    ],
    activity: "How active am I?",
    activityOptions: [
      { label: "Barely active", value: "inactive" },
      { label: "Light", value: "light" },
      { label: "Moderate", value: "moderate" },
      { label: "Very active", value: "active" },
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
    generate: "Generate my formulation brief",
    remaining: (count) =>
      `${count} required question${count === 1 ? "" : "s"} remaining`
  },
  goals: {
    title: "My number one priority",
    prompt: "What do I want most?",
    hint: "Pick up to 3",
    options: [
      { label: "Live longer", value: "longevity" },
      { label: "More energy", value: "energy" },
      { label: "Think clearer", value: "brain" },
      { label: "Sleep better", value: "sleep" },
      { label: "Build muscle", value: "muscle" },
      { label: "Less stress", value: "stress" },
      { label: "Gut health", value: "gut" },
      { label: "Manage weight", value: "weight" },
      { label: "Immunity", value: "immunity" },
      { label: "Hormones", value: "hormones" },
      { label: "Joints", value: "joints" },
      { label: "Skin and hair", value: "skin" }
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
    title: "My lifestyle",
    diet: "My diet",
    dietOptions: [
      { label: "Omnivore", value: "omnivore" },
      { label: "Pescatarian", value: "pescatarian" },
      { label: "Vegetarian", value: "vegetarian" },
      { label: "Vegan", value: "vegan" },
      { label: "Keto / carnivore", value: "keto" }
    ],
    fish: "Fatty fish such as salmon, sardines, or mackerel",
    fishOptions: [
      { label: "Daily", value: "daily" },
      { label: "2-3x / week", value: "2-3pw" },
      { label: "Once / week", value: "weekly" },
      { label: "Rarely", value: "rarely" },
      { label: "Never", value: "never" }
    ],
    sun: "Daily sun exposure on skin",
    sunOptions: [
      { label: "60+ min", value: "high" },
      { label: "30-60 min", value: "moderate" },
      { label: "15-30 min", value: "low" },
      { label: "Under 15 min", value: "minimal" }
    ],
    meds: "Regular medications?",
    medsHint:
      "This is important for safety. We use it to flag items for review, not to diagnose.",
    medsOptions: [
      { label: "Yes", value: "yes" },
      { label: "None", value: "no" }
    ],
    medType: "Which type or types?",
    medTypeOptions: [
      { label: "Statin", value: "statin" },
      { label: "Metformin", value: "metformin" },
      { label: "PPI / acid reflux", value: "ppi" },
      { label: "Contraceptive pill", value: "ocp" },
      { label: "Mood or anxiety medication", value: "mood" },
      { label: "Blood thinner / aspirin", value: "blood-thinner" },
      { label: "Thyroid medication", value: "thyroid" },
      { label: "Blood pressure", value: "bp" },
      { label: "Other", value: "other" }
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
    sleep: "How do I sleep?",
    sleepOptions: [
      { label: "Awful", value: "1", tone: "Low" },
      { label: "Poor", value: "2", tone: "Low" },
      { label: "OK", value: "3", tone: "Mid" },
      { label: "Good", value: "4", tone: "High" },
      { label: "Great", value: "5", tone: "High" }
    ],
    stress: "My daily stress",
    stressOptions: [
      { label: "Very low", value: "1", tone: "Low" },
      { label: "Low", value: "2", tone: "Low" },
      { label: "Moderate", value: "3", tone: "Mid" },
      { label: "High", value: "4", tone: "High" },
      { label: "Very high", value: "5", tone: "High" }
    ],
    gut: "My digestion is",
    gutOptions: [
      { label: "No issues", value: "great" },
      { label: "Often bloated", value: "bloat" },
      { label: "Constipation", value: "constipation" },
      { label: "Loose stools", value: "loose" },
      { label: "Alternating", value: "mixed" }
    ],
    region: "My region / climate",
    regionOptions: [
      { label: "Tropical / SE Asia", value: "tropical" },
      { label: "Subtropical", value: "subtropical" },
      { label: "Temperate", value: "temperate" },
      { label: "Northern Europe / Canada", value: "northern" }
    ],
    labs: "My lab values, if I know them",
    labFields: [
      {
        label: "Vitamin D",
        value: "vitaminD",
        placeholder: "e.g. 35",
        hint: "ng/mL"
      },
      { label: "Vitamin B12", value: "b12", placeholder: "e.g. 450", hint: "pg/mL" },
      { label: "Ferritin", value: "ferritin", placeholder: "e.g. 80", hint: "ng/mL" },
      { label: "HbA1c", value: "hba1c", placeholder: "e.g. 5.4", hint: "%" },
      {
        label: "Omega-3 Index",
        value: "omega3",
        placeholder: "e.g. 5.0",
        hint: "%"
      },
      {
        label: "Homocysteine",
        value: "homocysteine",
        placeholder: "e.g. 9.0",
        hint: "umol/L"
      }
    ]
  },
  preferences: {
    title: "My preferences",
    budget: "Monthly supplement budget",
    budgetOptions: [
      { label: "Under $30", value: "low" },
      { label: "$30-70", value: "mid" },
      { label: "$70-150", value: "good" },
      { label: "$150+", value: "high" }
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
  symptoms: {
    title: "How am I feeling?",
    prompt: "Select all that apply",
    hint: "Tap any that match you",
    great: { label: "I feel great", value: "great" },
    options: [
      { label: "Always tired", value: "tired" },
      { label: "Brain fog", value: "fog" },
      { label: "Stressed out", value: "stress" },
      { label: "Poor sleep", value: "bad-sleep" },
      { label: "Joint discomfort", value: "joints" },
      { label: "Gut issues", value: "gut" },
      { label: "Low mood", value: "mood" },
      { label: "Get sick often", value: "sick" },
      { label: "Hair / skin", value: "hair-skin" },
      { label: "Low libido", value: "libido" },
      { label: "Weight gain", value: "weight" }
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
    title: "เกี่ยวกับคุณ",
    sex: "ฉันคือ",
    sexOptions: [
      { label: "ชาย", value: "male" },
      { label: "หญิง", value: "female" }
    ],
    age: "อายุของฉัน",
    ageOptions: en.about.ageOptions,
    activity: "ฉันออกกำลังกายมากแค่ไหน?",
    activityOptions: [
      { label: "แทบไม่ออกกำลัง", value: "inactive" },
      { label: "เบาๆ", value: "light" },
      { label: "ปานกลาง", value: "moderate" },
      { label: "กระฉับกระเฉงมาก", value: "active" },
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
    generate: "สร้างบรีฟสูตรของฉัน",
    remaining: (count) => `เหลือคำถามจำเป็น ${count} ข้อ`
  },
  goals: {
    title: "เป้าหมายอันดับหนึ่งของฉัน",
    prompt: "ฉันต้องการอะไรมากที่สุด?",
    hint: "เลือกได้สูงสุด 3 ข้อ",
    options: [
      { label: "อายุยืนขึ้น", value: "longevity" },
      { label: "พลังงานมากขึ้น", value: "energy" },
      { label: "คิดได้ชัดขึ้น", value: "brain" },
      { label: "นอนหลับดีขึ้น", value: "sleep" },
      { label: "สร้างกล้ามเนื้อ", value: "muscle" },
      { label: "เครียดน้อยลง", value: "stress" },
      { label: "สุขภาพลำไส้", value: "gut" },
      { label: "จัดการน้ำหนัก", value: "weight" },
      { label: "ภูมิคุ้มกัน", value: "immunity" },
      { label: "ฮอร์โมน", value: "hormones" },
      { label: "ข้อต่อ", value: "joints" },
      { label: "ผิวและผม", value: "skin" }
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
    title: "ไลฟ์สไตล์ของฉัน",
    diet: "รูปแบบอาหารของฉัน",
    dietOptions: [
      { label: "กินได้หลากหลาย", value: "omnivore" },
      { label: "กินปลา", value: "pescatarian" },
      { label: "มังสวิรัติ", value: "vegetarian" },
      { label: "วีแกน", value: "vegan" },
      { label: "คีโต / คาร์นิวอร์", value: "keto" }
    ],
    fish: "ปลาที่มีไขมันดี เช่น แซลมอน ซาร์ดีน หรือแมคเคอเรล",
    fishOptions: [
      { label: "ทุกวัน", value: "daily" },
      { label: "2-3 ครั้ง / สัปดาห์", value: "2-3pw" },
      { label: "สัปดาห์ละครั้ง", value: "weekly" },
      { label: "นานๆ ครั้ง", value: "rarely" },
      { label: "ไม่เคย", value: "never" }
    ],
    sun: "แสงแดดต่อผิวในแต่ละวัน",
    sunOptions: [
      { label: "60+ นาที", value: "high" },
      { label: "30-60 นาที", value: "moderate" },
      { label: "15-30 นาที", value: "low" },
      { label: "น้อยกว่า 15 นาที", value: "minimal" }
    ],
    meds: "ใช้ยาเป็นประจำหรือไม่?",
    medsHint:
      "ข้อมูลนี้สำคัญด้านความปลอดภัย ใช้เพื่อระบุสิ่งที่ควรตรวจทาน ไม่ใช่เพื่อวินิจฉัย",
    medsOptions: [
      { label: "ใช่", value: "yes" },
      { label: "ไม่มี", value: "no" }
    ],
    medType: "เป็นยาประเภทใด?",
    medTypeOptions: [
      { label: "ยากลุ่มสแตติน", value: "statin" },
      { label: "เมตฟอร์มิน", value: "metformin" },
      { label: "ยาลดกรด / กรดไหลย้อน", value: "ppi" },
      { label: "ยาคุมกำเนิด", value: "ocp" },
      { label: "ยาดูแลอารมณ์หรือความกังวล", value: "mood" },
      { label: "ยาละลายลิ่มเลือด / แอสไพริน", value: "blood-thinner" },
      { label: "ยาไทรอยด์", value: "thyroid" },
      { label: "ยาความดัน", value: "bp" },
      { label: "อื่นๆ", value: "other" }
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
    sleep: "ฉันนอนหลับเป็นอย่างไร?",
    sleepOptions: [
      { label: "แย่มาก", value: "1", tone: "Low" },
      { label: "ไม่ดี", value: "2", tone: "Low" },
      { label: "พอใช้", value: "3", tone: "Mid" },
      { label: "ดี", value: "4", tone: "High" },
      { label: "ดีมาก", value: "5", tone: "High" }
    ],
    stress: "ความเครียดในแต่ละวัน",
    stressOptions: [
      { label: "ต่ำมาก", value: "1", tone: "Low" },
      { label: "ต่ำ", value: "2", tone: "Low" },
      { label: "ปานกลาง", value: "3", tone: "Mid" },
      { label: "สูง", value: "4", tone: "High" },
      { label: "สูงมาก", value: "5", tone: "High" }
    ],
    gut: "ระบบย่อยอาหารของฉัน",
    gutOptions: [
      { label: "ไม่มีปัญหา", value: "great" },
      { label: "ท้องอืดบ่อย", value: "bloat" },
      { label: "ท้องผูก", value: "constipation" },
      { label: "ถ่ายเหลว", value: "loose" },
      { label: "สลับกัน", value: "mixed" }
    ],
    region: "ภูมิภาค / สภาพอากาศ",
    regionOptions: [
      { label: "เขตร้อน / เอเชียตะวันออกเฉียงใต้", value: "tropical" },
      { label: "กึ่งร้อน", value: "subtropical" },
      { label: "อบอุ่น", value: "temperate" },
      { label: "ยุโรปเหนือ / แคนาดา", value: "northern" }
    ],
    labs: "ค่าตรวจเลือด หากทราบ",
    labFields: [
      { label: "วิตามินดี", value: "vitaminD", placeholder: "เช่น 35", hint: "ng/mL" },
      { label: "วิตามินบี12", value: "b12", placeholder: "เช่น 450", hint: "pg/mL" },
      { label: "เฟอร์ริติน", value: "ferritin", placeholder: "เช่น 80", hint: "ng/mL" },
      { label: "HbA1c", value: "hba1c", placeholder: "เช่น 5.4", hint: "%" },
      { label: "ดัชนีโอเมก้า-3", value: "omega3", placeholder: "เช่น 5.0", hint: "%" },
      {
        label: "โฮโมซิสเทอีน",
        value: "homocysteine",
        placeholder: "เช่น 9.0",
        hint: "umol/L"
      }
    ]
  },
  preferences: {
    ...en.preferences,
    title: "ความต้องการของฉัน",
    budget: "งบอาหารเสริมต่อเดือน",
    budgetOptions: [
      { label: "ต่ำกว่า $30", value: "low" },
      { label: "$30-70", value: "mid" },
      { label: "$70-150", value: "good" },
      { label: "$150+", value: "high" }
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
  symptoms: {
    ...en.symptoms,
    title: "ตอนนี้ฉันรู้สึกอย่างไร?",
    prompt: "เลือกทุกข้อที่ตรงกับคุณ",
    hint: "แตะข้อที่ตรงกับคุณ",
    great: { label: "ฉันรู้สึกดีมาก", value: "great" },
    options: [
      { label: "เหนื่อยตลอดเวลา", value: "tired" },
      { label: "สมองล้า", value: "fog" },
      { label: "เครียดมาก", value: "stress" },
      { label: "นอนหลับไม่ดี", value: "bad-sleep" },
      { label: "ไม่สบายข้อต่อ", value: "joints" },
      { label: "ปัญหาลำไส้", value: "gut" },
      { label: "อารมณ์ต่ำ", value: "mood" },
      { label: "ป่วยบ่อย", value: "sick" },
      { label: "ผม / ผิว", value: "hair-skin" },
      { label: "ความต้องการทางเพศต่ำ", value: "libido" },
      { label: "น้ำหนักขึ้น", value: "weight" }
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

function buildPreviewTags(copy: Copy, answers: Answers) {
  const selectedGoalLabels = copy.goals.options
    .filter((option) => answers.goals.includes(option.value))
    .map((option) => option.label);
  const tags = [
    ...selectedGoalLabels,
    answers.diet ? copy.lifestyle.dietOptions.find((option) => option.value === answers.diet)?.label : "",
    answers.budget
      ? copy.preferences.budgetOptions.find((option) => option.value === answers.budget)?.label
      : "",
    answers.meds === "yes" ? "Safety review" : ""
  ].filter(Boolean);

  return tags.slice(0, 8);
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

export function AssessmentFlow({ locale }: AssessmentFlowProps) {
  const copy = copies[locale];
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [processingStatus, setProcessingStatus] =
    useState<ProcessingStatus | null>(null);
  const [processingError, setProcessingError] = useState("");
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
          notesHint: "เพิ่มได้ถ้ามีรายละเอียดสำคัญ เช่น ความไวต่อส่วนผสม ข้อจำกัด หรือสิ่งที่อยากหลีกเลี่ยง",
          notesLabel: "มีอะไรเพิ่มเติมที่เราควรรู้ไหม?",
          optionalSection: "ขั้นตอนเสริม",
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
          validation: "ตอบข้อที่จำเป็นเพื่อไปต่อ"
        }
      : {
          back: "Back",
          close: "Close",
          continue: "Continue",
          currentStep: "Current step",
          notesHint:
            "Add anything useful, such as sensitivities, constraints, products you already use, or ingredients you want to avoid.",
          notesLabel: "Anything else we should know?",
          optionalSection: "Optional precision",
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
          summaryTitle: "Your brief preview",
          step: (current: number, total: number) =>
            `Question ${current} of ${total}`,
          validation: "Answer the required item to continue"
        };

  function setSingle(key: keyof Answers, value: string) {
    setAnswers((current) => ({
      ...current,
      [key]: value,
      ...(key === "sex" && value !== "female" ? { lifestage: "" } : {}),
      ...(key === "meds" && value !== "yes" ? { medTypes: [] } : {})
    }));
  }

  function toggleMulti(key: "goals" | "symptoms" | "medTypes" | "conditions", value: string, max = 99) {
    setAnswers((current) => {
      const values = current[key];
      const selected = values.includes(value);

      if (!selected && values.length >= max) {
        return current;
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
        },
        {
          content: (
            <PillGroup
              options={copy.about.buildOptions}
              selected={answers.build}
              onSelect={(value) => setSingle("build", value)}
            />
          ),
          id: "build",
          isAnswered: Boolean(answers.build),
          label: copy.about.build
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
          ? "อาหาร แสงแดด และยาที่ใช้อยู่ช่วยให้เราสร้างบรีฟที่ระมัดระวังและเหมาะสม"
          : "Diet, sunlight, and medication context keep the brief useful and careful.",
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
              options={copy.lifestyle.sunOptions}
              selected={answers.sun}
              onSelect={(value) => setSingle("sun", value)}
            />
          ),
          id: "sun",
          isAnswered: Boolean(answers.sun),
          label: copy.lifestyle.sun,
          required: true
        },
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
      title: copy.lifestyle.title
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
              options={copy.precision.regionOptions}
              selected={answers.region}
              onSelect={(value) => setSingle("region", value)}
            />
          ),
          id: "region",
          isAnswered: Boolean(answers.region),
          label: copy.precision.region
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
                    previewTags.map((tag) => (
                      <span
                        key={tag}
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
      void startProcessing();
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

  async function startProcessing() {
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
        body: JSON.stringify({ answers, locale }),
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
            onRetry={startProcessing}
            queueLabel={ui.processingQueue(processingStatus.queuePosition)}
            retryLabel={ui.retry}
            status={processingStatus}
            statusLabels={ui.statusLabels}
            stepLabels={ui.processingSteps}
            subtitle={ui.processingSubtitle}
            title={ui.processingTitle}
          />
        ) : (
          <div className="mx-auto max-w-4xl space-y-6">
            {sectionIndex === 0 ? (
              <section className="rounded-lg bg-white p-6 ring-1 ring-foreground/10 sm:p-8 lg:p-10">
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
              <SectionCard
                done={sectionIsComplete(currentSection)}
                number={sectionIndex + 1}
                optionalLabel={currentSection.optional ? ui.optionalSection : undefined}
                progress={progress}
                progressLabel={progressLabel}
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
                    label={question.label}
                    required={question.required}
                    requiredLabel={copy.common.required}
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
  optionalLabel?: string;
  progress: number;
  progressLabel: string;
  stepLabel: string;
  title: string;
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

function SectionCard({
  children,
  done,
  number,
  optionalLabel,
  progress,
  progressLabel,
  stepLabel,
  title
}: SectionCardProps) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-foreground/10 sm:p-6">
      <div className="mb-6 space-y-4">
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
            {optionalLabel ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {optionalLabel}
              </p>
            ) : null}
          </div>
        </div>

        <div>
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
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

type QuestionProps = Readonly<{
  children: React.ReactNode;
  hint?: string;
  label: string;
  required?: boolean;
  requiredLabel?: string;
}>;

function Question({
  children,
  hint,
  label,
  required = false,
  requiredLabel
}: QuestionProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-[#20343A]">{label}</p>
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
