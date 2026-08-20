import { createHash, randomBytes } from "node:crypto";

export type QaRunStatus = "accepted" | "completed" | "failed";

export type QaAssertion = Readonly<{
  actual: unknown;
  expected: unknown;
  id: string;
  result: "pass" | "fail";
}>;

export type QaRunRecord = Readonly<{
  acceptedAt: string;
  assertions: readonly QaAssertion[];
  completedAt: string | null;
  evidenceChecksum: string | null;
  evidenceHandle: string | null;
  evidencePayload: unknown;
  handle: string;
  id: string;
  idempotencyKey: string;
  ownerScope: string;
  requestHash: string;
  resourceFingerprint: string;
  resourceId: string | null;
  resourceType: string;
  scenario: string;
  startedAt: string | null;
  status: QaRunStatus;
}>;

type MutableRun = {
  -readonly [K in keyof QaRunRecord]: QaRunRecord[K];
};

const globalQa = globalThis as typeof globalThis & {
  mattanutraQaRuns?: Map<string, MutableRun>;
};

function runs() {
  globalQa.mattanutraQaRuns ??= new Map();
  return globalQa.mattanutraQaRuns;
}

export function issueQaHandle(kind: "qarun" | "qaev") {
  return `${kind}_${randomBytes(24).toString("base64url")}`;
}

export function fingerprintHandle(handle: string) {
  return createHash("sha256").update(handle).digest("hex");
}

export function requestHash(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function checksumPayload(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function getRunByIdempotency(ownerScope: string, key: string) {
  for (const run of runs().values()) {
    if (run.ownerScope === ownerScope && run.idempotencyKey === key) {
      return run as QaRunRecord;
    }
  }

  return null;
}

export function getRunByHandle(handle: string) {
  return runs().get(handle) ?? null;
}

export function getRunByEvidenceHandle(handle: string) {
  for (const run of runs().values()) {
    if (run.evidenceHandle === handle) {
      return run as QaRunRecord;
    }
  }

  return null;
}

export function saveRun(record: QaRunRecord) {
  runs().set(record.handle, { ...record });
  void persistRun(record);
}

async function persistRun(record: QaRunRecord) {
  if (!process.env.DB_URL) {
    return;
  }

  try {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();

    if (!sql) {
      return;
    }

    await sql`
      insert into public.agentic_qa_scenario_runs (
        id, handle_hash, idempotency_key, owner_scope, request_hash, scenario,
        resource_type, resource_id, resource_fingerprint, status, assertions,
        evidence_handle_hash, evidence_checksum, evidence_payload,
        accepted_at, started_at, completed_at
      ) values (
        ${record.id}::uuid,
        ${fingerprintHandle(record.handle)},
        ${record.idempotencyKey},
        ${record.ownerScope},
        ${record.requestHash},
        ${record.scenario},
        ${record.resourceType},
        ${record.resourceId},
        ${record.resourceFingerprint},
        ${record.status},
        ${sql.json(record.assertions as never)},
        ${record.evidenceHandle ? fingerprintHandle(record.evidenceHandle) : null},
        ${record.evidenceChecksum},
        ${record.evidencePayload ? sql.json(record.evidencePayload as never) : null},
        ${record.acceptedAt},
        ${record.startedAt},
        ${record.completedAt}
      )
      on conflict (id) do update set
        status = excluded.status,
        assertions = excluded.assertions,
        evidence_handle_hash = excluded.evidence_handle_hash,
        evidence_checksum = excluded.evidence_checksum,
        evidence_payload = excluded.evidence_payload,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at
    `;
  } catch {
    // Tables may not exist until schema apply; memory remains source of truth in-process.
  }
}
