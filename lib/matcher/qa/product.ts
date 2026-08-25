import type { MatcherProduct } from "@/lib/matcher/types";
import type { QaSubjectKey } from "@/lib/matcher/qa/subjects";
import { QA_SUBJECTS } from "@/lib/matcher/qa/subjects";

export type QaFact = Readonly<{
  amount: number;
  key: QaSubjectKey;
  name?: string;
  unit?: string;
}>;

export function qaProduct(input: Readonly<{
  id: string;
  facts: readonly QaFact[];
  priceThb: number;
  audience?: MatcherProduct["productAudience"];
  countries?: readonly string[] | null;
  currency?: string;
  dietary?: MatcherProduct["dietarySource"];
  form?: string;
  omega?: MatcherProduct["omegaSource"];
  orderable?: boolean;
  pills?: number;
  prenatal?: boolean;
  sellerId?: string;
  sellerName?: string;
  status?: MatcherProduct["status"];
  stock?: MatcherProduct["stockStatus"];
  title?: string;
  unknownSafetyAmount?: boolean;
  incompleteCommercialFacts?: boolean;
}>): MatcherProduct {
  const facts = input.facts.map((fact) => {
    const subject = QA_SUBJECTS[fact.key];

    return {
      amount: fact.amount,
      name: fact.name ?? subject.name,
      subjectId: subject.id,
      unit: fact.unit ?? subject.unit
    };
  });

  return {
    availableCountryCodes:
      input.countries === undefined ? ["TH"] : input.countries,
    contributionSubjectIds: [...new Set(facts.map((item) => item.subjectId))],
    currency: input.currency ?? "THB",
    dailyPillsPerServing: input.pills ?? 1,
    dietarySource: input.dietary ?? "any",
    form: input.form ?? "tablet",
    imageUrl: null,
    incompleteCommercialFacts: input.incompleteCommercialFacts ?? false,
    labelledContributions: facts,
    omegaSource: input.omega ?? "none",
    orderable: input.orderable ?? input.status !== "pending_review",
    prenatalOrFertility: input.prenatal ?? false,
    productAudience: input.audience ?? "both",
    productId: input.id,
    retailerSku: input.id,
    sellerId: input.sellerId ?? "seller_th",
    sellerName: input.sellerName ?? "TH",
    source: "fixture",
    status: input.status ?? "approved",
    stockStatus: input.stock ?? "in_stock",
    title: input.title ?? input.id,
    unknownSafetyAmount: input.unknownSafetyAmount ?? false,
    unitPriceMinor: Math.round(input.priceThb * 100)
  };
}
