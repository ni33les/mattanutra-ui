import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { closeSqlPool, getSql } from "../lib/db.ts";
import { getAdminReviewQueueData } from "../lib/admin-review-queue.ts";

const databaseUrl = process.env.TEST_DB_URL;
const schemaCache = globalThis as typeof globalThis & {
  mattanutraSafetyReviewItemColumns?: Promise<boolean>;
};

describe("admin review queue on PostgreSQL", { skip: !databaseUrl }, () => {
  const ids = Array.from({ length: 4 }, () => randomUUID());

  before(async () => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1", "Use an isolated local database");
    assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/);
    process.env.DB_URL = databaseUrl;
    const sql = getSql()!;
    const [organisation] = await sql`select id from public.organisations limit 1`;
    assert.ok(organisation, "The isolated fixture needs an organisation");
    const fixtures = [
      { id: ids[0], type: "review_supplement_for_plan", actor: "human", status: "queued", value: 990 },
      { id: ids[1], type: "customer_chat_escalation", actor: "human", status: "queued", value: 980 },
      { id: ids[2], type: "customer_chat_escalation", actor: "human", status: "completed", value: 970 },
      { id: ids[3], type: "dashboard_test_system_task", actor: "system", status: "queued", value: 960 }
    ];
    for (const fixture of fixtures) {
      await sql`
        insert into public.tasks
          (id, organisation_id, task_group_id, task_type, title, actor_type, status, business_value, due_at)
        values
          (${fixture.id}, ${organisation.id}, ${randomUUID()}, ${fixture.type},
           'Admin dashboard regression fixture', ${fixture.actor}, ${fixture.status},
           ${fixture.value}, now() + interval '1 day')
      `;
    }
  });

  after(async () => {
    delete schemaCache.mattanutraSafetyReviewItemColumns;
    try {
      await getSql()!`delete from public.tasks where id = any(${ids}::uuid[])`;
    } finally {
      await closeSqlPool();
    }
  });

  for (const itemColumns of [true, false]) {
    it(`returns both review branches with item columns ${itemColumns ? "available" : "unavailable"}`, async () => {
      // Exercise both supported schema projections against the actual driver.
      schemaCache.mattanutraSafetyReviewItemColumns = Promise.resolve(itemColumns);
      const data = await getAdminReviewQueueData();
      assert.equal(data.databaseAvailable, true, "A composed UNION must remain executable SQL");
      const fixtures = data.rows.filter(row => ids.includes(row.id));
      assert.deepEqual(fixtures.map(row => row.id), ids.slice(0, 2));
      assert.equal(fixtures[0].itemType, "supplement");
      assert.equal(fixtures[1].itemType, "task");
      assert.equal(fixtures[1].supplementName, "Admin dashboard regression fixture");
    });
  }
});
