import type { Locale } from "@/lib/i18n";
import type { AssessmentPlan } from "@/lib/assessment-jobs";

export type FormulationStatus = "covered" | "add" | "review";

export type FormulationIngredient = {
  category: string;
  dailyDose: string;
  id: string;
  rationale: string;
  status: FormulationStatus;
  supplement: string;
};

export type RecommendedProduct = {
  covers: string[];
  description: string;
  id: string;
  marketplace: "Lazada Thailand" | "Shopee Thailand";
  name: string;
  priority: number;
  tag: string;
  url: string;
};

export type FormulationResult = {
  customerContext: {
    ageRange: string;
    constraints: string[];
    goals: string[];
    plan: AssessmentPlan;
    region: string;
    sex: string;
  };
  formula: FormulationIngredient[];
  generatedAt: string;
  jobId: string;
  products: RecommendedProduct[];
  safetyNotes: string[];
  subtitle: string;
  title: string;
};

const formulaEn: FormulationIngredient[] = [
  {
    category: "Foundation add-on",
    dailyDose: "5,000 IU/day",
    id: "vitamin-d3",
    rationale: "Supports bone, immune, and vitamin D status goals.",
    status: "add",
    supplement: "Vitamin D3"
  },
  {
    category: "Foundation add-on",
    dailyDose: "200 mcg/day",
    id: "vitamin-k2",
    rationale: "Supports bone health and normal calcium utilisation goals.",
    status: "add",
    supplement: "Vitamin K2 MK-7"
  },
  {
    category: "Foundation add-on",
    dailyDose: "2,000 mg EPA / 800 mg DHA",
    id: "omega-3",
    rationale:
      "Supports general cardiovascular, brain, and recovery wellness goals.",
    status: "review",
    supplement: "Omega-3 EPA and DHA"
  },
  {
    category: "Foundation add-on",
    dailyDose: "300-400 mg/day",
    id: "magnesium",
    rationale: "Supports sleep quality, calm, and muscle relaxation goals.",
    status: "add",
    supplement: "Magnesium Glycinate"
  },
  {
    category: "Add separately",
    dailyDose: "1,000 mcg/day",
    id: "b12",
    rationale: "Supports energy, nervous system, and red blood cell goals.",
    status: "add",
    supplement: "Vitamin B12 Methylcobalamin"
  },
  {
    category: "Add separately",
    dailyDose: "400-800 mcg/day",
    id: "methylfolate",
    rationale:
      "Supports methylation, cardiovascular, and daily nutrient coverage goals.",
    status: "add",
    supplement: "Methylfolate 5-MTHF"
  },
  {
    category: "Foundation",
    dailyDose: "10-25 mg/day",
    id: "b6",
    rationale: "Supports energy metabolism, nervous system, and daily micronutrient goals.",
    status: "covered",
    supplement: "Vitamin B6"
  },
  {
    category: "Foundation",
    dailyDose: "500-1,000 mg/day",
    id: "vitamin-c",
    rationale: "Supports antioxidant, immune, and collagen formation goals.",
    status: "covered",
    supplement: "Vitamin C"
  },
  {
    category: "Foundation",
    dailyDose: "10-15 mg/day",
    id: "zinc",
    rationale:
      "Supports immune, skin, and recovery goals.",
    status: "covered",
    supplement: "Zinc"
  },
  {
    category: "Add separately",
    dailyDose: "100-200 mg/day",
    id: "coq10",
    rationale: "Supports energy metabolism and healthy aging goals.",
    status: "add",
    supplement: "CoQ10 Ubiquinol"
  },
  {
    category: "Add separately",
    dailyDose: "250-500 mg/day",
    id: "nmn",
    rationale:
      "Supports healthy aging, cellular energy, and longevity goals.",
    status: "add",
    supplement: "NMN"
  },
  {
    category: "Add separately",
    dailyDose: "10 g/day",
    id: "collagen",
    rationale: "Supports skin, joint, and active lifestyle goals.",
    status: "add",
    supplement: "Collagen Peptides"
  },
  {
    category: "Add separately",
    dailyDose: "3-5 g/day",
    id: "creatine",
    rationale:
      "Supports strength, recovery, and cognitive performance goals.",
    status: "add",
    supplement: "Creatine Monohydrate"
  },
  {
    category: "Add separately",
    dailyDose: "1-2 g/day",
    id: "l-carnitine",
    rationale:
      "Supports energy, active lifestyle, and training goals.",
    status: "add",
    supplement: "L-Carnitine L-Tartrate"
  }
];

