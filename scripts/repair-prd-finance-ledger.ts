/**
 * Idempotent PRD finance_transactions repair:
 * - Void expired/failed/cancelled plan revenue
 * - Keep paid plan sales as nominal revenue
 * - Retail product revenue → nominal
 * - Stripe bank payouts → category other
 * - Backfill missing retailer nominal payouts when payable > 0
 *
 * Usage:
 *   DB_ALLOW_DIRECT_CONNECTION=true DB_URL=... node --experimental-strip-types \
 *     --import ./scripts/register-ts-path-loader.mjs scripts/repair-prd-finance-ledger.ts
 *   DRY_RUN=1 ...  (report only)
 */
import postgres from "postgres";
import { FINANCE_ACCOUNT_IDS, recordFinanceTransaction } from "../lib/finance-ledger.ts";
import { resolveUsdRateForCurrency } from "../lib/finance-fx.ts";

const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const connection = process.env.DB_URL || process.env.PRD_DB_URL;

if (!connection) {
  console.error("DB_URL or PRD_DB_URL is required");
  process.exit(1);
}

const sql = postgres(connection, {
  max: 1,
  ssl: "require",
  connect_timeout: 30
});

type CountRow = { n: number };

async function main() {
  console.log(dryRun ? "[dry-run] PRD finance ledger repair" : "[apply] PRD finance ledger repair");

  const before = await sql`
    select
      count(*) filter (where category = 'revenue')::int as revenue_n,
      count(*) filter (
        where category = 'revenue'
          and entry_type = 'nominal'
          and (
            metadata->>'paymentStatus' in ('expired', 'failed', 'cancelled')
            or metadata->>'accountingBasis' in (
              'payment_expired', 'payment_failed', 'payment_cancelled', 'payment_created'
            )
          )
      )::int as expired_revenue_n,
      count(*) filter (
        where category = 'revenue' and metadata->>'accountingBasis' = 'stripe_payout'
      )::int as bank_as_revenue_n,
      count(*) filter (
        where category = 'revenue'
          and source = 'retail_product_checkout'
          and entry_type = 'actual'
      )::int as retail_actual_n,
      count(*) filter (where category = 'payout')::int as payout_n
    from public.finance_transactions
  `;
  console.log("before", before[0]);

  // 1) Void non-completed plan revenue (expired / failed / cancelled / open create)
  const voidCandidates = await sql<{
    id: string;
    source_ref: string;
    amount: number;
    currency: string;
    usd_rate: number;
    description: string;
  }[]>`
    select
      id::text,
      source_ref,
      amount,
      currency,
      usd_rate,
      description
    from public.finance_transactions
    where category = 'revenue'
      and source = 'stripe'
      and source_ref like 'stripe:payment:%:nominal-revenue'
      and (
        metadata->>'paymentStatus' in ('expired', 'failed', 'cancelled')
        or metadata->>'accountingBasis' in (
          'payment_expired', 'payment_failed', 'payment_cancelled', 'payment_created'
        )
      )
  `;

  console.log(`void candidates: ${voidCandidates.length}`);

  if (!dryRun) {
    for (const row of voidCandidates) {
      await sql`
        update public.finance_transactions
        set
          category = 'other',
          description = ${`Voided abandoned checkout (${row.description})`},
          metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json({
            voided: true,
            accountingBasis: "payment_voided",
            repairedAt: new Date().toISOString(),
            repairScript: "repair-prd-finance-ledger"
          })},
          updated_at = now()
        where id = ${row.id}::uuid
      `;
    }
  }

  // 2) Paid plans stay nominal revenue (ensure entry_type + clean description)
  const paidPlans = await sql<{
    payment_id: string;
    finance_id: string | null;
  }[]>`
    select
      p.id::text as payment_id,
      ft.id::text as finance_id
    from public.payments p
    left join public.finance_transactions ft
      on ft.source = 'stripe'
      and ft.source_ref = 'stripe:payment:' || p.id::text || ':nominal-revenue'
    where p.status = 'paid'
  `;

  console.log(`paid plan payments: ${paidPlans.length}`);

  if (!dryRun) {
    for (const row of paidPlans) {
      if (!row.finance_id) {
        console.warn("missing revenue row for paid payment", row.payment_id);
        continue;
      }

      await sql`
        update public.finance_transactions
        set
          category = 'revenue',
          entry_type = 'nominal',
          description = replace(description, 'Nominal Stripe', 'Stripe'),
          metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json({
            paymentStatus: "paid",
            accountingBasis: "payment_confirmed",
            repairedAt: new Date().toISOString(),
            repairScript: "repair-prd-finance-ledger"
          })},
          updated_at = now()
        where id = ${row.finance_id}::uuid
      `;
    }
  }

  // 3) Retail product revenue → nominal
  const retailActual = await sql<CountRow[]>`
    select count(*)::int as n
    from public.finance_transactions
    where category = 'revenue'
      and source = 'retail_product_checkout'
      and entry_type = 'actual'
  `;
  console.log(`retail actual→nominal: ${retailActual[0]?.n ?? 0}`);

  if (!dryRun) {
    await sql`
      update public.finance_transactions
      set
        entry_type = 'nominal',
        metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json({
          repairedAt: new Date().toISOString(),
          repairScript: "repair-prd-finance-ledger",
          entryTypeRepair: "actual_to_nominal"
        })},
        updated_at = now()
      where category = 'revenue'
        and source = 'retail_product_checkout'
        and entry_type = 'actual'
    `;
  }

  // 4) Bank payouts out of revenue
  const bankAsRevenue = await sql<CountRow[]>`
    select count(*)::int as n
    from public.finance_transactions
    where (
      metadata->>'accountingBasis' = 'stripe_payout'
      or source_ref like 'stripe:payout:%:net'
    )
    and category = 'revenue'
  `;
  console.log(`bank payout reclassify: ${bankAsRevenue[0]?.n ?? 0}`);

  if (!dryRun) {
    await sql`
      update public.finance_transactions
      set
        category = 'other',
        entry_type = 'actual',
        metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json({
          accountingBasis: "stripe_payout",
          repairedAt: new Date().toISOString(),
          repairScript: "repair-prd-finance-ledger"
        })},
        updated_at = now()
      where (
        metadata->>'accountingBasis' = 'stripe_payout'
        or source_ref like 'stripe:payout:%:net'
      )
      and category = 'revenue'
    `;
  }

  // 5) Backfill missing nominal retailer payouts
  const missingPayouts = await sql<{
    settlement_id: string;
    order_number: string;
    organisation_id: string;
    currency: string;
    payable: number;
    finance_account_id: string | null;
    status: string;
  }[]>`
    select
      s.id::text as settlement_id,
      o.order_number,
      s.organisation_id::text,
      s.currency,
      s.retailer_payable_amount::bigint as payable,
      s.finance_account_id::text,
      s.status
    from public.retail_order_settlements s
    join public.retail_customer_orders o on o.id = s.retail_customer_order_id
    where s.retailer_payable_amount > 0
      and s.nominal_finance_transaction_id is null
      and s.status in ('pending', 'due', 'needs_review', 'paid', 'confirmed')
  `;

  console.log(`missing nominal payouts: ${missingPayouts.length}`);

  if (!dryRun) {
    for (const row of missingPayouts) {
      const payable = Number(row.payable);
      if (!Number.isFinite(payable) || payable < 1) {
        continue;
      }

      const isCashSettled = row.status === "paid" || row.status === "confirmed";
      const fx = await resolveUsdRateForCurrency(row.currency, { sql });
      const transactionId = await recordFinanceTransaction({
        amount: payable,
        category: "payout",
        currency: row.currency,
        description: isCashSettled
          ? "Actual retailer settlement payout"
          : `Retailer settlement due for order ${row.order_number}`,
        entryType: isCashSettled ? "actual" : "nominal",
        from: isCashSettled ? "mattanutra:bank" : "mattanutra:retail-payable",
        fromAccountId: isCashSettled
          ? FINANCE_ACCOUNT_IDS.mattanutraBank
          : FINANCE_ACCOUNT_IDS.mattanutraRevenue,
        fxRateId: fx.fxRateId,
        metadata: {
          accountingBasis: isCashSettled
            ? "retailer_settlement_paid"
            : "retailer_settlement_due",
          orderNumber: row.order_number,
          organisationId: row.organisation_id,
          settlementId: row.settlement_id,
          repairScript: "repair-prd-finance-ledger"
        },
        provider: "retail_settlement",
        source: "retail_order_settlement",
        sourceRef: `retail-settlement:${row.settlement_id}:payout`,
        sql,
        to: `retailer:${row.organisation_id}:settlement`,
        toAccountId: row.finance_account_id,
        usdRate: fx.usdRate
      });

      if (transactionId) {
        await sql`
          update public.retail_order_settlements
          set
            nominal_finance_transaction_id = coalesce(
              nominal_finance_transaction_id,
              ${transactionId}::uuid
            ),
            actual_finance_transaction_id = case
              when status in ('paid', 'confirmed')
                then coalesce(actual_finance_transaction_id, ${transactionId}::uuid)
              else actual_finance_transaction_id
            end,
            updated_at = now()
          where id = ${row.settlement_id}::uuid
        `;
      }
    }
  }

  const after = await sql`
    select
      count(*) filter (where category = 'revenue')::int as revenue_n,
      round(sum(case when category = 'revenue' then amount else 0 end)::numeric / 1000000, 2) as revenue_thb_major_sum,
      count(*) filter (
        where category = 'revenue' and entry_type = 'nominal'
      )::int as revenue_nominal_n,
      count(*) filter (
        where category = 'revenue' and entry_type = 'actual'
      )::int as revenue_actual_n,
      count(*) filter (where category = 'payout')::int as payout_n,
      round(sum(case when category = 'payout' then amount else 0 end)::numeric / 1000000, 2) as payout_thb_major_sum,
      count(*) filter (
        where category = 'revenue'
          and (
            metadata->>'paymentStatus' in ('expired', 'failed', 'cancelled')
            or metadata->>'accountingBasis' in (
              'payment_expired', 'payment_failed', 'payment_cancelled', 'payment_created'
            )
          )
      )::int as expired_still_revenue_n,
      count(*) filter (
        where category = 'revenue' and metadata->>'accountingBasis' = 'stripe_payout'
      )::int as bank_still_revenue_n
    from public.finance_transactions
  `;

  const revenueDetail = await sql`
    select
      source,
      entry_type,
      count(*)::int as n,
      round(sum(amount)::numeric / 1000000, 2) as thb
    from public.finance_transactions
    where category = 'revenue'
    group by 1, 2
    order by 1, 2
  `;

  console.log("after", after[0]);
  console.log("revenue by source", revenueDetail);
  console.log(
    dryRun
      ? "Dry run complete — re-run without DRY_RUN=1 to apply."
      : "Repair applied."
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 2 });
  });
