import type { Locale, LocaleCode } from "@/lib/i18n";

export type LocalizedHealthScoreText =
  | string
  | Readonly<Record<LocaleCode, string>>;

export type HealthScoreDomainId =
  | "activity"
  | "biomarkers"
  | "habits"
  | "nutrition"
  | "sleep"
  | "stress";

export type HealthScoreDomain = Readonly<{
  description: string;
  id: HealthScoreDomainId;
  label: string;
  score: number;
}>;

export type HealthScoreMover = Readonly<{
  impact: string;
  label: string;
}>;

export type HealthScorePaywallFeature = Readonly<{
  description: LocalizedHealthScoreText;
  name: LocalizedHealthScoreText;
}>;

export type HealthScoreAdvice = Readonly<{
  paywallEyebrow?: LocalizedHealthScoreText;
  paywallFeatures?: HealthScorePaywallFeature[];
  paywallSubtitle?: LocalizedHealthScoreText;
  paywallTitle?: LocalizedHealthScoreText;
  overview: LocalizedHealthScoreText;
  focusArea?: LocalizedHealthScoreText;
  howToImprove?: LocalizedHealthScoreText;
}>;

export type HealthScoreFinding = Readonly<{
  body: string;
  code: string;
  headline: string;
  icon: string;
}>;

export type HealthScoreGapCard = Readonly<{
  body: string;
  headline: string;
  tag: string;
  value: string;
}>;

export type HealthScoreMethodCard = Readonly<{
  body: string;
  title: string;
}>;

export type HealthScorePageAiCard = Readonly<{
  body: LocalizedHealthScoreText;
  headline?: LocalizedHealthScoreText;
  title?: LocalizedHealthScoreText;
}>;

export type HealthScorePageAiCopy = Readonly<{
  bandLine?: LocalizedHealthScoreText;
  gapTrio?: HealthScorePageAiCard[];
  heroBody?: LocalizedHealthScoreText;
  heroTitle?: LocalizedHealthScoreText;
  findings?: HealthScorePageAiCard[];
  findingsHeadline?: LocalizedHealthScoreText;
  findingsSub?: LocalizedHealthScoreText;
  highestLeverageBody?: LocalizedHealthScoreText;
  methodCards?: HealthScorePageAiCard[];
  methodHeadline?: LocalizedHealthScoreText;
  overview?: LocalizedHealthScoreText;
  paywallFeatures?: HealthScorePaywallFeature[];
  paywallSubtitle?: LocalizedHealthScoreText;
  paywallTitle?: LocalizedHealthScoreText;
  pillarHeadline?: LocalizedHealthScoreText;
  relativityHeadline?: LocalizedHealthScoreText;
  relativitySub?: LocalizedHealthScoreText;
  strengthNote?: LocalizedHealthScoreText;
  subtractionBody?: LocalizedHealthScoreText;
}>;

export type HealthScoreSubtractionMode = "nutrients" | "products";

export type HealthScoreSubtraction = Readonly<{
  chosen: number;
  evaluated: number;
  mode: HealthScoreSubtractionMode;
  setAside: number;
}>;

export type HealthScorePillarContent = Readonly<{
  goalLinked: boolean;
  id: HealthScoreDomainId;
  label: string;
  tag: string | null;
  value: number;
}>;

export type HealthScorePageContent = Readonly<{
  aiCopy?: HealthScorePageAiCopy;
  copySeeds: Readonly<{
    bandLine: string;
    findings: HealthScoreFinding[];
    findingsHeadline: string;
    findingsMode: "caught" | "strengths";
    findingsSub: string;
    gapTrio: HealthScoreGapCard[];
    goalMirror: string;
    heroBody: string;
    highestLeverage: null | Readonly<{
      pillar: string;
      text: string;
      value: number;
    }>;
    methodCards: HealthScoreMethodCard[];
    methodHeadline: string;
    pillarHeadline: string;
    relativity: Readonly<{
      gap?: number;
      headline: string;
      mode: "gap" | "rank";
      spectrumMedian: number;
      spectrumYou: number;
      sub: string;
    }>;
    strengthNote: string | null;
    subtraction: HealthScoreSubtraction & Readonly<{
      body: string;
      labelChosen: string;
      labelEvaluated: string;
      labelSetAside: string;
    }>;
  }>;
  locked: Readonly<{
    band: string;
    flagCodes: string[];
    median: number;
    nutrientsChosen: number;
    nutrientsEvaluated: number;
    percentile: number;
    pillars: HealthScorePillarContent[];
    score: number;
    subtraction: HealthScoreSubtraction;
  }>;
  meta: Readonly<{
    engineScore: number;
    findingCount: number;
    relativityMode: "gap" | "rank";
    subtractionKey: string;
  }>;
}>;

export type HealthScoreResult = Readonly<{
  advice?: HealthScoreAdvice;
  band: string;
  domains: HealthScoreDomain[];
  flagCodes?: string[];
  headline: string;
  movers: HealthScoreMover[];
  pageContent?: HealthScorePageContent;
  raw?: number;
  score: number;
  selfReport?: number;
  summary: string;
  symptomMultiplier?: number;
  verification?: number;
  version?: "healthscore:v4" | string;
}>;

type PillarName =
  | "Activity & Fitness"
  | "Health Habits"
  | "Nutrition & Diet"
  | "Sleep & Recovery"
  | "Stress & Balance";

type NormalizedAnswers = Readonly<{
  activity: string;
  age: string;
  alcohol: string;
  caffeine: string;
  country: string;
  diet: string;
  digestion: string;
  energy: string;
  fEggs: string;
  fFish: string;
  fFruitVeg: string;
  fLegumes: string;
  goals: string[];
  hrv: number;
  kidney: string;
  labB12: number;
  labFerritin: number;
  labHba1c: number;
  labHomo: number;
  labO3: number;
  labVitd: number;
  liver: string;
  medTypes: string[];
  protein: string;
  reproStatus: string;
  sex: "female" | "male";
  sleepHrs: string;
  smoking: string;
  stress: string;
  sun: string;
  sunscreen: string;
  symptoms: string[];
  vo2: number;
}>;

type PillarScore = Readonly<{
  earned: number;
  id: HealthScoreDomainId;
  max: number;
  name: PillarName;
  pct: number;
  rows: Array<readonly [string, number, number]>;
}>;

type EngineResult = Readonly<{
  adjustedWeights: Record<PillarName, number>;
  band: string;
  final: number;
  flagCodes: string[];
  matched: Set<PillarName>;
  multiplier: number;
  raw: number;
  selfReport: number;
  symptomCount: number;
  verification: number;
  pillars: PillarScore[];
}>;

const PERCENTILES: Record<number, number> = {
  30: 0,
  31: 0,
  32: 0,
  33: 0,
  34: 0,
  35: 0,
  36: 0,
  37: 0,
  38: 0,
  39: 0,
  40: 0,
  41: 1,
  42: 1,
  43: 1,
  44: 2,
  45: 2,
  46: 3,
  47: 4,
  48: 5,
  49: 7,
  50: 9,
  51: 11,
  52: 14,
  53: 17,
  54: 20,
  55: 24,
  56: 28,
  57: 33,
  58: 38,
  59: 43,
  60: 49,
  61: 54,
  62: 59,
  63: 64,
  64: 69,
  65: 73,
  66: 78,
  67: 82,
  68: 85,
  69: 88,
  70: 90,
  71: 93,
  72: 95,
  73: 96,
  74: 97,
  75: 98,
  76: 99,
  77: 99,
  78: 99,
  79: 100,
  80: 100,
  81: 100,
  82: 100,
  83: 100,
  84: 100,
  85: 100,
  86: 100,
  87: 100,
  88: 100,
  89: 100,
  90: 100,
  91: 100,
  92: 100
};

const VO2_GOOD: Record<string, number> = {
  "female:30s": 36,
  "female:40s": 32,
  "female:50s": 29,
  "female:60+": 26,
  "female:u30": 38,
  "male:30s": 42,
  "male:40s": 39,
  "male:50s": 35,
  "male:60+": 32,
  "male:u30": 45
};

const GOAL_MAP: Record<string, PillarName[]> = {
  energy: ["Sleep & Recovery", "Activity & Fitness"],
  fitness: ["Activity & Fitness"],
  focus: ["Stress & Balance", "Sleep & Recovery"],
  heart: ["Activity & Fitness", "Nutrition & Diet"],
  hormones: ["Stress & Balance", "Sleep & Recovery"],
  immunity: ["Nutrition & Diet", "Health Habits"],
  joints: ["Activity & Fitness"],
  longevity: ["Nutrition & Diet", "Activity & Fitness"],
  mood: ["Stress & Balance"],
  skin: ["Nutrition & Diet"],
  sleep: ["Sleep & Recovery"],
  weight: ["Activity & Fitness", "Nutrition & Diet"]
};

const GOAL_PILLARS: Record<PillarName, string[]> = {
  "Activity & Fitness": ["energy", "longevity", "fitness", "weight", "heart", "joints"],
  "Health Habits": ["immunity"],
  "Nutrition & Diet": ["longevity", "immunity", "weight", "heart", "skin"],
  "Sleep & Recovery": ["energy", "sleep", "focus", "hormones"],
  "Stress & Balance": ["focus", "mood", "hormones"]
};

const GOAL_PHRASE: Record<string, string> = {
  energy: "energy",
  fitness: "a real way back to fitness",
  focus: "sharper focus",
  heart: "a stronger heart",
  hormones: "balanced hormones",
  immunity: "a stronger immune system",
  joints: "easier joints",
  longevity: "a longer healthspan",
  mood: "a steadier mood",
  skin: "better skin",
  sleep: "deeper sleep",
  weight: "a healthier weight"
};

const GOAL_PHRASE_TH: Record<string, string> = {
  energy: "พลังงานที่ดีขึ้น",
  fitness: "การกลับไปฟิตอย่างเป็นจริง",
  focus: "สมาธิที่ชัดขึ้น",
  heart: "หัวใจที่แข็งแรงขึ้น",
  hormones: "ฮอร์โมนที่สมดุลขึ้น",
  immunity: "ภูมิคุ้มกันที่แข็งแรงขึ้น",
  joints: "ข้อต่อที่สบายขึ้น",
  longevity: "ช่วงชีวิตสุขภาพที่ยาวขึ้น",
  mood: "อารมณ์ที่นิ่งขึ้น",
  skin: "ผิวที่ดีขึ้น",
  sleep: "การนอนที่ลึกขึ้น",
  weight: "น้ำหนักที่สุขภาพดีขึ้น"
};

const GOAL_PHRASE_ZH: Record<string, string> = {
  energy: "更稳定的精力",
  fitness: "切实恢复体能",
  focus: "更清晰的专注力",
  heart: "更强健的心血管状态",
  hormones: "更平衡的激素状态",
  immunity: "更强的免疫支持",
  joints: "更舒适的关节",
  longevity: "更长的健康寿命",
  mood: "更稳定的情绪",
  skin: "更好的皮肤状态",
  sleep: "更深的睡眠",
  weight: "更健康的体重"
};

