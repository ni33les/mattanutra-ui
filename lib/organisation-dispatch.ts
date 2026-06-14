function metadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      return metadataRecord(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }

  return {};
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeDispatchCity(value: unknown) {
  const text = cleanText(value).replace(/\s+/g, " ");

  return text || null;
}

export function organisationDispatchCity(input: Readonly<{
  metadata?: unknown;
  name?: string | null;
  slug?: string | null;
}>) {
  const metadata = metadataRecord(input.metadata);
  const address = metadataRecord(metadata.address);
  const city =
    normalizeDispatchCity(metadata.dispatchCity) ??
    normalizeDispatchCity(metadata.city) ??
    normalizeDispatchCity(address.dispatchCity) ??
    normalizeDispatchCity(address.city);

  if (city) {
    return city;
  }

  const slug = cleanText(input.slug).toLowerCase();
  const name = cleanText(input.name).toLowerCase();

  if (slug === "delight-pharmacy" || name.includes("delight pharmacy")) {
    return "Chiang Mai";
  }

  return null;
}
