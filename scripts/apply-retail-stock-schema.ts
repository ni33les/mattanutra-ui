import { closeSqlPool, getSql } from "@/lib/db";

const sql = getSql();

if (!sql) {
  throw new Error("DB_CONNECTION is required to apply the retail stock schema");
}

try {
  await sql`
    alter table public.bpm
      drop constraint if exists bpm_event_type_check
  `;

  await sql`
    alter table public.bpm
      add constraint bpm_event_type_check check (
        event_type = any(array[
          'traffic',
          'content',
          'funnel',
          'plan',
          'payment',
          'email',
          'chat',
          'formulation',
          'reassessment',
          'affiliate',
          'fulfillment',
          'safety',
          'error',
          'system'
        ]::text[])
      )
  `;

  await sql`
    alter table public.organisations
      add column if not exists currency text not null default 'THB'
  `;

  await sql`
    alter table public.organisations
      add column if not exists country_code text not null default 'TH'
  `;

  await sql`
    update public.organisations
    set country_code = 'TH'
    where country_code is null or country_code !~ '^[A-Z]{2}$'
  `;

  await sql`
    alter table public.organisations
      drop constraint if exists organisations_country_code_check
  `;

  await sql`
    alter table public.organisations
      add constraint organisations_country_code_check check (country_code ~ '^[A-Z]{2}$')
  `;

  await sql`
    update public.organisations
    set currency = case when organisation_type = 'platform' then 'USD' else 'THB' end
    where currency is null or currency !~ '^[A-Z]{3}$'
  `;

  await sql`
    update public.organisations
    set currency = 'USD'
    where organisation_type = 'platform'
      and lower(slug) = 'mattanutra'
      and currency = 'THB'
  `;

  await sql`
    alter table public.organisations
      drop constraint if exists organisations_currency_check
  `;

  await sql`
    alter table public.organisations
      add constraint organisations_currency_check check (currency ~ '^[A-Z]{3}$')
  `;

  await sql`
    alter table public.product_countries
      add column if not exists rrp_price_amount numeric(20,6),
      add column if not exists currency text not null default 'THB',
      add column if not exists pricing_status text not null default 'missing',
      add column if not exists price_updated_at timestamptz
  `;

  await sql`
    update public.product_countries
    set currency = coalesce(nullif(product_countries.currency, ''), 'THB')
    where product_countries.currency is null
      or product_countries.currency !~ '^[A-Z]{3}$'
  `;

  await sql`
    update public.product_countries
    set
      rrp_price_amount = products.price_amount,
      currency = coalesce(nullif(products.currency, ''), product_countries.currency, 'THB'),
      pricing_status = case
        when products.price_amount is not null and products.price_amount >= 0 then 'ready'
        else pricing_status
      end,
      price_updated_at = coalesce(product_countries.price_updated_at, now())
    from public.products
    where products.id = product_countries.product_id
      and product_countries.rrp_price_amount is null
      and products.price_amount is not null
      and products.price_amount >= 0
  `;

  await sql`
    update public.product_countries
    set pricing_status = case
      when rrp_price_amount is null then 'missing'
      when pricing_status not in ('missing', 'ready', 'review') then 'ready'
      else pricing_status
    end
  `;

  await sql`
    alter table public.product_countries
      drop constraint if exists product_countries_currency_check,
      drop constraint if exists product_countries_rrp_price_check,
      drop constraint if exists product_countries_pricing_status_check
  `;

  await sql`
    alter table public.product_countries
      add constraint product_countries_currency_check check (currency ~ '^[A-Z]{3}$'),
      add constraint product_countries_rrp_price_check check (rrp_price_amount is null or rrp_price_amount >= 0),
      add constraint product_countries_pricing_status_check check (pricing_status in ('missing', 'ready', 'review'))
  `;

  await sql`
    create index if not exists product_countries_pricing_status_idx
      on public.product_countries (country_code, pricing_status, updated_at desc)
  `;

  await sql`
    create table if not exists public.finance_fx_rates (
      id uuid primary key default gen_random_uuid(),
      base_currency text not null,
      quote_currency text not null,
      provider text not null,
      source text not null,
      bid numeric(20,10),
      ask numeric(20,10),
      mid numeric(20,10) not null,
      fetched_at timestamptz not null default now(),
      valid_at timestamptz not null default now(),
      expires_at timestamptz not null,
      raw_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint finance_fx_rates_currency_check check (
        base_currency ~ '^[A-Z]{3}$' and quote_currency ~ '^[A-Z]{3}$'
      ),
      constraint finance_fx_rates_mid_check check (mid > 0),
      constraint finance_fx_rates_spread_check check (
        (bid is null or bid > 0) and (ask is null or ask > 0)
      )
    )
  `;

  await sql`
    create index if not exists finance_fx_rates_pair_valid_idx
      on public.finance_fx_rates (
        base_currency,
        quote_currency,
        provider,
        valid_at desc,
        expires_at desc
      )
  `;

  await sql`
    alter table public.finance_transactions
      add column if not exists fx_rate_id uuid
  `;

  await sql`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.finance_transactions'::regclass
          and conname = 'finance_transactions_fx_rate_id_fkey'
      ) then
        alter table public.finance_transactions
          add constraint finance_transactions_fx_rate_id_fkey
          foreign key (fx_rate_id)
          references public.finance_fx_rates(id)
          on delete restrict;
      end if;
    end
    $$;
  `;

  await sql`
    create index if not exists finance_transactions_fx_rate_idx
      on public.finance_transactions (fx_rate_id)
      where fx_rate_id is not null
  `;

  await sql`
    create table if not exists public.retail_sellable_products (
      id uuid primary key default gen_random_uuid(),
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      status text not null default 'active',
      rrp_price_amount numeric(20,6),
      wholesale_price_amount numeric(20,6),
      currency text not null,
      lead_time_days integer not null default 0,
      backorder_policy text not null default 'allow',
      notes text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint retail_sellable_products_org_product_key unique (organisation_id, product_id),
      constraint retail_sellable_products_status_check check (
        status in ('active', 'disabled', 'deleted')
      ),
      constraint retail_sellable_products_backorder_policy_check check (
        backorder_policy in ('allow', 'deny')
      ),
      constraint retail_sellable_products_lead_time_check check (lead_time_days >= 0),
      constraint retail_sellable_products_currency_check check (currency ~ '^[A-Z]{3}$'),
      constraint retail_sellable_products_price_check check (
        (rrp_price_amount is null or rrp_price_amount >= 0)
        and (wholesale_price_amount is null or wholesale_price_amount >= 0)
      )
    )
  `;

  await sql`
    alter table public.retail_sellable_products
      drop constraint if exists retail_sellable_products_active_price_check
  `;

  await sql`
    create index if not exists retail_sellable_products_org_status_idx
      on public.retail_sellable_products (organisation_id, status, updated_at desc)
  `;

  await sql`
    create index if not exists retail_sellable_products_product_idx
      on public.retail_sellable_products (product_id)
  `;

  await sql`
    create table if not exists public.retail_product_stock (
      id uuid primary key default gen_random_uuid(),
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      status text not null default 'active',
      stock_quantity integer not null default 0,
      lead_time_days integer not null default 0,
      wholesale_price_amount numeric(20,6),
      retail_price_amount numeric(20,6),
      currency text not null,
      notes text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint retail_product_stock_org_product_key unique (organisation_id, product_id),
      constraint retail_product_stock_status_check check (
        status in ('active', 'disabled', 'deleted')
      ),
      constraint retail_product_stock_quantity_check check (stock_quantity >= 0),
      constraint retail_product_stock_lead_time_check check (lead_time_days >= 0),
      constraint retail_product_stock_currency_check check (currency ~ '^[A-Z]{3}$'),
      constraint retail_product_stock_price_check check (
        (wholesale_price_amount is null or wholesale_price_amount >= 0)
        and (retail_price_amount is null or retail_price_amount >= 0)
      )
    )
  `;

  await sql`
    alter table public.retail_product_stock
      drop constraint if exists retail_product_stock_active_price_check
  `;

  await sql`
    create index if not exists retail_product_stock_org_status_idx
      on public.retail_product_stock (organisation_id, status, updated_at desc)
  `;

  await sql`
    create index if not exists retail_product_stock_product_idx
      on public.retail_product_stock (product_id)
  `;

  await sql`
    insert into public.retail_sellable_products (
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
    select
      stock.organisation_id,
      stock.product_id,
      stock.status,
      stock.retail_price_amount,
      stock.wholesale_price_amount,
      stock.currency,
      stock.lead_time_days,
      'allow',
      stock.notes,
      stock.metadata || jsonb_build_object('backfilledFrom', 'retail_product_stock'),
      stock.created_at,
      stock.updated_at
    from public.retail_product_stock stock
    where stock.status <> 'deleted'
      and stock.retail_price_amount is not null
      and not exists (
        select 1
        from public.retail_sellable_products sellable
        where sellable.organisation_id = stock.organisation_id
          and sellable.product_id = stock.product_id
      )
  `;

  await sql`
    create table if not exists public.retail_product_stock_snapshots (
      id uuid primary key default gen_random_uuid(),
      retail_product_stock_id uuid not null references public.retail_product_stock(id) on delete restrict,
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      event_type text not null default 'updated',
      status text not null,
      stock_quantity integer not null,
      lead_time_days integer not null,
      wholesale_price_amount numeric(20,6),
      retail_price_amount numeric(20,6),
      currency text not null,
      notes text,
      actor_person_id uuid references public.people(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      recorded_at timestamptz not null default now(),
      constraint retail_product_stock_snapshots_event_type_check check (
        event_type in ('created', 'updated', 'status_changed', 'movement')
      ),
      constraint retail_product_stock_snapshots_status_check check (
        status in ('active', 'disabled', 'deleted')
      ),
      constraint retail_product_stock_snapshots_quantity_check check (stock_quantity >= 0),
      constraint retail_product_stock_snapshots_lead_time_check check (lead_time_days >= 0),
      constraint retail_product_stock_snapshots_currency_check check (currency ~ '^[A-Z]{3}$'),
      constraint retail_product_stock_snapshots_price_check check (
        (wholesale_price_amount is null or wholesale_price_amount >= 0)
        and (retail_price_amount is null or retail_price_amount >= 0)
      )
    )
  `;

  await sql`
    create index if not exists retail_product_stock_snapshots_stock_idx
      on public.retail_product_stock_snapshots (retail_product_stock_id, recorded_at desc)
  `;

  await sql`
    create index if not exists retail_product_stock_snapshots_org_product_idx
      on public.retail_product_stock_snapshots (organisation_id, product_id, recorded_at desc)
  `;

  await sql`
    alter table public.retail_product_stock_snapshots
      drop constraint if exists retail_product_stock_snapshots_event_type_check
  `;

  await sql`
    alter table public.retail_product_stock_snapshots
      add constraint retail_product_stock_snapshots_event_type_check check (
        event_type in ('created', 'updated', 'status_changed', 'movement')
      )
  `;

  await sql`
    create table if not exists public.retail_stock_lots (
      id uuid primary key default gen_random_uuid(),
      retail_product_stock_id uuid not null references public.retail_product_stock(id) on delete restrict,
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      status text not null default 'active',
      received_quantity integer not null default 0,
      remaining_quantity integer not null default 0,
      wholesale_price_amount numeric(20,6),
      currency text not null,
      expires_at date,
      received_at timestamptz not null default now(),
      notes text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint retail_stock_lots_status_check check (
        status in ('active', 'depleted', 'disabled', 'deleted')
      ),
      constraint retail_stock_lots_quantity_check check (
        received_quantity >= 0
        and remaining_quantity >= 0
        and remaining_quantity <= received_quantity
      ),
      constraint retail_stock_lots_currency_check check (currency ~ '^[A-Z]{3}$'),
      constraint retail_stock_lots_wholesale_price_check check (
        wholesale_price_amount is null or wholesale_price_amount >= 0
      )
    )
  `;

  await sql`
    create index if not exists retail_stock_lots_stock_idx
      on public.retail_stock_lots (retail_product_stock_id, status, expires_at)
  `;

  await sql`
    create index if not exists retail_stock_lots_org_product_idx
      on public.retail_stock_lots (organisation_id, product_id, status)
  `;

  await sql`
    create table if not exists public.retail_stock_movements (
      id uuid primary key default gen_random_uuid(),
      retail_product_stock_id uuid not null references public.retail_product_stock(id) on delete restrict,
      lot_id uuid references public.retail_stock_lots(id) on delete restrict,
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      movement_type text not null,
      quantity_delta integer not null,
      unit_cost_amount numeric(20,6),
      retail_price_amount numeric(20,6),
      currency text not null,
      reason text,
      notes text,
      voids_movement_id uuid references public.retail_stock_movements(id) on delete restrict,
      actor_person_id uuid references public.people(id) on delete set null,
      source text not null default 'admin',
      metadata jsonb not null default '{}'::jsonb,
      occurred_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      constraint retail_stock_movements_type_check check (
        movement_type in (
          'receive',
          'sale',
          'adjustment',
          'void',
          'return',
          'transfer_in',
          'transfer_out',
          'expiry_write_off'
        )
      ),
      constraint retail_stock_movements_quantity_delta_check check (quantity_delta <> 0),
      constraint retail_stock_movements_currency_check check (currency ~ '^[A-Z]{3}$'),
      constraint retail_stock_movements_amount_check check (
        (unit_cost_amount is null or unit_cost_amount >= 0)
        and (retail_price_amount is null or retail_price_amount >= 0)
      ),
      constraint retail_stock_movements_void_check check (
        (movement_type = 'void' and voids_movement_id is not null)
        or (movement_type <> 'void' and voids_movement_id is null)
      )
    )
  `;

  await sql`
    create index if not exists retail_stock_movements_stock_idx
      on public.retail_stock_movements (retail_product_stock_id, occurred_at desc)
  `;

  await sql`
    create index if not exists retail_stock_movements_org_product_idx
      on public.retail_stock_movements (organisation_id, product_id, occurred_at desc)
  `;

  await sql`
    create index if not exists retail_stock_movements_voids_idx
      on public.retail_stock_movements (voids_movement_id)
      where voids_movement_id is not null
  `;

  await sql`
    create table if not exists public.retail_stock_reorder_advice (
      id uuid primary key default gen_random_uuid(),
      retail_product_stock_id uuid not null references public.retail_product_stock(id) on delete restrict,
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      risk_level text not null default 'ok',
      confidence text not null default 'low',
      current_stock_quantity integer not null default 0,
      outflow_units_30d integer not null default 0,
      recommendation_pressure_count integer not null default 0,
      lead_time_days integer not null default 0,
      days_cover numeric(20,4),
      reorder_by date,
      suggested_order_quantity integer not null default 0,
      generated_by_task_id uuid references public.tasks(id) on delete set null,
      inputs jsonb not null default '{}'::jsonb,
      calculated_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint retail_stock_reorder_advice_org_product_key unique (organisation_id, product_id),
      constraint retail_stock_reorder_advice_risk_check check (
        risk_level in ('ok', 'watch', 'reorder', 'out_of_stock')
      ),
      constraint retail_stock_reorder_advice_confidence_check check (
        confidence in ('low', 'medium', 'high')
      ),
      constraint retail_stock_reorder_advice_nonnegative_check check (
        current_stock_quantity >= 0
        and outflow_units_30d >= 0
        and recommendation_pressure_count >= 0
        and lead_time_days >= 0
        and suggested_order_quantity >= 0
      )
    )
  `;

  await sql`
    create index if not exists retail_stock_reorder_advice_risk_idx
      on public.retail_stock_reorder_advice (organisation_id, risk_level, calculated_at desc)
  `;

  await sql`
    create table if not exists public.retail_shopping_lists (
      id uuid primary key default gen_random_uuid(),
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      list_number text not null,
      status text not null default 'draft',
      currency text not null,
      notes text,
      applied_at timestamptz,
      created_by_person_id uuid references public.people(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint retail_shopping_lists_org_number_key unique (organisation_id, list_number),
      constraint retail_shopping_lists_status_check check (
        status in ('draft', 'applied', 'closed', 'cancelled')
      ),
      constraint retail_shopping_lists_currency_check check (currency ~ '^[A-Z]{3}$')
    )
  `;

  await sql`
    create index if not exists retail_shopping_lists_org_status_idx
      on public.retail_shopping_lists (organisation_id, status, updated_at desc)
  `;

  await sql`
    create table if not exists public.retail_shopping_list_lines (
      id uuid primary key default gen_random_uuid(),
      shopping_list_id uuid not null references public.retail_shopping_lists(id) on delete cascade,
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      required_quantity integer not null default 0,
      current_stock_quantity integer not null default 0,
      unordered_need_quantity integer not null default 0,
      suggested_quantity integer not null default 0,
      wholesaler_tried text,
      availability_status text not null default 'unknown',
      purchased_quantity integer not null default 0,
      wholesale_price_amount numeric(20,6),
      retail_price_amount numeric(20,6),
      notes text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint retail_shopping_list_lines_quantity_check check (
        required_quantity >= 0
        and current_stock_quantity >= 0
        and unordered_need_quantity >= 0
        and suggested_quantity >= 0
        and purchased_quantity >= 0
      ),
      constraint retail_shopping_list_lines_availability_check check (
        availability_status in ('unknown', 'available', 'partial', 'not_available')
      ),
      constraint retail_shopping_list_lines_price_check check (
        (wholesale_price_amount is null or wholesale_price_amount >= 0)
        and (retail_price_amount is null or retail_price_amount >= 0)
      )
    )
  `;

  await sql`
    create index if not exists retail_shopping_list_lines_list_idx
      on public.retail_shopping_list_lines (shopping_list_id, created_at)
  `;

  await sql`
    alter table public.tasks
      add column if not exists priority_score integer not null default 200,
      add column if not exists priority_reason text,
      add column if not exists profit_impact_amount numeric(20,6),
      add column if not exists profit_impact_currency text,
      add column if not exists due_at timestamptz,
      add column if not exists source_entity_type text,
      add column if not exists source_entity_id uuid
  `;

  await sql`
    update public.tasks
    set priority_score = business_value
    where priority_score is null
  `;

  await sql`
    alter table public.tasks
      drop constraint if exists tasks_priority_score_check,
      drop constraint if exists tasks_profit_impact_check,
      drop constraint if exists tasks_profit_impact_currency_check
  `;

  await sql`
    alter table public.tasks
      add constraint tasks_priority_score_check check (priority_score > 0),
      add constraint tasks_profit_impact_check check (
        profit_impact_amount is null or profit_impact_amount >= 0
      ),
      add constraint tasks_profit_impact_currency_check check (
        profit_impact_currency is null or profit_impact_currency ~ '^[A-Z]{3}$'
      )
  `;

  await sql`
    create index if not exists tasks_priority_queue_idx
      on public.tasks (status, priority_score desc, due_at, scheduled_for, created_at)
  `;

  await sql`
    create index if not exists tasks_source_entity_idx
      on public.tasks (source_entity_type, source_entity_id)
      where source_entity_id is not null
  `;

  await sql`
    create table if not exists public.retail_purchase_orders (
      id uuid primary key default gen_random_uuid(),
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      po_number text not null,
      supplier_name text not null,
      supplier_contact text,
      status text not null default 'draft',
      currency text not null,
      expected_at date,
      ordered_at timestamptz,
      received_at timestamptz,
      notes text,
      created_by_person_id uuid references public.people(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint retail_purchase_orders_org_po_number_key unique (organisation_id, po_number),
      constraint retail_purchase_orders_status_check check (
        status in ('draft', 'ordered', 'partially_received', 'received', 'closed', 'cancelled')
      ),
      constraint retail_purchase_orders_currency_check check (currency ~ '^[A-Z]{3}$')
    )
  `;

  await sql`
    alter table public.retail_purchase_orders
      drop constraint if exists retail_purchase_orders_status_check,
      add constraint retail_purchase_orders_status_check check (
        status in ('draft', 'ordered', 'partially_received', 'received', 'closed', 'cancelled')
      )
  `;

  await sql`
    create table if not exists public.retail_purchase_order_lines (
      id uuid primary key default gen_random_uuid(),
      purchase_order_id uuid not null references public.retail_purchase_orders(id) on delete cascade,
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      quantity_ordered integer not null,
      quantity_received integer not null default 0,
      quantity_cancelled integer not null default 0,
      wholesale_price_amount numeric(20,6),
      expected_expires_at date,
      notes text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint retail_purchase_order_lines_quantity_check check (
        quantity_ordered > 0
        and quantity_received >= 0
        and quantity_cancelled >= 0
        and quantity_received + quantity_cancelled <= quantity_ordered
      ),
      constraint retail_purchase_order_lines_price_check check (
        wholesale_price_amount is null or wholesale_price_amount >= 0
      )
    )
  `;

  await sql`
    alter table public.retail_purchase_order_lines
      add column if not exists quantity_cancelled integer not null default 0
  `;

  await sql`
    alter table public.retail_purchase_order_lines
      drop constraint if exists retail_purchase_order_lines_quantity_check,
      add constraint retail_purchase_order_lines_quantity_check check (
        quantity_ordered > 0
        and quantity_received >= 0
        and quantity_cancelled >= 0
        and quantity_received + quantity_cancelled <= quantity_ordered
      )
  `;

  await sql`
    create table if not exists public.retail_purchase_order_line_shortfalls (
      id uuid primary key default gen_random_uuid(),
      purchase_order_id uuid not null references public.retail_purchase_orders(id) on delete cascade,
      purchase_order_line_id uuid not null references public.retail_purchase_order_lines(id) on delete cascade,
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      quantity integer not null,
      resolution text not null,
      reference text,
      expected_at date,
      notes text,
      metadata jsonb not null default '{}'::jsonb,
      created_by_person_id uuid references public.people(id) on delete set null,
      created_at timestamptz not null default now(),
      constraint retail_purchase_order_line_shortfalls_quantity_check check (quantity > 0),
      constraint retail_purchase_order_line_shortfalls_resolution_check check (
        resolution in (
          'supplier_backorder',
          'replacement_shipment',
          'supplier_credit',
          'supplier_refund',
          'close_short',
          'damaged_rejected'
        )
      )
    )
  `;

  await sql`
    create table if not exists public.retail_customer_orders (
      id uuid primary key default gen_random_uuid(),
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      order_number text not null,
      source text not null default 'manual',
      customer_name text,
      customer_email text,
      status text not null default 'draft',
      currency text not null,
      due_at timestamptz,
      placed_at timestamptz,
      shipped_at timestamptz,
      delivered_at timestamptz,
      notes text,
      created_by_person_id uuid references public.people(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint retail_customer_orders_org_order_number_key unique (organisation_id, order_number),
      constraint retail_customer_orders_source_check check (source in ('manual', 'checkout')),
      constraint retail_customer_orders_status_check check (
        status in (
          'draft',
          'placed',
          'awaiting_stock',
          'allocated',
          'picking',
          'packed',
          'shipped',
          'delivered',
          'cancelled',
          'returned'
        )
      ),
      constraint retail_customer_orders_currency_check check (currency ~ '^[A-Z]{3}$')
    )
  `;

  await sql`
    create table if not exists public.retail_customer_order_lines (
      id uuid primary key default gen_random_uuid(),
      customer_order_id uuid not null references public.retail_customer_orders(id) on delete cascade,
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      quantity_ordered integer not null,
      quantity_allocated integer not null default 0,
      quantity_shipped integer not null default 0,
      retail_price_amount numeric(20,6),
      notes text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint retail_customer_order_lines_quantity_check check (
        quantity_ordered > 0
        and quantity_allocated >= 0
        and quantity_allocated <= quantity_ordered
        and quantity_shipped >= 0
        and quantity_shipped <= quantity_ordered
      ),
      constraint retail_customer_order_lines_price_check check (
        retail_price_amount is null or retail_price_amount >= 0
      )
    )
  `;

  await sql`
    create table if not exists public.retail_order_allocations (
      id uuid primary key default gen_random_uuid(),
      customer_order_id uuid not null references public.retail_customer_orders(id) on delete cascade,
      customer_order_line_id uuid not null references public.retail_customer_order_lines(id) on delete cascade,
      retail_product_stock_id uuid not null references public.retail_product_stock(id) on delete restrict,
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      quantity_allocated integer not null,
      status text not null default 'active',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint retail_order_allocations_quantity_check check (quantity_allocated > 0),
      constraint retail_order_allocations_status_check check (
        status in ('active', 'picked', 'shipped', 'cancelled', 'returned')
      )
    )
  `;

  await sql`
    create index if not exists retail_purchase_orders_org_status_idx
      on public.retail_purchase_orders (organisation_id, status, expected_at, updated_at desc)
  `;

  await sql`
    create index if not exists retail_purchase_order_lines_po_idx
      on public.retail_purchase_order_lines (purchase_order_id, product_id)
  `;

  await sql`
    drop index if exists public.retail_purchase_order_lines_receiving_idx
  `;

  await sql`
    create index if not exists retail_purchase_order_lines_receiving_idx
      on public.retail_purchase_order_lines (organisation_id, product_id)
      where quantity_received + quantity_cancelled < quantity_ordered
  `;

  await sql`
    create index if not exists retail_purchase_order_line_shortfalls_line_idx
      on public.retail_purchase_order_line_shortfalls (purchase_order_line_id, created_at desc)
  `;

  await sql`
    create index if not exists retail_purchase_order_line_shortfalls_org_po_idx
      on public.retail_purchase_order_line_shortfalls (organisation_id, purchase_order_id, created_at desc)
  `;

  await sql`
    create index if not exists retail_customer_orders_org_status_idx
      on public.retail_customer_orders (organisation_id, status, due_at, updated_at desc)
  `;

  await sql`
    create index if not exists retail_customer_order_lines_order_idx
      on public.retail_customer_order_lines (customer_order_id, product_id)
  `;

  await sql`
    create index if not exists retail_order_allocations_order_idx
      on public.retail_order_allocations (customer_order_id, customer_order_line_id, status)
  `;

  await sql`
    do $$
    begin
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'retail_product_stock'
          and column_name = 'expires_at'
      ) then
        execute $backfill$
          insert into public.retail_stock_lots (
            retail_product_stock_id,
            organisation_id,
            product_id,
            status,
            received_quantity,
            remaining_quantity,
            wholesale_price_amount,
            currency,
            expires_at,
            notes,
            metadata,
            received_at
          )
          select
            stock.id,
            stock.organisation_id,
            stock.product_id,
            case when stock.stock_quantity = 0 then 'depleted' else 'active' end,
            stock.stock_quantity,
            stock.stock_quantity,
            stock.wholesale_price_amount,
            stock.currency,
            stock.expires_at,
            stock.notes,
            jsonb_build_object('backfilledFrom', 'retail_product_stock'),
            stock.created_at
          from public.retail_product_stock stock
          where stock.status <> 'deleted'
            and stock.stock_quantity > 0
            and not exists (
              select 1
              from public.retail_stock_lots lots
              where lots.retail_product_stock_id = stock.id
            )
        $backfill$;
      else
        execute $backfill$
          insert into public.retail_stock_lots (
            retail_product_stock_id,
            organisation_id,
            product_id,
            status,
            received_quantity,
            remaining_quantity,
            wholesale_price_amount,
            currency,
            expires_at,
            notes,
            metadata,
            received_at
          )
          select
            stock.id,
            stock.organisation_id,
            stock.product_id,
            case when stock.stock_quantity = 0 then 'depleted' else 'active' end,
            stock.stock_quantity,
            stock.stock_quantity,
            stock.wholesale_price_amount,
            stock.currency,
            null,
            stock.notes,
            jsonb_build_object('backfilledFrom', 'retail_product_stock'),
            stock.created_at
          from public.retail_product_stock stock
          where stock.status <> 'deleted'
            and stock.stock_quantity > 0
            and not exists (
              select 1
              from public.retail_stock_lots lots
              where lots.retail_product_stock_id = stock.id
            )
        $backfill$;
      end if;
    end
    $$;
  `;

  await sql`
    insert into public.retail_stock_movements (
      retail_product_stock_id,
      lot_id,
      organisation_id,
      product_id,
      movement_type,
      quantity_delta,
      unit_cost_amount,
      retail_price_amount,
      currency,
      reason,
      notes,
      source,
      metadata,
      occurred_at
    )
    select
      stock.id,
      lots.id,
      stock.organisation_id,
      stock.product_id,
      'receive',
      stock.stock_quantity,
      stock.wholesale_price_amount,
      stock.retail_price_amount,
      stock.currency,
      'Backfilled opening stock',
      stock.notes,
      'migration',
      jsonb_build_object('backfilledFrom', 'retail_product_stock'),
      stock.created_at
    from public.retail_product_stock stock
    left join lateral (
      select id
      from public.retail_stock_lots
      where retail_product_stock_id = stock.id
      order by created_at asc
      limit 1
    ) lots on true
    where stock.status <> 'deleted'
      and stock.stock_quantity > 0
      and not exists (
        select 1
        from public.retail_stock_movements movements
        where movements.retail_product_stock_id = stock.id
      )
  `;

  await sql`
    alter table public.retail_product_stock
      drop column if exists expires_at
  `;

  await sql`
    alter table public.retail_product_stock_snapshots
      drop column if exists expires_at
  `;

  console.log(JSON.stringify({ retailStockSchema: "applied" }));
} finally {
  await closeSqlPool();
}