const GOAL_TAG: Record<string, string> = {
  energy: "energy",
  fitness: "fitness",
  focus: "focus",
  heart: "heart",
  hormones: "hormones",
  immunity: "immunity",
  joints: "joints",
  longevity: "longevity",
  mood: "mood",
  skin: "skin",
  sleep: "sleep",
  weight: "weight"
};

const GOAL_TAG_TH: Record<string, string> = {
  energy: "พลังงาน",
  fitness: "ฟิตเนส",
  focus: "โฟกัส",
  heart: "หัวใจ",
  hormones: "ฮอร์โมน",
  immunity: "ภูมิคุ้มกัน",
  joints: "ข้อต่อ",
  longevity: "อายุสุขภาพ",
  mood: "อารมณ์",
  skin: "ผิว",
  sleep: "การนอน",
  weight: "น้ำหนัก"
};

const GOAL_TAG_ZH: Record<string, string> = {
  energy: "精力",
  fitness: "体能",
  focus: "专注",
  heart: "心血管",
  hormones: "激素",
  immunity: "免疫",
  joints: "关节",
  longevity: "健康寿命",
  mood: "情绪",
  skin: "皮肤",
  sleep: "睡眠",
  weight: "体重"
};

const SYMPTOM_NAME: Record<string, string> = {
  brainfog: "brain fog",
  colds: "frequent colds",
  digestion: "bloating",
  fatigue: "fatigue",
  hair: "thinning hair",
  joint: "joint aches",
  libido: "low libido",
  mood: "low mood",
  skin: "skin issues",
  sleep: "restless sleep",
  stress: "stress"
};

const SYMPTOM_NAME_TH: Record<string, string> = {
  brainfog: "สมองล้า",
  colds: "เป็นหวัดบ่อย",
  digestion: "ท้องอืด",
  fatigue: "อ่อนล้า",
  hair: "ผมบาง",
  joint: "ปวดข้อ",
  libido: "ความต้องการทางเพศต่ำ",
  mood: "อารมณ์ตก",
  skin: "ปัญหาผิว",
  sleep: "นอนหลับไม่สนิท",
  stress: "ความเครียด"
};

const SYMPTOM_NAME_ZH: Record<string, string> = {
  brainfog: "脑雾",
  colds: "经常感冒",
  digestion: "腹胀",
  fatigue: "疲劳",
  hair: "头发变稀",
  joint: "关节酸痛",
  libido: "性欲偏低",
  mood: "情绪低落",
  skin: "皮肤问题",
  sleep: "睡眠不安稳",
  stress: "压力"
};

function localizedGoalPhrase(goal: string, locale: Locale) {
  if (locale === "th") {
    return GOAL_PHRASE_TH[goal] ?? goal;
  }
  if (locale === "zh-CN") {
    return GOAL_PHRASE_ZH[goal] ?? goal;
  }
  return GOAL_PHRASE[goal] ?? goal;
}

function localizedGoalTag(goal: string, locale: Locale) {
  if (locale === "th") {
    return GOAL_TAG_TH[goal] ?? goal;
  }
  if (locale === "zh-CN") {
    return GOAL_TAG_ZH[goal] ?? goal;
  }
  return GOAL_TAG[goal] ?? goal;
}

function localizedSymptomName(symptom: string, locale: Locale) {
  if (locale === "th") {
    return SYMPTOM_NAME_TH[symptom] ?? symptom;
  }
  if (locale === "zh-CN") {
    return SYMPTOM_NAME_ZH[symptom] ?? symptom;
  }
  return SYMPTOM_NAME[symptom] ?? symptom;
}

function localizedList(items: readonly string[], locale: Locale) {
  if (locale === "zh-CN") {
    if (items.length <= 1) {
      return items[0] ?? "";
    }

    return items.slice(0, -1).join("、") + "和" + items[items.length - 1];
  }

  if (locale !== "th") {
    return oxford(items);
  }

  if (items.length <= 1) {
    return items[0] ?? "";
  }

  return items.slice(0, -1).join(", ") + " และ" + items[items.length - 1];
}

const PILLAR_LABEL_EN: Record<PillarName, string> = {
  "Activity & Fitness": "Activity & Fitness",
  "Health Habits": "Health Habits",
  "Nutrition & Diet": "Nutrition & Diet",
  "Sleep & Recovery": "Sleep & Recovery",
  "Stress & Balance": "Stress & Balance"
};

const PILLAR_LABEL_TH: Record<PillarName, string> = {
  "Activity & Fitness": "กิจกรรมและฟิตเนส",
  "Health Habits": "พฤติกรรมสุขภาพ",
  "Nutrition & Diet": "โภชนาการ",
  "Sleep & Recovery": "การนอนและการฟื้นตัว",
  "Stress & Balance": "ความเครียดและสมดุล"
};

const PILLAR_LABEL_ZH: Record<PillarName, string> = {
  "Activity & Fitness": "活动与体能",
  "Health Habits": "健康习惯",
  "Nutrition & Diet": "营养与饮食",
  "Sleep & Recovery": "睡眠与恢复",
  "Stress & Balance": "压力与平衡"
};

const PILLAR_ID: Record<PillarName, HealthScoreDomainId> = {
  "Activity & Fitness": "activity",
  "Health Habits": "habits",
  "Nutrition & Diet": "nutrition",
  "Sleep & Recovery": "sleep",
  "Stress & Balance": "stress"
};

const PILLAR_DESCRIPTION: Record<PillarName, Record<Locale, string>> = {
  "Activity & Fitness": {
    en: "Reflects movement, cardio base, and how much your goals rely on fitness.",
    th: "สะท้อนการเคลื่อนไหว ความฟิต และความเกี่ยวข้องกับเป้าหมายของคุณ",
    "zh-CN": "反映活动量、有氧基础，以及你的目标对体能的依赖程度。"
  },
  "Health Habits": {
    en: "Reflects smoking, alcohol, caffeine, sun exposure, and digestive comfort.",
    th: "สะท้อนบุหรี่ แอลกอฮอล์ คาเฟอีน แสงแดด และความสบายของระบบย่อย",
    "zh-CN": "反映吸烟、酒精、咖啡因、日晒和消化舒适度。"
  },
  "Nutrition & Diet": {
    en: "Reflects diet pattern, oily fish, fruit and vegetable intake, and food variety.",
    th: "สะท้อนรูปแบบอาหาร ปลา ผักผลไม้ และความหลากหลายของอาหาร",
    "zh-CN": "反映饮食模式、油性鱼类、蔬果摄入和食物多样性。"
  },
  "Sleep & Recovery": {
    en: "Reflects sleep duration and daytime energy as a recovery proxy.",
    th: "สะท้อนชั่วโมงนอนและพลังงานระหว่างวันในฐานะตัวแทนการฟื้นตัว",
    "zh-CN": "反映睡眠时长和白天精力，作为恢复状态的参考。"
  },
  "Stress & Balance": {
    en: "Reflects stress load and how much it may drag on your goals.",
    th: "สะท้อนระดับความเครียดและผลต่อเป้าหมายของคุณ",
    "zh-CN": "反映压力负荷，以及它可能对目标造成的拖累。"
  }
};

const PILLAR_GAP: Record<PillarName, { body: string; headline: string }> = {
  "Activity & Fitness": {
    body:
      "Your activity sits low, and it is the pillar most of your goals route through. That makes it your highest-return change.",
    headline: "Movement is the lever you are not pulling"
  },
  "Health Habits": {
    body:
      "Small, specific habit changes, not a lifestyle overhaul, would lift this pillar and the score with it.",
    headline: "A few daily habits are costing you"
  },
  "Nutrition & Diet": {
    body:
      "A few targeted shifts in what you eat would move this pillar quickly. Your plan shows exactly which ones matter for you.",
    headline: "Your plate is leaving value on the table"
  },
  "Sleep & Recovery": {
    body:
      "Short or broken sleep is limiting how much everything else can work. It is one of the most movable parts of your score.",
    headline: "Your recovery is running short"
  },
  "Stress & Balance": {
    body:
      "A high stress load is quietly taxing the energy and focus you came here for. It is the single biggest drag on your score right now.",
    headline: "Your lowest pillar by far"
  }
};

const PILLAR_GAP_TH: Record<PillarName, { body: string; headline: string }> = {
  "Activity & Fitness": {
    body:
      "กิจกรรมของคุณยังต่ำ และเป็นเสาหลักที่เกี่ยวกับเป้าหมายหลายข้อที่สุด จึงเป็นจุดที่ให้ผลตอบแทนสูง",
    headline: "การเคลื่อนไหวคือคันโยกที่ยังไม่ได้ใช้เต็มที่"
  },
  "Health Habits": {
    body:
      "การปรับพฤติกรรมเล็กๆ ที่เฉพาะเจาะจง ไม่ใช่การเปลี่ยนชีวิตทั้งระบบ จะช่วยยกเสาหลักนี้และคะแนนรวม",
    headline: "พฤติกรรมประจำวันบางอย่างกำลังกินคะแนน"
  },
  "Nutrition & Diet": {
    body:
      "การปรับอาหารบางจุดอย่างตรงเป้าจะขยับเสาหลักนี้ได้เร็ว แผนจะแสดงว่าจุดไหนสำคัญกับคุณจริงๆ",
    headline: "จานอาหารของคุณยังมีช่องว่างที่แก้ได้"
  },
  "Sleep & Recovery": {
    body:
      "การนอนที่สั้นหรือไม่ต่อเนื่องจำกัดผลของสิ่งอื่นๆ นี่คือหนึ่งในส่วนที่ขยับคะแนนได้มาก",
    headline: "การฟื้นตัวของคุณยังสั้นเกินไป"
  },
  "Stress & Balance": {
    body:
      "ความเครียดที่สูงกำลังกดพลังงานและสมาธิที่คุณต้องการ เป็นแรงฉุดคะแนนที่ชัดที่สุดตอนนี้",
    headline: "เสาหลักที่ต่ำที่สุดอย่างชัดเจน"
  }
};

const PILLAR_GAP_ZH: Record<PillarName, { body: string; headline: string }> = {
  "Activity & Fitness": {
    body:
      "你的活动量偏低，而且它连接了大多数目标。这让运动成为最值得优先调整的杠杆。",
    headline: "运动是你还没有充分拉动的杠杆"
  },
  "Health Habits": {
    body:
      "几个具体的小习惯调整，而不是彻底重塑生活方式，就能提升这一项并带动总分。",
    headline: "几个日常习惯正在消耗你的分数"
  },
  "Nutrition & Diet": {
    body:
      "饮食上的几个精准改变可以很快推动这一项。你的计划会说明哪些改变真正与你有关。",
    headline: "你的餐盘还有可提升的空间"
  },
  "Sleep & Recovery": {
    body:
      "睡眠短或不连续会限制其他努力的效果。这是最容易推动分数变化的部分之一。",
    headline: "你的恢复时间还不够"
  },
  "Stress & Balance": {
    body:
      "较高的压力正在悄悄消耗你想要的精力和专注力。它是当前拖累分数最大的因素。",
    headline: "这是目前最低的核心支柱"
  }
};

