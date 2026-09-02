import { AGENTIC_REASON_CODES } from "@/lib/agentic/contract/errors";

export const PUBLIC_ERROR_LEAK_NEEDLES = [
  "Failed validating",
  "On instance",
  "Schema:",
  "$defs",
  "oneOf",
  "stack trace",
  "sk_live",
  "pk_live",
  "whsec_",
  "operator does not exist",
  "at Object.",
  "ECONNREFUSED",
  "password",
  "capabilitySecret",
  "select *",
  "postgres://"
] as const;

export function publicErrorSafe(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.ok !== false) {
    return false;
  }

  const error = record.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return false;
  }

  const body = error as Record<string, unknown>;
  if (typeof body.reasonCode !== "string") {
    return false;
  }

  if (!(AGENTIC_REASON_CODES as readonly string[]).includes(body.reasonCode)) {
    return false;
  }

  if (!("fieldPath" in body)) {
    return false;
  }

  const blob = JSON.stringify(value);
  return !PUBLIC_ERROR_LEAK_NEEDLES.some((needle) =>
    blob.toLowerCase().includes(needle.toLowerCase())
  );
}