const formulaTh: FormulationIngredient[] = [
  {
    category: "Foundation add-on",
    dailyDose: "5,000 IU/วัน",
    id: "vitamin-d3",
    rationale: "ช่วยสนับสนุนกระดูก ภูมิคุ้มกัน และระดับวิตามินดี",
    status: "add",
    supplement: "วิตามิน D3"
  },
  {
    category: "Foundation add-on",
    dailyDose: "200 mcg/วัน",
    id: "vitamin-k2",
    rationale: "ช่วยสนับสนุนสุขภาพกระดูกและการใช้แคลเซียมตามปกติ",
    status: "add",
    supplement: "วิตามิน K2 MK-7"
  },
  {
    category: "Foundation add-on",
    dailyDose: "2,000 mg EPA / 800 mg DHA",
    id: "omega-3",
    rationale: "ช่วยสนับสนุนเป้าหมายด้านหัวใจ สมอง และการฟื้นตัว",
    status: "review",
    supplement: "โอเมก้า-3 EPA และ DHA"
  },
  {
    category: "Foundation add-on",
    dailyDose: "300-400 mg/วัน",
    id: "magnesium",
    rationale:
      "ช่วยสนับสนุนคุณภาพการนอน ความสงบ และการผ่อนคลายกล้ามเนื้อ",
    status: "add",
    supplement: "แมกนีเซียมไกลซิเนต"
  },
  {
    category: "Add separately",
    dailyDose: "1,000 mcg/วัน",
    id: "b12",
    rationale: "ช่วยสนับสนุนพลังงาน ระบบประสาท และการสร้างเม็ดเลือดแดง",
    status: "add",
    supplement: "วิตามิน B12 เมทิลโคบาลามิน"
  },
  {
    category: "Add separately",
    dailyDose: "400-800 mcg/วัน",
    id: "methylfolate",
    rationale:
      "ช่วยสนับสนุนเมทิลเลชัน หัวใจและหลอดเลือด และสารอาหารประจำวัน",
    status: "add",
    supplement: "เมทิลโฟเลต 5-MTHF"
  },
  {
    category: "Foundation",
    dailyDose: "10-25 mg/วัน",
    id: "b6",
    rationale: "ช่วยสนับสนุนเมตาบอลิซึมพลังงาน ระบบประสาท และสารอาหารรอง",
    status: "covered",
    supplement: "วิตามิน B6"
  },
  {
    category: "Foundation",
    dailyDose: "500-1,000 mg/วัน",
    id: "vitamin-c",
    rationale: "ช่วยสนับสนุนสารต้านอนุมูลอิสระ ภูมิคุ้มกัน และการสร้างคอลลาเจน",
    status: "covered",
    supplement: "วิตามิน C"
  },
  {
    category: "Foundation",
    dailyDose: "10-15 mg/วัน",
    id: "zinc",
    rationale: "ช่วยสนับสนุนภูมิคุ้มกัน ผิว และการฟื้นตัว",
    status: "covered",
    supplement: "สังกะสี"
  },
  {
    category: "Add separately",
    dailyDose: "100-200 mg/วัน",
    id: "coq10",
    rationale:
      "ช่วยสนับสนุนการเผาผลาญพลังงานและเป้าหมายการสูงวัยอย่างมีสุขภาพดี",
    status: "add",
    supplement: "CoQ10 ยูบิควินอล"
  },
  {
    category: "Add separately",
    dailyDose: "250-500 mg/วัน",
    id: "nmn",
    rationale: "ช่วยสนับสนุนการสูงวัยอย่างมีสุขภาพดี พลังงานระดับเซลล์ และอายุยืน",
    status: "add",
    supplement: "NMN"
  },
  {
    category: "Add separately",
    dailyDose: "10 g/วัน",
    id: "collagen",
    rationale:
      "ช่วยสนับสนุนเป้าหมายด้านผิว ข้อต่อ และไลฟ์สไตล์ที่เคลื่อนไหวมาก",
    status: "add",
    supplement: "คอลลาเจนเปปไทด์"
  },
  {
    category: "Add separately",
    dailyDose: "3-5 g/วัน",
    id: "creatine",
    rationale:
      "ช่วยสนับสนุนความแข็งแรง การฟื้นตัว และสมรรถภาพด้านความคิด",
    status: "add",
    supplement: "ครีเอทีนโมโนไฮเดรต"
  },
  {
    category: "Add separately",
    dailyDose: "1-2 g/วัน",
    id: "l-carnitine",
    rationale:
      "ช่วยสนับสนุนพลังงาน ไลฟ์สไตล์ที่เคลื่อนไหวมาก และเป้าหมายการฝึก",
    status: "add",
    supplement: "แอล-คาร์นิทีน แอล-ทาร์เทรต"
  }
];