const PILLAR_STRENGTH: Record<PillarName, string> = {
  "Activity & Fitness":
    "Your activity is strong at {value}%. That foundation means your plan can focus on refinement, not catch-up.",
  "Health Habits":
    "A note worth hearing: your Health Habits score is {value}%. You have a strong foundation; it just needs to be pointed in the right direction.",
  "Nutrition & Diet":
    "Your diet is already working for you at {value}%. The plan sharpens it rather than rebuilding it.",
  "Sleep & Recovery":
    "Your sleep is genuinely solid at {value}%. Your plan builds on it rather than fixing it.",
  "Stress & Balance":
    "You manage stress well at {value}%, a quiet advantage that makes every other change easier to sustain."
};

const PILLAR_STRENGTH_TH: Record<PillarName, string> = {
  "Activity & Fitness":
    "กิจกรรมของคุณแข็งแรงที่ {value}% แผนจึงเน้นการปรับให้คมขึ้น ไม่ใช่เริ่มใหม่ทั้งหมด",
  "Health Habits":
    "จุดที่ควรเห็น: พฤติกรรมสุขภาพของคุณอยู่ที่ {value}% คุณมีฐานที่ดี แค่ต้องชี้ไปให้ถูกทิศ",
  "Nutrition & Diet":
    "อาหารของคุณทำงานให้คุณแล้วที่ {value}% แผนจะปรับให้คมขึ้นมากกว่ารื้อใหม่",
  "Sleep & Recovery":
    "การนอนของคุณถือว่าแน่นที่ {value}% แผนจะต่อยอดจากจุดนี้",
  "Stress & Balance":
    "คุณจัดการความเครียดได้ดีที่ {value}% ซึ่งช่วยให้การเปลี่ยนแปลงอื่นทำได้ต่อเนื่องขึ้น"
};

const PILLAR_STRENGTH_ZH: Record<PillarName, string> = {
  "Activity & Fitness":
    "你的活动基础达到 {value}%。这意味着计划可以专注于优化，而不是从头追赶。",
  "Health Habits":
    "值得注意的是：你的健康习惯得分为 {value}%。你已经有不错的基础，只需要把方向指得更准。",
  "Nutrition & Diet":
    "你的饮食已经在发挥作用，得分为 {value}%。计划会让它更精准，而不是推倒重来。",
  "Sleep & Recovery":
    "你的睡眠基础相当扎实，得分为 {value}%。计划会在此基础上继续加强，而不是把它当成问题修补。",
  "Stress & Balance":
    "你的压力管理达到 {value}%，这是一个安静但重要的优势，会让其他改变更容易坚持。"
};

const FINDINGS: Record<string, {
  body: string;
  headline: string;
  icon: string;
  tier: number;
}> = {
  BLOODTHINNER: {
    body:
      "Because you reported a blood thinner, your plan is routed carefully around vitamin K and high-dose fish oil, which can interact with it. Safety is applied first, before anything is recommended.",
    headline: "Your medication sets a clear safety boundary.",
    icon: "*",
    tier: 1
  },
  DIURETIC_MIN: {
    body:
      "Diuretics can lower magnesium and potassium over time. Your plan keeps an eye on those minerals so your formula complements your medication rather than working against it.",
    headline: "Your medication affects a couple of key minerals.",
    icon: "sun",
    tier: 3
  },
  ENERGY_UPSTREAM: {
    body:
      "Your low energy lines up with {energy_causes}, not a missing stimulant. Your plan works the actual sequence: steady the stress load, support deeper sleep, and ease movement back in.",
    headline: "Your energy problem is not a caffeine problem.",
    icon: "◎",
    tier: 2
  },
  KIDNEY_CEILING: {
    body:
      "Because you reported reduced kidney function, several minerals are kept within careful dose ceilings. Your plan is built to support you without crossing that line.",
    headline: "Your plan respects a hard safety boundary.",
    icon: "*",
    tier: 4
  },
  LIVER_ROUTING: {
    body:
      "With a liver condition noted, certain botanicals and doses are handled with extra caution. Safety is applied as a filter first.",
    headline: "Your plan routes carefully around liver safety.",
    icon: "*",
    tier: 4
  },
  METFORMIN_B12: {
    body:
      "Long-term metformin use is associated with lower vitamin B12 over time. Your plan factors that in, so your formula reflects how your body handles nutrients.",
    headline: "Your medication shapes one specific nutrient choice.",
    icon: "*",
    tier: 1
  },
  PLANT_OMEGA_B12: {
    body:
      "Eating mostly plant-based with little oily fish makes omega-3 and vitamin B12 the two nutrients worth getting right. Your plan emphasises exactly these.",
    headline: "Your plant-forward diet has two specific blind spots.",
    icon: "sun",
    tier: 3
  },
  PPI_B12_MAG: {
    body:
      "You reported a PPI, which over time can affect how well you absorb vitamin B12 and magnesium. Your plan accounts for that rather than assuming everything you take is fully absorbed.",
    headline: "Your medication quietly affects how you absorb nutrients.",
    icon: "*",
    tier: 1
  },
  PREGNANCY: {
    body:
      "Because you are pregnant or breastfeeding, every ingredient is screened against strict safety rules. This is the most conservative routing we apply.",
    headline: "Your plan follows strict pregnancy-safe routing.",
    icon: "*",
    tier: 4
  },
  SLEEP_UPSTREAM: {
    body:
      "Your answers put short or restless sleep at the centre of the pattern. Your plan treats it as the lever it is because lifting sleep tends to pull energy, focus, and mood up with it.",
    headline: "Better sleep is upstream of almost everything you asked for.",
    icon: "◎",
    tier: 2
  },
  STATIN_COQ10: {
    body:
      "Because you reported a statin and low energy, your plan does not get a generic stack. It specifically reviews CoQ10 alongside heart-aware nutrient choices.",
    headline: "Your statin answer changed the entire review.",
    icon: "*",
    tier: 1
  },
  VITD_ROUTINE: {
    body:
      "Daily sunscreen, limited time in the sun, and low oily-fish intake all point the same way. Your formula is built around how you actually live, not just your age and sex.",
    headline: "Your daily routine shapes your formula.",
    icon: "sun",
    tier: 3
  },
  WEIGHT_PATTERN: {
    body:
      "Your pattern points less to willpower and more to the daily rhythm around movement, sleep, and meals. Your plan targets that rhythm rather than handing you another restrictive rulebook.",
    headline: "Your weight goal is really a consistency goal.",
    icon: "◎",
    tier: 2
  }
};

const FINDING_TEXT_TH: Record<string, { body: string; headline: string }> = {
  BLOODTHINNER: {
    body:
      "เพราะคุณระบุว่าใช้ยาละลายลิ่มเลือด แผนจะระวังวิตามิน K และน้ำมันปลาขนาดสูงเป็นพิเศษ โดยใช้ความปลอดภัยเป็นตัวกรองแรก",
    headline: "ยาของคุณกำหนดขอบเขตความปลอดภัยที่ชัดเจน"
  },
  DIURETIC_MIN: {
    body:
      "ยาขับปัสสาวะอาจทำให้แมกนีเซียมและโพแทสเซียมลดลงเมื่อใช้ต่อเนื่อง แผนจึงจับตาแร่ธาตุเหล่านี้",
    headline: "ยาของคุณเกี่ยวข้องกับแร่ธาตุสำคัญบางตัว"
  },
  ENERGY_UPSTREAM: {
    body:
      "พลังงานต่ำของคุณสัมพันธ์กับ {energy_causes} ไม่ใช่การขาดตัวกระตุ้น แผนจึงจัดการลำดับจริง: ลดภาระความเครียด หนุนการนอน และค่อยๆ เพิ่มการเคลื่อนไหว",
    headline: "ปัญหาพลังงานของคุณไม่ใช่ปัญหาคาเฟอีน"
  },
  KIDNEY_CEILING: {
    body:
      "เพราะคุณระบุการทำงานของไตที่ลดลง แร่ธาตุบางตัวจะถูกจำกัดอย่างระมัดระวัง แผนถูกสร้างให้ช่วยโดยไม่ข้ามเส้นนี้",
    headline: "แผนของคุณเคารพขอบเขตความปลอดภัยที่แข็งแรง"
  },
  LIVER_ROUTING: {
    body:
      "เมื่อมีภาวะตับในคำตอบ สมุนไพรและปริมาณบางอย่างจะถูกจัดการอย่างระมัดระวังเป็นพิเศษ",
    headline: "แผนของคุณเดินอย่างระวังรอบความปลอดภัยของตับ"
  },
  METFORMIN_B12: {
    body:
      "การใช้เมตฟอร์มินต่อเนื่องสัมพันธ์กับระดับวิตามิน B12 ที่ลดลง แผนจึงนำเรื่องนี้เข้ามาคิดด้วย",
    headline: "ยาของคุณเปลี่ยนการเลือกสารอาหารหนึ่งตัวโดยตรง"
  },
  PLANT_OMEGA_B12: {
    body:
      "การกินแบบเน้นพืชและปลามันน้อยทำให้โอเมก้า 3 และวิตามิน B12 เป็นสองจุดที่ควรทำให้ถูก",
    headline: "อาหารแบบเน้นพืชของคุณมีสองช่องว่างที่ชัดเจน"
  },
  PPI_B12_MAG: {
    body:
      "คุณระบุว่าใช้ PPI ซึ่งอาจเกี่ยวกับการดูดซึมวิตามิน B12 และแมกนีเซียมเมื่อใช้ต่อเนื่อง แผนจึงไม่ถือว่าทุกอย่างดูดซึมได้เท่ากัน",
    headline: "ยาของคุณมีผลเงียบๆ ต่อการดูดซึมสารอาหาร"
  },
  PREGNANCY: {
    body:
      "เพราะคุณตั้งครรภ์หรือให้นม ทุกส่วนผสมจะถูกคัดผ่านกฎความปลอดภัยที่เข้มที่สุด",
    headline: "แผนของคุณใช้เส้นทางที่ระมัดระวังสำหรับการตั้งครรภ์"
  },
  SLEEP_UPSTREAM: {
    body:
      "คำตอบของคุณทำให้การนอนสั้นหรือไม่สนิทเป็นศูนย์กลางของรูปแบบคะแนน การยกการนอนมักดึงพลังงาน โฟกัส และอารมณ์ขึ้นด้วย",
    headline: "การนอนที่ดีขึ้นอยู่ต้นน้ำของหลายเป้าหมาย"
  },
  STATIN_COQ10: {
    body:
      "เพราะคุณระบุว่ายา statin และพลังงานต่ำ แผนของคุณจึงไม่ใช่ชุดทั่วไป แต่จะพิจารณา CoQ10 ร่วมกับสารอาหารที่ระวังเรื่องหัวใจ",
    headline: "คำตอบเรื่อง statin เปลี่ยนทั้งการทบทวน"
  },
  VITD_ROUTINE: {
    body:
      "กันแดดทุกวัน เวลาโดนแดดจำกัด และปลามันน้อยชี้ไปทางเดียวกัน สูตรจึงอิงชีวิตจริงของคุณ ไม่ใช่แค่อายุและเพศ",
    headline: "กิจวัตรประจำวันของคุณมีผลต่อสูตร"
  },
  WEIGHT_PATTERN: {
    body:
      "รูปแบบของคุณชี้ไปที่จังหวะชีวิตเรื่องการเคลื่อนไหว การนอน และมื้ออาหาร มากกว่าปัญหาวินัย แผนจึงเน้นจังหวะนั้น",
    headline: "เป้าหมายน้ำหนักของคุณคือเป้าหมายเรื่องความสม่ำเสมอ"
  }
};

