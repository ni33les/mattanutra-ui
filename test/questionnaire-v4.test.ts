import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const assessmentFlow = readFileSync(new URL("../components/assessment-flow.tsx", import.meta.url), "utf8");
const assessmentState = readFileSync(new URL("../components/assessment-flow-state.ts", import.meta.url), "utf8");
const assessmentStore = readFileSync(new URL("../lib/assessment-store.ts", import.meta.url), "utf8");
const assessmentResumeStore = readFileSync(new URL("../lib/assessment-resume-store.ts", import.meta.url), "utf8");
const assessmentResumeRoute = readFileSync(new URL("../app/api/assessment/resume-link/route.ts", import.meta.url), "utf8");
const assessmentRoute = readFileSync(new URL("../app/api/assessment/route.ts", import.meta.url), "utf8");
const assessmentPlanRoute = readFileSync(new URL("../app/api/assessment/[planId]/route.ts", import.meta.url), "utf8");
const adminQueryData = readFileSync(new URL("../lib/admin-query-data.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../db-schema.sql", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const schemaApply = readFileSync(new URL("../scripts/apply-assessment-schema.ts", import.meta.url), "utf8");

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }

    if (/\.(ts|tsx)$/.test(path)) {
      files.push(path);
    }
  }

  return files;
}

describe("questionnaire V4 first name capture", () => {
  it("keeps first name optional in the React questionnaire payload", () => {
    assert.match(assessmentState, /\bfirstName:\s*string\b/);
    assert.match(assessmentState, /\bfirstName:\s*""/);
    assert.match(assessmentFlow, /\bmaxLength=\{ASSESSMENT_FIRST_NAME_MAX_LENGTH\}/);
    assert.match(assessmentFlow, /copy\.about\.firstNameOptional/);
    assert.match(assessmentFlow, /normalizeAssessmentFirstName\(answers\.firstName\)/);
  });

  it("persists first name to the assessment projection and JSON summary", () => {
    assert.match(schema, /\bfirst_name\s+text\b/i);
    assert.match(assessmentStore, /"first_name"/);
    assert.match(assessmentStore, /\bfirst_name\s*=\s*excluded\.first_name\b/);
    assert.match(assessmentStore, /\bfirstName,\s*\n\s*contactEmail:\s*normalizedContactEmail,\s*\n\s*healthScore:/);
    assert.match(assessmentStore, /\bfirstName:\s*firstName\s*\?\?\s*""/);
  });

  it("captures optional resume email outside assessment answers", () => {
    assert.doesNotMatch(assessmentState, /\bcontactEmail:\s*string\b/);
    assert.match(assessmentFlow, /\bconst \[contactEmail, setContactEmail\]/);
    assert.match(assessmentFlow, /id: "firstName"[\s\S]*id: "resume-email"[\s\S]*id: "sex"/);
    assert.match(assessmentFlow, /contactEmail:\s*normalizedContactEmail/);
    assert.match(assessmentRoute, /contactEmail\?: unknown/);
    assert.match(assessmentStore, /\bcontact_email\b/);
    assert.match(assessmentStore, /normalizeAssessmentContactEmail\(contactEmail\)/);
  });

  it("adds a private resume link flow with hashed reusable tokens", () => {
    assert.match(assessmentFlow, /\/api\/assessment\/resume-link/);
    assert.match(assessmentFlow, /payload\.message \|\| ui\.resume\.error/);
    assert.match(assessmentFlow, /assessment_resume_opened/);
    assert.match(assessmentResumeRoute, /sendTransactionalEmail/);
    assert.match(assessmentResumeStore, /randomBytes\(RESUME_TOKEN_BYTES\)\.toString\("base64url"\)/);
    assert.match(assessmentResumeStore, /token_hash/);
    assert.doesNotMatch(assessmentResumeStore, /insert into public\.assessment_resume_drafts[\s\S]*\$\{token\}/);
    assert.doesNotMatch(assessmentResumeStore, /ensureAssessmentSchema/);
    assert.match(assessmentResumeStore, /ensureAssessmentResumeDraftSchema/);
    assert.match(assessmentResumeStore, /RESUME_TTL_DAYS\s*=\s*14/);
    assert.match(assessmentResumeStore, /finalized_at is null/);
    assert.match(assessmentResumeStore, /finalizeAssessmentResumeDraftForContact/);
    assert.match(assessmentRoute, /finalizeAssessmentResumeDraftForContact/);
    assert.match(assessmentPlanRoute, /finalizeAssessmentResumeDraftForContact/);
    assert.match(assessmentResumeRoute, /assessment_resume_schema_missing/);
    assert.match(assessmentResumeRoute, /status:\s*schemaMissing \? 503 : 400/);
    assert.match(assessmentResumeRoute, /We could not send the private link at this time\./);
  });

  it("exposes questionnaire email to authenticated admin lead surfaces", () => {
    assert.match(adminQueryData, /contactEmail: string \| null/);
    assert.match(adminQueryData, /assessment_resume_requested/);
    assert.match(adminQueryData, /assessment_resume_drafts\.contact_email/);
    assert.match(adminQueryData, /communication_channels\.channel_type = 'email'/);
  });

  it("ships an idempotent schema apply script", () => {
    assert.match(packageJson, /"assessment:schema:apply"/);
    assert.match(schemaApply, /add column if not exists first_name text/i);
    assert.match(schemaApply, /add column if not exists contact_email text/i);
    assert.match(schemaApply, /create table if not exists public\.assessment_resume_drafts/i);
    assert.match(schemaApply, /grant select, insert, update, delete on public\.assessment_resume_drafts to mn/i);
    assert.match(schemaApply, /answers->>'firstName'|firstNameFromAssessmentAnswers/);
    assert.match(schemaApply, /answer_summary = jsonb_set/);
    assert.match(schema, /CREATE TABLE public\.assessment_resume_drafts/);
    assert.match(schema, /\bcontact_email\s+text\b/i);
  });

  it("does not show the forbidden sex label in customer-facing source", () => {
    const files = [
      ...sourceFiles(join(root, "app")),
      ...sourceFiles(join(root, "components")),
      ...sourceFiles(join(root, "lib"))
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /Sex at birth/i, file);
    }
  });
});
