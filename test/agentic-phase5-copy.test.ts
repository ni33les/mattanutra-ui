import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { AGENTIC_TOOL_DESCRIPTIONS } from "../lib/agentic/contract/index.ts";
import {
  beginIdempotency,
  commitIdempotency,
  isIdempotencyRace
} from "../lib/agentic/idempotency.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";

describe("Phase 5 discovery copy", () => {
  it("generates plan-tool recognised names from the same fixture list info uses", () => {
    const description = AGENTIC_TOOL_DESCRIPTIONS.plan;
    assert.match(description, /Vitamin K2/);
    assert.doesNotMatch(description, /K2 unrecognized/i);
    assert.doesNotMatch(description, /unrecognised.{0,40}Vitamin K2/i);
    assert.doesNotMatch(description, /welness/i);
    assert.match(
      description,
      /processing plan is polled with the same idempotencyKey and planHandle/i
    );
    for (const item of FIXTURE_SUPPLEMENTS) {
      assert.match(
        description,
        new RegExp(item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      );
    }
  });

  it("replays a processing plan when polled with the same key and planHandle", async () => {
    const store = createMemoryStore();
    const created = {
      idempotencyKey: "r4-poll-contract-01",
      request: { locale: "en", targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }] }
    };
    const processing = {
      ok: true,
      planHandle: "cap_processing_poll_handle_32chars_min",
      revision: 1,
      status: "processing"
    };
    await commitIdempotency({
      key: created.idempotencyKey,
      now: "2026-08-25T00:00:00.000Z",
      operation: "plan",
      ownerScope: "dev:test:anon",
      payload: created,
      resourceIds: { planId: "plan-1" },
      response: processing,
      store
    });
    const poll = await beginIdempotency({
      key: created.idempotencyKey,
      now: "2026-08-25T00:00:02.000Z",
      operation: "plan",
      ownerScope: "dev:test:anon",
      payload: {
        expectedRevision: 1,
        idempotencyKey: created.idempotencyKey,
        planHandle: processing.planHandle
      },
      store
    });
    assert.equal(poll.kind, "replay");
    if (poll.kind === "replay") {
      assert.equal((poll.response as { status: string }).status, "processing");
      assert.equal(
        (poll.response as { planHandle: string }).planHandle,
        processing.planHandle
      );
    }
  });

  it("replays a completed match when polled with the same key and planHandle", async () => {
    const store = createMemoryStore();
    const created = {
      idempotencyKey: "r4-poll-contract-02",
      request: { locale: "en", targets: [{ amount: 500, name: "Vitamin C", unit: "mg" }] }
    };
    const completed = {
      ok: true,
      planHandle: "cap_completed_poll_handle_32chars_minx",
      revision: 1,
      status: "needs_input"
    };
    await commitIdempotency({
      key: created.idempotencyKey,
      now: "2026-08-25T00:00:00.000Z",
      operation: "plan",
      ownerScope: "dev:test:anon",
      payload: created,
      resourceIds: { planId: "plan-2" },
      response: completed,
      store
    });
    const poll = await beginIdempotency({
      key: created.idempotencyKey,
      now: "2026-08-25T00:00:04.000Z",
      operation: "plan",
      ownerScope: "dev:test:anon",
      payload: {
        expectedRevision: 1,
        idempotencyKey: created.idempotencyKey,
        planHandle: completed.planHandle
      },
      store
    });
    assert.equal(poll.kind, "replay");
    if (poll.kind === "replay") {
      assert.equal((poll.response as { status: string }).status, "needs_input");
    }
  });

  it("treats a duplicate idempotency insert of the same hash as a race, not a 500", async () => {
    const store = createMemoryStore();
    const payload = {
      idempotencyKey: "r17-idem-race-same-hash-01",
      request: { locale: "en", targets: [{ amount: 500, name: "Vitamin C", unit: "mg" }] }
    };
    const processing = {
      ok: true,
      planHandle: "cap_r17_idem_race_handle_32chars_min",
      revision: 1,
      status: "processing"
    };
    await commitIdempotency({
      key: payload.idempotencyKey,
      now: "2026-08-26T00:00:00.000Z",
      operation: "plan",
      ownerScope: "dev:test:anon",
      payload,
      resourceIds: { planId: "plan-race-1" },
      response: processing,
      store
    });
    await commitIdempotency({
      key: payload.idempotencyKey,
      now: "2026-08-26T00:00:00.100Z",
      operation: "plan",
      ownerScope: "dev:test:anon",
      payload,
      resourceIds: { planId: "plan-race-1" },
      response: processing,
      store
    });
    const replay = await beginIdempotency({
      key: payload.idempotencyKey,
      now: "2026-08-26T00:00:00.200Z",
      operation: "plan",
      ownerScope: "dev:test:anon",
      payload,
      store
    });
    assert.equal(replay.kind, "replay");
    assert.equal(isIdempotencyRace(new Error("idempotency_conflict")), true);
    assert.equal(
      isIdempotencyRace({
        code: "23505",
        constraint: "agentic_idempotency_records_pkey"
      }),
      true
    );
    assert.equal(isIdempotencyRace(new Error("other")), false);
  });
});
