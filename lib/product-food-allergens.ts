import type { ProductCandidate } from "@/lib/product-recommendation-types";

// These match affirmative ingredient/label identities only. Missing label data
// does not establish absence, and a free-from statement is not an ingredient.
const ALLERGENS: Readonly<Record<string, RegExp>> = {
  sesame: /\b(?:sesame|sesamin|tahini)\b/i,
  milk: /\b(?:milk|dairy|whey|casein(?:ate)?|colostrum|lactalbumin|lactoglobulin)\b/i,
  eggs: /\b(?:egg|eggs|albumen|ovalbumin)\b/i,
  fish: /\b(?:fish|salmon|cod|tuna|sardine|anchovy)\b/i,
  shellfish: /\b(?:shellfish|shrimp|prawn|krill|crab|lobster|mussel|oyster)\b/i,
  treenuts: /\b(?:almond|walnut|cashew|hazelnut|pecan|pistachio|macadamia|brazil nut)\b/i,
  peanuts: /\b(?:peanut|groundnut)\b/i,
  soy: /\b(?:soy|soya|soybean)\b/i,
  wheat: /\b(?:wheat|semolina|spelt|gluten)\b/i
};

export function productContainsFoodAllergen(product: Pick<ProductCandidate, "title" | "facts">, allergy: string) {
  const pattern = ALLERGENS[allergy];
  if (!pattern) return false;
  const affirmative = (text: string) => text
    .replace(/\b(?:milk|dairy|egg|fish|shellfish|soy|soya|wheat|gluten|peanut|nut)[ -]free\b/gi, "")
    .replace(/\b(?:free (?:of|from)|no|without)\s+(?:milk|dairy|eggs?|fish|shellfish|soy|soya|wheat|gluten|peanuts?|nuts?)\b/gi, "");
  return [product.title, ...product.facts.map(fact => fact.name)].some(text => pattern.test(affirmative(text)));
}
