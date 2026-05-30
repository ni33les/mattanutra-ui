const PRODUCT_FACT_DOSE_UNIT_PATTERN = "(?:mcg|µg|ug|mg|g|iu)";
const PRODUCT_FACT_PER_UNIT_PATTERN =
  "(?:mcg|µg|ug|mg|g|kg|ml|l)";
const PRODUCT_FACT_CONCENTRATION_PATTERN = new RegExp(
  `\\b\\d+(?:[,.]\\d+)?\\s*${PRODUCT_FACT_DOSE_UNIT_PATTERN}\\s*(?:\\/|\\bper\\b|\\s+)\\s*${PRODUCT_FACT_PER_UNIT_PATTERN}\\b`,
  "i"
);
const PRODUCT_FACT_CONCENTRATION_REPLACE_PATTERN = new RegExp(
  PRODUCT_FACT_CONCENTRATION_PATTERN.source,
  "gi"
);
const PRODUCT_FACT_DOSE_PATTERN = new RegExp(
  `\\b\\d+(?:[,.]\\d+)?\\s*${PRODUCT_FACT_DOSE_UNIT_PATTERN}\\b`,
  "gi"
);
const PRODUCT_FACT_PERCENT_PATTERN = /\b\d+(?:[,.]\d+)?\s*%/g;
const PRODUCT_FACT_PERCENT_PARENS_PATTERN = /\([^)]*\b\d+(?:[,.]\d+)?\s*%[^)]*\)/g;
const MATCH_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ["vitamin_a", "retinol", "retinyl_palmitate", "retinyl_acetate"],
  ["beta_carotene", "provitamin_a"],
  ["vitamin_b1", "thiamine", "thiamin", "thiamine_nitrate", "thiamine_hydrochloride"],
  ["vitamin_b2", "riboflavin"],
  ["vitamin_b3", "niacin", "niacinamide", "nicotinamide", "nicotinic_acid"],
  ["vitamin_b5", "pantothenic_acid", "calcium_pantothenate"],
  ["vitamin_b6", "pyridoxine", "pyridoxine_hcl", "pyridoxine_hydrochloride"],
  ["vitamin_b7", "biotin"],
  ["vitamin_b9", "folate", "folic_acid", "methylfolate", "l_5_mthf"],
  ["vitamin_b12", "b12", "cobalamin", "cyanocobalamin", "methylcobalamin"],
  ["vitamin_c", "ascorbic_acid", "calcium_ascorbate", "sodium_ascorbate"],
  ["vitamin_d", "vitamin_d3", "d3", "cholecalciferol"],
  ["vitamin_e", "tocopherol", "alpha_tocopherol", "tocopheryl_acetate", "tocopheryl_succinate"],
  ["vitamin_k", "vitamin_k1", "phytonadione", "phylloquinone"],
  ["vitamin_k2", "menaquinone", "mk_7", "mk7"],
  ["coq10", "coenzyme_q10", "ubiquinone", "ubiquinol"],
  ["pea", "palmidrol", "palmitoylethanolamide"],
  ["ashwagandha", "ashwaganda", "withania_somnifera", "ashwagandha_root_extract"],
  ["curcumin", "curacumin", "curcuminoids", "turmeric_extract", "curcuma_longa"],
  ["multi_strain_probiotics", "probiotics", "probiotic", "probiotic_blend"],
  [
    "omega_3",
    "omega_3_fatty_acids",
    "fish_oil",
    "epa",
    "dha",
    "eicosapentaenoic_acid",
    "docosahexaenoic_acid"
  ],
  ["theanine", "l_theanine", "alpha_wave_l_theanine"],
  ["l_glutamine", "glutamine"],
  ["magnesium", "magnesium_citrate", "magnesium_glycinate", "magnesium_bisglycinate", "magnesium_glyconate", "magnesium_oxide", "magnesium_threonate"],
  ["iron", "ferrous_fumarate", "ferrous_sulfate", "ferrous_bisglycinate"],
  ["zinc", "zinc_amino_acid_chelate", "zinc_citrate", "zinc_gluconate", "zinc_oxide", "zinc_sulfate"],
  ["selenium", "selenomethionine", "sodium_selenite"],
  ["iodine", "iodide", "potassium_iodide"],
  ["copper", "copper_gluconate", "copper_sulfate"],
  ["chromium", "chromium_picolinate"],
  ["manganese", "manganese_sulfate"],
  ["calcium", "calcium_carbonate", "calcium_citrate"]
];
const MATCH_KEY_ALIASES: Record<string, readonly string[]> =
  Object.fromEntries(
    MATCH_ALIAS_GROUPS.flatMap((group) => {
      const aliases = [...new Set(group.map((alias) => normalizeProductKey(alias)))];

      return aliases.map((alias) => [alias, aliases] as const);
    })
  );