const ENERGY_CAUSE: Record<string, string> = {
  activity: "light activity",
  sleep: "short sleep",
  stress: "high stress"
};

const ENERGY_CAUSE_TH: Record<string, string> = {
  activity: "กิจกรรมที่ยังเบา",
  sleep: "การนอนที่สั้น",
  stress: "ความเครียดสูง"
};

const ENERGY_CAUSE_ZH: Record<string, string> = {
  activity: "活动量偏低",
  sleep: "睡眠时间偏短",
  stress: "压力偏高"
};

const FINDING_TEXT_ZH: Record<string, { body: string; headline: string }> = {
  BLOODTHINNER: {
    body:
      "因为你报告正在使用抗凝药，计划会谨慎处理维生素 K 和高剂量鱼油等可能相互作用的内容。安全会先于任何推荐被应用。",
    headline: "你的用药设定了清晰的安全边界。"
  },
  DIURETIC_MIN: {
    body:
      "利尿剂长期使用可能影响镁和钾水平。你的计划会关注这些矿物质，让方案与用药相配合，而不是相冲突。",
    headline: "你的用药会影响几个关键矿物质。"
  },
  ENERGY_UPSTREAM: {
    body:
      "你的低精力更符合{energy_causes}的模式，而不是缺少刺激物。计划会处理真正的顺序：稳定压力负荷、支持更深睡眠，并逐步恢复活动。",
    headline: "你的精力问题不是咖啡因问题。"
  },
  KIDNEY_CEILING: {
    body:
      "因为你报告肾功能下降，几类矿物质会被控制在谨慎剂量上限内。你的计划会在不跨越这条线的前提下提供支持。",
    headline: "你的计划尊重明确的安全边界。"
  },
  LIVER_ROUTING: {
    body:
      "当答案中提到肝脏状况时，某些草本成分和剂量会被额外谨慎处理。安全会作为第一道过滤条件。",
    headline: "你的计划会谨慎绕开肝脏安全风险。"
  },
  METFORMIN_B12: {
    body:
      "长期使用二甲双胍与维生素 B12 水平下降有关。你的计划会纳入这一点，使方案反映身体处理营养的方式。",
    headline: "你的用药影响了一个具体营养选择。"
  },
  PLANT_OMEGA_B12: {
    body:
      "以植物性饮食为主且油性鱼类摄入较少时，Omega-3 和维生素 B12 是最值得做对的两个营养点。你的计划会重点关注它们。",
    headline: "你的植物性饮食有两个明确盲点。"
  },
  PPI_B12_MAG: {
    body:
      "你报告正在使用 PPI，长期来看可能影响维生素 B12 和镁的吸收。你的计划会考虑这一点，而不是假设摄入的一切都能充分吸收。",
    headline: "你的用药会悄悄影响营养吸收。"
  },
  PREGNANCY: {
    body:
      "因为你处于怀孕或哺乳期，每一种成分都会按严格安全规则筛查。这是我们最保守的安全路径。",
    headline: "你的计划遵循严格的孕哺期安全路径。"
  },
  SLEEP_UPSTREAM: {
    body:
      "你的答案显示，睡眠短或不安稳处在整个模式的中心。计划会把睡眠视为关键杠杆，因为睡眠改善通常会带动精力、专注和情绪。",
    headline: "更好的睡眠位于几乎所有目标的上游。"
  },
  STATIN_COQ10: {
    body:
      "因为你报告使用他汀且精力偏低，你的计划不会给出通用组合，而会专门审视 CoQ10 与心血管相关营养选择。",
    headline: "你的他汀答案改变了整个评估。"
  },
  VITD_ROUTINE: {
    body:
      "每天防晒、日晒时间有限、油性鱼类摄入少，都指向同一个方向。你的方案会围绕真实生活方式构建，而不只是年龄和性别。",
    headline: "你的日常习惯影响方案。"
  },
  WEIGHT_PATTERN: {
    body:
      "你的模式更像是活动、睡眠和饮食节奏的问题，而不是意志力问题。计划会针对这种节奏，而不是再给你一套限制性规则。",
    headline: "你的体重目标本质上是一个一致性目标。"
  }
};

function localizedFindingCopy(code: string, locale: Locale) {
  const base = FINDINGS[code];
  const localized =
    locale === "th"
      ? FINDING_TEXT_TH[code]
      : locale === "zh-CN"
        ? FINDING_TEXT_ZH[code]
        : undefined;

  return base && localized
    ? { ...base, ...localized }
    : base;
}

export const HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS = [
  "bloodwork",
  "blood work",
  "get tested",
  "lab test",
  "lab result",
  "unmeasured",
  "capped",
  "can't rise",
  "locked",
  "deficien"
] as const;

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).filter((item) => item && item !== "none")
    : [];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function optionScore(value: string, scores: Record<string, number>, fallback: number) {
  return scores[value] ?? fallback;
}

function oxford(items: readonly string[]) {
  const clean = items.filter(Boolean);

  if (clean.length <= 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;

  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function fmt(template: string, context: Record<string, string | number>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
    context[key] === undefined ? match : String(context[key])
  );
}

function titleCaseFirst(value: string) {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : value;
}

function ageBand(age: string) {
  return ({
    "18-25": "u30",
    "26-35": "30s",
    "36-45": "40s",
    "46-55": "50s",
    "56-65": "60+",
    "66+": "60+"
  }[age] ?? "40s");
}

function normalizeCountry(value: unknown) {
  const country = text(value);

  return ({
    ID: "Indonesia",
    MY: "Malaysia",
    PH: "Philippines",
    SG: "Singapore",
    TH: "Thailand",
    VN: "Vietnam"
  }[country] ?? country);
}

function normalizeLabValue(key: string, value: number, unit: string) {
  const normalizedUnit = unit.trim().toLowerCase();
  const normalizedKey = key.startsWith("lab_") ? key.slice(4) : key;

  if ((normalizedKey === "vitd" || normalizedKey === "vitaminD") && normalizedUnit === "nmol/l") {
    return value / 2.5;
  }

  if (normalizedKey === "b12" && normalizedUnit === "pmol/l") {
    return value / 0.738;
  }

  if (normalizedKey === "hba1c" && normalizedUnit === "mmol/mol") {
    return (value + 46.7) / 28.7;
  }

  if ((normalizedKey === "homo" || normalizedKey === "homocysteine") && normalizedUnit === "mg/l") {
    return value * 7.398;
  }

  return value;
}

function labNumber(
  labs: Record<string, unknown>,
  labUnits: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const raw = labs[key];
    const record = asRecord(raw);
    const value = Object.keys(record).length > 0 ? record.value : raw;
    const parsed = numberValue(value);
    const unit = text(labUnits[key]) || text(record.unit);

    if (parsed !== null) {
      return normalizeLabValue(key, parsed, unit);
    }
  }

  return 0;
}

function normalizeAnswers(answersInput: unknown): NormalizedAnswers {
  const answers = asRecord(answersInput);
  const labs = { ...answers, ...asRecord(answers.labs) };
  const labUnits = asRecord(answers.labUnits);
  const foodFrequency = asRecord(answers.foodFrequency);
  const sex = text(answers.sex) === "female" ? "female" : "male";

  return {
    activity: text(answers.activity) || "moderate",
    age: text(answers.age) || "36-45",
    alcohol: text(answers.alcohol) || "1-3",
    caffeine: text(answers.caffeine) || "2-3",
    country: normalizeCountry(answers.country) || "Thailand",
    diet: text(answers.diet) || "balanced",
    digestion: text(answers.digestion) || "none",
    energy: text(answers.energy) || "ok",
    fEggs: text(answers.f_eggs) || text(foodFrequency.eggs) || "1-2",
    fFish: text(answers.f_fish) || text(answers.fish) || text(foodFrequency.fish) || "rare",
    fFruitVeg:
      text(answers.f_fruitveg) || text(foodFrequency.fruitveg) || "1-2",
    fLegumes: text(answers.f_legumes) || text(foodFrequency.legumes) || "1-2",
    goals: arrayValue(answers.goals).slice(0, 3),
    hrv: numberValue(answers.hrv) ?? numberValue(labs.hrv) ?? 0,
    kidney: text(answers.kidney) || "normal",
    labB12: labNumber(labs, labUnits, "b12", "lab_b12"),
    labFerritin: labNumber(labs, labUnits, "ferritin", "lab_ferritin"),
    labHba1c: labNumber(labs, labUnits, "hba1c", "lab_hba1c"),
    labHomo: labNumber(labs, labUnits, "homo", "homocysteine", "lab_homo"),
    labO3: labNumber(labs, labUnits, "o3", "omega3", "lab_o3"),
    labVitd: labNumber(labs, labUnits, "vitd", "vitaminD", "lab_vitd"),
    liver: text(answers.liver) || "normal",
    medTypes: arrayValue(answers.medTypes),
    protein: text(answers.protein),
    reproStatus: text(answers.reproStatus) || "none",
    sex,
    sleepHrs: text(answers.sleepHrs) || "7-8",
    smoking: text(answers.smoking) || "never",
    stress: text(answers.stress) || "moderate",
    sun: text(answers.sun) || "15-30",
    sunscreen: text(answers.sunscreen) || "sometimes",
    symptoms: arrayValue(answers.symptoms),
    vo2: numberValue(answers.vo2) ?? numberValue(labs.vo2) ?? 0
  };
}

function pillarSleep(a: NormalizedAnswers): PillarScore {
  const rows: Array<readonly [string, number, number]> = [];
  const duration = optionScore(
    a.sleepHrs,
    { "5-6": 5, "6-7": 8, "7-8": 9, "8-9": 8, "9+": 7, u5: 2 },
    5
  );
  rows.push(["Sleep duration", duration, 9]);
  const energy = optionScore(
    a.energy,
    { drained: 0, excellent: 6, good: 5, low: 2, ok: 4 },
    4
  );
  rows.push(["Daytime energy (recovery proxy)", energy, 6]);

  return {
    earned: rows.reduce((sum, row) => sum + row[1], 0),
    id: "sleep",
    max: 15,
    name: "Sleep & Recovery",
    pct: rows.reduce((sum, row) => sum + row[1], 0) / 15,
    rows
  };
}

