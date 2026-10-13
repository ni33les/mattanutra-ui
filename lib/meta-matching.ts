import { createHash } from "node:crypto";

/** Customer information only; never spread browser event data or questionnaire answers here. */
export type MetaContact = {
  email?: string | null; phone?: string | null; country?: string | null;
  firstName?: string | null; lastName?: string | null;
  city?: string | null; region?: string | null; postalCode?: string | null;
  gender?: string | null; dateOfBirth?: string | null;
};

export const META_HASHED_MATCHING_FIELDS = ["em", "ph", "fn", "ln", "ct", "st", "zp", "country", "ge", "db"] as const;
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const text = (value: unknown, max = 200) => typeof value === "string" && value.length <= max ? value.trim().toLowerCase() : "";
const name = (value: unknown) => text(value).replace(/[^\p{L}\p{M}\s]/gu, "").replace(/\s+/gu, " ").trim();
const place = (value: unknown) => text(value).replace(/[^\p{L}\p{M}]/gu, "");

/** https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters/ */
export function metaContactMatching(contact: MetaContact = {}): Record<string, string[]> {
  const values: Record<string, string> = {};
  const email = text(contact.email, 254);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) values.em = email;
  const country = text(contact.country);
  if (/^[a-z]{2}$/.test(country)) values.country = country;
  const rawPhone = text(contact.phone, 50);
  if (rawPhone && /^[+\d\s().-]+$/.test(rawPhone)) {
    let digits = rawPhone.replace(/\D/g, "");
    if (rawPhone.startsWith("00")) digits = digits.slice(2);
    // Keep existing Thailand support; other national numbers need an explicit country prefix.
    else if (!rawPhone.startsWith("+")) digits = country === "th" ? digits.replace(/^0/, "66") : "";
    if (country === "th") digits = digits.replace(/^660/, "66");
    if (/^[1-9]\d{7,14}$/.test(digits)) values.ph = digits;
  }
  values.fn = name(contact.firstName);
  values.ln = name(contact.lastName);
  values.ct = place(contact.city);
  const region = place(contact.region);
  // Meta requires the two-letter state code for US addresses. Never truncate a full state name.
  if (country !== "us" || /^[a-z]{2}$/.test(region)) values.st = region;
  const postal = text(contact.postalCode, 32).replace(/[\s-]/g, "");
  if (country === "us") {
    if (/^\d{5}(?:\d{4})?$/.test(postal)) values.zp = postal.slice(0, 5);
  } else if (/^[a-z\d]{2,16}$/.test(postal)) values.zp = postal;
  const gender = text(contact.gender);
  if (["f", "female"].includes(gender)) values.ge = "f";
  if (["m", "male"].includes(gender)) values.ge = "m";
  const birth = text(contact.dateOfBirth);
  if (/^\d{4}-\d{2}-\d{2}$|^\d{8}$/.test(birth)) {
    const compact = birth.replace(/-/g, "");
    const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso && compact >= "19000101" && date.getTime() <= Date.now()) values.db = compact;
  }
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value).map(([key, value]) => [key, [hash(value)]]));
}

/** Only valid SHA-256 identifiers may reach CAPI, including legacy database rows. */
export function metaHashedMatching(evidence: unknown): Record<string, string[]> {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return {};
  const data = evidence as Record<string, unknown>;
  const matching: Record<string, string[]> = {};
  for (const key of META_HASHED_MATCHING_FIELDS) {
    const values = data[key];
    if (Array.isArray(values) && values.length && values.every(v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v))) matching[key] = values;
  }
  return matching;
}

/** A reused browser can contain several customers. Never combine conflicting identities. */
export function metaMatchingIdentitiesConflict(left: Record<string, unknown>, right: Record<string, unknown>) {
  for (const key of ["em", "ph"] as const) {
    const a = left[key], b = right[key];
    if (Array.isArray(a) && a.length && Array.isArray(b) && b.length) {
      return !a.some(value => b.includes(value));
    }
  }
  return false;
}

export function withoutMetaContactMatching(matching: Record<string, string | string[]>) {
  return Object.fromEntries(Object.entries(matching).filter(([key]) => !META_HASHED_MATCHING_FIELDS.includes(key as typeof META_HASHED_MATCHING_FIELDS[number])));
}
