import { validateLeadEmail } from "@/lib/email-validation";

export function normalizeAssessmentContactEmail(value: unknown) {
  const validation = validateLeadEmail(value);

  return validation.ok ? validation.email : null;
}

export function assessmentContactEmailError(value: unknown, { required = false }: { required?: boolean } = {}) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return required ? "required" : null;
  }

  return normalizeAssessmentContactEmail(value) ? null : "invalid";
}
