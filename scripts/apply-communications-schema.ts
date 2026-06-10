import { closeSqlPool, getSql } from "@/lib/db";

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to apply the communications schema");
}

try {
  await sql`
    create table if not exists public.organisation_communication_identities (
      organisation_id uuid not null references public.organisations(id) on delete cascade,
      identity_id uuid not null references public.communication_identities(id) on delete cascade,
      relationship text not null default 'retailer',
      is_primary boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      primary key (organisation_id, identity_id),
      constraint organisation_communication_identities_relationship_check check (
        relationship in ('retailer', 'platform', 'supplier', 'other')
      )
    )
  `;

  await sql`
    create unique index if not exists organisation_communication_primary_identity_idx
      on public.organisation_communication_identities (organisation_id)
      where is_primary
  `;

  await sql`
    create index if not exists organisation_communication_identity_idx
      on public.organisation_communication_identities (identity_id)
  `;

  await sql`
    create table if not exists public.organisation_notification_preferences (
      organisation_id uuid not null references public.organisations(id) on delete cascade,
      event_key text not null,
      channel_type text not null,
      enabled boolean not null default true,
      preference_rank integer not null default 100,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (organisation_id, event_key, channel_type),
      constraint organisation_notification_preferences_channel_check check (
        channel_type in ('email', 'line')
      ),
      constraint organisation_notification_preferences_event_check check (
        event_key in (
          'platform_revenue_received',
          'platform_checkout_failed',
          'platform_carrier_integration_failed',
          'platform_payment_failed',
          'platform_payout_failed',
          'platform_retailer_payout_due',
          'platform_retailer_settlement_needs_review',
          'platform_worker_unavailable',
          'platform_task_stuck',
          'platform_communication_failed',
          'platform_technical_alert',
          'retail_order_created',
          'retail_order_awaiting_stock',
          'retail_order_ready_to_pack',
          'retail_order_ready_to_ship',
          'retail_order_pickup_booked',
          'retail_order_cancelled',
          'retail_order_returned',
          'retail_order_shipment_exception',
          'retail_order_shipped',
          'retail_order_delivered',
          'retail_settlement_needs_review',
          'retail_settlement_payout_paid'
        )
      ),
      constraint organisation_notification_preferences_rank_check check (
        preference_rank >= 0
      )
    )
  `;

  await sql`
    alter table public.organisation_notification_preferences
      drop constraint if exists organisation_notification_preferences_event_check
  `;

  await sql`
    alter table public.organisation_notification_preferences
      add constraint organisation_notification_preferences_event_check check (
        event_key in (
          'platform_revenue_received',
          'platform_checkout_failed',
          'platform_carrier_integration_failed',
          'platform_payment_failed',
          'platform_payout_failed',
          'platform_retailer_payout_due',
          'platform_retailer_settlement_needs_review',
          'platform_worker_unavailable',
          'platform_task_stuck',
          'platform_communication_failed',
          'platform_technical_alert',
          'retail_order_created',
          'retail_order_awaiting_stock',
          'retail_order_ready_to_pack',
          'retail_order_ready_to_ship',
          'retail_order_pickup_booked',
          'retail_order_cancelled',
          'retail_order_returned',
          'retail_order_shipment_exception',
          'retail_order_shipped',
          'retail_order_delivered',
          'retail_settlement_needs_review',
          'retail_settlement_payout_paid'
        )
      )
  `;

  await sql`
    create index if not exists organisation_notification_preferences_enabled_idx
      on public.organisation_notification_preferences (
        organisation_id,
        event_key,
        enabled,
        preference_rank
      )
  `;

  await sql`
    create table if not exists public.line_connect_tokens (
      id uuid primary key default gen_random_uuid(),
      organisation_id uuid not null references public.organisations(id) on delete cascade,
      token_hash text not null,
      status text not null default 'active',
      expires_at timestamptz not null,
      consumed_at timestamptz,
      consumed_by_channel_id uuid references public.communication_channels(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint line_connect_tokens_status_check check (
        status in ('active', 'consuming', 'consumed', 'expired', 'revoked')
      )
    )
  `;

  await sql`
    create unique index if not exists line_connect_tokens_active_hash_idx
      on public.line_connect_tokens (token_hash)
      where consumed_at is null and status in ('active', 'consuming')
  `;

  await sql`
    create index if not exists line_connect_tokens_org_status_idx
      on public.line_connect_tokens (organisation_id, status, expires_at desc)
  `;

  await sql`
    create table if not exists public.customer_line_connect_tokens (
      id uuid primary key default gen_random_uuid(),
      plan_id uuid not null references public.assessments(plan_id) on delete cascade,
      retail_customer_order_id uuid,
      token_hash text not null,
      status text not null default 'active',
      expires_at timestamptz not null,
      consumed_at timestamptz,
      consumed_by_channel_id uuid references public.communication_channels(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint customer_line_connect_tokens_status_check check (
        status in ('active', 'consuming', 'consumed', 'expired', 'revoked')
      )
    )
  `;

  await sql`
    create unique index if not exists customer_line_connect_tokens_active_hash_idx
      on public.customer_line_connect_tokens (token_hash)
      where consumed_at is null and status in ('active', 'consuming')
  `;

  await sql`
    create index if not exists customer_line_connect_tokens_plan_status_idx
      on public.customer_line_connect_tokens (plan_id, status, expires_at desc)
  `;

  await sql`
    do $$
    begin
      if to_regclass('public.retail_customer_orders') is not null then
        alter table public.customer_line_connect_tokens
          add constraint customer_line_connect_tokens_retail_customer_order_id_fkey
          foreign key (retail_customer_order_id)
          references public.retail_customer_orders(id)
          on delete set null;
      end if;
    exception
      when duplicate_object then null;
    end $$;
  `;

  await sql`
    do $$
    begin
      if exists (select 1 from pg_roles where rolname = 'mn') then
        grant usage on schema public to mn;
        grant select, insert, update, delete on table
          public.organisation_communication_identities,
          public.organisation_notification_preferences,
          public.line_connect_tokens,
          public.customer_line_connect_tokens
        to mn;
      end if;
    end
    $$;
  `;

  console.log(JSON.stringify({ communicationsSchema: "applied" }));
} finally {
  await closeSqlPool();
}
