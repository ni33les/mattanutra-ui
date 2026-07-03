import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { getSql } from "@/lib/db";
import {
  callGovernedGrokChatCompletion,
  configuredGrokModel,
  configuredGrokValue,
  getRequiredXaiApiKey
} from "@/lib/grok-client";
import { type Locale, isLocale } from "@/lib/i18n";
import {
  panyaEntitlementLabel,
  resolvePanyaEntitlement,
  type PanyaEntitlement
} from "@/lib/panya";

export type CustomerInsightAiStatus =
  | "disabled"
  | "fallback"
  | "generated"
  | "unavailable";

export type CustomerInsightHealthScore = Readonly<{
  band: string | null;
  focusAreas: string[];
  score: number | null;
}>;

export type CustomerInsightPanyaActivity = Readonly<{
  channelAddress: string | null;
  channelType: string | null;
  escalationCount: number;
  failedCount: number;
  inboundCount: number;
  lastMessageAt: string | null;
  latestSnippets: string[];
  messageCount: number;
  outboundCount: number;
}>;

export type CustomerInsightDemographics = Readonly<{
  ageBand: string | null;
  ageLabel: string | null;
  lifeStage: string | null;
  reproductiveStatus: string | null;
  sex: string | null;
  sexLabel: string | null;
}>;

export type CustomerInsightProfile = Readonly<{
  archetypeId: string;
  archetypeLabel: string;
  campaign: string | null;
  capturedAt: string;
  constraints: string[];
  contactEmail: string | null;
  demographics: CustomerInsightDemographics;
  entitlement: PanyaEntitlement;
  entitlementLabel: string;
  firstName: string | null;
  funnelStage: string;
  goals: string[];
  healthScore: CustomerInsightHealthScore | null;
  identifiable: boolean;
  lastActivityAt: string;
  lastEvent: string | null;
  locale: Locale;
  orderNumber: string | null;
  orderStatus: string | null;
  panya: CustomerInsightPanyaActivity;
  planId: string;
  primarySegmentId: string;
  productInterests: string[];
  profile: string | null;
  purchaseReadinessScore: number;
  region: string | null;
  segmentIds: string[];
  segmentReasons: string[];
  selectedPlan: string | null;
  source: string | null;
  status: string;
  supplementInterests: string[];
  updatedAt: string;
}>;

export type CustomerInsightArchetype = Readonly<{
  averageHealthScore: number | null;
  count: number;
  customersWithOrders: number;
  description: string;
  entitlement: PanyaEntitlement;
  id: string;
  label: string;
  paidCustomers: number;
  panyaEngaged: number;
  planLabel: string;
  primaryGoal: string | null;
  signalMix: string[];
}>;

export type CustomerInsightSegment = Readonly<{
  aiLabel: string | null;
  averageHealthScore: number | null;
  count: number;
  customersWithOrders: number;
  description: string;
  deterministicLabel: string;
  id: string;
  label: string;
  likelyMotivation: string;
  likelyObjection: string;
  marketingAngle: string;
  nextMessageTheme: string;
  paidCustomers: number;
  panyaEngaged: number;
  panyaEngagementScore: number;
  purchaseReadinessScore: number;
  signalMix: string[];
}>;

export type AdminCustomerInsightsData = Readonly<{
  aiStatus: CustomerInsightAiStatus;
  archetypes: CustomerInsightArchetype[];
  customers: CustomerInsightProfile[];
  databaseAvailable: boolean;
  generatedAt: string;
  range: AdminDashboardRange;
  segments: CustomerInsightSegment[];
  summary: {
    activeSegments: number;
    identifiableCustomers: number;
    orderLinkedCustomers: number;
    paidCustomers: number;
    panyaEngagedCustomers: number;
    totalCustomers: number;
  };
}>;

type SchemaAvailability = Readonly<{
  assessments: boolean;
  bpm: boolean;
  communicationChannels: boolean;
  communicationMessages: boolean;
  productDecisions: boolean;
  retailCheckoutPayments: boolean;
  retailCustomerOrders: boolean;
  supplementSelections: boolean;
}>;

type AssessmentRow = Readonly<{
  answer_summary: unknown;
  answers: unknown;
  captured_at: Date | string;
  contact_email: string | null;
  first_name: string | null;
  health_score: unknown;
  locale: string;
  plan_id: string;
  selected_plan: string | null;
  status: string;
  updated_at: Date | string;
}>;

type CommunicationInsight = Readonly<{
  channelAddress: string | null;
  channelType: string | null;
  escalationCount: number;
  failedCount: number;
  inboundCount: number;
  lastMessageAt: string | null;
  latestSnippets: string[];
  messageCount: number;
  outboundCount: number;
}>;

type LeadInsight = Readonly<{
  campaign: string | null;
  funnelStage: string;
  lastEvent: string | null;
  lastSeenAt: string | null;
  source: string | null;
}>;

type OrderInsight = Readonly<{
  orderNumber: string | null;
  orderStatus: string | null;
  updatedAt: string | null;
}>;

type SegmentRule = Readonly<{
  description: string;
  id: string;
  label: string;
  matches: (customer: CustomerInsightProfileDraft) => boolean;
  reason: (customer: CustomerInsightProfileDraft) => string;
  signalMix: (customer: CustomerInsightProfileDraft) => string[];
}>;

type CustomerInsightProfileDraft = Omit<
  CustomerInsightProfile,
  "primarySegmentId" | "purchaseReadinessScore" | "segmentIds" | "segmentReasons"
> & {
  primarySegmentId?: string;
  purchaseReadinessScore?: number;
  segmentIds?: string[];
  segmentReasons?: string[];
};