const productsEn: RecommendedProduct[] = [
  {
    covers: ["b6", "vitamin-c", "zinc"],
    description:
      "Format: tablet or capsule. A simple base multivitamin search that covers several foundation nutrients without adding unnecessary complexity.",
    id: "base-multi",
    marketplace: "Lazada Thailand",
    name: "Adult foundation multivitamin",
    priority: 1,
    tag: "Base option",
    url: "https://www.lazada.co.th/tag/adult-multivitamin/"
  },
  {
    covers: ["omega-3"],
    description:
      "Format: softgel. A targeted search for omega-3 products. Review the label for EPA and DHA amounts before choosing.",
    id: "omega-product",
    marketplace: "Lazada Thailand",
    name: "Omega-3 EPA and DHA",
    priority: 2,
    tag: "Foundation add-on",
    url: "https://www.lazada.co.th/tag/omega-3/"
  },
  {
    covers: ["magnesium"],
    description:
      "Format: capsule or tablet. A focused search for magnesium glycinate products to support calm evenings and recovery.",
    id: "magnesium-product",
    marketplace: "Shopee Thailand",
    name: "Magnesium glycinate",
    priority: 3,
    tag: "Sleep and calm",
    url: "https://shopee.co.th/search?keyword=magnesium%20glycinate"
  },
  {
    covers: ["vitamin-d3", "vitamin-k2"],
    description:
      "Format: softgel, capsule, or drop. A combined search for vitamin D3 and K2 products. Choose clear labelling and avoid duplicate stacking.",
    id: "d3-k2-product",
    marketplace: "Lazada Thailand",
    name: "Vitamin D3 plus K2",
    priority: 4,
    tag: "Foundation add-on",
    url: "https://www.lazada.co.th/tag/vitamin-d3-k2/"
  },
  {
    covers: ["coq10"],
    description:
      "Format: softgel or capsule. A targeted healthy aging support product. Ubiquinol is often preferred in premium CoQ10 products.",
    id: "coq10-product",
    marketplace: "Lazada Thailand",
    name: "CoQ10 ubiquinol",
    priority: 5,
    tag: "Targeted support",
    url: "https://www.lazada.co.th/tag/ubiquinol-coq10/"
  },
  {
    covers: ["nmn"],
    description:
      "Format: capsule or powder. An optional longevity-focused product search for users who want an advanced healthy aging layer.",
    id: "nmn-product",
    marketplace: "Shopee Thailand",
    name: "NMN healthy aging support",
    priority: 6,
    tag: "Optional advanced",
    url: "https://shopee.co.th/search?keyword=nmn"
  },
  {
    covers: ["collagen", "creatine", "l-carnitine"],
    description:
      "Format: powder plus capsule or tablet options. Active lifestyle add-ons grouped for recovery, strength, and daily movement support.",
    id: "active-stack",
    marketplace: "Lazada Thailand",
    name: "Active lifestyle support stack",
    priority: 7,
    tag: "Targeted support",
    url: "https://www.lazada.co.th/tag/creatine-collagen-l-carnitine/"
  },
  {
    covers: ["b12", "methylfolate"],
    description:
      "Format: sublingual tablet, lozenge, or capsule. A methylated B-vitamin search for users who want a separate B12 and folate layer.",
    id: "methyl-b-product",
    marketplace: "Lazada Thailand",
    name: "Methylated B12 and folate",
    priority: 8,
    tag: "Add separately",
    url: "https://www.lazada.co.th/tag/methyl-b12-folate/"
  }
];

