import type { MatcherUnit } from "@/lib/matcher/types";

export type QaSubjectKey =
  | "b12"
  | "b6"
  | "c"
  | "calcium"
  | "collagen"
  | "coq10"
  | "creatine"
  | "d3"
  | "folate"
  | "iodine"
  | "iron"
  | "k2"
  | "mag"
  | "omega"
  | "selenium"
  | "sterols"
  | "zinc";

export type QaSubject = Readonly<{
  aliases: readonly string[];
  id: string;
  name: string;
  unit: MatcherUnit;
}>;

export const QA_SUBJECTS: Readonly<Record<QaSubjectKey, QaSubject>> = {
  d3: {
    id: "sup_d3",
    name: "Vitamin D3",
    unit: "IU",
    aliases: ["Vitamin D", "D3", "Cholecalciferol", "Vit D3", "Colecalciferol"]
  },
  omega: {
    id: "sup_omega",
    name: "Omega-3",
    unit: "mg",
    aliases: ["Fish oil", "EPA", "DHA", "Algae oil", "Algae omega-3", "Algal omega-3"]
  },
  mag: {
    id: "sup_mag",
    name: "Magnesium",
    unit: "mg",
    aliases: ["Mg", "Magnesium glycinate", "Magnesium citrate"]
  },
  b12: {
    id: "sup_b12",
    name: "Vitamin B12",
    unit: "mcg",
    aliases: ["B12", "Cobalamin", "Methylcobalamin"]
  },
  c: {
    id: "sup_c",
    name: "Vitamin C",
    unit: "mg",
    aliases: ["Ascorbic acid", "Ascorbate"]
  },
  collagen: {
    id: "sup_collagen",
    name: "Collagen",
    unit: "g",
    aliases: ["Collagen peptides", "Hydrolyzed collagen"]
  },
  folate: {
    id: "sup_folate",
    name: "Folate",
    unit: "mcg",
    aliases: ["Folic acid", "Vitamin B9", "Folacin", "Methylfolate"]
  },
  calcium: {
    id: "sup_calcium",
    name: "Calcium",
    unit: "mg",
    aliases: ["Calcium citrate", "Calcium carbonate"]
  },
  b6: {
    id: "sup_b6",
    name: "Vitamin B6",
    unit: "mg",
    aliases: ["B6", "Pyridoxine"]
  },
  iodine: {
    id: "sup_iodine",
    name: "Iodine",
    unit: "mcg",
    aliases: ["Potassium iodide", "Iodide"]
  },
  selenium: {
    id: "sup_selenium",
    name: "Selenium",
    unit: "mcg",
    aliases: ["Selenomethionine"]
  },
  zinc: {
    id: "sup_zinc",
    name: "Zinc",
    unit: "mg",
    aliases: ["Zinc picolinate", "Zinc citrate"]
  },
  iron: {
    id: "sup_iron",
    name: "Iron",
    unit: "mg",
    aliases: ["Ferrous", "Ferrous sulfate"]
  },
  coq10: {
    id: "sup_coq10",
    name: "CoQ10",
    unit: "mg",
    aliases: ["Ubiquinone", "Ubiquinol", "Coenzyme Q10"]
  },
  creatine: {
    id: "sup_creatine",
    name: "Creatine",
    unit: "g",
    aliases: ["Creatine monohydrate", "Creapure"]
  },
  sterols: {
    id: "sup_sterols",
    name: "Plant sterols",
    unit: "mg",
    aliases: ["Phytosterols", "Plant sterol"]
  },
  k2: {
    id: "sup_k2",
    name: "Vitamin K2",
    unit: "mcg",
    aliases: ["K2", "MK-7", "MK7", "Menaquinone-7", "Menaquinone"]
  }
};

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolveQaSubject(name: string): QaSubject | null {
  const wanted = normalizeName(name);

  for (const subject of Object.values(QA_SUBJECTS)) {
    const names = [subject.name, ...subject.aliases].map(normalizeName);

    if (names.includes(wanted)) {
      return subject;
    }
  }

  return null;
}