const emptyPanyaActivity: CustomerInsightPanyaActivity = {
  channelAddress: null,
  channelType: null,
  escalationCount: 0,
  failedCount: 0,
  inboundCount: 0,
  lastMessageAt: null,
  latestSnippets: [],
  messageCount: 0,
  outboundCount: 0
};

export function emptyAdminCustomerInsightsData(
  range: AdminDashboardRange
): AdminCustomerInsightsData {
  return {
    aiStatus: "unavailable",
    archetypes: [],
    customers: [],
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    range,
    segments: [],
    summary: {
      activeSegments: 0,
      identifiableCustomers: 0,
      orderLinkedCustomers: 0,
      paidCustomers: 0,
      panyaEngagedCustomers: 0,
      totalCustomers: 0
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function isoOrNull(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function safeLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : "en";
}

function stringList(value: unknown, max = 6) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((item) => {
      const text = cleanText(item);

      return text ? [text] : [];
    })
    .slice(0, max);
}

function answerSummary(value: unknown) {
  const record = asRecord(value);

  return {
    constraints: stringList(record.constraints),
    goals: stringList(record.goals),
    profile: cleanText(record.profile),
    region: cleanText(record.region)
  };
}

function labelFromMap(value: unknown, labels: Readonly<Record<string, string>>) {
  const text = cleanText(value);

  return text ? labels[text] ?? text : null;
}

const ageLabels: Record<string, string> = {
  "18-25": "early-20s",
  "26-35": "early-30s",
  "36-45": "40-ish",
  "46-55": "50-ish",
  "56-65": "60-ish",
  "66+": "66+"
};

const sexLabels: Record<string, string> = {
  female: "woman",
  male: "man"
};

const menopauseLabels: Record<string, string> = {
  peri: "perimenopause",
  post: "post-menopause",
  pre: "pre-menopause",
  unsure: "menopause unsure"
};

const reproductiveStatusLabels: Record<string, string> = {
  breastfeeding: "breastfeeding",
  none: "",
  pregnant: "pregnant",
  ttc: "trying to conceive"
};

function demographicsFromAnswers(value: unknown): CustomerInsightDemographics {
  const record = asRecord(value);
  const ageBand = cleanText(record.age);
  const sex = cleanText(record.sex);
  const menopause = cleanText(record.menopause);
  const reproductiveStatus = cleanText(record.reproStatus);
  const reproductiveLabel = labelFromMap(
    reproductiveStatus,
    reproductiveStatusLabels
  );
  const menopauseLabel =
    sex === "female" ? labelFromMap(menopause, menopauseLabels) : null;

  return {
    ageBand,
    ageLabel: ageBand ? ageLabels[ageBand] ?? ageBand : null,
    lifeStage: reproductiveLabel || menopauseLabel,
    reproductiveStatus,
    sex,
    sexLabel: sex ? sexLabels[sex] ?? sex : null
  };
}

function slugPart(value: string | null | undefined) {
  return (value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "unknown";
}

function archetypeFromCustomerSignals(input: Readonly<{
  demographics: CustomerInsightDemographics;
  entitlement: PanyaEntitlement;
  entitlementLabel: string;
  goals: readonly string[];
}>) {
  const primaryGoal = input.goals[0] ?? null;
  const personParts = [
    input.demographics.ageLabel,
    input.demographics.lifeStage,
    input.demographics.sexLabel ?? "customer"
  ].filter(Boolean);
  const personLabel = personParts.length > 0 ? personParts.join(" ") : "Unknown persona";
  const label = primaryGoal ? `${personLabel} focused on ${primaryGoal}` : personLabel;

  return {
    id: [
      input.entitlement,
      slugPart(input.demographics.ageBand),
      slugPart(input.demographics.sex),
      slugPart(input.demographics.lifeStage),
      slugPart(primaryGoal)
    ].join(":"),
    label,
    primaryGoal
  };
}

function healthScoreInsight(value: unknown): CustomerInsightHealthScore | null {
  const record = asRecord(value);
  const score = optionalNumber(record.score);
  const band = cleanText(record.band);
  const domains = Array.isArray(record.domains)
    ? record.domains.flatMap((item) => {
        const domain = asRecord(item);
        const label =
          cleanText(domain.label) ?? cleanText(domain.name) ?? cleanText(domain.id);
        const domainScore = optionalNumber(domain.score);

        return label ? [{ label, score: domainScore ?? 100 }] : [];
      })
    : [];
  const focusAreas = domains
    .sort((left, right) => left.score - right.score)
    .map((domain) => domain.label)
    .slice(0, 3);

  if (score === null && !band && focusAreas.length === 0) {
    return null;
  }

  return {
    band,
    focusAreas,
    score
  };
}

function latestIso(...values: Array<string | null | undefined>) {
  const timestamps = values
    .flatMap((value) => {
      if (!value) {
        return [];
      }

      const time = new Date(value).getTime();

      return Number.isFinite(time) ? [time] : [];
    })
    .sort((left, right) => right - left);

  return timestamps[0] ? new Date(timestamps[0]).toISOString() : new Date().toISOString();
}

function daysSince(value: string | null | undefined) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const elapsed = Date.now() - new Date(value).getTime();

  return Number.isFinite(elapsed) ? elapsed / 86_400_000 : Number.POSITIVE_INFINITY;
}

function textIncludesAny(values: readonly string[], terms: readonly string[]) {
  const haystack = values.join(" ").toLowerCase();

  return terms.some((term) => haystack.includes(term));
}

function purchaseReadiness(customer: CustomerInsightProfileDraft) {
  let score = 10;

  if (customer.selectedPlan) {
    score += 30;
  }

  if (customer.orderNumber || customer.orderStatus) {
    score += 25;
  }

  if (customer.panya.inboundCount > 0) {
    score += 15;
  }

  if (customer.funnelStage === "paid") {
    score += 15;
  } else if (customer.funnelStage === "healthscore_viewed") {
    score += 8;
  }

  if (daysSince(customer.lastActivityAt) <= 14) {
    score += 10;
  }

  return Math.min(100, score);
}

function panyaEngagementScore(customer: CustomerInsightProfile) {
  return Math.min(
    100,
    customer.panya.messageCount * 12 +
      customer.panya.inboundCount * 8 +
      customer.panya.escalationCount * 10
  );
}

function unique(values: readonly string[], max = 8) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, max);
}

