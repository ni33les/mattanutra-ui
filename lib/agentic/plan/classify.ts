import { catalogueHaystack } from "@/lib/agentic/catalogue/product-fit";
import type { CatalogueProduct, CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { productHitsCoverageFloor } from "@/lib/matcher/candidates";
import { productEligible } from "@/lib/matcher/eligibility";
import { productKeysMatch } from "@/lib/product-key-matching";
import { toMatcherProduct } from "@/lib/agentic/plan/to-matcher-product";
import type { CanonicalRequest } from "@/lib/matcher/types";
import type {
  CanonicalPlanState,
  CoverageRow,
  MatcherTelemetry,
  PlanTarget,
  StackOption,
  TargetClassification,
  TargetClass
} from "@/lib/agentic/plan/types";

function mappedToTarget(product: CatalogueProduct, target: PlanTarget) {
  if (product.contributionSupplementIds.includes(target.supplementId)) {
    return true;
  }

  return (product.candidate.facts ?? []).some(
    (fact) =>
      Boolean(fact.name?.trim()) && productKeysMatch(target.name, fact.name)
  );
}

function looksLikeTarget(product: CatalogueProduct, target: PlanTarget) {
  const hay = catalogueHaystack({
    brandName: product.candidate.brandName,
    facts: product.candidate.facts ?? [],
    title: product.candidate.title
  });

  if (productKeysMatch(target.name, product.candidate.title)) {
    return true;
  }

  if ((product.candidate.facts ?? []).some((fact) => productKeysMatch(target.name, fact.name))) {
    return true;
  }

  const tokens = target.name.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2);
  return tokens.length > 0 && tokens.every((token) => hay.includes(token));
}

function classifyOne(input: Readonly<{
  coverage: CoverageRow | undefined;
  eligibleCount: number;
  floorCoveringCount: number;
  hasCertificate: boolean;
  mappedCount: number;
  unmappedLookalike: boolean;
}>): TargetClass {
  const percent = input.coverage?.coveragePercent ?? 0;

  if (percent >= 90) {
    return "available";
  }

  if (input.mappedCount < 1) {
    return input.unmappedLookalike ? "mapping_defect" : "genuine_gap";
  }

  if (input.hasCertificate) {
    return "matcher_defect";
  }

  if (input.eligibleCount < 1 || input.floorCoveringCount < 1) {
    return "genuine_gap";
  }

  return "matcher_defect";
}

export function classifySnapshotTargets(input: Readonly<{
  lossCertificates?: MatcherTelemetry["lossCertificates"];
  request?: CanonicalRequest | { error: string };
  selected: StackOption | null;
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): TargetClassification[] {
  const request = input.request;
  const coverageById = new Map(
    (input.selected?.coverage ?? []).map((row) => [row.supplementId, row])
  );

  const matcherByProductId = new Map(
    input.snapshot.products.map((product) => [product.productId, toMatcherProduct(product)])
  );

  return input.state.targets.map((target) => {
    const mapped = input.snapshot.products.filter((product) =>
      mappedToTarget(product, target)
    );
    const eligible = mapped.filter((product) => {
      if (!request || "error" in request) {
        return product.orderable && product.stockStatus !== "unavailable";
      }

      return productEligible(
        matcherByProductId.get(product.productId) ?? toMatcherProduct(product),
        request
      );
    });
    const unmappedLookalike = mapped.length < 1 &&
      input.snapshot.products.some((product) => looksLikeTarget(product, target));
    const coverage = coverageById.get(target.supplementId);
    const canonicalTarget =
      request && !("error" in request)
        ? request.targets.find((item) => item.subjectId === target.supplementId)
        : undefined;
    const floorCoveringCount =
      canonicalTarget && request && !("error" in request)
        ? eligible.filter((product) =>
            productHitsCoverageFloor(
              matcherByProductId.get(product.productId) ?? toMatcherProduct(product),
              request,
              canonicalTarget
            )
          ).length
        : eligible.length;
    const targetClass = classifyOne({
      coverage,
      eligibleCount: eligible.length,
      floorCoveringCount,
      hasCertificate: Boolean(
        input.lossCertificates?.some(
          (item) => item.target_supplement_id === target.supplementId
        )
      ),
      mappedCount: mapped.length,
      unmappedLookalike
    });

    return {
      class: targetClass,
      coveragePercent: coverage?.coveragePercent ?? 0,
      eligibleProductCount: eligible.length,
      mappedProductCount: mapped.length,
      name: target.name,
      supplementId: target.supplementId
    };
  });
}
