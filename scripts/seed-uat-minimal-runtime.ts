import postgres from "postgres";
import { hashAdminToken } from "@/lib/admin-session-cookie";
import { toJsonValue } from "@/lib/assessment-store";
import { SYSTEM_AGENTS, type SystemAgentKey } from "@/lib/system-agents";

type Db = postgres.Sql;

type SourceDelightOrganisation = Readonly<{
  country_code: string;
  currency: string;
  default_locale: string;
  id: string;
  metadata: unknown;
  name: string;
  slug: string;
  status: string;
}>;

type SourceDelightSellable = Readonly<{
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

const workerCredentialSeeds: readonly WorkerCredentialSeed[] = [
  { agentKey: "nutritionPlanAdvisor", envKey: "WORKER_ADVISOR_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "chatDispatcher", envKey: "WORKER_CHAT_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "communicationsCoordinator", envKey: "WORKER_COMMUNICATIONS_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "contentPublisher", envKey: "WORKER_CONTENT_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "emailDispatcher", envKey: "WORKER_EMAIL_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "foodGuidanceWorker", envKey: "WORKER_FOOD_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "formulationWorker", envKey: "WORKER_FORMULATION_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "healthScoreEngine", envKey: "WORKER_HEALTHSCORE_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "scheduler", envKey: "WORKER_HOSTING_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "productMatcher", envKey: "WORKER_PRODUCTS_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "retailStockPlanner", envKey: "WORKER_STOCK_AGENT_API_KEY", role: "retail_agent" }
];

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
  throw new Error(`[uat-minimal-runtime] ${message}`);
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

async function fetchSourceDelightData(source: Db) {
  const organisations = await source<SourceDelightOrganisation[]>`
    select
      id::text,
      slug,
      name,
      status,
      default_locale,
      country_code,
      currency,
      metadata
    from public.organisations
    where slug = 'delight-pharmacy'
      and organisation_type = 'tenant'
    limit 1
  `;
  const organisation = organisations[0];

  if (!organisation) {
    fail("DEV source does not contain delight-pharmacy organisation");
  }

  const sellables = await source<SourceDelightSellable[]>`
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
    where sellable.organisation_id = ${organisation.id}::uuid
      and sellable.status = 'active'
    order by sellable.product_id
  `;

  if (sellables.length < 1) {
    fail("DEV source has no active Delight sellable products");
  }

  return { organisation, sellables };
}

async function ensureDelightOrganisation(
  target: Db,
  organisation: SourceDelightOrganisation
) {
  await target`
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
      ${organisation.id}::uuid,
      ${organisation.slug},
      ${organisation.name},
      'tenant',
      'active',
      ${organisation.default_locale || "en"},
      ${organisation.country_code || "TH"},
      ${organisation.currency || "THB"},
      ${target.json(toJsonValue({
        ...(organisation.metadata && typeof organisation.metadata === "object"
          ? organisation.metadata as Record<string, unknown>
          : {}),
        reseededForUatAt: new Date().toISOString(),
        source: "seed-uat-minimal-runtime"
      }))}::jsonb,
      now(),
      now()
    )
    on conflict (id)
    do update set
      slug = excluded.slug,
      name = excluded.name,
      organisation_type = 'tenant',
      status = 'active',
      default_locale = excluded.default_locale,
      country_code = excluded.country_code,
      currency = excluded.currency,
      metadata = public.organisations.metadata || excluded.metadata,
      updated_at = now()
  `;
}

async function seedDelightSellables(
  target: Db,
  input: Readonly<{
    organisationId: string;
    sellables: readonly SourceDelightSellable[];
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
          ...(row.metadata && typeof row.metadata === "object"
            ? row.metadata as Record<string, unknown>
            : {}),
          reseededForUatAt: new Date().toISOString(),
          source: "seed-uat-minimal-runtime"
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
          ...(row.stock_metadata && typeof row.stock_metadata === "object"
            ? row.stock_metadata as Record<string, unknown>
            : {}),
          reseededForUatAt: new Date().toISOString(),
          source: "seed-uat-minimal-runtime",
          stockQuantityResetToZero: true
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

async function platformOrganisationId(target: Db) {
  const rows = await target<Array<{ id: string }>>`
    select id::text
    from public.organisations
    where slug = 'mattanutra'
      and organisation_type = 'platform'
      and status = 'active'
    limit 1
  `;

  if (!rows[0]?.id) {
    fail("Platform organisation mattanutra is missing");
  }

  return rows[0].id;
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
        reseededForUatAt: new Date().toISOString(),
        source: "seed-uat-minimal-runtime"
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
        reseededForUatAt: new Date().toISOString(),
        source: "seed-uat-minimal-runtime",
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
      ${hashAdminToken(input.apiKey)},
      ${input.apiKey.slice(0, 12)},
      ${`${definition.name} - UAT`},
      'active',
      ${target.json(toJsonValue({
        envKey: input.seed.envKey,
        reseededForUatAt: new Date().toISOString(),
        source: "seed-uat-minimal-runtime",
        systemAgentKey: input.seed.agentKey
      }))}::jsonb,
      now(),
      now()
    )
    on conflict (credential_hash)
    do update set
      agent_id = excluded.agent_id,
      membership_id = excluded.membership_id,
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
    fail("Worker API keys must be unique per worker profile for DB-managed credentials");
  }

  for (const item of tokens) {
    await ensureAgentCredential(target, {
      apiKey: item.token,
      membershipOrganisationId: item.seed.role === "retail_agent"
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
          ${channelType === "line" ? 50 : 100},
          ${target.json(toJsonValue({ source: "seed-uat-minimal-runtime" }))}::jsonb,
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
      const lineEnabled = eventKey !== "platform_revenue_received";

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
          ${channelType === "email" || lineEnabled},
          ${channelType === "line" ? 50 : 100},
          ${target.json(toJsonValue({ source: "seed-uat-minimal-runtime" }))}::jsonb,
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

async function main() {
  const targetConnection = envText("DB_URL");
  const sourceConnection = envText("DEV_DB_URL");

  if (!targetConnection) {
    fail("DB_URL is required for target UAT");
  }

  if (!sourceConnection) {
    fail("DEV_DB_URL is required for source DEV");
  }

  if (process.env.MATTANUTRA_ENV !== "uat") {
    fail("MATTANUTRA_ENV=uat is required");
  }

  if (process.env.MATTANUTRA_CONFIRM_UAT_MINIMAL_SEED !== "seed") {
    fail("MATTANUTRA_CONFIRM_UAT_MINIMAL_SEED=seed is required");
  }

  if (!connectionLooksLike(targetConnection, /uat|mattanutra-uat/i)) {
    fail("DB_URL does not look like UAT");
  }

  if (!connectionLooksLike(sourceConnection, /dev|mn-dev|mattanutra-dev/i)) {
    fail("DEV_DB_URL does not look like DEV");
  }

  const source = makeSql(sourceConnection);
  const target = makeSql(targetConnection);

  try {
    const { organisation, sellables } = await fetchSourceDelightData(source);
    const platformId = await platformOrganisationId(target);

    await ensureDelightOrganisation(target, organisation);
    const sellableResult = await seedDelightSellables(target, {
      organisationId: organisation.id,
      sellables
    });
    const credentialResult = await seedWorkerCredentials(target, {
      delightOrganisationId: organisation.id,
      platformOrganisationId: platformId
    });
    const preferenceResult = await seedNotificationPreferences(target, {
      delightOrganisationId: organisation.id,
      platformOrganisationId: platformId
    });
    const stockRows = await target<Array<{ stock_sum: string }>>`
      select coalesce(sum(stock_quantity), 0)::text as stock_sum
      from public.retail_product_stock
      where organisation_id = ${organisation.id}::uuid
        and status = 'active'
    `;

    console.log(JSON.stringify({
      delightOrganisationId: organisation.id,
      delightOrganisationName: organisation.name,
      sourceSellables: sellables.length,
      stockQuantitySum: Number(stockRows[0]?.stock_sum ?? 0),
      ...sellableResult,
      ...credentialResult,
      ...preferenceResult,
      status: "ok"
    }, null, 2));
  } finally {
    await Promise.all([
      source.end({ timeout: 5 }),
      target.end({ timeout: 5 })
    ]);
  }
}

await main();