function fallbackCampaignAngle(label: string) {
  return `Speak to the practical next step for ${label.toLowerCase()}.`;
}

function fallbackMotivation(label: string) {
  return `They are showing signals that match ${label.toLowerCase()}.`;
}

function fallbackObjection(label: string) {
  return `They may need clearer proof, timing, or reassurance around ${label.toLowerCase()} before acting.`;
}

function fallbackNextMessage(label: string) {
  return `Send a concise, personal message tied to ${label.toLowerCase()}.`;
}

const segmentRules: SegmentRule[] = [
  {
    description: "Paid customers who are already talking to Panya.",
    id: "panya-engaged-paid",
    label: "Panya-engaged paid customers",
    matches: (customer) => Boolean(customer.selectedPlan && customer.panya.inboundCount > 0),
    reason: () => "Paid plan with inbound Panya activity",
    signalMix: (customer) => [
      customer.entitlementLabel,
      `${customer.panya.inboundCount} inbound Panya message${customer.panya.inboundCount === 1 ? "" : "s"}`,
      customer.orderStatus ? `order ${customer.orderStatus}` : "no linked order"
    ]
  },
  {
    description: "Living Protocol customers with enough context for high-touch lifecycle marketing.",
    id: "living-protocol-active",
    label: "Living Protocol active customers",
    matches: (customer) => customer.entitlement === "living_protocol",
    reason: () => "Selected Living Protocol",
    signalMix: (customer) => [
      customer.entitlementLabel,
      ...customer.goals.slice(0, 2),
      customer.panya.messageCount > 0 ? "Panya connected" : "No Panya thread"
    ]
  },
  {
    description: "Right Amount Formula customers who may need product and formula education.",
    id: "right-amount-formula-ready",
    label: "Right Amount Formula ready",
    matches: (customer) => customer.entitlement === "right_amount_formula",
    reason: () => "Selected Right Amount Formula",
    signalMix: (customer) => [
      customer.entitlementLabel,
      ...customer.supplementInterests.slice(0, 2),
      ...customer.productInterests.slice(0, 1)
    ]
  },
  {
    description: "LINE/Panya reachable customers without a linked retail order.",
    id: "line-connected-no-order",
    label: "Connected but not ordered",
    matches: (customer) =>
      Boolean(customer.panya.channelAddress || customer.panya.messageCount > 0) &&
      !customer.orderNumber,
    reason: () => "Reachable through Panya but no linked order",
    signalMix: (customer) => [
      customer.panya.channelType ?? "connected channel",
      customer.funnelStage,
      ...customer.goals.slice(0, 2)
    ]
  },
  {
    description: "Customers with an order that is still moving through fulfillment.",
    id: "order-in-progress",
    label: "Order in progress",
    matches: (customer) =>
      Boolean(customer.orderStatus) &&
      !["cancelled", "delivered", "returned"].includes(customer.orderStatus ?? ""),
    reason: (customer) => `Latest order status is ${customer.orderStatus}`,
    signalMix: (customer) => [
      customer.orderStatus ?? "order active",
      customer.orderNumber ?? "linked order",
      customer.panya.messageCount > 0 ? "Panya context available" : "no chat yet"
    ]
  },
  {
    description: "Customers with a lower HealthScore or clear formula themes.",
    id: "healthscore-opportunity",
    label: "HealthScore opportunity",
    matches: (customer) =>
      (customer.healthScore?.score ?? 101) <= 72 ||
      (customer.healthScore?.focusAreas.length ?? 0) > 0,
    reason: (customer) =>
      customer.healthScore?.score !== null && customer.healthScore?.score !== undefined
        ? `HealthScore ${customer.healthScore.score}`
        : "HealthScore focus areas available",
    signalMix: (customer) => [
      customer.healthScore?.band ?? "HealthScore context",
      ...(customer.healthScore?.focusAreas ?? []),
      ...customer.goals.slice(0, 2)
    ]
  },
  {
    description: "Customers talking about sleep, stress, energy, focus, or routine themes.",
    id: "daily-routine-themes",
    label: "Daily routine themes",
    matches: (customer) =>
      textIncludesAny(
        [
          ...customer.goals,
          ...customer.constraints,
          ...(customer.healthScore?.focusAreas ?? []),
          ...customer.panya.latestSnippets
        ],
        ["sleep", "stress", "energy", "focus", "routine", "นอน", "เครียด", "พลังงาน"]
      ),
    reason: () => "Goals or Panya context mention daily routine themes",
    signalMix: (customer) => [
      ...customer.goals.slice(0, 3),
      ...(customer.healthScore?.focusAreas ?? [])
    ]
  },
  {
    description: "Identifiable customers with assessment context but limited follow-up signal.",
    id: "assessment-only",
    label: "Assessment-only customers",
    matches: (customer) =>
      customer.panya.messageCount === 0 && !customer.orderNumber && customer.identifiable,
    reason: () => "Assessment is identifiable but not yet chat or order engaged",
    signalMix: (customer) => [
      customer.locale,
      customer.funnelStage,
      ...customer.goals.slice(0, 2)
    ]
  }
];

