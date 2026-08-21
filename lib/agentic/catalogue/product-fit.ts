import type { CatalogueProduct } from "@/lib/agentic/catalogue/types";
import type { ProductCandidate } from "@/lib/product-recommendation-types";

export function catalogueHaystack(
  candidate: Pick<ProductCandidate, "brandName" | "facts" | "title">
) {
  return [
    candidate.title,
    candidate.brandName ?? "",
    ...(candidate.facts ?? []).map((item) => item.name)
  ]
    .join(" ")
    .toLowerCase();
}

export function isPrenatalOrFertilitySku(
  candidate: Pick<ProductCandidate, "brandName" | "facts" | "title">
) {
  return /conceive|prenatal|pregnan|fertility|\bttc\b|gestation|maternal/i.test(
    catalogueHaystack(candidate)
  );
}

export function isNonAlgaeOmegaStandin(
  candidate: Pick<ProductCandidate, "brandName" | "facts" | "title">
) {
  const hay = catalogueHaystack(candidate);

  if (/\balgae\b|\balgal\b/.test(hay)) {
    return false;
  }

  return (
    /3\s*-?\s*6\s*-?\s*9/.test(hay) ||
    /\blecithin\b/.test(hay) ||
    /\bkrill\b/.test(hay) ||
    /\bfish\s+oil\b/.test(hay) ||
    /super omega/.test(hay)
  );
}

export function inferOmegaSource(candidate: ProductCandidate): CatalogueProduct["omegaSource"] {
  const haystack = catalogueHaystack(candidate);

  if (/\balgae\b|\balgal\b/.test(haystack)) {
    return "algae";
  }

  if (isNonAlgaeOmegaStandin(candidate)) {
    return "fish";
  }

  if (/\bfish\b|\bepa\b|\bdha\b|\bomega/.test(haystack) && /\boil\b/.test(haystack)) {
    return "fish";
  }

  return "none";
}

export function shouldSkipOmegaContribution(name: string, candidate: ProductCandidate) {
  if (!/omega|epa|dha|algae|algal|n-3|fish oil/.test(`${name} ${catalogueHaystack(candidate)}`)) {
    return false;
  }

  return isNonAlgaeOmegaStandin(candidate);
}

export function supplementNameMatchesFact(
  supplementName: string,
  wanted: string,
  candidate: ProductCandidate
) {
  if (supplementName === wanted) {
    return !shouldSkipOmegaContribution(wanted, candidate);
  }

  if (wanted.length >= 4 && supplementName.startsWith(`${wanted} `)) {
    return !shouldSkipOmegaContribution(wanted, candidate);
  }

  if (supplementName.length >= 4 && wanted.startsWith(`${supplementName} `)) {
    const rest = wanted.slice(supplementName.length).trim();

    if (/^(?:3[-\s]*)?6[-\s]*9\b/.test(rest) || /lecithin|krill/.test(rest)) {
      return false;
    }

    return !shouldSkipOmegaContribution(supplementName, candidate);
  }

  return false;
}
