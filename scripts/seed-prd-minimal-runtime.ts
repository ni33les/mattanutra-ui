#!/usr/bin/env node

import postgres from "postgres";
import { hashAdminToken } from "@/lib/admin-session-cookie";
import { toJsonValue } from "@/lib/assessment-store";
import { DEFAULT_NONG MATA_CONFIG } from "@/lib/panya";
import { FLAT_RATE_SHIPPING_METADATA_KEY } from "@/lib/shipping-fees";
import { SYSTEM_AGENTS, type SystemAgentKey } from "@/lib/system-agents";
import { RUNTIME_WORKER_CREDENTIAL_PROFILES } from "@/lib/worker-agent-credentials";

type Db = postgres.Sql | postgres.TransactionSql;

type SourceOrganisation = Readonly<{
  country_code: string | null;
  currency: string;
  default_locale: string;
  id: string;
  metadata: unknown;
  name: string;
  organisation_type: string;
  slug: string;
  status: string;
}>;

type SourceSellable = Readonly<{
  backorder_policy: string;
  currency: string;
  id: string;
  lead_time_days: number;
  metadata: unknown;
  notes: string | null;
  product_id: string;
  retail_price_amount: string | null;
  rrp_price_amount: string | null;
  status: string;
  stock_lead_time_days: number | null;
  stock_metadata: unknown;
  stock_notes: string | null;
  stock_retail_price_amount: string | null;
  stock_status: string | null;
  stock_wholesale_price_amount: string | null;
  wholesale_price_amount: string | null;
}>;

type WorkerCredentialSeed = Readonly<{
  agentKey: SystemAgentKey;
  envKey: string;
  role: "platform_agent" | "retail_agent";
}>;

const workerCredentialSeeds: readonly WorkerCredentialSeed[] =
  RUNTIME_WORKER_CREDENTIAL_PROFILES;

const retailPreferenceEvents = [
  "retail_order_created",
  "retail_order_awaiting_stock",
  "retail_order_ready_to_pack",
  "retail_order_ready_to_ship",
  "retail_order_cancelled",
  "retail_order_returned",
  "retail_settlement_needs_review",
  "retail_settlement_payout_paid"
] as const;

const platformPreferenceEvents = [
  "platform_revenue_received",
  "platform_checkout_failed",
  "platform_payment_failed",
  "platform_payout_failed",
  "platform_retailer_payout_due",
  "platform_retailer_settlement_needs_review",
  "platform_worker_unavailable",
  "platform_task_stuck",
  "platform_communication_failed",
  "platform_technical_alert"
] as const;

function envText(name: string) {
  return process.env[name]?.trim() || "";
}

function fail(message: string): never {
  throw new Error(`[prd-minimal-runtime] ${message}`);
}

function connectionLooksLike(value: string, pattern: RegExp) {
  try {
    const url = new URL(value);

    return pattern.test(`${url.hostname}${url.pathname}`);
  } catch {
    return false;
  }
}

function shouldUseSsl(connectionString: string) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

  return (
    url.hostname.endsWith(".db.ondigitalocean.com") ||
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
  );
}

function makeSql(connectionString: string) {
  return postgres(connectionString, {
    connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT_SECONDS ?? 10),
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ...(shouldUseSsl(connectionString) ? { ssl: "require" } : {})
  });
}

