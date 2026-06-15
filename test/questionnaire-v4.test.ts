import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const assessmentFlow = readFileSync(new URL("../components/assessment-flow.tsx", import.meta.url), "utf8");
const assessmentFlowCopy = readFileSync(new URL("../components/assessment-flow-copy.ts", import.meta.url), "utf8");
const customerCss = readFileSync(new URL("../app/customer.css", import.meta.url), "utf8");
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

  it("renders the opening privacy gate before questionnaire controls", () => {
    assert.match(assessmentFlowCopy, /privacyGate:\s*\{[\s\S]*Your answers stay between us\./);
    assert.match(assessmentFlowCopy, /acceptedPrompt:\s*"Thanks — your answers are protected\. You can begin\."/);
    assert.match(assessmentFlowCopy, /acceptedPrompt:\s*"ขอบคุณ คำตอบของคุณได้รับการปกป้องแล้ว คุณเริ่มได้เลย"/);
    assert.match(assessmentFlowCopy, /acceptedPrompt:\s*"谢谢，你的答案已受到保护。现在可以开始。"/);
    assert.match(assessmentFlowCopy, /privacyGate:\s*\{[\s\S]*คำตอบของคุณอยู่ระหว่างเราเท่านั้น/);
    assert.match(assessmentFlowCopy, /privacyGate:\s*\{[\s\S]*你的答案只留在我们之间。/);
    assert.match(assessmentFlow, /function renderPrivacyGate\(\)/);
    assert.match(assessmentFlow, /className="consent-wrap"[\s\S]*className="consent"[\s\S]*className="consent-eyebrow"[\s\S]*className="consent-title"[\s\S]*className="consent-lede"/);
    assert.match(assessmentFlow, /className="consent-check"[\s\S]*id="consentFormula"[\s\S]*type="checkbox"[\s\S]*className="consent-box"/);
    assert.match(assessmentFlow, /className="consent-label"[\s\S]*className="tag"[\s\S]*className="consent-note"/);
    assert.match(assessmentFlow, /className=\{`consent-gatehint\$\{answers\.disclosure \? " ok" : ""\}`\}/);
    assert.match(assessmentFlow, /answers\.disclosure \? privacy\.acceptedPrompt : privacy\.prompt/);
    assert.match(assessmentFlow, /className="consent-link" href=\{`\/\$\{locale\}\/privacy`\}/);
    assert.match(assessmentFlow, /renderPrivacyGate\(\)[\s\S]*<QuestionnairePrecisionMeter/);
    assert.match(assessmentFlow, /const primaryActionDisabled = !answers\.disclosure/);
    assert.match(assessmentFlow, /!answers\.disclosure && index !== 0/);
    assert.match(assessmentFlow, /if \(!answers\.disclosure\)[\s\S]*setResumeError\(ui\.privacyGate\.prompt\)/);
    assert.match(assessmentFlow, /disabled=\{resumeStatus === "sending" \|\| !normalizedContactEmail \|\| !answers\.disclosure\}/);
    assert.doesNotMatch(assessmentFlow, /mn-privacy-gate/);
    assert.doesNotMatch(assessmentFlow, /id: "disclosure"/);
    assert.doesNotMatch(assessmentFlow, /copy\.food\.disclosureTitle/);
  });

  it("ports the v5 consent notice CSS from the handoff", () => {
    assert.match(customerCss, /\.consent-wrap\s*\{[\s\S]*max-width:\s*920px[\s\S]*margin:\s*22px auto 0[\s\S]*padding:\s*0 22px/);
    assert.match(customerCss, /\.consent\s*\{[\s\S]*border:\s*1\.5px solid var\(--mn-teal-glow\)[\s\S]*border-radius:\s*22px[\s\S]*background:\s*var\(--mn-mint\)[\s\S]*padding:\s*24px 26px 22px/);
    assert.match(customerCss, /\.consent-title\s*\{[\s\S]*font-family:\s*var\(--mn-font-display\)[\s\S]*font-size:\s*23px[\s\S]*font-weight:\s*600[\s\S]*line-height:\s*1\.12/);
    assert.match(customerCss, /\.consent-lede\s*\{[\s\S]*font-size:\s*14\.5px[\s\S]*line-height:\s*1\.55/);
    assert.match(customerCss, /\.consent-check input\s*\{[\s\S]*position:\s*absolute[\s\S]*opacity:\s*0/);
    assert.match(customerCss, /\.consent-box\s*\{[\s\S]*width:\s*22px[\s\S]*height:\s*22px[\s\S]*border-radius:\s*7px/);
    assert.match(customerCss, /\.consent-check input:checked ~ \.consent-box\s*\{[\s\S]*background:\s*var\(--mn-teal\)/);
    assert.match(customerCss, /@media \(max-width:\s*520px\)\s*\{[\s\S]*\.consent\s*\{[\s\S]*padding:\s*20px 18px[\s\S]*\.consent-title\s*\{[\s\S]*font-size:\s*21px/);
    assert.match(customerCss, /@media \(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.consent \*/);
    assert.doesNotMatch(customerCss, /mn-privacy-gate/);
    assert.doesNotMatch(customerCss, /accent-color/);
  });

  it("places female health context directly after sex before country and sun context", () => {
    assert.match(
      assessmentFlow,
      /id: "firstName"[\s\S]*id: "resume-email"[\s\S]*id: "sex"[\s\S]*femaleContextQuestion \? \[femaleContextQuestion\] : \[\][\s\S]*id: "age"[\s\S]*id: "sunscreen-sun"[\s\S]*id: "country"/
    );
    assert.match(
      assessmentFlow,
      /const femaleContextQuestion: AssessmentQuestion \| null =[\s\S]*answers\.sex === "female"[\s\S]*id: "female-context"/
    );
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