function pillarActivity(a: NormalizedAnswers): PillarScore {
  const earned = optionScore(
    a.activity,
    { active: 12, athlete: 14, light: 6, moderate: 9, sitting: 2 },
    6
  );

  return {
    earned,
    id: "activity",
    max: 14,
    name: "Activity & Fitness",
    pct: earned / 14,
    rows: [["Activity level", earned, 14]]
  };
}

function pillarNutrition(a: NormalizedAnswers): PillarScore {
  const rows: Array<readonly [string, number, number]> = [];
  const diet = optionScore(
    a.diet,
    {
      balanced: 6,
      carnivore: 4,
      mediterranean: 8,
      plant: 7,
      processed: 2,
      vegan: 6,
      whole: 8
    },
    5
  );
  rows.push(["Diet pattern", diet, 8]);
  rows.push([
    "Oily fish frequency",
    optionScore(a.fFish, { never: 1, often: 5, once: 4, rare: 3 }, 3),
    5
  ]);
  rows.push([
    "Fruit & vegetables",
    optionScore(
      a.fFruitVeg,
      { "1-2": 2, "3+": 3, most: 3, never: 0, notdaily: 1, rare: 1, weekly: 2 },
      2
    ),
    3
  ]);
  const legumes = optionScore(
    a.fLegumes,
    { "1-2": 1, "3+": 1, most: 1, weekly: 1 },
    0
  );
  const eggs = optionScore(a.fEggs, { "3+": 1, most: 1 }, 0);
  rows.push(["Legumes / eggs variety", Math.min(legumes + eggs, 2), 2]);

  const earned = rows.reduce((sum, row) => sum + row[1], 0);

  return {
    earned,
    id: "nutrition",
    max: 18,
    name: "Nutrition & Diet",
    pct: earned / 18,
    rows
  };
}

function pillarStress(a: NormalizedAnswers): PillarScore {
  const earned = optionScore(
    a.stress,
    { extreme: 2, high: 5, low: 11, moderate: 9, verylow: 13 },
    9
  );

  return {
    earned,
    id: "stress",
    max: 13,
    name: "Stress & Balance",
    pct: earned / 13,
    rows: [["Stress level", earned, 13]]
  };
}

function pillarHabits(a: NormalizedAnswers): PillarScore {
  const rows: Array<readonly [string, number, number]> = [];
  rows.push([
    "Smoking status",
    optionScore(
      a.smoking,
      { daily: 0, "ex5+": 6, ex5: 5, never: 7, occasional: 3 },
      5
    ),
    7
  ]);
  rows.push([
    "Alcohol / week",
    optionScore(a.alcohol, { "1-3": 3, "4-7": 2, "8+": 0, none: 3 }, 2),
    3
  ]);
  rows.push([
    "Caffeine load",
    optionScore(a.caffeine, { "1": 2, "2-3": 2, "4+": 1, none: 2 }, 2),
    2
  ]);
  const sunOk = (a.sun === "30-60" || a.sun === "60+") && a.sunscreen !== "daily";
  rows.push(["Sun-exposure behaviour", sunOk ? 2 : 1, 2]);
  rows.push(["Digestive comfort", a.digestion === "none" ? 1 : 0.5, 1]);

  const earned = rows.reduce((sum, row) => sum + row[1], 0);

  return {
    earned,
    id: "habits",
    max: 15,
    name: "Health Habits",
    pct: earned / 15,
    rows
  };
}

function labPoints(
  rows: Array<readonly [string, number, number]>,
  name: string,
  value: number,
  full: number,
  optLo: number,
  optHi?: number,
  goodLo?: number
) {
  if (!value) {
    rows.push([`${name} (not provided)`, 0, full]);
    return 0;
  }

  const ok = optHi === undefined ? value <= optLo : value >= optLo && value <= optHi;
  const points = ok
    ? full
    : goodLo !== undefined && value >= goodLo
      ? round1(full * 0.35)
      : round1(full * 0.25);

  rows.push([`${name} (measured)`, points, full]);
  return points;
}

function verification(a: NormalizedAnswers) {
  const rows: Array<readonly [string, number, number]> = [];
  let total = 0;

  total += labPoints(rows, "Vitamin D", a.labVitd, 4, 50, 80, 30);
  total += labPoints(rows, "Vitamin B12", a.labB12, 2, 400, 900, 300);
  total += labPoints(rows, "Ferritin", a.labFerritin, 2, 50, 150, 30);
  total += labPoints(rows, "HbA1c", a.labHba1c, 4, 5.4, undefined, 5.7);
  total += labPoints(rows, "Omega-3 Index", a.labO3, 3, 8, 12, 5);
  total += labPoints(rows, "Homocysteine", a.labHomo, 2, 8, undefined, 12);

  if (a.vo2) {
    const good = VO2_GOOD[`${a.sex}:${ageBand(a.age)}`] ?? 39;
    const points = a.vo2 >= good ? 5 : a.vo2 >= good * 0.88 ? 3 : 1.5;
    rows.push(["VO2max (measured)", points, 5]);
    total += points;
  } else {
    rows.push(["VO2max (not provided)", 0, 5]);
  }

  if (a.hrv) {
    const points = a.hrv >= 70 ? 2 : a.hrv >= 50 ? 1 : 0.5;
    rows.push(["HRV (measured)", points, 2]);
    total += points;
  } else {
    rows.push(["HRV (not provided)", 0, 2]);
  }

  const protein = optionScore(a.protein, { "1-1.5": 1.5, "1.5-2": 3, "2+": 3 }, 0);
  rows.push([a.protein ? "Protein adequacy" : "Protein (not provided)", protein, 3]);
  total += protein;

  return { earned: round1(total), max: 25, rows };
}

function symptomMultiplier(a: NormalizedAnswers) {
  const symptoms = a.symptoms.filter((symptom) => symptom !== "great");

  if (a.symptoms.includes("great") && symptoms.length < 1) {
    return { count: 0, multiplier: 1 };
  }

  if (symptoms.length <= 0) return { count: 0, multiplier: 1 };
  if (symptoms.length <= 2) return { count: symptoms.length, multiplier: 0.95 };
  if (symptoms.length <= 4) return { count: symptoms.length, multiplier: 0.88 };

  return { count: symptoms.length, multiplier: 0.82 };
}

function safetyFlagCodes(a: NormalizedAnswers) {
  const codes: string[] = [];
  const lowEnergy = a.energy === "low" || a.energy === "drained" || a.symptoms.includes("fatigue");

  if (a.medTypes.includes("statin") && lowEnergy) codes.push("STATIN_COQ10");
  if (a.medTypes.includes("ppi")) codes.push("PPI_B12_MAG");
  if (a.medTypes.includes("metformin")) codes.push("METFORMIN_B12");
  if (a.medTypes.includes("diuretic")) codes.push("DIURETIC_MIN");
  if (a.medTypes.includes("bloodthinner")) codes.push("BLOODTHINNER");
  if ((a.diet === "vegan" || a.diet === "plant") && (a.fFish === "never" || a.fFish === "rare")) {
    codes.push("PLANT_OMEGA_B12");
  }

  if (
    a.sunscreen === "daily" &&
    (a.sun === "u15" || a.sun === "15-30") &&
    ["Indonesia", "Malaysia", "Philippines", "Singapore", "Thailand", "Vietnam"].includes(a.country)
  ) {
    codes.push("VITD_ROUTINE");
  }

  if (a.kidney === "reduced" || a.kidney === "disease") codes.push("KIDNEY_CEILING");
  if (a.liver === "condition") codes.push("LIVER_ROUTING");
  if (a.reproStatus === "pregnant" || a.reproStatus === "breastfeeding") codes.push("PREGNANCY");

  return codes;
}

function scoreEngine(a: NormalizedAnswers): EngineResult {
  const pillars = [
    pillarSleep(a),
    pillarActivity(a),
    pillarNutrition(a),
    pillarStress(a),
    pillarHabits(a)
  ];
  const base = Object.fromEntries(pillars.map((pillar) => [pillar.name, pillar.max])) as Record<PillarName, number>;
  const baseTotal = Object.values(base).reduce((sum, value) => sum + value, 0);
  const weights = Object.fromEntries(
    (Object.keys(base) as PillarName[]).map((name) => [name, base[name] / baseTotal])
  ) as Record<PillarName, number>;
  const matched = new Set<PillarName>();

  for (const goal of a.goals.slice(0, 3)) {
    for (const pillar of GOAL_MAP[goal] ?? []) {
      matched.add(pillar);
    }
  }

  const adjustedRaw = Object.fromEntries(
    (Object.keys(weights) as PillarName[]).map((name) => [
      name,
      matched.has(name) ? weights[name] * 1.3 : weights[name]
    ])
  ) as Record<PillarName, number>;
  const adjustedTotal = Object.values(adjustedRaw).reduce((sum, value) => sum + value, 0);
  const adjustedWeights = Object.fromEntries(
    (Object.keys(adjustedRaw) as PillarName[]).map((name) => [
      name,
      adjustedRaw[name] / adjustedTotal
    ])
  ) as Record<PillarName, number>;
  const weightedPct = pillars.reduce(
    (sum, pillar) => sum + adjustedWeights[pillar.name] * pillar.pct,
    0
  );
  const selfReport = weightedPct * 86;
  const verificationEarned = round1((verification(a).earned * 18) / 25);
  const raw = selfReport + verificationEarned;
  const symptoms = symptomMultiplier(a);
  const final = Math.round(clamp(raw * symptoms.multiplier, 30, 92));
  const band =
    final >= 82
      ? "Excellent"
      : final >= 70
        ? "Strong, with headroom"
        : final >= 58
          ? "Good, with a clear gap"
          : final >= 46
            ? "Building foundation"
            : "Needs attention";

  return {
    adjustedWeights,
    band,
    final,
    flagCodes: safetyFlagCodes(a),
    matched,
    multiplier: symptoms.multiplier,
    raw: round1(raw),
    selfReport: round1(selfReport),
    symptomCount: symptoms.count,
    verification: verificationEarned,
    pillars
  };
}

function pillarLabel(name: PillarName, locale: Locale) {
  if (locale === "th") {
    return PILLAR_LABEL_TH[name];
  }
  if (locale === "zh-CN") {
    return PILLAR_LABEL_ZH[name];
  }
  return PILLAR_LABEL_EN[name];
}

function buildPillars(result: EngineResult, goals: readonly string[], locale: Locale) {
  return result.pillars
    .map((pillar) => {
      const linkedGoals = goals.filter((goal) =>
        GOAL_PILLARS[pillar.name].includes(goal)
      );
      const tag =
        linkedGoals.length >= 3
          ? locale === "th"
            ? "ทั้ง 3 เป้าหมาย"
            : locale === "zh-CN"
              ? "全部 3 个目标"
              : "all 3 goals"
          : linkedGoals.length > 0
            ? linkedGoals.map((goal) => localizedGoalTag(goal, locale)).join(" / ")
            : null;

      return {
        goalLinked: linkedGoals.length > 0,
        id: PILLAR_ID[pillar.name],
        label: pillarLabel(pillar.name, locale),
        name: pillar.name,
        tag,
        value: Math.round(pillar.pct * 100)
      };
    })
    .sort((first, second) => second.value - first.value);
}

