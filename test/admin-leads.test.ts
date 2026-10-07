import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import postgres from "postgres";
import {
  adminTextSearchPattern,
  emptyAdminDashboardFilters,
  normalizeAdminDashboardFilters
} from "../lib/admin-dashboard-filters.ts";
import { normalizeAdminLeadSearch } from "../lib/admin-lead-search.ts";
import { normalizeAdminQueryParams } from "../lib/admin-query-helpers.ts";
import {
  getAdminExternalQueryData,
  getAdminLeadsData
} from "../lib/admin-query-data.ts";
import { getSql } from "../lib/db.ts";

describe("lead search parameters", () => {
  it("normalizes partial text, dates, and unsafe pagination values", () => {
    const params = normalizeAdminQueryParams(
      new URLSearchParams({
        q: "  some CAMPaign  ",
        dateFrom: "2026-10-06",
        dateTo: "2026-10-07",
        limit: "10000",
        cursor: "1000.9"
      })
    );
    assert.equal(params.cursor, 1000);
    assert.equal(params.limit, 100);
    assert.deepEqual(params.leadSearch, {
      q: "some CAMPaign",
      dateFrom: "2026-10-06",
      dateTo: "2026-10-07",
      timeZone: "Asia/Bangkok"
    });
    for (const cursor of ["-2", "NaN", "Infinity", "999999999999999999999"]) {
      assert.equal(
        normalizeAdminQueryParams(new URLSearchParams({ cursor })).cursor,
        0
      );
    }
  });

  it("rejects invalid calendar dates and zones while preserving valid leap days", () => {
    assert.deepEqual(
      normalizeAdminLeadSearch({
        dateFrom: "2026-02-30",
        dateTo: "not-a-date",
        timeZone: "invalid/zone"
      }),
      {
        q: "",
        dateFrom: "",
        dateTo: "",
        timeZone: "Asia/Bangkok"
      }
    );
    assert.equal(
      normalizeAdminLeadSearch({ dateFrom: "2024-02-29" }).dateFrom,
      "2024-02-29"
    );
    assert.equal(
      normalizeAdminLeadSearch({ dateFrom: "2026-02-29" }).dateFrom,
      ""
    );
  });

  it("treats wildcard characters as literal search text", () => {
    assert.equal(
      adminTextSearchPattern("100%_Organic\\Bangkok"),
      "%100\\%\\_Organic\\\\Bangkok%"
    );
  });
});