function segmentIdsForCustomer(customer: CustomerInsightProfileDraft) {
  const matches = segmentRules.flatMap((rule) =>
    rule.matches(customer)
      ? [
          {
            id: rule.id,
            reason: rule.reason(customer)
          }
        ]
      : []
  );

  return matches.length > 0
    ? matches
    : [
        {
          id: "general-customer-base",
          reason: "Customer has questionnaire context"
        }
      ];
}

function buildSegmentSummary(
  id: string,
  customers: readonly CustomerInsightProfile[]
): CustomerInsightSegment {
  const rule = segmentRules.find((item) => item.id === id);
  const deterministicLabel = rule?.label ?? "General customer base";
  const healthScores = customers.flatMap((customer) =>
    customer.healthScore?.score !== null && customer.healthScore?.score !== undefined
      ? [customer.healthScore.score]
      : []
  );
  const signalMix = unique(
    customers.flatMap((customer) => {
      if (rule) {
        return rule.signalMix(customer);
      }

      return [customer.funnelStage, customer.entitlementLabel, ...customer.goals.slice(0, 2)];
    })
  );
  const purchaseReadinessScore =
    customers.reduce((sum, customer) => sum + customer.purchaseReadinessScore, 0) /
    Math.max(1, customers.length);
  const panyaScore =
    customers.reduce((sum, customer) => sum + panyaEngagementScore(customer), 0) /
    Math.max(1, customers.length);

  return {
    aiLabel: null,
    averageHealthScore:
      healthScores.length > 0
        ? Math.round(
            healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length
          )
        : null,
    count: customers.length,
    customersWithOrders: customers.filter(
      (customer) => customer.orderNumber || customer.orderStatus
    ).length,
    description:
      rule?.description ?? "Customers with assessment context and emerging marketing signals.",
    deterministicLabel,
    id,
    label: deterministicLabel,
    likelyMotivation: fallbackMotivation(deterministicLabel),
    likelyObjection: fallbackObjection(deterministicLabel),
    marketingAngle: fallbackCampaignAngle(deterministicLabel),
    nextMessageTheme: fallbackNextMessage(deterministicLabel),
    paidCustomers: customers.filter((customer) => Boolean(customer.selectedPlan)).length,
    panyaEngaged: customers.filter((customer) => customer.panya.messageCount > 0).length,
    panyaEngagementScore: Math.round(panyaScore),
    purchaseReadinessScore: Math.round(purchaseReadinessScore),
    signalMix
  };
}

export function buildCustomerInsightSegments(
  drafts: readonly CustomerInsightProfileDraft[]
): {
  customers: CustomerInsightProfile[];
  segments: CustomerInsightSegment[];
} {
  const customers = drafts.map((draft): CustomerInsightProfile => {
    const matches = segmentIdsForCustomer(draft);
    const purchaseScore = purchaseReadiness(draft);

    return {
      ...draft,
      primarySegmentId: matches[0]?.id ?? "general-customer-base",
      purchaseReadinessScore: purchaseScore,
      segmentIds: matches.map((match) => match.id),
      segmentReasons: matches.map((match) => match.reason)
    };
  });
  const customerGroups = customers.reduce<Map<string, CustomerInsightProfile[]>>(
    (map, customer) => {
      for (const segmentId of customer.segmentIds) {
        const group = map.get(segmentId) ?? [];

        group.push(customer);
        map.set(segmentId, group);
      }

      return map;
    },
    new Map()
  );
  const segments = [...customerGroups.entries()]
    .map(([id, group]) => buildSegmentSummary(id, group))
    .sort(
      (first, second) =>
        second.count - first.count ||
        second.purchaseReadinessScore - first.purchaseReadinessScore ||
        first.label.localeCompare(second.label)
    );

  return { customers, segments };
}

export function customerInsightsAiPromptInput(
  segments: readonly CustomerInsightSegment[]
) {
  return {
    constraints: [
      "Return JSON only with a segments array.",
      "Do not invent customer facts.",
      "Do not include diagnosis, medical claims, or sensitive symptom details.",
      "Keep each field short, human, and useful for marketing."
    ],
    segments: segments.slice(0, 12).map((segment) => ({
      averageHealthScore: segment.averageHealthScore,
      count: segment.count,
      customersWithOrders: segment.customersWithOrders,
      deterministicLabel: segment.deterministicLabel,
      id: segment.id,
      paidCustomers: segment.paidCustomers,
      panyaEngaged: segment.panyaEngaged,
      panyaEngagementScore: segment.panyaEngagementScore,
      purchaseReadinessScore: segment.purchaseReadinessScore,
      signalMix: segment.signalMix
    }))
  };
}

type SegmentAiEnrichment = Readonly<{
  id: string;
  label: string | null;
  likelyMotivation: string | null;
  likelyObjection: string | null;
  marketingAngle: string | null;
  nextMessageTheme: string | null;
}>;

function safeAiText(value: unknown, maxLength = 140) {
  const text = cleanText(value)
    ?.replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return null;
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function parseSegmentAiEnrichments(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    const segments = asRecord(parsed).segments;

    if (!Array.isArray(segments)) {
      return [];
    }

    return segments.flatMap((item): SegmentAiEnrichment[] => {
      const record = asRecord(item);
      const id = cleanText(record.id);

      return id
        ? [
            {
              id,
              label: safeAiText(record.label, 80),
              likelyMotivation: safeAiText(record.likelyMotivation),
              likelyObjection: safeAiText(record.likelyObjection),
              marketingAngle: safeAiText(record.marketingAngle),
              nextMessageTheme: safeAiText(record.nextMessageTheme)
            }
          ]
        : [];
    });
  } catch {
    return [];
  }
}