const productsTh: RecommendedProduct[] = [
  {
    covers: ["b6", "vitamin-c", "zinc"],
    description:
      "รูปแบบ: เม็ดหรือแคปซูล การค้นหามัลตวิตามินพื้นฐานที่ครอบคลุมสารอาหารหลักหลายตัวโดยไม่เพิ่มความซับซ้อนเกินจำเป็น",
    id: "base-multi",
    marketplace: "Lazada Thailand",
    name: "มัลตวิตามินพื้นฐานสำหรับผู้ใหญ่",
    priority: 1,
    tag: "ตัวเลือกพื้นฐาน",
    url: "https://www.lazada.co.th/tag/adult-multivitamin/"
  },
  {
    covers: ["omega-3"],
    description:
      "รูปแบบ: ซอฟต์เจล การค้นหาผลิตภัณฑ์โอเมก้า-3 แบบเจาะจง ควรตรวจฉลากปริมาณ EPA และ DHA ก่อนเลือกซื้อ",
    id: "omega-product",
    marketplace: "Lazada Thailand",
    name: "โอเมก้า-3 EPA และ DHA",
    priority: 2,
    tag: "ส่วนเสริมพื้นฐาน",
    url: "https://www.lazada.co.th/tag/omega-3/"
  },
  {
    covers: ["magnesium"],
    description:
      "รูปแบบ: แคปซูลหรือเม็ด การค้นหาแมกนีเซียมไกลซิเนตเพื่อสนับสนุนช่วงเย็นที่สงบและการฟื้นตัว",
    id: "magnesium-product",
    marketplace: "Shopee Thailand",
    name: "แมกนีเซียมไกลซิเนต",
    priority: 3,
    tag: "การนอนและความสงบ",
    url: "https://shopee.co.th/search?keyword=magnesium%20glycinate"
  },
  {
    covers: ["vitamin-d3", "vitamin-k2"],
    description:
      "รูปแบบ: ซอฟต์เจล แคปซูล หรือหยด การค้นหาผลิตภัณฑ์วิตามิน D3 และ K2 แบบรวม ควรเลือกฉลากชัดเจนและหลีกเลี่ยงการทานซ้ำซ้อน",
    id: "d3-k2-product",
    marketplace: "Lazada Thailand",
    name: "วิตามิน D3 + K2",
    priority: 4,
    tag: "ส่วนเสริมพื้นฐาน",
    url: "https://www.lazada.co.th/tag/vitamin-d3-k2/"
  },
  {
    covers: ["coq10"],
    description:
      "รูปแบบ: ซอฟต์เจลหรือแคปซูล ผลิตภัณฑ์สนับสนุนการสูงวัยอย่างมีสุขภาพดีแบบเจาะจง โดย Ubiquinol มักพบใน CoQ10 ระดับพรีเมียม",
    id: "coq10-product",
    marketplace: "Lazada Thailand",
    name: "CoQ10 ยูบิควินอล",
    priority: 5,
    tag: "การดูแลเฉพาะจุด",
    url: "https://www.lazada.co.th/tag/ubiquinol-coq10/"
  },
  {
    covers: ["nmn"],
    description:
      "รูปแบบ: แคปซูลหรือผง การค้นหาผลิตภัณฑ์ด้านอายุยืนสำหรับผู้ที่ต้องการชั้นดูแลขั้นสูง",
    id: "nmn-product",
    marketplace: "Shopee Thailand",
    name: "NMN สำหรับการสูงวัยอย่างมีสุขภาพดี",
    priority: 6,
    tag: "ตัวเลือกขั้นสูง",
    url: "https://shopee.co.th/search?keyword=nmn"
  },
  {
    covers: ["collagen", "creatine", "l-carnitine"],
    description:
      "รูปแบบ: ผงร่วมกับแคปซูลหรือเม็ด กลุ่มส่วนเสริมสำหรับไลฟ์สไตล์ที่แอคทีฟ เพื่อช่วยเรื่องการฟื้นตัว ความแข็งแรง และการเคลื่อนไหวในแต่ละวัน",
    id: "active-stack",
    marketplace: "Lazada Thailand",
    name: "ชุดสนับสนุนไลฟ์สไตล์แอคทีฟ",
    priority: 7,
    tag: "การดูแลเฉพาะจุด",
    url: "https://www.lazada.co.th/tag/creatine-collagen-l-carnitine/"
  },
  {
    covers: ["b12", "methylfolate"],
    description:
      "รูปแบบ: เม็ดอมใต้ลิ้น เม็ดอม หรือแคปซูล การค้นหาวิตามินบีกลุ่ม methylated สำหรับผู้ที่ต้องการแยกชั้น B12 และโฟเลตออกมา",
    id: "methyl-b-product",
    marketplace: "Lazada Thailand",
    name: "B12 และโฟเลตแบบเมทิลเลต",
    priority: 8,
    tag: "เพิ่มแยกต่างหาก",
    url: "https://www.lazada.co.th/tag/methyl-b12-folate/"
  }
];