// Only a newly created database is mutated; existing application tables are never used.
const testConnection = process.env.ADMIN_LEADS_TEST_DB;
describe("lead queries against PostgreSQL", { skip: !testConnection }, () => {
  const databaseName = `admin_leads_test_${randomUUID().replaceAll("-", "")}`;
  const previousConnection = process.env.DB_URL;
  let admin: postgres.Sql;
  let database: postgres.Sql;
  let created = false;
  const leadId = (index: number) =>
    `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const eventId = (index: number) =>
    `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

  before(async () => {
    admin = postgres(testConnection!, { max: 1 });
    await admin`create database ${admin(databaseName)}`;
    created = true;
    const url = new URL(testConnection!);
    url.pathname = `/${databaseName}`;
    process.env.DB_URL = url.toString();
    database = getSql()!;
    await database.unsafe(`
      create table public.bpm (
        id uuid primary key, ray uuid not null, plan_id uuid, email_hash text,
        locale text, selected_plan text, utm_source text, traffic_source text,
        source_channel text, utm_campaign text, campaign_name text, utm_medium text,
        campaign_id text, affiliate_id text, affiliate_ref text, affiliate_sub_id text,
        promo_code text, device_type text, event_name text, event_type text,
        event_status text, occurred_at timestamptz, severity text, actor_type text,
        path text default '/en/nutrition/assessment', route text, error_message text,
        user_agent text, emitted_by text, properties jsonb default '{}'::jsonb
      );
      create table public.assessments (plan_id uuid primary key, contact_email text, updated_at timestamptz, answers jsonb default '{}'::jsonb);
      create table public.assessment_resume_drafts (plan_id uuid, email_hash text, contact_email text, updated_at timestamptz);
      create table public.plan_communication_identities (plan_id uuid, identity_id uuid);
      create table public.communication_channels (identity_id uuid, channel_type text, status text, address text, updated_at timestamptz);
      create table public.tasks (plan_id uuid, task_type text, status text);
      create table public.communication_messages (plan_id uuid, status text);
    `);
    await database`
      insert into public.bpm (id, ray, plan_id, email_hash, locale, utm_source,
        utm_campaign, event_name, event_type, event_status, occurred_at, severity, actor_type)
      select
        ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
        ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
        ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
        'hash-' || n, 'en',
        case when n = 1205 then 'October-Newsletter-Retarget'
             when n = 1204 then ${"100%_Organic\\Bangkok"} else 'Website' end,
        case when n = 1205 then 'Spring-Campaign-FrAgMeNt-2026' else 'Default' end,
        'assessment_started', 'funnel', 'observed',
        case when n = 1205 then '2026-10-05 09:00:00+07'::timestamptz
             else '2026-10-07 12:00:00+07'::timestamptz end,
        'low', 'visitor'
      from generate_series(1, 1205) n
    `;
    await database`insert into public.assessments (plan_id, contact_email, updated_at)
      values (${leadId(1205)}, 'search.user@example.test', '2026-10-05 09:00:00+07')`;
    for (const [index, properties, agent] of [
      [5001, { journeyChannel: "mcp" }, null],
      [5002, { journeyChannel: "retail" }, null],
      [5003, {}, "HeadlessChrome"],
      [5004, { mocked: true }, null]
    ] as const) {
      await database`insert into public.bpm (id, ray, event_name, occurred_at, properties, user_agent)
        values (${eventId(index)}, ${leadId(index)}, 'assessment_started', '2026-10-07 12:00:00+07', ${database.json(properties)}, ${agent})`;
    }
    await database`insert into public.bpm (id, ray, event_name, occurred_at)
      values (${eventId(5005)}, ${leadId(1204)}, 'assessment_resume_requested', '2026-10-07 12:00:00+07')`;
    // Later events have no attribution; search must still retain the complete lead.
    await database`
      insert into public.bpm (id, ray, plan_id, event_name, event_type, event_status, occurred_at, severity, actor_type)
      select
        ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
        ${leadId(1205)}::uuid, ${leadId(1205)}::uuid,
        case when n = 95 then 'free_email_sent' else 'healthscore_viewed' end,
        'funnel', 'observed', '2026-10-05 09:00:00+07'::timestamptz + n * interval '1 minute', 'low', 'visitor'
      from generate_series(1, 95) n
    `;
    for (const [index, plan] of [
      [1, "precision"],
      [2, "pro"]
    ] as const) {
      await database`
        insert into public.bpm (id, ray, plan_id, selected_plan, event_name, event_type, event_status, occurred_at)
        values (${eventId(index + 3000)}, ${leadId(index)}, ${leadId(index)}, ${plan}, 'plan_paid', 'payment', 'paid', '2026-10-07 12:00:00+07')
      `;
    }
    const boundaryDates = [
      "2026-10-05 23:59:59.999999+07",
      "2026-10-06 00:00:00+07",
      "2026-10-06 12:00:00+07",
      "2026-10-06 23:59:59.999999+07",
      "2026-10-07 00:00:00+07"
    ];
    for (const [index, occurredAt] of boundaryDates.entries()) {
      await database`
        insert into public.bpm (id, ray, plan_id, event_name, event_type, event_status, occurred_at, utm_source)
        values (${eventId(2001 + index)}, ${leadId(2001 + index)}, ${leadId(2001 + index)}, 'assessment_started', 'funnel', 'observed', ${occurredAt}::timestamptz, 'CalendarBoundary')
      `;
    }
    await database`insert into public.tasks values (${leadId(1205)}, 'classify_supplement', 'pending'), (${leadId(1205)}, 'review_supplement_for_plan', 'pending'), (${leadId(1205)}, 'classify_supplement', 'completed')`;
    await database`insert into public.communication_messages values (${leadId(1205)}, 'failed'), (${leadId(1205)}, 'sent')`;
  });

  after(async () => {
    if (database) await database.end();
    if (admin) {
      if (created)
        await admin`drop database ${admin(databaseName)} with (force)`;
      await admin.end();
    }
    if (previousConnection === undefined) delete process.env.DB_URL;
    else process.env.DB_URL = previousConnection;
  });

  it("returns every lead beyond 1,000 with stable ordering, full totals and no duplicate pages", async () => {
    const subjects: string[] = [];
    let cursor: string | null = null;
    do {
      const data = await getAdminLeadsData("all", emptyAdminDashboardFilters, {
        limit: "100",
        cursor: cursor ?? "0"
      });
      assert.deepEqual(data.summary, {
        total: 1210,
        pendingReviews: 2,
        communicationIssues: 1,
        free: 1,
        precision: 1,
        pro: 1
      });
      assert.ok(data.rows.length <= 100);
      subjects.push(...data.rows.map((row) => row.subject));
      cursor = data.pagination.nextCursor;
    } while (cursor !== null);
    assert.equal(subjects.length, 1210);
    assert.equal(new Set(subjects).size, 1210);
    assert.ok(subjects.includes(leadId(1205)));
    assert.deepEqual(subjects.slice(0, 3), [leadId(1), leadId(2), leadId(3)]);
  });

  it("finds partial and case-insensitive matches beyond the old cap without losing history or stage", async () => {
    const data = await getAdminLeadsData("all", emptyAdminDashboardFilters, {
      q: "CAMPAIGN-frag"
    });
    assert.equal(data.summary.total, 1);
    assert.equal(data.rows[0]?.subject, leadId(1205));
    assert.equal(data.rows[0]?.currentStage, "free_sent");
    assert.equal(data.rows[0]?.events.length, 96);
    assert.equal(data.rows[0]?.events.at(-1)?.eventName, "free_email_sent");
    for (const filters of [
      { source: "newsLETTER" },
      { campaign: "campaign-frag" },
      { planId: "000000001205" },
      { ray: "000000001205" },
      { emailHash: "ASH-1205" }
    ]) {
      const filtered = await getAdminLeadsData(
        "all",
        normalizeAdminDashboardFilters(filters)
      );
      assert.equal(filtered.summary.total, 1);
      assert.equal(filtered.rows[0]?.currentStage, "free_sent");
      assert.equal(filtered.rows[0]?.events.length, 96);
    }
  });

  it("preserves the current resume-requested lead stage", async () => {
    const data = await getAdminLeadsData("all", emptyAdminDashboardFilters, { status: "resume_requested" });
    assert.equal(data.summary.total, 1);
    assert.equal(data.rows[0]?.subject, leadId(1204));
  });

  it("searches partial contact emails without losing lead history", async () => {
    const data = await getAdminLeadsData("all", emptyAdminDashboardFilters, {
      q: "USER@EXAM"
    });
    assert.equal(data.summary.total, 1);
    assert.equal(data.rows[0]?.contactEmail, "search.user@example.test");
    assert.equal(data.rows[0]?.events.length, 96);
  });

  it("filters by stage before paging and counts even when a cursor is past the end", async () => {
    const data = await getAdminLeadsData("all", emptyAdminDashboardFilters, {
      status: "free_sent",
      limit: "1"
    });
    assert.equal(data.summary.total, 1);
    assert.equal(data.rows[0]?.subject, leadId(1205));
    assert.equal(data.pagination.nextCursor, null);
    const beyondEnd = await getAdminLeadsData(
      "all",
      emptyAdminDashboardFilters,
      { cursor: "9999" }
    );
    assert.equal(beyondEnd.summary.total, 1210);
    assert.deepEqual(beyondEnd.rows, []);
    assert.equal(beyondEnd.pagination.nextCursor, null);
  });

  it("includes all of 6 October in Bangkok time and replaces the rolling timeframe", async () => {
    const filters = normalizeAdminDashboardFilters({ source: "boundary" });
    const data = await getAdminLeadsData("hour", filters, {
      dateFrom: "2026-10-06",
      dateTo: "2026-10-06"
    });
    assert.deepEqual(
      data.rows.map((row) => row.subject),
      [leadId(2004), leadId(2003), leadId(2002)]
    );
    const nextDay = await getAdminLeadsData("all", filters, {
      dateFrom: "2026-10-07",
      dateTo: "2026-10-07"
    });
    assert.deepEqual(
      nextDay.rows.map((row) => row.subject),
      [leadId(2005)]
    );
    const until = await getAdminLeadsData("hour", filters, {
      dateTo: "2026-10-06"
    });
    assert.equal(until.summary.total, 4);
    const since = await getAdminLeadsData("hour", filters, {
      dateFrom: "2026-10-06"
    });
    assert.equal(since.summary.total, 4);
  });

  it("escapes literal wildcard input and returns an accurate empty result", async () => {
    const readableEvent = await getAdminLeadsData(
      "all",
      emptyAdminDashboardFilters,
      { q: "ASSESSMENT START" }
    );
    assert.equal(readableEvent.summary.total, 1210);
    for (const q of ["%_", "Organic\\Bang"]) {
      const data = await getAdminLeadsData("all", emptyAdminDashboardFilters, {
        q
      });
      assert.equal(data.summary.total, 1);
      assert.equal(data.rows[0]?.subject, leadId(1204));
    }
    const empty = await getAdminLeadsData("all", emptyAdminDashboardFilters, {
      q: "this lead does not exist"
    });
    assert.equal(empty.summary.total, 0);
    assert.deepEqual(empty.rows, []);
    assert.equal(empty.pagination.nextCursor, null);
  });

  it("exposes the same complete pagination and applied search in the external API", async () => {
    const result = await getAdminExternalQueryData(
      "leads",
      new URLSearchParams({
        range: "all",
        cursor: "1000",
        limit: "100",
        q: "assessment"
      })
    );
    assert.equal(result.pagination.nextCursor, "1100");
    assert.equal(
      (result.data as { summary: { total: number } }).summary.total,
      1210
    );
    assert.ok("q" in result.filters);
    assert.equal(result.filters.q, "assessment");
  });
});