export function applyCustomerInsightSegmentAi(
  segments: readonly CustomerInsightSegment[],
  enrichments: readonly SegmentAiEnrichment[]
) {
  const byId = new Map(enrichments.map((item) => [item.id, item]));

  return segments.map((segment): CustomerInsightSegment => {
    const enrichment = byId.get(segment.id);
    const label = enrichment?.label ?? segment.label;

    return {
      ...segment,
      aiLabel: enrichment?.label ?? null,
      label,
      likelyMotivation: enrichment?.likelyMotivation ?? segment.likelyMotivation,
      likelyObjection: enrichment?.likelyObjection ?? segment.likelyObjection,
      marketingAngle: enrichment?.marketingAngle ?? segment.marketingAngle,
      nextMessageTheme: enrichment?.nextMessageTheme ?? segment.nextMessageTheme
    };
  });
}

async function enrichCustomerInsightSegments(
  segments: readonly CustomerInsightSegment[]
) {
  if (segments.length === 0) {
    return {
      aiStatus: "unavailable" as const,
      segments
    };
  }

  if (process.env.CUSTOMER_INSIGHTS_AI_ENABLED === "false") {
    return {
      aiStatus: "disabled" as const,
      segments
    };
  }

  let apiKey = "";

  try {
    apiKey = getRequiredXaiApiKey();
  } catch {
    return {
      aiStatus: "unavailable" as const,
      segments
    };
  }

  try {
    const model = configuredGrokModel(
      process.env.CUSTOMER_INSIGHTS_MODEL,
      process.env.GROK_MODEL
    );
    const completion = await callGovernedGrokChatCompletion({
      apiKey,
      cost: {
        metadata: {
          segmentCount: segments.length,
          source: "admin_customer_insights"
        },
        recordUsage: true
      },
      maxTokens: 1000,
      messages: [
        {
          content: [
            "You are a marketing intelligence analyst for MattaNutra.",
            "Create segment-level language only. Do not mention exact customer names, emails, LINE handles, raw chat text, diagnoses, or sensitive symptoms.",
            "Return JSON in this shape: {\"segments\":[{\"id\":\"...\",\"label\":\"...\",\"marketingAngle\":\"...\",\"likelyMotivation\":\"...\",\"likelyObjection\":\"...\",\"nextMessageTheme\":\"...\"}]}."
          ].join("\n"),
          role: "system"
        },
        {
          content: JSON.stringify(customerInsightsAiPromptInput(segments)),
          role: "user"
        }
      ],
      model,
      purpose: "customer insights segment enrichment",
      reasoningEffort:
        configuredGrokValue(process.env.CUSTOMER_INSIGHTS_REASONING_EFFORT) ||
        "none",
      temperature: 0.35,
      timeoutMs: 8_000
    });
    const enrichments = parseSegmentAiEnrichments(
      completion.choices?.[0]?.message?.content
    );

    if (enrichments.length === 0) {
      return {
        aiStatus: "fallback" as const,
        segments
      };
    }

    return {
      aiStatus: "generated" as const,
      segments: applyCustomerInsightSegmentAi(segments, enrichments)
    };
  } catch {
    return {
      aiStatus: "fallback" as const,
      segments
    };
  }
}

async function customerInsightsSchemaAvailable(sql: NonNullable<ReturnType<typeof getSql>>) {
  const rows = await sql<Array<{
    assessments: boolean;
    bpm: boolean;
    communication_channels: boolean;
    communication_messages: boolean;
    product_decisions: boolean;
    retail_checkout_payments: boolean;
    retail_customer_orders: boolean;
    supplement_selections: boolean;
  }>>`
    select
      to_regclass('public.assessments') is not null as assessments,
      to_regclass('public.bpm') is not null as bpm,
      to_regclass('public.communication_channels') is not null as communication_channels,
      to_regclass('public.communication_messages') is not null as communication_messages,
      to_regclass('public.product_recommendation_decisions') is not null as product_decisions,
      to_regclass('public.retail_checkout_payments') is not null as retail_checkout_payments,
      to_regclass('public.retail_customer_orders') is not null as retail_customer_orders,
      to_regclass('public.supplement_recommendation_selections') is not null as supplement_selections
  `;
  const row = rows[0];

  return {
    assessments: row?.assessments === true,
    bpm: row?.bpm === true,
    communicationChannels: row?.communication_channels === true,
    communicationMessages: row?.communication_messages === true,
    productDecisions: row?.product_decisions === true,
    retailCheckoutPayments: row?.retail_checkout_payments === true,
    retailCustomerOrders: row?.retail_customer_orders === true,
    supplementSelections: row?.supplement_selections === true
  } satisfies SchemaAvailability;
}

async function loadAssessmentRows(
  sql: NonNullable<ReturnType<typeof getSql>>,
  range: AdminDashboardRange
) {
  const start = adminDashboardRangeStart(range);

  return sql<AssessmentRow[]>`
    select
      plan_id::text,
      locale,
      selected_plan::text,
      status::text,
      answers,
      answer_summary,
      first_name,
      contact_email,
      health_score,
      captured_at,
      updated_at
    from public.assessments
    where (${start}::timestamptz is null or greatest(captured_at, updated_at) >= ${start})
    order by greatest(captured_at, updated_at) desc
    limit 1000
  `;
}