const MATCH_TOKEN_STOP_WORDS = new Set([
  "acid",
  "active",
  "amino",
  "chelate",
  "compound",
  "dietary",
  "extract",
  "hcl",
  "hydrochloride",
  "mineral",
  "minerals",
  "nitrate",
  "oxide",
  "plus",
  "supplement",
  "supplements",
  "tablet",
  "tablets",
  "vitamin",
  "vitamins"
]);

export function normalizeProductKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function factTextForParsing(value: string) {
  return value.replace(/_/g, " ");
}

export function productFactLooksLikeConcentration(value: string | null | undefined) {
  return Boolean(
    value &&
      PRODUCT_FACT_CONCENTRATION_PATTERN.test(factTextForParsing(value))
  );
}

export function normalizeProductFactName(value: string) {
  return factTextForParsing(value)
    .replace(/\([^)]*\)/g, (match) =>
      productFactLooksLikeConcentration(match) ? " " : match
    )
    .replace(PRODUCT_FACT_PERCENT_PARENS_PATTERN, " ")
    .replace(PRODUCT_FACT_CONCENTRATION_REPLACE_PATTERN, " ")
    .replace(PRODUCT_FACT_DOSE_PATTERN, " ")
    .replace(PRODUCT_FACT_PERCENT_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:()[\]-]+$/g, "")
    .trim();
}

export function normalizeProductFactKey(value: string) {
  return normalizeProductKey(normalizeProductFactName(value) || value);
}

export function productFactAliasKeys(
  value: string,
  extraAliases: readonly string[] = []
) {
  const normalized = normalizeProductFactKey(value);
  const inferredAliases: string[] = [];

  if (/(^|_)l?_?theanine($|_)/.test(normalized)) {
    inferredAliases.push("theanine", "l_theanine");
  }

  if (
    /(^|_)dha($|_)/.test(normalized) ||
    normalized.includes("docosahexaenoic_acid")
  ) {
    inferredAliases.push("omega_3", "dha", "docosahexaenoic_acid");
  }

  if (
    /(^|_)epa($|_)/.test(normalized) ||
    normalized.includes("eicosapentaenoic_acid")
  ) {
    inferredAliases.push("omega_3", "epa", "eicosapentaenoic_acid");
  }

  const seed = [
    normalized,
    ...inferredAliases,
    ...extraAliases.map((alias) => normalizeProductFactKey(alias))
  ].filter(Boolean);
  const aliases = seed.flatMap((key) => MATCH_KEY_ALIASES[key] ?? [key]);

  return [...new Set(aliases.map((alias) => normalizeProductFactKey(alias)).filter(Boolean))];
}

export function matchKeyAliases(
  value: string,
  extraAliases: readonly string[] = []
) {
  return new Set(productFactAliasKeys(value, extraAliases));
}

function keyTokens(key: string) {
  return normalizeProductFactKey(key)
    .split("_")
    .filter((token) => token.length > 1 && !MATCH_TOKEN_STOP_WORDS.has(token));
}

function editDistanceWithinOne(left: string, right: string) {
  if (left === right) {
    return true;
  }

  if (left.length < 5 || right.length < 5) {
    return false;
  }

  if (Math.abs(left.length - right.length) > 1) {
    return false;
  }

  let edits = 0;
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    edits += 1;

    if (edits > 1) {
      return false;
    }

    if (left.length > right.length) {
      leftIndex += 1;
    } else if (right.length > left.length) {
      rightIndex += 1;
    } else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return edits + (left.length - leftIndex) + (right.length - rightIndex) <= 1;
}

export function fuzzyTokensMatch(left: string, right: string) {
  const leftTokens = keyTokens(left);
  const rightTokens = keyTokens(right);

  if (leftTokens.length < 1 || rightTokens.length < 1) {
    return false;
  }

  const shorter = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const longer = leftTokens.length <= rightTokens.length ? rightTokens : leftTokens;
  const matched = shorter.filter((token) =>
    longer.some((candidate) => editDistanceWithinOne(token, candidate))
  ).length;

  return matched === shorter.length && matched / longer.length >= 0.6;
}

export function productKeysMatch(
  left: string,
  right: string,
  leftAliases: readonly string[] = [],
  rightAliases: readonly string[] = []
) {
  const leftKeys = matchKeyAliases(left, leftAliases);
  const rightKeys = matchKeyAliases(right, rightAliases);

  if ([...leftKeys].some((alias) => rightKeys.has(alias))) {
    return true;
  }

  return [...leftKeys].some((leftKey) =>
    [...rightKeys].some((rightKey) => fuzzyTokensMatch(leftKey, rightKey))
  );
}
