import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { FinanceTransactionInput } from "@/lib/finance-ledger";

type Db = postgres.Sql | postgres.TransactionSql;
export type PaymentAccountingIdentity = Readonly<{
  sourceRef: string; amount: number | string; currency: string;
  category: "revenue" | "payment_fee"; entryType: "nominal" | "actual";
  metadata?: Record<string, unknown>;
}>;
export class PaymentAccountingConflict extends Error {
  readonly code = "payment_accounting_conflict";
  readonly sourceRef: string;
  constructor(sourceRef: string) { super("Existing payment accounting conflicts with verified payment facts"); this.sourceRef = sourceRef; }
}
function amount(value: number | string) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("Payment amount must be an exact integer in micros");
  if (!/^\d+$/.test(String(value)) || BigInt(value) <= BigInt(0)) throw new Error("Payment amount must be positive integer micros");
  return BigInt(value).toString();
}
const identityFields = ["paymentId", "stripeCheckoutSessionId", "stripePaymentIntentId", "stripeBalanceTransactionId"] as const;
/** Ordinary read; differences in historical FX, descriptions or binding labels are not corrections. */
export async function existingPaymentAccounting(sql: Db, input: PaymentAccountingIdentity): Promise<string | null> {
  const expectedAmount = amount(input.amount);
  const [row] = await sql`select id,amount::text,amount_unit,currency,category,entry_type,provider,metadata from public.finance_transactions
    where source='stripe' and source_ref=${input.sourceRef}`;
  if (!row) return null;
  const matches = row.amount === expectedAmount && row.amount_unit === "micros" && row.currency === input.currency.toUpperCase()
    && row.category === input.category && row.entry_type === input.entryType && (row.provider == null || row.provider === "stripe")
    && identityFields.every(field => row.metadata?.[field] == null || input.metadata?.[field] == null || row.metadata[field] === input.metadata[field]);
  if (!matches) throw new PaymentAccountingConflict(input.sourceRef);
  return row.id;
}
/** Payment-only insertion. General finance upserts retain their existing behaviour. */
export async function recordPaymentAccountingOnce(sql: Db, input: Omit<FinanceTransactionInput, "amount"> & PaymentAccountingIdentity) {
  const existing = await existingPaymentAccounting(sql, input);
  if (existing) return existing;
  if (input.source !== "stripe" || input.provider !== "stripe" || !input.sourceRef || !Number.isFinite(input.usdRate) || input.usdRate <= 0) throw new Error("Verified Stripe accounting and FX are required");
  const [inserted] = await sql`insert into public.finance_transactions
    (id,occurred_at,category,entry_type,source,source_ref,provider,fx_rate_id,task_id,from_account_id,to_account_id,
      "from","to",amount,amount_unit,currency,usd_rate,description,metadata,created_at,updated_at)
    values (${randomUUID()}::uuid,${input.occurredAt ? new Date(input.occurredAt) : new Date()},${input.category},${input.entryType},
      'stripe',${input.sourceRef},'stripe',${input.fxRateId ?? null}::uuid,${input.taskId ?? null}::uuid,
      ${input.fromAccountId ?? null}::uuid,${input.toAccountId ?? null}::uuid,${input.from},${input.to},${amount(input.amount)}::bigint,
      'micros',${input.currency.toUpperCase()},${input.usdRate},${input.description},${sql.json(JSON.parse(JSON.stringify(input.metadata ?? {})))},now(),now())
    on conflict (source,source_ref) where source_ref is not null do nothing returning id`;
  if (inserted) return inserted.id;
  const winner = await existingPaymentAccounting(sql, input);
  if (!winner) throw new Error("Concurrent payment accounting is not visible; retry the transaction");
  return winner;
}