function buildFindings(
  answers: NormalizedAnswers,
  result: EngineResult,
  locale: Locale
) {
  const pool: Array<readonly [number, string, HealthScoreFinding]> = [];
  const symptoms = answers.symptoms.filter((symptom) => symptom !== "great");

  for (const code of result.flagCodes) {
    const finding = localizedFindingCopy(code, locale);

    if (finding) {
      pool.push([
        finding.tier,
        code,
        {
          body: finding.body,
          code,
          headline: finding.headline,
          icon: finding.icon
        }
      ]);
    }
  }

  const lowEnergy =
    answers.energy === "low" ||
    answers.energy === "drained" ||
    symptoms.includes("fatigue");

  if (answers.goals.includes("energy") && lowEnergy) {
    const causes = [
      answers.stress === "high" || answers.stress === "extreme" ? "stress" : "",
      answers.sleepHrs === "u5" || answers.sleepHrs === "5-6" ? "sleep" : "",
      answers.activity === "sitting" || answers.activity === "light" ? "activity" : ""
    ].filter(Boolean);

    if (causes.length > 0) {
      const finding = localizedFindingCopy("ENERGY_UPSTREAM", locale);

      if (finding) {
        pool.push([
          finding.tier,
          "ENERGY_UPSTREAM",
          {
            body: fmt(finding.body, {
              energy_causes: localizedList(
                causes.map((cause) =>
                  locale === "th"
                    ? (ENERGY_CAUSE_TH[cause] ?? cause)
                    : locale === "zh-CN"
                      ? (ENERGY_CAUSE_ZH[cause] ?? cause)
                    : (ENERGY_CAUSE[cause] ?? cause)
                ),
                locale
              )
            }),
            code: "ENERGY_UPSTREAM",
            headline: finding.headline,
            icon: finding.icon
          }
        ]);
      }
    }
  }

  if (answers.goals.includes("sleep") && ["u5", "5-6", "6-7"].includes(answers.sleepHrs)) {
    const finding = localizedFindingCopy("SLEEP_UPSTREAM", locale);

    if (finding) {
      pool.push([
        finding.tier,
        "SLEEP_UPSTREAM",
        {
          body: finding.body,
          code: "SLEEP_UPSTREAM",
          headline: finding.headline,
          icon: finding.icon
        }
      ]);
    }
  }

  if (answers.goals.includes("weight")) {
    const finding = localizedFindingCopy("WEIGHT_PATTERN", locale);

    if (finding) {
      pool.push([
        finding.tier,
        "WEIGHT_PATTERN",
        {
          body: finding.body,
          code: "WEIGHT_PATTERN",
          headline: finding.headline,
          icon: finding.icon
        }
      ]);
    }
  }

  const unique: Array<readonly [number, string, HealthScoreFinding]> = [];
  const seen = new Set<string>();

  for (const item of pool.sort((first, second) => first[0] - second[0])) {
    if (!seen.has(item[1])) {
      unique.push(item);
      seen.add(item[1]);
    }
  }

  let chosen = unique.slice(0, 3);
  const tierOne = result.flagCodes.filter((code) => FINDINGS[code]?.tier === 1);

  if (tierOne.length > 0 && !tierOne.includes(chosen[0]?.[1] ?? "")) {
    const lead = tierOne[0];
    const leadFinding = localizedFindingCopy(lead, locale);
    if (!leadFinding) {
      return chosen.map((item) => item[2]);
    }
    chosen = [
      [
        1,
        lead,
        {
          body: leadFinding.body,
          code: lead,
          headline: leadFinding.headline,
          icon: leadFinding.icon
        }
      ],
      ...chosen.filter((item) => item[1] !== lead).slice(0, 2)
    ];
  }

  return chosen.map((item) => item[2]);
}

function buildStrengthFindings(
  pillars: Array<HealthScorePillarContent & { name: PillarName }>,
  locale: Locale
) {
  return pillars
    .slice()
    .sort((first, second) => second.value - first.value)
    .slice(0, 2)
    .map((pillar) => ({
        body: fmt(
          locale === "th"
            ? PILLAR_STRENGTH_TH[pillar.name]
            : locale === "zh-CN"
              ? PILLAR_STRENGTH_ZH[pillar.name]
            : PILLAR_STRENGTH[pillar.name],
          { value: pillar.value }
        ),
        code: `STRENGTH_${pillar.id.toUpperCase()}`,
        headline:
          locale === "th"
            ? `${pillar.label} เป็นจุดแข็งสำคัญของคุณ`
            : locale === "zh-CN"
              ? `${pillar.label}正在承担重要作用。`
              : `${pillar.label} is doing the heavy lifting.`,
      icon: "check"
    }));
}

function highestLeverage(
  pillars: Array<HealthScorePillarContent & { name: PillarName }>,
  goals: readonly string[],
  locale: Locale
) {
  const candidates = pillars.filter((pillar) => pillar.goalLinked);

  if (candidates.length < 1) return null;

  const hero = candidates.slice().sort((first, second) => first.value - second.value)[0];

  if (hero.value >= 70) return null;

  const goalList = localizedList(
    goals.slice(0, 3).map((goal) => localizedGoalPhrase(goal, locale)),
    locale
  );

  return {
    pillar: hero.label,
    text: locale === "th"
      ? `จุดที่ให้แรงส่งสูงที่สุด: ${hero.label} อยู่ที่ ${hero.value}% และเชื่อมกับเป้าหมายของคุณโดยตรง เมื่อเสาหลักนี้ขยับ ${goalList} จะขยับไปด้วย`
      : locale === "zh-CN"
        ? `最高杠杆点：${hero.label} 目前为 ${hero.value}%，并且直接连接你的目标。提升这一项，${goalList}会一起移动。这不是巧合，而是你答案呈现出的模式。`
        : `Your highest-leverage move: ${hero.label} sits at ${hero.value}% and every one of your goals routes through it. Lift this one pillar and ${goalList} all move together. That is not a coincidence in your results; it is the shape of your answers.`,
    value: hero.value
  };
}

function strengthNote(
  pillars: Array<HealthScorePillarContent & { name: PillarName }>,
  locale: Locale
) {
  const nonGoalStrength = pillars.find((pillar) => pillar.value >= 80 && !pillar.goalLinked);
  const top = nonGoalStrength ?? pillars.find((pillar) => pillar.value >= 80);

  return top
    ? fmt(
        locale === "th"
          ? PILLAR_STRENGTH_TH[top.name]
          : locale === "zh-CN"
            ? PILLAR_STRENGTH_ZH[top.name]
          : PILLAR_STRENGTH[top.name],
        { value: top.value }
      )
    : null;
}

function gapPillarCard(
  pillar: HealthScorePillarContent & { name: PillarName },
  number: string,
  locale: Locale
): HealthScoreGapCard {
  const copy =
    locale === "th"
      ? PILLAR_GAP_TH[pillar.name]
      : locale === "zh-CN"
        ? PILLAR_GAP_ZH[pillar.name]
        : PILLAR_GAP[pillar.name];

  return {
    body: copy.body,
    headline: copy.headline,
    tag:
      locale === "th"
        ? `ช่องว่าง ${number} · ${pillar.label}`
        : locale === "zh-CN"
          ? `缺口 ${number} · ${pillar.label}`
          : `GAP ${number} · ${pillar.label.toUpperCase()}`,
    value: `${pillar.value}%`
  };
}

function buildGapTrio(
  pillars: Array<HealthScorePillarContent & { name: PillarName }>,
  answers: NormalizedAnswers,
  locale: Locale
) {
  const weak = pillars.slice().sort((first, second) => first.value - second.value);
  const cards: HealthScoreGapCard[] = [gapPillarCard(weak[0], "01", locale)];
  const linkedLow = weak.filter((pillar) => pillar.goalLinked);
  const second =
    linkedLow.find((pillar) => pillar.name !== weak[0].name) ?? weak[1];
  cards.push(gapPillarCard(second, "02", locale));

  const symptoms = answers.symptoms.filter((symptom) => symptom !== "great");

  if (symptoms.length >= 2) {
    const names = localizedList(
      symptoms.slice(0, 3).map((symptom) => localizedSymptomName(symptom, locale)),
      locale
    );
    cards.push({
      body:
        locale === "th"
          ? `${names} กำลังกดคะแนนหลายด้านพร้อมกัน และเป็นสัญญาณที่แผนจะนำมาจัดลำดับก่อน`
          : locale === "zh-CN"
            ? `${names}正在同时拉低整体分数，也是你的计划会优先处理的身体信号。`
            : `${titleCaseFirst(names)} pull down your whole score at once, and they are the felt signals your plan is built to address first.`,
      headline:
        locale === "th"
          ? "อาการที่กำลังกดภาพรวม"
          : locale === "zh-CN"
            ? "正在拖累整体状态的症状"
            : "The symptoms dragging on everything",
      tag:
        locale === "th"
          ? "ช่องว่าง 03 · สิ่งที่คุณรู้สึก"
          : locale === "zh-CN"
            ? "缺口 03 · 你的体感"
            : "GAP 03 · HOW YOU FEEL",
      value: String(symptoms.length)
    });
  } else {
    const used = new Set([weak[0].name, second.name]);
    cards.push(gapPillarCard(
      weak.find((pillar) => !used.has(pillar.name)) ?? weak[weak.length - 1],
      "03",
      locale
    ));
  }

  return cards;
}

function relativity(score: number, percentile: number, median: number, locale: Locale) {
  if (score >= median) {
    return {
      headline: locale === "th"
        ? `คุณอยู่ข้างหน้าประมาณ ${percentile}% ของคนที่ทำแบบประเมินนี้`
        : locale === "zh-CN"
          ? `你领先约 ${percentile}% 完成此评估的人。`
          : `You are ahead of about ${percentile}% of people who finish this assessment.`,
      mode: "rank" as const,
      spectrumMedian: median,
      spectrumYou: score,
      sub: locale === "th"
        ? "คุณทำหลายอย่างได้ดีแล้ว สิ่งที่เหลือคือการปรับเฉพาะจุดให้คมขึ้น"
        : locale === "zh-CN"
          ? "你已经做对了很多事。剩下的是更精准的微调，让你更接近自己的最佳状态。"
          : "You are clearly doing a lot right. What is left is refinement, a few targeted points between you and your personal best."
    };
  }

  const gap = median - score;

  return {
    gap,
    headline: locale === "th"
      ? `คนทั่วไปที่ทำแบบประเมินนี้ได้ประมาณ ${median} คะแนน ช่องว่างของคุณคือ ${gap} คะแนน และไม่ได้เกี่ยวกับอายุ`
      : locale === "zh-CN"
        ? `完成此评估的人平均约为 ${median} 分。你的差距是 ${gap} 分，而且这些差距并不是年龄本身造成的。`
        : `The average person who finishes this assessment scores about ${median}. Your gap is ${gap} points, and none of them are about age.`,
    mode: "gap" as const,
    spectrumMedian: median,
    spectrumYou: score,
    sub: locale === "th"
      ? `${gap} คะแนนนี้มาจากจุดเฉพาะที่ฟื้นกลับได้ และจุดใหญ่ที่สุดเชื่อมกับเป้าหมายที่คุณบอกว่าสำคัญ`
      : locale === "zh-CN"
        ? `这 ${gap} 分来自几个具体且可恢复的点，其中最大的部分正好连接到你说最重要的目标。`
        : `Those ${gap} points are a few specific, recoverable things, and the biggest are exactly the goals you told us mattered most.`
  };
}