export function getMockFormulationResult(
  jobId: string,
  locale: Locale = "en",
  plan: AssessmentPlan = "free"
): FormulationResult {
  if (locale === "th") {
    return {
      customerContext: {
        ageRange: "ผู้ใหญ่",
        constraints: [
          "ต้องการผลิตภัณฑ์ที่ใช้ประจำวันได้ง่าย",
          "หลีกเลี่ยงการทานซ้ำซ้อนโดยไม่จำเป็น",
          "ตรวจฉลากเพื่อดูสารก่อแพ้และความไวต่อส่วนผสม"
        ],
        goals: [
          "สูงวัยอย่างมีสุขภาพดี",
          "พลังงาน",
          "การฟื้นตัว",
          "คุณภาพการนอน"
        ],
        plan,
        region: "ประเทศไทย",
        sex: "ไม่แสดง"
      },
      formula: formulaTh,
      generatedAt: new Date().toISOString(),
      jobId,
      products: productsTh,
      safetyNotes: [
        "คำแนะนำเหล่านี้เป็นตัวเลือกผลิตภัณฑ์เพื่อสุขภาพ ไม่ใช่คำแนะนำทางการแพทย์",
        "ตรวจฉลากทั้งหมดเพื่อดูสารก่อแพ้ ส่วนผสม และวิธีใช้ต่อวันก่อนซื้อ",
        "ปรึกษาแพทย์หรือเภสัชกรหากคุณตั้งครรภ์ ให้นมบุตร ใช้ยา หรือมีโรคประจำตัว"
      ],
      subtitle:
        "บรีฟสูตรเพื่อสุขภาพและคู่มือค้นหาผลิตภัณฑ์จากคำตอบในแบบประเมินของคุณ",
      title: "สูตรอาหารเสริมเฉพาะบุคคลของคุณ"
    };
  }

  return {
    customerContext: {
      ageRange: "Adult",
      constraints: [
        "Prefers simple daily products",
        "Avoids unnecessary duplication",
        "Review labels for allergies and sensitivities"
      ],
      goals: [
        "Healthy aging",
        "Energy support",
        "Recovery",
        "Sleep quality"
      ],
      plan,
      region: "Thailand",
      sex: "Not displayed"
    },
    formula: formulaEn,
    generatedAt: new Date().toISOString(),
    jobId,
    products: productsEn,
    safetyNotes: [
      "These are optional wellness product suggestions, not medical advice.",
      "Review all labels for allergens, ingredients, and daily use instructions before purchase.",
      "Ask a qualified clinician or pharmacist to review the plan if you are pregnant, breastfeeding, taking medication, or managing a medical condition."
    ],
    subtitle:
      "A concise wellness formulation and marketplace search guide based on the completed assessment.",
    title: "Your personalised supplement formulation"
  };
}
