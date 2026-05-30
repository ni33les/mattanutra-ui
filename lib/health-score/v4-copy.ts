import type { Locale } from "@/lib/i18n";
import type { HealthScoreDomainId, PillarName } from "@/lib/health-score/v4-types";

function oxford(items: readonly string[]) {
  const clean = items.filter(Boolean);

  if (clean.length <= 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;

  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

export const GOAL_MAP: Record<string, PillarName[]> = {
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

export const GOAL_PILLARS: Record<PillarName, string[]> = {
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

export function localizedGoalPhrase(goal: string, locale: Locale) {
  if (locale === "th") {
    return GOAL_PHRASE_TH[goal] ?? goal;
  }
  if (locale === "zh-CN") {
    return GOAL_PHRASE_ZH[goal] ?? goal;
  }
  return GOAL_PHRASE[goal] ?? goal;
}

export function localizedGoalTag(goal: string, locale: Locale) {
  if (locale === "th") {
    return GOAL_TAG_TH[goal] ?? goal;
  }
  if (locale === "zh-CN") {
    return GOAL_TAG_ZH[goal] ?? goal;
  }
  return GOAL_TAG[goal] ?? goal;
}

export function localizedSymptomName(symptom: string, locale: Locale) {
  if (locale === "th") {
    return SYMPTOM_NAME_TH[symptom] ?? symptom;
  }
  if (locale === "zh-CN") {
    return SYMPTOM_NAME_ZH[symptom] ?? symptom;
  }
  return SYMPTOM_NAME[symptom] ?? symptom;
}

export function localizedList(items: readonly string[], locale: Locale) {
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

export const PILLAR_LABEL_EN: Record<PillarName, string> = {
  "Activity & Fitness": "Activity & Fitness",
  "Health Habits": "Health Habits",
  "Nutrition & Diet": "Nutrition & Diet",
  "Sleep & Recovery": "Sleep & Recovery",
  "Stress & Balance": "Stress & Balance"
};

export const PILLAR_LABEL_TH: Record<PillarName, string> = {
  "Activity & Fitness": "กิจกรรมและฟิตเนส",
  "Health Habits": "พฤติกรรมสุขภาพ",
  "Nutrition & Diet": "โภชนาการ",
  "Sleep & Recovery": "การนอนและการฟื้นตัว",
  "Stress & Balance": "ความเครียดและสมดุล"
};

export const PILLAR_LABEL_ZH: Record<PillarName, string> = {
  "Activity & Fitness": "活动与体能",
  "Health Habits": "健康习惯",
  "Nutrition & Diet": "营养与饮食",
  "Sleep & Recovery": "睡眠与恢复",
  "Stress & Balance": "压力与平衡"
};

export const PILLAR_ID: Record<PillarName, HealthScoreDomainId> = {
  "Activity & Fitness": "activity",
  "Health Habits": "habits",
  "Nutrition & Diet": "nutrition",
  "Sleep & Recovery": "sleep",
  "Stress & Balance": "stress"
};

export const PILLAR_DESCRIPTION: Record<PillarName, Record<Locale, string>> = {
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

export const PILLAR_GAP: Record<PillarName, { body: string; headline: string }> = {
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

export const PILLAR_GAP_TH: Record<PillarName, { body: string; headline: string }> = {
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

export const PILLAR_GAP_ZH: Record<PillarName, { body: string; headline: string }> = {
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

export const PILLAR_STRENGTH: Record<PillarName, string> = {
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

export const PILLAR_STRENGTH_TH: Record<PillarName, string> = {
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

export const PILLAR_STRENGTH_ZH: Record<PillarName, string> = {
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

export const FINDINGS: Record<string, {
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

export const ENERGY_CAUSE: Record<string, string> = {
  activity: "light activity",
  sleep: "short sleep",
  stress: "high stress"
};

export const ENERGY_CAUSE_TH: Record<string, string> = {
  activity: "กิจกรรมที่ยังเบา",
  sleep: "การนอนที่สั้น",
  stress: "ความเครียดสูง"
};

export const ENERGY_CAUSE_ZH: Record<string, string> = {
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

export function localizedFindingCopy(code: string, locale: Locale) {
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
