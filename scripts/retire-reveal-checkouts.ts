import { closeSqlPool, getSql } from "@/lib/db";
import { markPaymentCancelled } from "@/lib/stripe-payments";
import { webProductJourneyEnabled } from "@/lib/web-product-journey";

// Dry run by default. Run --apply only after enabling the new journey.
const apply = process.argv.includes("--apply");
const sql = getSql();
if (!sql) throw new Error("Database connection is not configured");
if (apply && !webProductJourneyEnabled()) throw new Error("Enable the free product journey before retiring reveal checkouts");
try {
  const rows = await sql`select id, status from public.payments where paid_at is null
    and status in ('created','checkout_session_created','checkout_opened','processing') order by created_at`;
  const results: Array<{ paymentId: string; status: string }> = [];
  for (const row of rows) {
    if (!apply) { results.push({ paymentId: row.id, status: row.status }); continue; }
    try {
      // Retrieves provider state, preserves paid/processing races, expires only open sessions.
      const payment = await markPaymentCancelled({ paymentId: row.id, retirement: true });
      results.push({ paymentId: row.id, status: payment?.status ?? "missing" });
    } catch (error) {
      results.push({ paymentId: row.id, status: error instanceof Error ? error.message : "retry_required" });
      process.exitCode = 1;
    }
  }
  console.log(JSON.stringify({ apply, candidates: results }, null, 2));
} finally { await closeSqlPool(); }
