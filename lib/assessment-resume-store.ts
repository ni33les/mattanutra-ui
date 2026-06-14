import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n";
import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { normalizeAssessmentContactEmail } from "@/lib/assessment-contact";

const RESUME_TOKEN_BYTES = 32;
const RESUME_TTL_DAYS = 14;
const REQUIRED_RESUME_DRAFT_COLUMNS = [
  "id",
  "plan_id",
  "locale",
  "answers",
  "section_index",
  "contact_email",
  "email_hash",
  "token_hash",
  "payment_id",
  "expires_at",
  "last_opened_at",
  "finalized_at",
  "created_at",
  "updated_at"
] as const;

let resumeSchemaReady: Promise<void> | null = null;

function tokenHash(token: string) {
  const salt = process.env.BPM_HASH_SALT || "mattanutra-bpm-default-salt";

  return createHash("sha256").update(`${salt}:assessment-resume:${token}`).digest("hex");
}

function emailHash(email: string) {
  const salt = process.env.BPM_HASH_SALT || "mattanutra-bpm-default-salt";

  return createHash("sha256").update(`${salt}:${email}`).digest("hex");
}

function normalizedSectionIndex(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.max(0, Math.min(20, Math.round(parsed))) : 0;
}

function normalizedAnswers(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isAssessmentResumeSchemaError(error: unknown) {
  return error instanceof Error &&
    error.message.startsWith("Assessment resume schema is incomplete.");
}

async function ensureAssessmentResumeDraftSchema() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database connection is not configured");
  }

  if (!resumeSchemaReady) {
    resumeSchemaReady = (async () => {
      const tableRows = await sql<Array<{ table_name: string }>>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'assessment_resume_drafts'
        limit 1
      `;

      if (!tableRows[0]) {
        throw new Error(
          "Assessment resume schema is incomplete. Apply scripts/apply-assessment-schema.ts with the database owner role. Missing: public.assessment_resume_drafts"
        );
      }

      const columnRows = await sql<Array<{ column_name: string }>>`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'assessment_resume_drafts'
      `;
      const available = new Set(columnRows.map((row) => row.column_name));
      const missing = REQUIRED_RESUME_DRAFT_COLUMNS
        .filter((column) => !available.has(column))
        .map((column) => `public.assessment_resume_drafts.${column}`);

      if (missing.length > 0) {
        throw new Error(
          `Assessment resume schema is incomplete. Apply scripts/apply-assessment-schema.ts with the database owner role. Missing: ${missing.join(", ")}`
        );
      }
    })().catch((error) => {
      resumeSchemaReady = null;
      throw error;
    });
  }

  await resumeSchemaReady;
}

export type AssessmentResumeDraft = Readonly<{
  answers: Record<string, unknown>;
  contactEmail: string;
  draftId: string;
  locale: Locale;
  planId: string;
  sectionIndex: number;
}>;

export async function createAssessmentResumeDraft(input: Readonly<{
  answers?: unknown;
  contactEmail: unknown;
  locale?: unknown;
  paymentId?: unknown;
  planId?: unknown;
  sectionIndex?: unknown;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database connection is not configured");
  }

  const contactEmail = normalizeAssessmentContactEmail(input.contactEmail);

  if (!contactEmail) {
    throw new Error("Assessment resume email is not valid");
  }

  const token = randomBytes(RESUME_TOKEN_BYTES).toString("base64url");
  const planId = isUuid(String(input.planId ?? ""))
    ? String(input.planId)
    : randomUUID();
  const draftId = randomUUID();
  const locale = isLocale(input.locale) ? input.locale : "en";
  const sectionIndex = normalizedSectionIndex(input.sectionIndex);
  const answers = normalizedAnswers(input.answers);
  const paymentId = isUuid(String(input.paymentId ?? ""))
    ? String(input.paymentId)
    : null;

  await ensureAssessmentResumeDraftSchema();

  await sql`
    insert into public.assessment_resume_drafts (
      id,
      plan_id,
      locale,
      answers,
      section_index,
      contact_email,
      email_hash,
      token_hash,
      payment_id,
      expires_at,
      created_at,
      updated_at
    )
    values (
      ${draftId}::uuid,
      ${planId}::uuid,
      ${locale},
      ${sql.json(toJsonValue(answers))},
      ${sectionIndex},
      ${contactEmail},
      ${emailHash(contactEmail)},
      ${tokenHash(token)},
      ${paymentId ? sql`${paymentId}::uuid` : null},
      now() + (${RESUME_TTL_DAYS}::text || ' days')::interval,
      now(),
      now()
    )
    on conflict (token_hash) do nothing
  `;

  return {
    contactEmail,
    draftId,
    planId,
    sectionIndex,
    token
  };
}

export async function getAssessmentResumeDraft(token: string): Promise<AssessmentResumeDraft | null> {
  const sql = getSql();

  if (!sql || !token) {
    return null;
  }

  await ensureAssessmentResumeDraftSchema();
  const rows = await sql<Array<{
    answers: unknown;
    contact_email: string;
    id: string;
    locale: string;
    plan_id: string;
    section_index: number | string;
  }>>`
    update public.assessment_resume_drafts
    set
      last_opened_at = now(),
      updated_at = now()
    where token_hash = ${tokenHash(token)}
      and expires_at > now()
      and finalized_at is null
    returning
      id::text,
      plan_id::text,
      locale,
      answers,
      section_index,
      contact_email
  `;
  const row = rows[0];

  if (!row || !isLocale(row.locale)) {
    return null;
  }

  return {
    answers:
      row.answers && typeof row.answers === "object" && !Array.isArray(row.answers)
        ? row.answers as Record<string, unknown>
        : {},
    contactEmail: row.contact_email,
    draftId: row.id,
    locale: row.locale,
    planId: row.plan_id,
    sectionIndex: normalizedSectionIndex(row.section_index)
  };
}

export async function finalizeAssessmentResumeDraft(input: Readonly<{
  planId: string;
  token?: unknown;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(input.planId) || typeof input.token !== "string" || !input.token) {
    return null;
  }

  await ensureAssessmentResumeDraftSchema();
  const rows = await sql<Array<{ contact_email: string }>>`
    update public.assessment_resume_drafts
    set
      finalized_at = now(),
      updated_at = now()
    where token_hash = ${tokenHash(input.token)}
      and plan_id = ${input.planId}::uuid
      and finalized_at is null
    returning contact_email
  `;

  return rows[0]?.contact_email ?? null;
}

export async function finalizeAssessmentResumeDraftForContact(input: Readonly<{
  contactEmail?: unknown;
  planId: string;
}>) {
  const sql = getSql();
  const contactEmail = normalizeAssessmentContactEmail(input.contactEmail);

  if (!sql || !isUuid(input.planId) || !contactEmail) {
    return null;
  }

  await ensureAssessmentResumeDraftSchema();
  const rows = await sql<Array<{ contact_email: string }>>`
    update public.assessment_resume_drafts
    set
      finalized_at = now(),
      updated_at = now()
    where plan_id = ${input.planId}::uuid
      and contact_email = ${contactEmail}
      and expires_at > now()
      and finalized_at is null
    returning contact_email
  `;

  return rows[0]?.contact_email ?? null;
}
