import { createHash, randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { closeSqlPool, getSql } from "../lib/db.ts";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const seedName = "campaign-demo";
const emittedBy = "dev_campaign_seed";
const defaultDays = 7;

const args = new Set(process.argv.slice(2));
const append = args.has("--append");
const dryRun = args.has("--dry-run");
const resetOnly = args.has("--reset-only");
const daysArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith("--days="))
  ?.split("=")[1];
const days = Number.isFinite(Number(daysArg))
  ? Math.max(1, Math.round(Number(daysArg)))
  : defaultDays;

const campaigns = [
  {
    adPrefix: "fb",
    affiliateId: null,
    affiliateRef: null,
    campaignId: "fb-hs-may-001",
    campaignName: "HealthScore Launch",
    countryCode: "GB",
    landingPage: "/en",
    medium: "paid_social",
    promoCode: "HSMAY",
    source: "facebook",
    sourceChannel: "paid_social",
    sourceUrl:
      "https://mattanutra.com/en?utm_source=facebook&utm_medium=paid_social&utm_campaign=healthscore_launch"
  },
  {
    adPrefix: "gg",
    affiliateId: null,
    affiliateRef: null,
    campaignId: "google-precision-002",
    campaignName: "Precision Longevity Search",
    countryCode: "TH",
    landingPage: "/en/assessment",
    medium: "paid_search",
    promoCode: "PRECISION",
    source: "google",
    sourceChannel: "paid_search",
    sourceUrl:
      "https://mattanutra.com/en/assessment?utm_source=google&utm_medium=paid_search&utm_campaign=precision_longevity_search"
  },
  {
    adPrefix: "af",
    affiliateId: "dr-anya",
    affiliateRef: "clinic-bkk",
    campaignId: "affiliate-clinic-003",
    campaignName: "Bangkok Clinic Referrals",
    countryCode: "TH",
    landingPage: "/th",
    medium: "affiliate",
    promoCode: "WELL10",
    source: "wellness_partner",
    sourceChannel: "affiliate",
    sourceUrl:
      "https://mattanutra.com/th?utm_source=wellness_partner&utm_medium=affiliate&utm_campaign=bangkok_clinic_referrals&affiliate_id=dr-anya"
  }
];

const outcomes = [
  "landed",
  "started",
  "completed",
  "healthscore",
  "free",
  "free_sent",
  "precision",
  "pro"
];

function seedRandom(seed) {
  let value = seed;

  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);

    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seedRandom(20260511);

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let threshold = random() * total;

  for (const item of items) {
    threshold -= item.weight;

    if (threshold <= 0) {
      return item.value;
    }
  }

  return items.at(-1)?.value;
}