async function loadCommunicationInsights(
  sql: NonNullable<ReturnType<typeof getSql>>,
  planIds: readonly string[],
  availability: SchemaAvailability
) {
  if (!availability.communicationMessages || planIds.length === 0) {
    return new Map<string, CommunicationInsight>();
  }

  const rows = availability.communicationChannels
    ? await sql<Array<{
        address: string | null;
        channel_type: string | null;
        escalation_count: number | string;
        failed_count: number | string;
        inbound_count: number | string;
        last_message_at: Date | string | null;
        latest_snippets: string[] | null;
        message_count: number | string;
        outbound_count: number | string;
        plan_id: string;
      }>>`
        select
          communication_messages.plan_id::text,
          count(*)::int as message_count,
          count(*) filter (where communication_messages.direction = 'inbound')::int as inbound_count,
          count(*) filter (where communication_messages.direction = 'outbound')::int as outbound_count,
          count(*) filter (where communication_messages.status in ('failed', 'no_channel'))::int as failed_count,
          count(*) filter (where communication_messages.metadata ->> 'escalate' = 'true')::int as escalation_count,
          max(communication_messages.created_at) as last_message_at,
          (array_remove(array_agg(communication_channels.channel_type order by communication_messages.created_at desc), null))[1] as channel_type,
          (array_remove(array_agg(communication_channels.address order by communication_messages.created_at desc), null))[1] as address,
          (array_remove(array_agg(left(communication_messages.body, 180) order by communication_messages.created_at desc), null))[1:3] as latest_snippets
        from public.communication_messages
        left join public.communication_channels
          on communication_channels.id = communication_messages.channel_id
        where communication_messages.plan_id = any(${planIds}::uuid[])
          and (
            communication_messages.message_type like 'panya_%'
            or communication_messages.message_type = 'line_inbound'
          )
        group by communication_messages.plan_id
      `
    : await sql<Array<{
        address: string | null;
        channel_type: string | null;
        escalation_count: number | string;
        failed_count: number | string;
        inbound_count: number | string;
        last_message_at: Date | string | null;
        latest_snippets: string[] | null;
        message_count: number | string;
        outbound_count: number | string;
        plan_id: string;
      }>>`
        select
          communication_messages.plan_id::text,
          count(*)::int as message_count,
          count(*) filter (where communication_messages.direction = 'inbound')::int as inbound_count,
          count(*) filter (where communication_messages.direction = 'outbound')::int as outbound_count,
          count(*) filter (where communication_messages.status in ('failed', 'no_channel'))::int as failed_count,
          count(*) filter (where communication_messages.metadata ->> 'escalate' = 'true')::int as escalation_count,
          max(communication_messages.created_at) as last_message_at,
          null::text as channel_type,
          null::text as address,
          (array_remove(array_agg(left(communication_messages.body, 180) order by communication_messages.created_at desc), null))[1:3] as latest_snippets
        from public.communication_messages
        where communication_messages.plan_id = any(${planIds}::uuid[])
          and (
            communication_messages.message_type like 'panya_%'
            or communication_messages.message_type = 'line_inbound'
          )
        group by communication_messages.plan_id
      `;

  return new Map(
    rows.map((row) => [
      row.plan_id,
      {
        channelAddress: row.address,
        channelType: row.channel_type,
        escalationCount: numberValue(row.escalation_count),
        failedCount: numberValue(row.failed_count),
        inboundCount: numberValue(row.inbound_count),
        lastMessageAt: isoOrNull(row.last_message_at),
        latestSnippets: stringList(row.latest_snippets, 3),
        messageCount: numberValue(row.message_count),
        outboundCount: numberValue(row.outbound_count)
      }
    ])
  );
}

function leadStage(row: {
  healthscore_viewed: boolean | null;
  paid: boolean | null;
  started: boolean | null;
  submitted: boolean | null;
}) {
  if (row.paid) {
    return "paid";
  }

  if (row.healthscore_viewed) {
    return "healthscore_viewed";
  }

  if (row.submitted) {
    return "submitted";
  }

  if (row.started) {
    return "started";
  }

  return "assessment";
}

async function loadLeadInsights(
  sql: NonNullable<ReturnType<typeof getSql>>,
  planIds: readonly string[],
  availability: SchemaAvailability
) {
  if (!availability.bpm || planIds.length === 0) {
    return new Map<string, LeadInsight>();
  }

  const rows = await sql<Array<{
    campaign: string | null;
    healthscore_viewed: boolean | null;
    last_event: string | null;
    last_seen_at: Date | string | null;
    paid: boolean | null;
    plan_id: string;
    source: string | null;
    started: boolean | null;
    submitted: boolean | null;
  }>>`
    select
      plan_id::text,
      (array_remove(array_agg(coalesce(nullif(utm_source, ''), nullif(traffic_source, ''), nullif(source_channel, '')) order by occurred_at desc), null))[1] as source,
      (array_remove(array_agg(coalesce(nullif(utm_campaign, ''), nullif(campaign_name, '')) order by occurred_at desc), null))[1] as campaign,
      (array_agg(event_name order by occurred_at desc))[1] as last_event,
      max(occurred_at) as last_seen_at,
      bool_or(event_name = 'assessment_started') as started,
      bool_or(event_name in ('assessment_submitted', 'assessment_captured', 'assessment_recaptured')) as submitted,
      bool_or(event_name = 'healthscore_viewed') as healthscore_viewed,
      bool_or(event_type = 'payment' and event_status in ('paid', 'succeeded', 'completed')) as paid
    from public.bpm
    where plan_id = any(${planIds}::uuid[])
    group by plan_id
  `;

  return new Map(
    rows.map((row) => [
      row.plan_id,
      {
        campaign: row.campaign,
        funnelStage: leadStage(row),
        lastEvent: row.last_event,
        lastSeenAt: isoOrNull(row.last_seen_at),
        source: row.source
      }
    ])
  );
}

