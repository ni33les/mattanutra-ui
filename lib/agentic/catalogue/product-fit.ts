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
  return /conceive|pre[-\s]?natal|pregnan|fertility|\bttc\b|gestation|maternal|maternity|\bpre\s*9\+?|\bpre9\b/i.test(
    catalogueHaystack(candidate)
  );
}

export function isFalseOmegaAttribution(
  candidate: Pick<ProductCandidate, "brandName" | "facts" | "title"> | { title: string }
) {
  const hay =
    "facts" in candidate
      ? catalogueHaystack(candidate)
      : candidate.title.toLowerCase();

  if (/\balgae\b|\balgal\b/.test(hay)) {
    return false;
  }

  return (
    /3\s*-?\s*6\s*-?\s*9/.test(hay) ||
    /\blecithin\b/.test(hay) ||
    /\bkrill\b/.test(hay)
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
    isFalseOmegaAttribution(candidate) ||
    /\bfish\s+oil\b/.test(hay) ||
    /super omega/.test(hay)
  );
}

export function isNonAlgaeOmegaLine(
  candidate: Pick<ProductCandidate, "brandName" | "facts" | "title">
) {
  const hay = catalogueHaystack(candidate);

  if (/\balgae\b|\balgal\b/.test(hay)) {
    return false;
  }

  return (
    isNonAlgaeOmegaStandin(candidate) ||
    /\bomega\b|\bepa\b|\bdha\b/.test(hay)
  );
}

export function isAnimalDerivedSku(
  candidate: Pick<ProductCandidate, "brandName" | "facts" | "title">
) {
  const hay = catalogueHaystack(candidate);

  if (/\balgae\b|\balgal\b|\bvegan\b|\bplant[- ]based\b/.test(hay) && !/\bcollagen\b|\bgelatin\b|\bkrill\b|\bfish\s+oil\b/.test(hay)) {
    return false;
  }

  return (
    /\bcollagen\b/.test(hay) ||
    /\bgelatin\b/.test(hay) ||
    /\bkrill\b/.test(hay) ||
    /\bfish\s+oil\b/.test(hay) ||
    /\bwhey\b/.test(hay) ||
    isNonAlgaeOmegaLine(candidate)
  );
}

export function inferOmegaSource(candidate: ProductCandidate): CatalogueProduct["omegaSource"] {
  const haystack = catalogueHaystack(candidate);

  if (/\balgae\b|\balgal\b/.test(haystack)) {
    return "algae";
  }

  if (isNonAlgaeOmegaLine(candidate) || (/\bfish\b/.test(haystack) && /\boil\b/.test(haystack))) {
    return "fish";
  }

  return "none";
}

export function looksLikeOmegaLabel(value: string) {
  return /\bomega|\bepa\b|\bdha\b|n-3|fish oil|algal/i.test(value);
}

export function shouldSkipOmegaContribution(name: string, candidate: ProductCandidate) {
  if (isFalseOmegaAttribution(candidate) && looksLikeOmegaLabel(name)) {
    return true;
  }

  if (!/omega|epa|dha|algae|algal|n-3|fish oil/.test(`${name} ${catalogueHaystack(candidate)}`)) {
    return false;
  }

  return isFalseOmegaAttribution(candidate);
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
