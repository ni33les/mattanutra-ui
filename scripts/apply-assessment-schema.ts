import { getSql } from "@/lib/db";
import { firstNameFromAssessmentAnswers } from "@/lib/assessment-first-name";

const sql = getSql();

if (!sql) {
  throw new Error("DB_CONNECTION is required to apply the assessment schema");
}

await sql`
  alter table public.assessments
    add column if not exists first_name text
`;

const rows = await sql<Array<{
  answer_summary: unknown;
  answers: unknown;
  plan_id: string;
}>>`
  select
    plan_id::text,
    answers,
    answer_summary
  from public.assessments
  where first_name is null
`;

let backfilled = 0;

for (const row of rows) {
  const firstName =
    firstNameFromAssessmentAnswers(row.answers) ??
    firstNameFromAssessmentAnswers(row.answer_summary);

  if (!firstName) {
    continue;
  }

  await sql`
    update public.assessments
    set
      first_name = ${firstName},
      answers = jsonb_set(
        coalesce(answers, '{}'::jsonb),
        '{firstName}',
        to_jsonb(${firstName}::text),
        true
      ),
      answer_summary = jsonb_set(
        coalesce(answer_summary, '{}'::jsonb),
        '{firstName}',
        to_jsonb(${firstName}::text),
        true
      ),
      updated_at = now()
    where plan_id = ${row.plan_id}::uuid
  `;
  backfilled += 1;
}

console.log(
  `[assessment-schema] first_name column ready; backfilled ${backfilled} assessment${backfilled === 1 ? "" : "s"}.`
);