async function loadOrderInsights(
  sql: NonNullable<ReturnType<typeof getSql>>,
  planIds: readonly string[],
  availability: SchemaAvailability
) {
  if (
    !availability.retailCheckoutPayments ||
    !availability.retailCustomerOrders ||
    planIds.length === 0
  ) {
    return new Map<string, OrderInsight>();
  }

  const rows = await sql<Array<{
    order_number: string | null;
    order_status: string | null;
    plan_id: string;
    updated_at: Date | string | null;
  }>>`
    select distinct on (retail_checkout_payments.plan_id)
      retail_checkout_payments.plan_id::text,
      retail_customer_orders.order_number,
      coalesce(retail_customer_orders.status, retail_checkout_payments.status) as order_status,
      coalesce(retail_customer_orders.updated_at, retail_checkout_payments.updated_at) as updated_at
    from public.retail_checkout_payments
    left join public.retail_customer_orders
      on retail_customer_orders.id = retail_checkout_payments.retail_customer_order_id
    where retail_checkout_payments.plan_id = any(${planIds}::uuid[])
    order by retail_checkout_payments.plan_id, retail_checkout_payments.created_at desc
  `;

  return new Map(
    rows.map((row) => [
      row.plan_id,
      {
        orderNumber: row.order_number,
        orderStatus: row.order_status,
        updatedAt: isoOrNull(row.updated_at)
      }
    ])
  );
}

async function loadProductInterests(
  sql: NonNullable<ReturnType<typeof getSql>>,
  planIds: readonly string[],
  availability: SchemaAvailability
) {
  if (!availability.productDecisions || planIds.length === 0) {
    return new Map<string, string[]>();
  }

  const rows = await sql<Array<{
    plan_id: string;
    product_title: string;
  }>>`
    select
      product_recommendation_decisions.plan_id::text,
      product_recommendation_decisions.product_title
    from public.product_recommendation_decisions
    where product_recommendation_decisions.plan_id = any(${planIds}::uuid[])
      and product_recommendation_decisions.is_current = true
      and product_recommendation_decisions.outcome in ('chosen', 'near_miss')
    order by
      product_recommendation_decisions.plan_id,
      case product_recommendation_decisions.outcome when 'chosen' then 0 else 1 end,
      product_recommendation_decisions.rank nulls last,
      product_recommendation_decisions.generated_at desc
    limit 3000
  `;

  return rows.reduce<Map<string, string[]>>((map, row) => {
    const list = map.get(row.plan_id) ?? [];

    if (list.length < 5 && !list.includes(row.product_title)) {
      list.push(row.product_title);
    }

    map.set(row.plan_id, list);

    return map;
  }, new Map());
}

async function loadSupplementInterests(
  sql: NonNullable<ReturnType<typeof getSql>>,
  planIds: readonly string[],
  availability: SchemaAvailability
) {
  if (!availability.supplementSelections || planIds.length === 0) {
    return new Map<string, string[]>();
  }

  const rows = await sql<Array<{
    plan_id: string;
    supplement_name_text: string;
  }>>`
    select
      supplement_recommendation_selections.plan_id::text,
      supplement_recommendation_selections.supplement_name_text
    from public.supplement_recommendation_selections
    where supplement_recommendation_selections.plan_id = any(${planIds}::uuid[])
      and supplement_recommendation_selections.is_current = true
      and coalesce(supplement_recommendation_selections.safety_visibility, 'visible') <> 'hidden'
    order by
      supplement_recommendation_selections.plan_id,
      supplement_recommendation_selections.effectiveness_rank,
      supplement_recommendation_selections.generated_at desc
    limit 3000
  `;

  return rows.reduce<Map<string, string[]>>((map, row) => {
    const list = map.get(row.plan_id) ?? [];

    if (list.length < 6 && !list.includes(row.supplement_name_text)) {
      list.push(row.supplement_name_text);
    }

    map.set(row.plan_id, list);

    return map;
  }, new Map());
}

function buildCustomerDrafts(input: Readonly<{
  assessments: readonly AssessmentRow[];
  communications: ReadonlyMap<string, CommunicationInsight>;
  leads: ReadonlyMap<string, LeadInsight>;
  orders: ReadonlyMap<string, OrderInsight>;
  products: ReadonlyMap<string, string[]>;
  supplements: ReadonlyMap<string, string[]>;
}>) {
  return input.assessments.map((row): CustomerInsightProfileDraft => {
    const locale = safeLocale(row.locale);
    const summary = answerSummary(row.answer_summary);
    const demographics = demographicsFromAnswers(row.answers);
    const healthScore = healthScoreInsight(row.health_score);
    const entitlement = resolvePanyaEntitlement(row.selected_plan);
    const archetype = archetypeFromCustomerSignals({
      demographics,
      entitlement,
      entitlementLabel: panyaEntitlementLabel(entitlement),
      goals: summary.goals
    });
    const panya = input.communications.get(row.plan_id) ?? emptyPanyaActivity;
    const lead = input.leads.get(row.plan_id);
    const order = input.orders.get(row.plan_id);
    const capturedAt = new Date(row.captured_at).toISOString();
    const updatedAt = new Date(row.updated_at).toISOString();
    const lastActivityAt = latestIso(
      updatedAt,
      panya.lastMessageAt,
      lead?.lastSeenAt,
      order?.updatedAt
    );

    return {
      archetypeId: archetype.id,
      archetypeLabel: archetype.label,
      campaign: lead?.campaign ?? null,
      capturedAt,
      constraints: summary.constraints,
      contactEmail: row.contact_email,
      demographics,
      entitlement,
      entitlementLabel: panyaEntitlementLabel(entitlement),
      firstName: row.first_name,
      funnelStage: lead?.funnelStage ?? (row.selected_plan ? "paid" : "assessment"),
      goals: summary.goals,
      healthScore,
      identifiable: Boolean(
        row.first_name || row.contact_email || panya.channelAddress || order?.orderNumber
      ),
      lastActivityAt,
      lastEvent: lead?.lastEvent ?? null,
      locale,
      orderNumber: order?.orderNumber ?? null,
      orderStatus: order?.orderStatus ?? null,
      panya,
      planId: row.plan_id,
      productInterests: input.products.get(row.plan_id) ?? [],
      profile: summary.profile,
      region: summary.region,
      selectedPlan: row.selected_plan,
      source: lead?.source ?? null,
      status: row.status,
      supplementInterests: input.supplements.get(row.plan_id) ?? [],
      updatedAt
    };
  });
}

