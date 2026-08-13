/**
 * Idempotent finance_transactions cleanup for sales ledger accuracy:
 * - DELETE abandoned/expired/failed/cancelled plan revenue rows (no "other")
 * - DELETE voided "other" rows left by earlier repairs
 * - DELETE Stripe bank-transfer rows (not customer sales)
 * - Keep paid plan sales as nominal revenue
 * - Retail product revenue → nominal
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

async function main() {
  console.log(
    dryRun ? "[dry-run] finance ledger cleanup" : "[apply] finance ledger cleanup"
  );

  const before = await sql`
    select
      count(*)::int as total_n,
      count(*) filter (where category = 'revenue')::int as revenue_n,
      count(*) filter (where category = 'other')::int as other_n,
      count(*) filter (where category = 'payout')::int as payout_n
    from public.finance_transactions
  `;
  console.log("before", before[0]);

  // 1) Delete non-completed plan revenue (and legacy voided "other" payment rows)
  const deleteAbandoned = await sql`
    select id::text, source_ref, category, description
    from public.finance_transactions
    where source = 'stripe'
      and source_ref like 'stripe:payment:%:nominal-revenue'
      and (
        category = 'other'
        or metadata->>'voided' = 'true'
        or metadata->>'paymentStatus' in ('expired', 'failed', 'cancelled')
        or metadata->>'accountingBasis' in (
          'payment_expired',
          'payment_failed',
          'payment_cancelled',
          'payment_created',
          'payment_voided'
        )
        or exists (
          select 1
          from public.payments p
          where source_ref = 'stripe:payment:' || p.id::text || ':nominal-revenue'
            and p.status not in ('paid', 'bound')
        )
      )
  `;
  console.log(`abandoned/void payment rows to delete: ${deleteAbandoned.length}`);

  // 2) Delete Stripe bank-transfer ledger rows (internal, not sales)
  const deleteBank = await sql`
    select id::text, source_ref
    from public.finance_transactions
    where source_ref like 'stripe:payout:%:net'
      or metadata->>'accountingBasis' = 'stripe_payout'
  `;
  console.log(`bank transfer rows to delete: ${deleteBank.length}`);

  if (!dryRun) {
    const ids = [
      ...deleteAbandoned.map((r) => r.id),
      ...deleteBank.map((r) => r.id)
    ];

    if (ids.length > 0) {
      const deleted = await sql`
        delete from public.finance_transactions
        where id = any(${ids}::uuid[])
        returning id::text
      `;
      console.log(`deleted ${deleted.length} rows`);
    }

    // Paid plans: ensure remaining revenue rows are nominal + clean
    await sql`
      update public.finance_transactions ft
      set
        category = 'revenue',
        entry_type = 'nominal',
        description = replace(ft.description, 'Nominal Stripe', 'Stripe'),
        metadata = coalesce(ft.metadata, '{}'::jsonb) || ${sql.json({
          paymentStatus: "paid",
          accountingBasis: "payment_confirmed",
          repairedAt: new Date().toISOString(),
          repairScript: "repair-prd-finance-ledger"
        })},
        updated_at = now()
      from public.payments p
      where ft.source = 'stripe'
        and ft.source_ref = 'stripe:payment:' || p.id::text || ':nominal-revenue'
        and p.status in ('paid', 'bound')
    `;

    // Retail product revenue → nominal
    await sql`
      update public.finance_transactions ft
      set
        entry_type = 'nominal',
        metadata = coalesce(ft.metadata, '{}'::jsonb) || ${sql.json({
          repairedAt: new Date().toISOString(),
          repairScript: "repair-prd-finance-ledger",
          entryTypeRepair: "actual_to_nominal"
        })},
        updated_at = now()
      where ft.category = 'revenue'
        and ft.source = 'retail_product_checkout'
        and ft.entry_type = 'actual'
    `;
  }

  // 3) Backfill missing nominal retailer payouts
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
      count(*)::int as total_n,
      count(*) filter (where category = 'revenue')::int as revenue_n,
      count(*) filter (where category = 'other')::int as other_n,
      count(*) filter (where category = 'payout')::int as payout_n,
      round(sum(case when category = 'revenue' then amount else 0 end)::numeric / 1000000, 2)
        as revenue_major_sum
    from public.finance_transactions
  `;

  const revenueDetail = await sql`
    select
      source,
      entry_type,
      count(*)::int as n,
      round(sum(amount)::numeric / 1000000, 2) as major
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
      : "Cleanup applied."
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
