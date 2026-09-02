import {
  APPROVED_CLAIMS,
  type ApprovedClaim
} from "@/lib/agentic/claims/corpus";

const PLAN_LEVEL_COVERAGE_STATUSES = new Set([
  "already_covered",
  "conditional_deferred",
  "covered",
  "gap",
  "over_target",
  "partial"
]);

export function selectApplicableClaims(input: Readonly<{
  status: string;
  supplementNames: readonly string[];
}>): readonly string[] {
  const names = new Set(input.supplementNames.map((item) => item.toLowerCase()));
  const selected = APPROVED_CLAIMS.filter((claim) => claimApplies(claim, input.status, names));
  return [...selected]
    .sort((left, right) => left.claimId.localeCompare(right.claimId))
    .map((item) => item.claimId);
}

export function selectCoverageClaimIds(input: Readonly<{
  name: string;
  planStatus?: string;
}>): readonly string[] {
  const planStatus = input.planStatus === "no_purchase" ? "no_purchase" : "ready";
  return selectApplicableClaims({
    status: planStatus,
    supplementNames: [input.name]
  });
}

export function planLevelSupplementNames(
  coverage: readonly Readonly<{ name: string; status: string }>[],
  currentNames: readonly string[] = []
) {
  const fromCoverage = coverage
    .filter((row) => PLAN_LEVEL_COVERAGE_STATUSES.has(row.status))
    .map((row) => row.name);
  return [...fromCoverage, ...currentNames];
}

function claimApplies(
  claim: ApprovedClaim,
  status: string,
  names: ReadonlySet<string>
) {
  if (!claim.relevance.statuses.includes(status as "ready" | "no_purchase")) {
    return false;
  }

  return claim.relevance.supplementNames.some((name) => names.has(name.toLowerCase()));
}