function buildSummary(customers: readonly CustomerInsightProfile[], segments: readonly CustomerInsightSegment[]) {
  return {
    activeSegments: segments.length,
    identifiableCustomers: customers.filter((customer) => customer.identifiable).length,
    orderLinkedCustomers: customers.filter(
      (customer) => customer.orderNumber || customer.orderStatus
    ).length,
    paidCustomers: customers.filter((customer) => Boolean(customer.selectedPlan)).length,
    panyaEngagedCustomers: customers.filter((customer) => customer.panya.messageCount > 0)
      .length,
    totalCustomers: customers.length
  };
}

export function buildCustomerInsightArchetypes(
  customers: readonly CustomerInsightProfile[]
): CustomerInsightArchetype[] {
  const groups = customers.reduce<Map<string, CustomerInsightProfile[]>>(
    (map, customer) => {
      const group = map.get(customer.archetypeId) ?? [];

      group.push(customer);
      map.set(customer.archetypeId, group);

      return map;
    },
    new Map()
  );

  return [...groups.entries()]
    .map(([id, group]): CustomerInsightArchetype => {
      const first = group[0];
      const healthScores = group.flatMap((customer) =>
        customer.healthScore?.score !== null && customer.healthScore?.score !== undefined
          ? [customer.healthScore.score]
          : []
      );
      const goals = unique(group.flatMap((customer) => customer.goals), 4);
      const lifeStages = unique(
        group.flatMap((customer) => customer.demographics.lifeStage ?? []),
        2
      );
      const regions = unique(group.flatMap((customer) => customer.region ?? []), 2);
      const products = unique(
        group.flatMap((customer) => customer.productInterests.slice(0, 2)),
        3
      );
      const supplements = unique(
        group.flatMap((customer) => customer.supplementInterests.slice(0, 2)),
        3
      );

      return {
        averageHealthScore:
          healthScores.length > 0
            ? Math.round(
                healthScores.reduce((sum, score) => sum + score, 0) /
                  healthScores.length
              )
            : null,
        count: group.length,
        customersWithOrders: group.filter(
          (customer) => customer.orderNumber || customer.orderStatus
        ).length,
        description: [
          first?.entitlementLabel,
          first?.demographics.ageBand,
          ...lifeStages,
          ...goals.slice(0, 2)
        ]
          .filter(Boolean)
          .join(" · "),
        entitlement: first?.entitlement ?? "unpaid",
        id,
        label: first?.archetypeLabel ?? "Unknown persona",
        paidCustomers: group.filter((customer) => Boolean(customer.selectedPlan)).length,
        panyaEngaged: group.filter((customer) => customer.panya.messageCount > 0)
          .length,
        planLabel: first?.entitlementLabel ?? "Unpaid",
        primaryGoal: goals[0] ?? null,
        signalMix: unique(
          [
            ...goals,
            ...lifeStages,
            ...regions,
            ...products,
            ...supplements
          ],
          7
        )
      };
    })
    .sort(
      (first, second) =>
        second.count - first.count ||
        second.panyaEngaged - first.panyaEngaged ||
        first.label.localeCompare(second.label)
    );
}

export async function getAdminCustomerInsightsData(
  range: AdminDashboardRange,
  options: Readonly<{ enrichSegments?: boolean }> = {}
): Promise<AdminCustomerInsightsData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminCustomerInsightsData(range);
  }

  try {
    const availability = await customerInsightsSchemaAvailable(sql);

    if (!availability.assessments) {
      return emptyAdminCustomerInsightsData(range);
    }

    const assessments = await loadAssessmentRows(sql, range);
    const planIds = assessments.map((row) => row.plan_id);
    const [communications, leads, orders, products, supplements] = await Promise.all([
      loadCommunicationInsights(sql, planIds, availability),
      loadLeadInsights(sql, planIds, availability),
      loadOrderInsights(sql, planIds, availability),
      loadProductInterests(sql, planIds, availability),
      loadSupplementInterests(sql, planIds, availability)
    ]);
    const drafts = buildCustomerDrafts({
      assessments,
      communications,
      leads,
      orders,
      products,
      supplements
    });
    const built = buildCustomerInsightSegments(drafts);
    const archetypes = buildCustomerInsightArchetypes(built.customers);
    const enriched = options.enrichSegments === false
      ? {
          aiStatus: "disabled" as const,
          segments: built.segments
        }
      : await enrichCustomerInsightSegments(built.segments);

    return {
      aiStatus: enriched.aiStatus,
      archetypes,
      customers: built.customers,
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      range,
      segments: [...enriched.segments],
      summary: buildSummary(built.customers, enriched.segments)
    };
  } catch (error) {
    console.error("Unable to load admin customer insights data", error);

    return emptyAdminCustomerInsightsData(range);
  }
}
