import { normalizeProductFactName, productKeysMatch } from "@/lib/product-key-matching";

const key = (value: string) => normalizeProductFactName(value).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
// These are identity aliases, not interchangeable members of a nutrient family.
const FORMS = [
  ["epa", "eicosapentaenoic_acid"], ["dha", "docosahexaenoic_acid", "docosahexaenoic_acid_dha"],
  ["vitamin_d2", "d2", "ergocalciferol"], ["vitamin_d3", "d3", "cholecalciferol"],
  ["folic_acid"], ["methylfolate", "l_5_mthf", "5_mthf", "5_methyltetrahydrofolate"],
  ["niacinamide", "nicotinamide"], ["nicotinic_acid"],
  ["ubiquinol", "coq10_ubiquinol"], ["ubiquinone", "coq10_ubiquinone"],
  ["magnesium_glycinate", "magnesium_bisglycinate"], ["magnesium_citrate"], ["magnesium_oxide"], ["magnesium_threonate"],
  ["vitamin_k1", "k1", "phytonadione", "phylloquinone"], ["vitamin_k2", "k2", "menaquinone"],
  ["mk_4", "mk4", "menaquinone_4"], ["mk_7", "mk7", "menaquinone_7"]
] as const;

const FORM_NAMES: Record<typeof FORMS[number][0], string> = {
  epa: "EPA", dha: "DHA", vitamin_d2: "Vitamin D2", vitamin_d3: "Vitamin D3",
  folic_acid: "Folic acid", methylfolate: "Methylfolate", niacinamide: "Niacinamide",
  nicotinic_acid: "Nicotinic acid", ubiquinol: "Ubiquinol", ubiquinone: "Ubiquinone",
  magnesium_glycinate: "Magnesium glycinate", magnesium_citrate: "Magnesium citrate",
  magnesium_oxide: "Magnesium oxide", magnesium_threonate: "Magnesium threonate",
  vitamin_k1: "Vitamin K1", vitamin_k2: "Vitamin K2", mk_4: "MK-4", mk_7: "MK-7"
};

/** A catalogue alias resolves the concept ID, but cannot broaden an explicitly
 * requested form. General/localized aliases still use the catalogue name. */
export function resolvedNutrientFormName(requestedName: string | undefined, catalogueName: string) {
  if (!requestedName) return catalogueName;
  const requested = key(requestedName);
  const form = FORMS.find(group => (group as readonly string[]).includes(requested));
  return form && !nutrientNameMatchesTarget(requestedName, catalogueName)
    ? FORM_NAMES[form[0]]
    : catalogueName;
}

/** Directional: a generic target may accept measured family contributions, while
 * a specifically requested form must not silently become another form. */
export function nutrientNameMatchesTarget(targetName: string, factName: string) {
  // Source restrictions (e.g. algae) are enforced separately by candidate eligibility.
  const target = key(targetName).replace(/^(?:algae|algal)_omega_?3$/, "omega_3");
  const fact = key(factName).replace(/^(?:algae|algal)_omega_?3$/, "omega_3");
  if (target === fact) return true;
  // Quantified active content is distinct from the mass of its source botanical.
  // Evaluate before catalogue aliases, which may group those names for discovery.
  const curcumin = ["curcumin", "curacumin"];
  const curcuminoids = ["curcuminoid", "curcuminoids"];
  if (curcumin.includes(target)) return curcumin.includes(fact);
  if (curcuminoids.includes(target)) return curcuminoids.includes(fact) || curcumin.includes(fact);
  if (["vitamin_k2", "k2", "menaquinone"].includes(target) &&
      ["mk_4", "mk4", "menaquinone_4", "mk_7", "mk7", "menaquinone_7"].includes(fact)) return true;
  const requestedForm = FORMS.find(group => (group as readonly string[]).includes(target));
  if (requestedForm) return (requestedForm as readonly string[]).includes(fact);
  if (["omega_3", "omega3", "omega_3_fatty_acids"].includes(target)) {
    return ["omega_3", "omega3", "omega_3_fatty_acids", "epa", "dha", "eicosapentaenoic_acid", "docosahexaenoic_acid", "docosahexaenoic_acid_dha"].includes(fact);
  }
  return productKeysMatch(targetName, factName);
}