function bandLine(score: number, band: string, locale: Locale) {
  if (locale === "th") {
    return ({
      "Building foundation":
        `${score} ไม่ใช่คำตัดสินสุขภาพของคุณ แต่เป็นเส้นเริ่มต้น และตอนนี้เราเห็นแล้วว่าเส้นนี้อยู่ตรงไหน`,
      Excellent:
        `${score} เป็นคะแนนที่ยอดเยี่ยม แผนของคุณจึงเน้นปกป้องและปรับสิ่งที่คุณสร้างไว้ให้คมขึ้น`,
      "Good, with a clear gap":
        `${score} เป็นฐานที่ดี พร้อมช่องว่างชัดเจนหนึ่งจุดระหว่างคุณกับระดับถัดไป`,
      "Needs attention":
        "นี่คือเส้นเริ่มต้น ไม่ใช่คำตัดสิน และเราเห็นจุดที่ควรเริ่มแล้ว",
      "Strong, with headroom":
        `${score} เป็นคะแนนที่แข็งแรง สิ่งที่เหลือคือการปรับละเอียดที่คนส่วนใหญ่ไม่เคยเห็น`
    }[band] ?? `คะแนนสุขภาพของคุณคือ ${score}`);
  }

  if (locale === "zh-CN") {
    return ({
      "Building foundation":
        `${score} 分不是对健康的判决，而是一条起跑线。重要的是，我们已经能看清这条线在哪里。`,
      Excellent:
        `${score} 分非常出色。你的计划会专注于保护并优化你已经建立的基础。`,
      "Good, with a clear gap":
        `${score} 分是很扎实的基础，你和下一个层级之间有一个清晰可命名的缺口。`,
      "Needs attention":
        "这是起跑线，不是判决；我们已经看清该从哪里开始。",
      "Strong, with headroom":
        `${score} 分很强。剩下的是大多数人从未得到过的精细调整。`
    }[band] ?? `你的 HealthScore 是 ${score}。`);
  }

  return ({
    "Building foundation":
      `A ${score} is not a verdict on your health. It is a starting line, and the rare thing is that we can see exactly where the line sits.`,
    Excellent:
      `A ${score} is excellent. Your plan is about protecting and sharpening what you have built.`,
    "Good, with a clear gap":
      `A ${score} is a genuinely solid base, with one clear, nameable gap between you and the next level.`,
    "Needs attention":
      "This is a starting line, not a verdict, and we can see exactly where to begin.",
    "Strong, with headroom":
      `A ${score} is strong. What is left is the fine-tuning most people never get to.`
  }[band] ?? `Your HealthScore is ${score}.`);
}

function methodCards(
  goals: readonly string[],
  findings: readonly HealthScoreFinding[],
  locale: Locale
) {
  const goalList =
    localizedList(
      goals.slice(0, 3).map((goal) => localizedGoalPhrase(goal, locale)),
      locale
    ) ||
    (locale === "th" ? "เป้าหมายของคุณ" : locale === "zh-CN" ? "你的目标" : "your goals");
  const safetyFinding = findings.find((finding) =>
    ["BLOODTHINNER", "KIDNEY_CEILING", "LIVER_ROUTING", "PPI_B12_MAG", "PREGNANCY", "STATIN_COQ10"].includes(finding.code)
  );

  return [
    {
      body:
        locale === "th"
          ? `${goalList} เป็นเลนส์ที่ใช้จัดลำดับคำตอบอื่นๆ เสาหลักที่เกี่ยวกับเป้าหมายจึงมีน้ำหนักมากขึ้น`
          : locale === "zh-CN"
            ? `${goalList}会成为解读其他答案的镜头，因此与目标相关的支柱权重更高。`
            : `${titleCaseFirst(goalList)} become the lens every other answer is read through, which is why goal-linked pillars carry more weight.`,
      title:
        locale === "th"
          ? "เป้าหมายกำหนดทิศทาง"
          : locale === "zh-CN"
            ? "你的目标决定方向"
            : "Your goals set the direction"
    },
    {
      body:
        locale === "th"
          ? "การนอน ความเครียด การเคลื่อนไหว อาหาร กันแดด และการกินปลา ล้วนเปลี่ยนสิ่งที่ควรอยู่ในสูตรและสิ่งที่ควรถูกตัดออก"
          : locale === "zh-CN"
            ? "睡眠、压力、活动、饮食、防晒和鱼类摄入都会影响哪些内容适合进入你的方案，哪些应被排除。"
            : "Sleep, stress, movement, diet, sunscreen, and fish intake all shift what belongs in your formula and what gets ruled out.",
      title:
        locale === "th"
          ? "กิจวัตรเพิ่มบริบท"
          : locale === "zh-CN"
            ? "你的日常提供背景"
            : "Your routine adds the context"
    },
    {
      body: safetyFinding
        ? locale === "th"
          ? `${safetyFinding.headline.replace(/\.$/, "")} ความปลอดภัยเป็นตัวกรองก่อนคำแนะนำใดๆ`
          : locale === "zh-CN"
            ? `${safetyFinding.headline.replace(/[。.]$/, "")}。安全会先于任何建议成为过滤条件。`
            : `${safetyFinding.headline.replace(/\.$/, "")} Safety is a filter applied before any recommendation.`
        : locale === "th"
          ? "คำตอบเรื่องยา การตั้งครรภ์ ไต ตับ และความไวต่อสารต่างๆ เป็นเส้นที่แผนจะไม่ข้าม"
          : locale === "zh-CN"
            ? "用药、怀孕或哺乳、肾脏、肝脏和敏感性相关答案会划出计划不能跨越的边界。"
            : "Medication, pregnancy, kidney, liver, and sensitivity answers draw boundaries the plan will not cross.",
      title:
        locale === "th"
          ? "โปรไฟล์ความปลอดภัยขีดเส้น"
          : locale === "zh-CN"
            ? "你的安全资料划定边界"
            : "Your safety profile draws the lines"
    }
  ] satisfies HealthScoreMethodCard[];
}

function subtractionCopy(
  subtraction: HealthScoreSubtraction,
  goals: readonly string[],
  flags: readonly string[],
  locale: Locale
) {
  const goalList =
    localizedList(
      goals.slice(0, 3).map((goal) => localizedGoalPhrase(goal, locale)),
      locale
    ) ||
    (locale === "th" ? "คะแนนของคุณ" : locale === "zh-CN" ? "你的分数" : "your score");
  const constraint = flags.includes("STATIN_COQ10")
    ? locale === "th" ? "ยา statin ของคุณ" : locale === "zh-CN" ? "你的他汀用药" : "your statin"
    : flags.length > 0
      ? locale === "th"
        ? "โปรไฟล์ความปลอดภัยของคุณ"
        : locale === "zh-CN"
          ? "你的安全资料"
          : "your safety profile"
      : locale === "th"
        ? "บริบทประจำวันของคุณ"
        : locale === "zh-CN"
          ? "你的日常背景"
          : "your daily context";

  if (subtraction.mode === "products") {
    if (locale === "th") {
      return {
        body:
          `รายการผลิตภัณฑ์ที่ดีไม่ได้เกิดจากการใส่ทุกอย่างที่อาจช่วย แต่เกิดจากการตัดสิ่งที่ไม่พอดีออก จนเหลือเฉพาะสิ่งที่ตรงกับคะแนน ${goalList} และ${constraint}`,
        labelChosen: "เหมาะกับแผนของคุณ",
        labelEvaluated: "ผลิตภัณฑ์ที่ประเมิน",
        labelSetAside: "ตัดออกสำหรับคุณ"
      };
    }

    if (locale === "zh-CN") {
      return {
        body:
          `好的产品候选清单不是把所有可能有帮助的东西都加入，而是不断移除不适合的选项，直到只留下匹配你的分数、${goalList}和${constraint}的产品。`,
        labelChosen: "适合你的计划",
        labelEvaluated: "已评估产品",
        labelSetAside: "已为你排除"
      };
    }

    return {
      body:
        `A good product shortlist is built by removing what does not fit until only what matches your score, ${goalList}, and ${constraint} remains.`,
      labelChosen: "right for your plan",
      labelEvaluated: "products evaluated",
      labelSetAside: "set aside for you"
    };
  }

  if (locale === "th") {
    return {
      body:
        `แผนที่ดีไม่ได้สร้างจากการเพิ่มทุกอย่างที่อาจช่วย แต่สร้างจากการตัดสิ่งที่ไม่พอดีออก จนเหลือเฉพาะสิ่งที่ตรงกับคะแนน ${goalList} และ${constraint}`,
      labelChosen: "เหมาะกับคะแนนของคุณ",
      labelEvaluated: "ส่วนผสมที่ประเมิน",
      labelSetAside: "ตัดออกสำหรับคุณ"
    };
  }

  if (locale === "zh-CN") {
    return {
      body:
        `好的计划不是把所有可能有帮助的东西都加进去，而是移除所有不适合的内容，直到只留下匹配你的分数、${goalList}和${constraint}的部分。`,
      labelChosen: "适合你的分数",
      labelEvaluated: "已评估成分",
      labelSetAside: "已为你排除"
    };
  }

  return {
    body:
      `A good plan is not built by adding everything that might help. It is built by removing everything that does not fit until only what matches your score, ${goalList}, and ${constraint} remains.`,
    labelChosen: "right for your score",
    labelEvaluated: "ingredients evaluated",
    labelSetAside: "set aside for you"
  };
}

function findingsHeadline(count: number, locale: Locale) {
  if (locale === "th") {
    return `${count} เรื่องที่แบบทดสอบวิตามินทั่วไปมักมองข้าม`;
  }

  if (locale === "zh-CN") {
    return `普通维生素测验常会漏掉的 ${count} 个要点`;
  }

  return count === 1
    ? "1 thing a generic vitamin quiz would have missed."
    : `${count} things a generic vitamin quiz would have missed.`;
}