function isoAt(baseTime, minutes) {
  return new Date(baseTime.getTime() + minutes * 60_000).toISOString();
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function journeyOutcome(campaignIndex) {
  const profiles = [
    [
      { value: "landed", weight: 7 },
      { value: "started", weight: 12 },
      { value: "completed", weight: 12 },
      { value: "healthscore", weight: 20 },
      { value: "free", weight: 22 },
      { value: "free_sent", weight: 12 },
      { value: "precision", weight: 11 },
      { value: "pro", weight: 4 }
    ],
    [
      { value: "landed", weight: 9 },
      { value: "started", weight: 11 },
      { value: "completed", weight: 15 },
      { value: "healthscore", weight: 18 },
      { value: "free", weight: 12 },
      { value: "free_sent", weight: 6 },
      { value: "precision", weight: 22 },
      { value: "pro", weight: 7 }
    ],
    [
      { value: "landed", weight: 5 },
      { value: "started", weight: 8 },
      { value: "completed", weight: 14 },
      { value: "healthscore", weight: 16 },
      { value: "free", weight: 16 },
      { value: "free_sent", weight: 8 },
      { value: "precision", weight: 17 },
      { value: "pro", weight: 16 }
    ]
  ];

  return pickWeighted(profiles[campaignIndex] ?? profiles[0]);
}

function attribution(campaign, index, locale) {
  return {
    adId: `${campaign.adPrefix}-ad-${String(index % 9).padStart(2, "0")}`,
    affiliateClickId: campaign.affiliateId
      ? `${campaign.adPrefix}-click-${String(index).padStart(4, "0")}`
      : null,
    affiliateId: campaign.affiliateId,
    affiliateRef: campaign.affiliateRef,
    browser: index % 3 === 0 ? "Safari" : index % 3 === 1 ? "Chrome" : "Edge",
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    clickId: `${campaign.adPrefix}-${hash(`${campaign.campaignId}:${index}`).slice(0, 12)}`,
    countryCode: campaign.countryCode,
    deviceType: index % 5 === 0 ? "desktop" : index % 3 === 0 ? "tablet" : "mobile",
    landingPage: campaign.landingPage,
    locale,
    medium: campaign.medium,
    os: index % 2 === 0 ? "iOS" : "Android",
    promoCode: campaign.promoCode,
    source: campaign.source,
    sourceChannel: campaign.sourceChannel,
    sourceUrl: campaign.sourceUrl,
    userAgent: "MattaNutra campaign seed"
  };
}

function buildJourney({ campaign, campaignIndex, index, now }) {
  const ray = randomUUID();
  const locale = campaign.countryCode === "TH" && index % 2 === 0 ? "th" : "en";
  const attr = attribution(campaign, index, locale);
  const baseTime = new Date(
    now.getTime() -
      Math.floor(random() * days * 24 * 60) * 60_000 -
      Math.floor(random() * 30) * 60_000
  );
  const outcome = journeyOutcome(campaignIndex);
  const outcomeIndex = outcomes.indexOf(outcome);
  const emailHash =
    outcomeIndex >= outcomes.indexOf("free")
      ? hash(`campaign-demo-${campaignIndex}-${index}@example.com`)
      : null;
  const selectedPlan =
    outcome === "precision" ? "precision" : outcome === "pro" ? "pro" : null;
  const healthScore =
    outcomeIndex >= outcomes.indexOf("healthscore")
      ? 42 + Math.floor(random() * 43)
      : null;
  const scoreBand =
    healthScore === null ? null : healthScore >= 75 ? "strong" : healthScore >= 55 ? "good" : "needs_attention";
  const events = [
    {
      eventName: "home_viewed",
      eventType: "traffic",
      path: attr.landingPage,
      route: "/[locale]",
      status: "observed"
    }
  ];

  if (outcomeIndex >= outcomes.indexOf("started")) {
    events.push({
      eventName: "assessment_started",
      eventType: "funnel",
      path: `/${locale}/assessment`,
      route: "/[locale]/assessment",
      status: "observed"
    });
  }

  if (outcomeIndex >= outcomes.indexOf("completed")) {
    events.push({
      eventName: "assessment_submitted",
      eventType: "funnel",
      path: `/${locale}/assessment`,
      route: "/[locale]/assessment",
      status: "completed"
    });
  }

  if (outcomeIndex >= outcomes.indexOf("healthscore")) {
    events.push({
      eventName: "healthscore_viewed",
      eventType: "funnel",
      path: `/${locale}/assessment/results`,
      route: "/[locale]/assessment/results",
      status: "observed"
    });
  }

  if (outcomeIndex >= outcomes.indexOf("free")) {
    events.push({
      eventName: "free_email_requested",
      eventType: "email",
      path: `/${locale}/assessment/results`,
      route: "/[locale]/assessment/results",
      status: "queued"
    });
  }

  if (outcomeIndex >= outcomes.indexOf("free_sent") && selectedPlan === null) {
    events.push({
      eventName: "free_email_sent",
      eventType: "email",
      path: `/${locale}/assessment/results`,
      route: "/[locale]/assessment/results",
      status: "sent"
    });
  }

  if (selectedPlan) {
    events.push(
      {
        eventName: "plan_selected",
        eventType: "funnel",
        path: `/${locale}/assessment/results`,
        route: "/[locale]/assessment/results",
        status: "observed"
      },
      {
        eventName: "checkout_completed",
        eventType: "payment",
        path: `/${locale}/assessment/results`,
        route: "/[locale]/assessment/results",
        status: "paid",
        valueAmount: selectedPlan === "pro" ? 249 : 99
      },
      {
        eventName: "formulation_ready",
        eventType: "formulation",
        path: `/${locale}/assessment/results`,
        route: "/[locale]/assessment/results",
        status: "completed"
      },
      {
        eventName: "formulation_page_viewed",
        eventType: "formulation",
        path: `/${locale}/assessment/results`,
        route: "/[locale]/assessment/results",
        status: "observed"
      }
    );
  }

  return events.map((event, eventIndex) => ({
    ...event,
    ...attr,
    emailHash,
    healthScore,
    id: randomUUID(),
    lowestDomain:
      healthScore === null
        ? null
        : ["stress_balance", "sleep_recovery", "body_markers"][index % 3],
    metrics: {
      seedJourneyEvent: eventIndex + 1,
      seedJourneyEvents: events.length
    },
    occurredAt: isoAt(baseTime, eventIndex * (2 + (index % 4))),
    properties: {
      outcome,
      seedIndex: index,
      seedName
    },
    ray,
    scoreBand,
    selectedPlan,
    valueAmount: event.valueAmount ?? null
  }));
}

function createRows() {
  const now = new Date();
  const counts = [34, 30, 24];

  return campaigns.flatMap((campaign, campaignIndex) =>
    Array.from({ length: counts[campaignIndex] }, (_, index) =>
      buildJourney({ campaign, campaignIndex, index, now })
    ).flat()
  );
}

async function main() {
  const sql = getSql();

  if (!sql) {
    throw new Error("DB_CONNECTION is required.");
  }

  const rows = createRows();

  try {
    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            append,
            campaigns: campaigns.map((campaign) => campaign.campaignName),
            days,
            rows: rows.length,
            seedName
          },
          null,
          2
        )
      );
      return;
    }

    if (!append) {
      const deleted = await sql`
        delete from public.bpm
        where emitted_by = ${emittedBy}
          and properties ->> 'seedName' = ${seedName}
      `;
      console.log(`Deleted ${deleted.count} existing seed BPM rows.`);
    }

    if (resetOnly) {
      return;
    }

    for (const row of rows) {
      await sql`
        insert into public.bpm (
          id,
          ray,
          event_name,
          event_type,
          event_status,
          severity,
          actor_type,
          emitted_by,
          locale,
          selected_plan,
          email_hash,
          user_agent,
          device_type,
          browser,
          os,
          country_code,
          path,
          route,
          referrer,
          landing_page,
          traffic_source,
          source_channel,
          source_url,
          utm_source,
          utm_medium,
          utm_campaign,
          campaign_id,
          campaign_name,
          promo_code,
          affiliate_id,
          affiliate_ref,
          affiliate_click_id,
          ad_id,
          click_id,
          health_score,
          score_band,
          lowest_domain,
          value_amount,
          value_currency,
          properties,
          metrics,
          occurred_at,
          created_at
        )
        values (
          ${row.id}::uuid,
          ${row.ray}::uuid,
          ${row.eventName},
          ${row.eventType},
          ${row.status},
          'low',
          'visitor',
          ${emittedBy},
          ${row.locale},
          ${row.selectedPlan}::public.assessment_plan,
          ${row.emailHash},
          ${row.userAgent},
          ${row.deviceType},
          ${row.browser},
          ${row.os},
          ${row.countryCode},
          ${row.path},
          ${row.route},
          ${row.sourceUrl},
          ${row.landingPage},
          ${row.source},
          ${row.sourceChannel},
          ${row.sourceUrl},
          ${row.source},
          ${row.medium},
          ${row.campaignName.toLowerCase().replaceAll(" ", "_")},
          ${row.campaignId},
          ${row.campaignName},
          ${row.promoCode},
          ${row.affiliateId},
          ${row.affiliateRef},
          ${row.affiliateClickId},
          ${row.adId},
          ${row.clickId},
          ${row.healthScore},
          ${row.scoreBand},
          ${row.lowestDomain},
          ${row.valueAmount},
          ${row.valueAmount === null ? null : "GBP"},
          ${sql.json(row.properties)},
          ${sql.json(row.metrics)},
          ${row.occurredAt}::timestamptz,
          now()
        )
      `;
    }

    console.log(`Inserted ${rows.length} seed BPM rows across ${campaigns.length} campaigns.`);
    console.log("Open the admin dashboard with view=campaigns or view=leads.");
  } finally {
    await closeSqlPool();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
