import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const assessmentFlow = readFileSync(new URL("../components/assessment-flow.tsx", import.meta.url), "utf8");
const assessmentState = readFileSync(new URL("../components/assessment-flow-state.ts", import.meta.url), "utf8");
const assessmentStore = readFileSync(new URL("../lib/assessment-store.ts", import.meta.url), "utf8");
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
    assert.match(assessmentStore, /\bfirstName,\s*\n\s*healthScore:/);
    assert.match(assessmentStore, /\bfirstName:\s*firstName\s*\?\?\s*""/);
  });

  it("ships an idempotent schema apply script", () => {
    assert.match(packageJson, /"assessment:schema:apply"/);
    assert.match(schemaApply, /add column if not exists first_name text/i);
    assert.match(schemaApply, /answers->>'firstName'|firstNameFromAssessmentAnswers/);
    assert.match(schemaApply, /answer_summary = jsonb_set/);
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
