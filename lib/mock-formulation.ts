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

const formula: FormulationIngredient[] = [
  {
    category: "Foundation add-on",
    dailyDose: "5,000 IU/day",
    id: "vitamin-d3",
    rationale: "Supports normal vitamin D status where sun exposure is limited.",
    status: "add",
    supplement: "Vitamin D3"
  },
  {
    category: "Foundation add-on",
    dailyDose: "200 mcg/day",
    id: "vitamin-k2",
    rationale: "Commonly paired with vitamin D in adult wellness stacks.",
    status: "add",
    supplement: "Vitamin K2 MK-7"
  },
  {
    category: "Foundation add-on",
    dailyDose: "2,000 mg EPA / 800 mg DHA",
    id: "omega-3",
    rationale: "Supports general cardiovascular, brain, and recovery wellness goals.",
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
    rationale: "Useful to consider when dietary intake may be low.",
    status: "add",
    supplement: "Vitamin B12 Methylcobalamin"
  },
  {
    category: "Add separately",
    dailyDose: "400-800 mcg/day",
    id: "methylfolate",
    rationale: "Supports methylation and general daily nutrient coverage.",
    status: "add",
    supplement: "Methylfolate 5-MTHF"
  },
  {
    category: "Foundation",
    dailyDose: "Included in base option",
    id: "b6",
    rationale: "Included as part of the base micronutrient layer.",
    status: "covered",
    supplement: "Vitamin B6"
  },
  {
    category: "Foundation",
    dailyDose: "Included in base option",
    id: "vitamin-c",
    rationale: "Included as part of the base antioxidant layer.",
    status: "covered",
    supplement: "Vitamin C"
  },
  {
    category: "Foundation",
    dailyDose: "Included in base option",
    id: "zinc",
    rationale: "Included as part of the base immune and recovery support layer.",
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
    rationale: "Optional healthy aging support for users who prefer advanced longevity products.",
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
    rationale: "Supports strength, recovery, and cognitive performance goals.",
    status: "add",
    supplement: "Creatine Monohydrate"
  },
  {
    category: "Add separately",
    dailyDose: "1-2 g/day",
    id: "l-carnitine",
    rationale: "Optional active lifestyle support for energy and training goals.",
    status: "add",
    supplement: "L-Carnitine L-Tartrate"
  }
];

const products: RecommendedProduct[] = [
  {
    covers: ["b6", "vitamin-c", "zinc"],
    description:
      "A simple base multivitamin search that covers several foundation nutrients without adding unnecessary complexity.",
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
      "A targeted search for omega-3 products. Review the label for EPA and DHA amounts before choosing.",
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
      "A focused search for magnesium glycinate products to support calm evenings and recovery.",
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
      "A combined search for vitamin D3 and K2 products. Choose clear labelling and avoid duplicate stacking.",
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
      "A targeted healthy aging support product. Ubiquinol is often preferred in premium CoQ10 products.",
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
      "An optional longevity-focused product search for users who want an advanced healthy aging layer.",
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
      "Active lifestyle add-ons grouped for recovery, strength, and daily movement support.",
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
      "A methylated B-vitamin search for users who want a separate B12 and folate layer.",
    id: "methyl-b-product",
    marketplace: "Lazada Thailand",
    name: "Methylated B12 and folate",
    priority: 8,
    tag: "Add separately",
    url: "https://www.lazada.co.th/tag/methyl-b12-folate/"
  }
];

export function getMockFormulationResult(jobId: string): FormulationResult {
  return {
    customerContext: {
      ageRange: "Adult",
      constraints: [
        "Prefers simple daily products",
        "Avoids unnecessary duplication",
        "Review labels for allergies and sensitivities"
      ],
      goals: ["Healthy aging", "Energy support", "Recovery", "Sleep quality"],
      region: "Thailand",
      sex: "Not displayed"
    },
    formula,
    generatedAt: new Date().toISOString(),
    jobId,
    products,
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
