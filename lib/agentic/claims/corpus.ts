import { RESEARCH_VERSION } from "@/lib/agentic/discovery/versions";

export type ClaimStrength = "emerging" | "moderate" | "established";

export type ApprovedClaim = Readonly<{
  claimId: string;
  limitation: string;
  prohibitedWording: readonly string[];
  relevance: Readonly<{
    supplementNames: readonly string[];
    statuses: readonly ("ready" | "no_purchase")[];
  }>;
  researchVersion: string;
  reviewDate: string;
  source: string;
  statement: string;
  strength: ClaimStrength;
}>;

export const APPROVED_CLAIMS: readonly ApprovedClaim[] = [
  {
    claimId: "clm_mg_muscle_relaxation_v1",
    limitation: "Not a treatment for cramp disorders; food and total diet matter.",
    prohibitedWording: ["cure", "treat disease", "prevent disease"],
    relevance: {
      statuses: ["ready", "no_purchase"],
      supplementNames: ["Magnesium"]
    },
    researchVersion: RESEARCH_VERSION,
    reviewDate: "2026-08-01",
    source: "NIH ODS Magnesium Fact Sheet for Health Professionals",
    statement: "Magnesium contributes to normal muscle function when intake meets the agreed daily target.",
    strength: "established"
  },
  {
    claimId: "clm_d3_bone_v1",
    limitation: "Does not diagnose or treat bone disease; sun exposure and diet also contribute.",
    prohibitedWording: ["cure", "treat osteoporosis", "prevent cancer"],
    relevance: {
      statuses: ["ready", "no_purchase"],
      supplementNames: ["Vitamin D3"]
    },
    researchVersion: RESEARCH_VERSION,
    reviewDate: "2026-08-01",
    source: "NIH ODS Vitamin D Fact Sheet for Health Professionals",
    statement: "Vitamin D helps maintain normal bone health when the agreed daily amount is met.",
    strength: "established"
  },
  {
    claimId: "clm_creatine_performance_v1",
    limitation: "Not a treatment for muscle disease; training and total diet also matter.",
    prohibitedWording: ["cure", "treat disease", "steroid"],
    relevance: {
      statuses: ["ready", "no_purchase"],
      supplementNames: ["Creatine"]
    },
    researchVersion: RESEARCH_VERSION,
    reviewDate: "2026-08-01",
    source: "ISSN exercise & sports nutrition review: creatine supplementation",
    statement: "Creatine monohydrate supports high-intensity exercise performance when the agreed daily amount is met.",
    strength: "established"
  },
  {
    claimId: "clm_omega3_intake_v1",
    limitation: "Algae or fish source must match the plan constraint; not a heart-disease treatment.",
    prohibitedWording: ["cure", "prevent heart attack", "treat CVD"],
    relevance: {
      statuses: ["ready"],
      supplementNames: ["Omega-3"]
    },
    researchVersion: RESEARCH_VERSION,
    reviewDate: "2026-08-01",
    source: "NIH ODS Omega-3 Fatty Acids Fact Sheet for Health Professionals",
    statement: "An agreed EPA/DHA target can be met from a labelled omega-3 product that matches the source constraint.",
    strength: "moderate"
  }
] as const;

export function claimById(claimId: string) {
  return APPROVED_CLAIMS.find((item) => item.claimId === claimId) ?? null;
}

export function researchVersion() {
  return RESEARCH_VERSION;
}
