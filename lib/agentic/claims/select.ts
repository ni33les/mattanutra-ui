import {
  APPROVED_CLAIMS,
  type ApprovedClaim
} from "@/lib/agentic/claims/corpus";

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
