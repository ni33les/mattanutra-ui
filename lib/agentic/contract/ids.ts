const UUID_HEX = /^[0-9a-f]{32}$/i;
const UUID_DASHED =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stripDashes(value: string) {
  return value.replace(/-/g, "").toLowerCase();
}

function dashedUuid(hex: string) {
  const normalized = hex.toLowerCase();

  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

export function publicSupplementId(uuid: string) {
  return `sup_${stripDashes(uuid)}`;
}

export function publicProductId(uuid: string) {
  return `prd_${stripDashes(uuid)}`;
}

export function parsePublicId(
  value: string,
  prefix: "sup_" | "prd_"
): string | null {
  if (!value.startsWith(prefix)) {
    return null;
  }

  const hex = value.slice(prefix.length);

  if (!UUID_HEX.test(hex)) {
    return null;
  }

  return dashedUuid(hex);
}

export function isPublicSupplementId(value: unknown): value is string {
  return typeof value === "string" && Boolean(parsePublicId(value, "sup_"));
}

export function isPublicProductId(value: unknown): value is string {
  return typeof value === "string" && Boolean(parsePublicId(value, "prd_"));
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_DASHED.test(value);
}

export function humanOrderReference(orderId: string) {
  return `ord_${stripDashes(orderId).slice(0, 12)}`;
}

export function humanCaseReference(caseId: string) {
  return `tkt_${stripDashes(caseId).slice(0, 12)}`;
}