function buildPageContent({
  answers,
  chosenNutrients = 8,
  engine,
  locale,
  subtraction
}: Readonly<{
  answers: NormalizedAnswers;
  chosenNutrients?: number;
  engine: EngineResult;
  locale: Locale;
  subtraction?: HealthScoreSubtraction;
}>): HealthScorePageContent {
  const median = 60;
  const percentile = PERCENTILES[engine.final] ?? (engine.final >= 79 ? 100 : 0);
  const pillarsWithNames = buildPillars(engine, answers.goals, locale);
  const findings = buildFindings(answers, engine, locale);
  const selectedFindings = findings.length > 0
    ? findings
    : buildStrengthFindings(pillarsWithNames, locale);
  const selectedSubtraction =
    subtraction ?? {
      chosen: chosenNutrients,
      evaluated: 120,
      mode: "nutrients" as const,
      setAside: Math.max(0, 120 - chosenNutrients)
    };
  const subtractionText = subtractionCopy(
    selectedSubtraction,
    answers.goals,
    engine.flagCodes,
    locale
  );
  const relative = relativity(engine.final, percentile, median, locale);

  return {
    copySeeds: {
      bandLine: bandLine(engine.final, engine.band, locale),
      findings: selectedFindings,
      findingsHeadline: findings.length > 0
        ? findingsHeadline(selectedFindings.length, locale)
        : locale === "th"
          ? "สิ่งที่คุณทำได้ดีอยู่แล้วก็เป็นส่วนหนึ่งของแผน"
          : locale === "zh-CN"
            ? "你已经做得好的地方同样重要。"
            : "What you are already doing well matters too.",
      findingsMode: findings.length > 0 ? "caught" : "strengths",
      findingsSub: findings.length > 0
        ? locale === "th"
          ? "แสดงอย่างชัดเจนจากสัญญาณจริงในคำตอบของคุณ"
          : locale === "zh-CN"
            ? "这些内容来自你答案中的具体信号，清楚呈现，不做隐藏。"
            : "Laid out from the specific signals in your answers, nothing held back."
        : locale === "th"
          ? "แผนจะรักษาจุดแข็งเหล่านี้ไว้ พร้อมจัดลำดับสิ่งที่ควรปรับ"
          : locale === "zh-CN"
            ? "计划会保留这些优势，同时优先处理少数真正值得改变的地方。"
            : "The plan keeps these strengths intact while it prioritizes the few things worth changing.",
      gapTrio: buildGapTrio(pillarsWithNames, answers, locale),
      goalMirror:
        answers.goals.length > 0
          ? locale === "th"
            ? `คุณมาที่นี่เพื่อ${localizedList(answers.goals.map((goal) => localizedGoalPhrase(goal, locale)), locale)}`
            : locale === "zh-CN"
              ? `你来到这里，是为了${localizedList(answers.goals.map((goal) => localizedGoalPhrase(goal, locale)), locale)}。`
              : `You came here for ${localizedList(answers.goals.map((goal) => localizedGoalPhrase(goal, locale)), locale)}.`
          : locale === "th"
            ? "คุณมาที่นี่เพื่อเข้าใจสุขภาพของตัวเองให้ชัดขึ้น"
            : locale === "zh-CN"
              ? "你来到这里，是为了更清楚地理解自己的健康。"
              : "You came here for a clearer way to understand your health.",
      heroBody: locale === "th"
        ? "เราอ่านเป้าหมาย กิจวัตร บริบทความเหมาะสม และชีวิตจริงของคุณ แล้วแปลงเป็นคะแนนเดียวพร้อมรูปแบบที่อยู่ข้างใต้"
        : locale === "zh-CN"
          ? "我们读取你的目标、日常习惯、安全背景和真实生活方式，并将它们转化为一个分数及其背后的模式。"
          : "We read your goals, daily routine, safety context, and the way you actually live, then turned them into one number and the pattern underneath it.",
      highestLeverage: highestLeverage(pillarsWithNames, answers.goals, locale),
      methodCards: methodCards(answers.goals, selectedFindings, locale),
      methodHeadline: locale === "th"
        ? "โมเดลคะแนนคงที่ห้าด้าน ไม่ใช่การเดา และไม่ใช่ค่าเฉลี่ยของคนอื่น"
        : locale === "zh-CN"
          ? "这是覆盖五个领域的固定评分模型，不是猜测，也不是陌生人的平均值。"
          : "A fixed scoring model across five domains, not a guess and not an average of strangers.",
      pillarHeadline: locale === "th"
        ? `เสาหลักที่เชื่อมกับเป้าหมายบอกว่า ${engine.final >= median ? "สิ่งที่เหลือคือการปรับให้คมขึ้น" : "ควรเริ่มจากจุดไหนก่อน"}`
        : locale === "zh-CN"
          ? `与你目标相关的支柱显示${engine.final >= median ? "哪里仍值得精细优化" : "计划应该从哪里开始"}。`
          : `Your goal-linked pillars show ${engine.final >= median ? "where refinement still matters" : "where the plan should start"}.`,
      relativity: relative,
      strengthNote: strengthNote(pillarsWithNames, locale),
      subtraction: {
        ...selectedSubtraction,
        ...subtractionText
      }
    },
    locked: {
      band: engine.band,
      flagCodes: engine.flagCodes,
      median,
      nutrientsChosen: chosenNutrients,
      nutrientsEvaluated: 120,
      percentile,
      pillars: pillarsWithNames.map(({ goalLinked, id, label, tag, value }) => ({
        goalLinked,
        id,
        label,
        tag,
        value
      })),
      score: engine.final,
      subtraction: selectedSubtraction
    },
    meta: {
      engineScore: engine.final,
      findingCount: selectedFindings.length,
      relativityMode: relative.mode,
      subtractionKey:
        `${selectedSubtraction.mode}:${selectedSubtraction.evaluated}:${selectedSubtraction.setAside}:${selectedSubtraction.chosen}`
    }
  };
}

function summaryForScore(score: number, lowest: HealthScoreDomain, locale: Locale) {
  if (locale === "th") {
    return `พื้นที่ที่ควรให้ความสำคัญที่สุดคือ ${lowest.label} คะแนนนี้ช่วยให้เราเห็นรูปแบบที่ควรเริ่มก่อน`;
  }

  if (locale === "zh-CN") {
    return `你最清晰的机会点是${lowest.label}。这个分数帮助我们围绕真实缺口确定计划优先级。`;
  }

  return `Your clearest opportunity is ${lowest.label.toLowerCase()}. This score helps us prioritise the plan around your actual gaps.`;
}

function headlineForScore(score: number, locale: Locale) {
  if (locale === "th") {
    if (score >= 82) return "พื้นฐานสุขภาพของคุณแข็งแรงมาก";
    if (score >= 70) return "คุณมีพื้นฐานที่ดีและยังปรับให้เฉพาะตัวได้อีก";
    if (score >= 58) return "มีฐานที่ดีพร้อมช่องว่างที่ชัดเจน";
    if (score >= 46) return "นี่คือจุดเริ่มต้นที่ชัดเจน";
    return "มีโอกาสปรับปรุงพื้นฐานที่ชัดเจน";
  }

  if (locale === "zh-CN") {
    if (score >= 82) return "你的健康基础非常出色。";
    if (score >= 70) return "你的基础很强，并且还有个性化优化空间。";
    if (score >= 58) return "你的基础扎实，同时有一个清晰缺口。";
    if (score >= 46) return "这是一个清晰的起点。";
    return "基础层面有明确的改善机会。";
  }

  if (score >= 82) return "You have an excellent health foundation.";
  if (score >= 70) return "You have a strong base with room to personalise.";
  if (score >= 58) return "You have a solid base with a clear gap.";
  if (score >= 46) return "You have a clear starting point.";
  return "There is a clear opportunity to improve the fundamentals.";
}

function buildDomains(result: EngineResult, locale: Locale): HealthScoreDomain[] {
  return result.pillars.map((pillar) => ({
    description: PILLAR_DESCRIPTION[pillar.name][locale],
    id: pillar.id,
    label: pillarLabel(pillar.name, locale),
    score: Math.round(pillar.pct * 100)
  }));
}

function buildMovers(domains: readonly HealthScoreDomain[], locale: Locale): HealthScoreMover[] {
  return domains
    .slice()
    .sort((first, second) => first.score - second.score)
    .slice(0, 3)
    .map((domain) => ({
      impact:
        locale === "th"
          ? "ผลกระทบสูง"
          : locale === "zh-CN"
            ? "高影响"
            : "High impact",
      label:
        locale === "th"
          ? `ปรับปรุง ${domain.label}`
          : locale === "zh-CN"
            ? `改善${domain.label}`
            : `Improve ${domain.label.toLowerCase()}`
    }));
}

export function computeHealthScore(
  answersInput: unknown,
  locale: Locale = "en"
): HealthScoreResult {
  const answers = normalizeAnswers(answersInput);
  const engine = scoreEngine(answers);
  const domains = buildDomains(engine, locale);
  const lowest = domains.slice().sort((first, second) => first.score - second.score)[0];

  return {
    band: engine.band,
    domains,
    flagCodes: engine.flagCodes,
    headline: headlineForScore(engine.final, locale),
    movers: buildMovers(domains, locale),
    pageContent: buildPageContent({ answers, engine, locale }),
    raw: engine.raw,
    score: engine.final,
    selfReport: engine.selfReport,
    summary: summaryForScore(engine.final, lowest, locale),
    symptomMultiplier: engine.multiplier,
    verification: engine.verification,
    version: "healthscore:v4"
  };
}

export function applyHealthScoreProductSubtraction(
  healthScore: HealthScoreResult,
  stats: Readonly<{
    productsChosen: number;
    productsEvaluated: number;
  }>
): HealthScoreResult {
  const pageContent = healthScore.pageContent;

  if (!pageContent || stats.productsEvaluated <= 0 || stats.productsChosen <= 0) {
    return healthScore;
  }

  const subtraction = {
    chosen: stats.productsChosen,
    evaluated: stats.productsEvaluated,
    mode: "products" as const,
    setAside: Math.max(0, stats.productsEvaluated - stats.productsChosen)
  };
	  const goals = pageContent.copySeeds.goalMirror
	    .replace(/^You came here for /, "")
	    .replace(/^คุณมาที่นี่เพื่อ/, "")
	    .replace(/^你来到这里，是为了/, "")
	    .replace(/\.$/, "")
	    .replace(/。$/, "")
	    .split(/,\s+and\s+|,\s+|\s+and\s+/)
	    .filter(Boolean);
	  const locale: Locale = /[\u0E00-\u0E7F]/.test(pageContent.copySeeds.goalMirror)
	    ? "th"
	    : /[\u3400-\u9FFF]/.test(pageContent.copySeeds.goalMirror)
	      ? "zh-CN"
	      : "en";
  const textBits = subtractionCopy(
    subtraction,
    goals,
    pageContent.locked.flagCodes,
    locale
  );
  const nextPageContent: HealthScorePageContent = {
    copySeeds: {
      ...pageContent.copySeeds,
      subtraction: {
        ...subtraction,
        ...textBits
      }
    },
    locked: {
      ...pageContent.locked,
      subtraction
    },
    meta: {
      ...pageContent.meta,
      subtractionKey:
        `${subtraction.mode}:${subtraction.evaluated}:${subtraction.setAside}:${subtraction.chosen}`
    }
  };

  return {
    ...healthScore,
    pageContent: nextPageContent
  };
}
