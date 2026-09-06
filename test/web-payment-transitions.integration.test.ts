import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { claimPaidReservation, markPaymentCancelled, updatePaymentState } from "../lib/stripe-payments.ts";

const databaseUrl = process.env.TEST_DB_URL;

describe("web payment integrity on PostgreSQL", { skip: !databaseUrl }, () => {
  const ids: string[] = [];
  const plans: string[] = [];
  before(async () => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1");
    assert.match(url.pathname, /^\/mattanutra_lock_review/);
    process.env.DB_URL = databaseUrl;
    await getSql()!`insert into public.site_locales (code, label, native_label, html_lang) values ('en', 'English', 'English', 'en') on conflict (code) do nothing`;
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async sql => {
      await sql`set local session_replication_role = replica`;
      for (const id of ids) {
        await sql`delete from public.finance_transactions where source_ref = ${`stripe:payment:${id}:nominal-revenue`}`;
        await sql`delete from public.payment_versions where payment_id = ${id}::uuid`;
        await sql`delete from public.payments where id = ${id}::uuid`;
      }
      for (const id of plans) await sql`delete from public.assessments where plan_id = ${id}::uuid`;
    });
    await closeSqlPool();
  });
  async function seed(status = "paid") {
    const id = randomUUID();
    ids.push(id);
    await getSql()!`insert into public.payments (id, selected_plan, status, amount, paid_at)
      values (${id}::uuid, 'precision', ${status}, 1000000, ${status === "paid" ? new Date() : null})`;
    return id;
  }
  async function seedPlan() {
    const id = randomUUID();
    plans.push(id);
    await getSql()!`insert into public.assessments (plan_id, locale, status, answers, answer_summary)
      values (${id}::uuid, 'en', 'captured', '{}'::jsonb, '{}'::jsonb)`;
    return id;
  }

  it("does not cancel paid or bound payments or remove their revenue", async () => {
    for (const status of ["paid", "bound"]) {
      const id = await seed(status);
      const sql = getSql()!;
      await sql`insert into public.finance_transactions
        (id, category, amount, amount_unit, currency, description, "from", "to", source, source_ref, usd_rate)
        values (${randomUUID()}::uuid, 'revenue', 1000000, 'micros', 'THB', 'funnel test', 'fixture', 'fixture', 'stripe', ${`stripe:payment:${id}:nominal-revenue`}, 1)`;
      assert.equal((await markPaymentCancelled({ paymentId: id }))?.status, status);
      assert.equal((await sql`select count(*)::int as n from public.finance_transactions where source_ref = ${`stripe:payment:${id}:nominal-revenue`}`)[0].n, 1);
      assert.equal((await sql`select count(*)::int as n from public.payment_versions where payment_id = ${id}::uuid`)[0].n, 0);
    }
  });

  it("serializes cancellation against confirmation without downgrading paid", async () => {
    const sql = getSql()!;
    const id = await seed("processing");
    await Promise.all([
      updatePaymentState(sql, { paymentId: id, status: "paid", action: "test_paid", reason: "test" }),
      updatePaymentState(sql, { paymentId: id, status: "cancelled", action: "test_cancelled", reason: "test" })
    ]);
    assert.equal((await sql`select status from public.payments where id = ${id}::uuid`)[0].status, "paid");
    for (const status of ["failed", "expired", "processing"] as const) {
      assert.equal(await updatePaymentState(sql, { paymentId: id, status, action: "late_event", reason: "test" }), null);
    }
  });

  it("allows exactly one reservation claim and makes the same claim replayable", async () => {
    const sql = getSql()!;
    const id = await seed();
    const a = await seedPlan();
    const b = await seedPlan();
    const results = await Promise.all([claimPaidReservation(sql, id, a), claimPaidReservation(sql, id, b)]);
    assert.equal(results.filter(Boolean).length, 1);
    const winner = results.find(Boolean)!;
    const replay = await claimPaidReservation(sql, id, winner.payment.plan_id!);
    assert.equal(replay?.replayed, true);
    assert.equal(replay?.payment.plan_id, winner.payment.plan_id);
    assert.equal((await sql`select count(*)::int as n from public.payment_versions where payment_id = ${id}::uuid`)[0].n, 1);
  });

  it("rolls binding and its audit version back with the caller transaction", async () => {
    const sql = getSql()!;
    const id = await seed();
    const planId = await seedPlan();
    await assert.rejects(withDatabaseTransaction(sql, async tx => {
      await claimPaidReservation(tx, id, planId);
      throw new Error("injected_failure");
    }), /injected_failure/);
    const [row] = await sql`select status, plan_id from public.payments where id = ${id}::uuid`;
    assert.deepEqual(row, { status: "paid", plan_id: null });
    assert.equal((await sql`select count(*)::int as n from public.payment_versions where payment_id = ${id}::uuid`)[0].n, 0);
  });
});