function apiKeyFor(seed: WorkerCredentialSeed) {
  const token = envText(seed.envKey);

  if (!token) {
    fail(`${seed.envKey} is required to seed worker credentials`);
  }

  return token;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function metadataPatchFromSource(value: unknown) {
  const metadata = objectValue(value);
  const patch: Record<string, unknown> = {};

  if (metadata[FLAT_RATE_SHIPPING_METADATA_KEY] !== undefined) {
    patch[FLAT_RATE_SHIPPING_METADATA_KEY] =
      metadata[FLAT_RATE_SHIPPING_METADATA_KEY];
  }

  if (typeof metadata.dispatchCity === "string" && metadata.dispatchCity.trim()) {
    patch.dispatchCity = metadata.dispatchCity;
  }

  return patch;
}

async function fetchSourceOrganisation(source: Db, slug: string) {
  const rows = await source<SourceOrganisation[]>`
    select
      id::text,
      slug,
      name,
      organisation_type,
      status,
      default_locale,
      country_code,
      currency,
      metadata
    from public.organisations
    where slug = ${slug}
    limit 1
  `;

  return rows[0] ?? null;
}

async function fetchSourceDelightSellables(source: Db, organisationId: string) {
  return source<SourceSellable[]>`
    select
      sellable.id::text,
      sellable.product_id::text,
      sellable.status,
      sellable.rrp_price_amount::text,
      sellable.wholesale_price_amount::text,
      sellable.currency,
      sellable.lead_time_days,
      sellable.backorder_policy,
      sellable.notes,
      sellable.metadata,
      stock.status as stock_status,
      stock.lead_time_days as stock_lead_time_days,
      stock.wholesale_price_amount::text as stock_wholesale_price_amount,
      stock.retail_price_amount::text as stock_retail_price_amount,
      stock.notes as stock_notes,
      stock.metadata as stock_metadata,
      sellable.rrp_price_amount::text as retail_price_amount
    from public.retail_sellable_products sellable
    left join public.retail_product_stock stock
      on stock.organisation_id = sellable.organisation_id
      and stock.product_id = sellable.product_id
      and stock.status <> 'deleted'
    where sellable.organisation_id = ${organisationId}::uuid
      and sellable.status = 'active'
    order by sellable.product_id
  `;
}

async function ensureOrganisation(
  target: Db,
  input: Readonly<{
    fallbackType: "platform" | "tenant";
    source: SourceOrganisation;
  }>
) {
  const existing = await target<Array<{ id: string }>>`
    select id::text
    from public.organisations
    where lower(slug) = lower(${input.source.slug})
    limit 1
  `;
  const metadataPatch = {
    ...metadataPatchFromSource(input.source.metadata),
    source: "seed-prd-minimal-runtime",
    uatConfigPromotedAt: new Date().toISOString()
  };

  if (existing[0]?.id) {
    await target`
      update public.organisations
      set
        name = ${input.source.name},
        organisation_type = ${input.source.organisation_type || input.fallbackType},
        status = 'active',
        default_locale = ${input.source.default_locale || "en"},
        country_code = ${input.source.country_code || "TH"},
        currency = ${input.source.currency || (input.fallbackType === "platform" ? "USD" : "THB")},
        metadata = metadata || ${target.json(toJsonValue(metadataPatch))}::jsonb,
        updated_at = now()
      where id = ${existing[0].id}::uuid
    `;

    return existing[0].id;
  }

  const inserted = await target<Array<{ id: string }>>`
    insert into public.organisations (
      id,
      slug,
      name,
      organisation_type,
      status,
      default_locale,
      country_code,
      currency,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${input.source.id}::uuid,
      ${input.source.slug},
      ${input.source.name},
      ${input.source.organisation_type || input.fallbackType},
      'active',
      ${input.source.default_locale || "en"},
      ${input.source.country_code || "TH"},
      ${input.source.currency || (input.fallbackType === "platform" ? "USD" : "THB")},
      ${target.json(toJsonValue(metadataPatch))}::jsonb,
      now(),
      now()
    )
    returning id::text
  `;

  return inserted[0]?.id;
}

async function seedDelightSellables(
  target: Db,
  input: Readonly<{
    organisationId: string;
    sellables: readonly SourceSellable[];
  }>
) {
  let sellableCount = 0;
  let stockCount = 0;

  for (const row of input.sellables) {
    const productExists = await target<Array<{ exists: boolean }>>`
      select exists (
        select 1
        from public.products
        where id = ${row.product_id}::uuid
      ) as exists
    `;

    if (!productExists[0]?.exists) {
      continue;
    }

    await target`
      insert into public.retail_sellable_products (
        id,
        organisation_id,
        product_id,
        status,
        rrp_price_amount,
        wholesale_price_amount,
        currency,
        lead_time_days,
        backorder_policy,
        notes,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${row.id}::uuid,
        ${input.organisationId}::uuid,
        ${row.product_id}::uuid,
        'active',
        ${row.rrp_price_amount},
        ${row.wholesale_price_amount},
        ${row.currency || "THB"},
        ${row.lead_time_days ?? 0},
        ${row.backorder_policy || "allow"},
        ${row.notes},
        ${target.json(toJsonValue({
          ...objectValue(row.metadata),
          source: "seed-prd-minimal-runtime",
          uatConfigPromotedAt: new Date().toISOString()
        }))}::jsonb,
        now(),
        now()
      )
      on conflict (organisation_id, product_id)
      do update set
        status = 'active',
        rrp_price_amount = excluded.rrp_price_amount,
        wholesale_price_amount = excluded.wholesale_price_amount,
        currency = excluded.currency,
        lead_time_days = excluded.lead_time_days,
        backorder_policy = excluded.backorder_policy,
        notes = excluded.notes,
        metadata = public.retail_sellable_products.metadata || excluded.metadata,
        updated_at = now()
    `;
    sellableCount += 1;

    await target`
      insert into public.retail_product_stock (
        organisation_id,
        product_id,
        status,
        stock_quantity,
        lead_time_days,
        wholesale_price_amount,
        retail_price_amount,
        currency,
        notes,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${input.organisationId}::uuid,
        ${row.product_id}::uuid,
        'active',
        0,
        ${row.stock_lead_time_days ?? row.lead_time_days ?? 0},
        ${row.stock_wholesale_price_amount ?? row.wholesale_price_amount},
        ${row.stock_retail_price_amount ?? row.rrp_price_amount},
        ${row.currency || "THB"},
        ${row.stock_notes ?? row.notes},
        ${target.json(toJsonValue({
          ...objectValue(row.stock_metadata),
          source: "seed-prd-minimal-runtime",
          stockQuantityResetToZero: true,
          uatConfigPromotedAt: new Date().toISOString()
        }))}::jsonb,
        now(),
        now()
      )
      on conflict (organisation_id, product_id)
      do update set
        status = 'active',
        stock_quantity = 0,
        lead_time_days = excluded.lead_time_days,
        wholesale_price_amount = excluded.wholesale_price_amount,
        retail_price_amount = excluded.retail_price_amount,
        currency = excluded.currency,
        notes = excluded.notes,
        metadata = public.retail_product_stock.metadata || excluded.metadata,
        updated_at = now()
    `;
    stockCount += 1;
  }

  return { sellableCount, stockCount };
}

async function ensureAgentCredential(
  target: Db,
  input: Readonly<{
    apiKey: string;
    membershipOrganisationId: string;
    role: "platform_agent" | "retail_agent";
    seed: WorkerCredentialSeed;
  }>
) {
  const definition = SYSTEM_AGENTS[input.seed.agentKey];
  const credentialHash = hashAdminToken(input.apiKey);

  await target`
    insert into public.agents (
      id,
      name,
      agent_type,
      role,
      status,
      capabilities,
      model,
      organisation_id,
      metadata,
      last_seen_at,
      created_at,
      updated_at
    )
    values (
      ${definition.id}::uuid,
      ${definition.name},
      ${definition.type},
      ${input.role},
      'active',
      ${[...definition.capabilities]},
      ${definition.model},
      ${input.membershipOrganisationId}::uuid,
      ${target.json(toJsonValue({
        ...definition.metadata,
        source: "seed-prd-minimal-runtime",
        systemAgentKey: input.seed.agentKey
      }))}::jsonb,
      now(),
      now(),
      now()
    )
    on conflict (id)
    do update set
      name = excluded.name,
      agent_type = excluded.agent_type,
      role = excluded.role,
      status = 'active',
      capabilities = excluded.capabilities,
      model = excluded.model,
      organisation_id = excluded.organisation_id,
      metadata = public.agents.metadata || excluded.metadata,
      updated_at = now()
  `;

  const memberships = await target<Array<{ id: string }>>`
    insert into public.organisation_memberships (
      organisation_id,
      principal_type,
      agent_id,
      role,
      status,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${input.membershipOrganisationId}::uuid,
      'agent',
      ${definition.id}::uuid,
      ${input.role},
      'active',
      ${target.json(toJsonValue({
        source: "seed-prd-minimal-runtime",
        systemAgentKey: input.seed.agentKey
      }))}::jsonb,
      now(),
      now()
    )
    on conflict (agent_id, organisation_id)
      where principal_type = 'agent' and status <> 'deleted'
    do update set
      role = excluded.role,
      status = 'active',
      metadata = public.organisation_memberships.metadata || excluded.metadata,
      updated_at = now()
    returning id::text
  `;
  const membershipId = memberships[0]?.id;

  if (!membershipId) {
    fail(`Could not seed membership for ${definition.name}`);
  }

  await target`
    update public.agent_credentials
    set
      status = 'revoked',
      revoked_at = coalesce(revoked_at, now()),
      metadata = metadata || ${target.json(toJsonValue({
        revokedBy: "seed-prd-minimal-runtime",
        replacedEnvKey: input.seed.envKey
      }))}::jsonb,
      updated_at = now()
    where agent_id = ${definition.id}::uuid
      and metadata->>'envKey' = ${input.seed.envKey}
      and credential_hash <> ${credentialHash}
      and status = 'active'
  `;

  await target`
    insert into public.agent_credentials (
      agent_id,
      membership_id,
      credential_hash,
      display_prefix,
      label,
      status,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${definition.id}::uuid,
      ${membershipId}::uuid,
      ${credentialHash},
      ${input.apiKey.slice(0, 12)},
      ${`${definition.name} - PRD`},
      'active',
      ${target.json(toJsonValue({
        envKey: input.seed.envKey,
        source: "seed-prd-minimal-runtime",
        systemAgentKey: input.seed.agentKey
      }))}::jsonb,
      now(),
      now()
    )
    on conflict (credential_hash)
    do update set
      agent_id = excluded.agent_id,
      membership_id = excluded.membership_id,
      display_prefix = excluded.display_prefix,
      label = excluded.label,
      status = 'active',
      revoked_at = null,
      revoked_by_person_id = null,
      metadata = public.agent_credentials.metadata || excluded.metadata,
      updated_at = now()
  `;
}

async function seedWorkerCredentials(
  target: Db,
  input: Readonly<{
    delightOrganisationId: string;
    platformOrganisationId: string;
  }>
) {
  const tokens = workerCredentialSeeds.map((seed) => ({
    seed,
    token: apiKeyFor(seed)
  }));
  const duplicateTokens = tokens
    .map((item) => item.token)
    .filter((token, index, all) => all.indexOf(token) !== index);

  if (duplicateTokens.length > 0) {
    fail("Worker API keys must be unique per worker profile");
  }

  for (const item of tokens) {
    await ensureAgentCredential(target, {
      apiKey: item.token,
      membershipOrganisationId:
        item.seed.role === "retail_agent"
          ? input.delightOrganisationId
          : input.platformOrganisationId,
      role: item.seed.role,
      seed: item.seed
    });
  }

  return { credentialCount: tokens.length };
}

async function seedNotificationPreferences(
  target: Db,
  input: Readonly<{
    delightOrganisationId: string;
    platformOrganisationId: string;
  }>
) {
  let preferenceCount = 0;

  for (const eventKey of retailPreferenceEvents) {
    for (const channelType of ["email", "line"] as const) {
      await target`
        insert into public.organisation_notification_preferences (
          organisation_id,
          event_key,
          channel_type,
          enabled,
          preference_rank,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${input.delightOrganisationId}::uuid,
          ${eventKey},
          ${channelType},
          true,
          ${channelType === "line" ? 20 : 80},
          ${target.json(toJsonValue({ source: "seed-prd-minimal-runtime" }))}::jsonb,
          now(),
          now()
        )
        on conflict (organisation_id, event_key, channel_type)
        do update set
          enabled = excluded.enabled,
          preference_rank = excluded.preference_rank,
          metadata = public.organisation_notification_preferences.metadata || excluded.metadata,
          updated_at = now()
      `;
      preferenceCount += 1;
    }
  }

  for (const eventKey of platformPreferenceEvents) {
    for (const channelType of ["email", "line"] as const) {
      await target`
        insert into public.organisation_notification_preferences (
          organisation_id,
          event_key,
          channel_type,
          enabled,
          preference_rank,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${input.platformOrganisationId}::uuid,
          ${eventKey},
          ${channelType},
          true,
          ${channelType === "line" ? 20 : 80},
          ${target.json(toJsonValue({ source: "seed-prd-minimal-runtime" }))}::jsonb,
          now(),
          now()
        )
        on conflict (organisation_id, event_key, channel_type)
        do update set
          enabled = excluded.enabled,
          preference_rank = excluded.preference_rank,
          metadata = public.organisation_notification_preferences.metadata || excluded.metadata,
          updated_at = now()
      `;
      preferenceCount += 1;
    }
  }

  return { preferenceCount };
}

async function seedPanyaConfig(source: Db, target: Db) {
  const rows = await source<Array<{
    config: unknown;
    metadata: unknown;
    version: number;
  }>>`
    select version, config, metadata
    from public.panya_config_versions
    where status = 'active'
    order by activated_at desc nulls last, version desc, created_at desc
    limit 1
  `.catch(() => []);
  const sourceRow = rows[0];
  const config = sourceRow?.config ?? DEFAULT_NONG MATA_CONFIG;
  const metadata = {
    ...objectValue(sourceRow?.metadata),
    source: sourceRow ? "uat-panya-config" : "default-panya-config",
    promotedToPrdAt: new Date().toISOString()
  };

  await target`
    update public.panya_config_versions
    set status = 'archived', updated_at = now()
    where status = 'active'
  `;

  await target`
    insert into public.panya_config_versions (
      version,
      status,
      config,
      created_by_person_id,
      activated_by_person_id,
      activated_at,
      metadata,
      created_at,
      updated_at
    )
    values (
      1,
      'active',
      ${target.json(toJsonValue(config))}::jsonb,
      null,
      null,
      now(),
      ${target.json(toJsonValue(metadata))}::jsonb,
      now(),
      now()
    )
    on conflict (version)
    do update set
      status = 'active',
      config = excluded.config,
      created_by_person_id = null,
      activated_by_person_id = null,
      activated_at = excluded.activated_at,
      metadata = public.panya_config_versions.metadata || excluded.metadata,
      updated_at = now()
  `;

  return { panyaConfigSource: sourceRow ? "uat" : "default" };
}

async function main() {
  const targetConnection = envText("DB_URL") || envText("PRD_DB_URL");
  const sourceConnection = envText("UAT_DB_URL") || envText("PRD_SEED_SOURCE_DB_URL");

  if (!targetConnection) {
    fail("DB_URL or PRD_DB_URL is required for target PRD");
  }

  if (!sourceConnection) {
    fail("UAT_DB_URL or PRD_SEED_SOURCE_DB_URL is required for source UAT");
  }

  if (process.env.MATTANUTRA_ENV !== "prd") {
    fail("MATTANUTRA_ENV=prd is required");
  }

  if (process.env.MATTANUTRA_CONFIRM_PRD_MINIMAL_SEED !== "seed") {
    fail("MATTANUTRA_CONFIRM_PRD_MINIMAL_SEED=seed is required");
  }

  if (!connectionLooksLike(targetConnection, /prd|prod|mattanutra-prd/i)) {
    fail("DB_URL does not look like PRD");
  }

  if (!connectionLooksLike(sourceConnection, /uat|mattanutra-uat/i)) {
    fail("UAT_DB_URL does not look like UAT");
  }

  const source = makeSql(sourceConnection);
  const target = makeSql(targetConnection);

  try {
    const [sourcePlatform, sourceDelight] = await Promise.all([
      fetchSourceOrganisation(source, "mattanutra"),
      fetchSourceOrganisation(source, "delight-pharmacy")
    ]);

    if (!sourcePlatform) {
      fail("UAT source does not contain mattanutra platform organisation");
    }

    if (!sourceDelight) {
      fail("UAT source does not contain delight-pharmacy organisation");
    }

    const sellables = await fetchSourceDelightSellables(source, sourceDelight.id);

    if (sellables.length < 1) {
      fail("UAT source has no active Delight sellable products");
    }

    const result = await target.begin(async (transaction) => {
      const platformOrganisationId = await ensureOrganisation(transaction, {
        fallbackType: "platform",
        source: sourcePlatform
      });
      const delightOrganisationId = await ensureOrganisation(transaction, {
        fallbackType: "tenant",
        source: sourceDelight
      });

      if (!platformOrganisationId || !delightOrganisationId) {
        fail("Could not ensure platform and Delight organisations");
      }

      const sellableResult = await seedDelightSellables(transaction, {
        organisationId: delightOrganisationId,
        sellables
      });
      const credentialResult = await seedWorkerCredentials(transaction, {
        delightOrganisationId,
        platformOrganisationId
      });
      const preferenceResult = await seedNotificationPreferences(transaction, {
        delightOrganisationId,
        platformOrganisationId
      });
      const panyaResult = await seedPanyaConfig(source, transaction);
      const stockRows = await transaction<Array<{ stock_sum: string }>>`
        select coalesce(sum(stock_quantity), 0)::text as stock_sum
        from public.retail_product_stock
        where organisation_id = ${delightOrganisationId}::uuid
          and status = 'active'
      `;

      return {
        delightOrganisationId,
        platformOrganisationId,
        sourceSellables: sellables.length,
        stockQuantitySum: Number(stockRows[0]?.stock_sum ?? 0),
        ...sellableResult,
        ...credentialResult,
        ...preferenceResult,
        ...panyaResult
      };
    });

    console.log(JSON.stringify({
      ...result,
      status: "ok"
    }, null, 2));
  } finally {
    await Promise.all([source.end({ timeout: 5 }), target.end({ timeout: 5 })]);
  }
}

await main();
