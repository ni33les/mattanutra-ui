import { ceilingsForSubjects } from "@/lib/agentic/catalogue/supplemental-ul-reference";
import { QA_SUBJECTS } from "@/lib/matcher/qa/subjects";
import type { SafetyCeiling } from "@/lib/matcher/types";

export function qaCatalogSafetyCeilings(): SafetyCeiling[] {
  return ceilingsForSubjects(
    Object.values(QA_SUBJECTS).map((subject) => ({
      aliases: subject.aliases,
      id: subject.id,
      name: subject.name
    }))
  );
}
