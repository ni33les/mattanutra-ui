import { toJsonValue } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import { upsertProductRegulatoryApproval } from "@/lib/product-regulatory-approvals";

type Db = NonNullable<ReturnType<typeof getSql>>;

type FdaEvidence = Readonly<{
  evidenceUrl: string | null;
  metadata?: Record<string, unknown>;
  source: string;
  value: string;
}>;

type ThaiFdaOryorCandidate = Readonly<{
  Addr?: string | null;
  IDA?: string | number | null;
  NewCode?: string | null;
  URLs?: string | null;
  cncnm?: string | null;
  lcnno?: string | null;
  licen?: string | null;
  produceng?: string | null;
  productha?: string | null;
  thanm?: string | null;
  type?: string | number | null;
  typeallow?: string | null;
  typepro?: string | null;
}>;

type SourceableProductRow = Readonly<{
  brand_name: string | null;
  ean13_identifiers: string[] | null;
  id: string;
  manufacturer_sku_identifiers: string[] | null;
  product_url: string;
  source_snapshot: unknown;
  source_url: string | null;
  title: string;
  translated_titles: string[] | null;
}>;

const thaiFdaOryorApiBaseUrl = "https://api.oryor.com";
const thaiFdaOryorProductSearchUrl =
  "https://prod.oryor.com/check-product-serial";
const thaiFdaOryorAuthorization =
  process.env.THAI_FDA_ORYOR_AUTHORIZATION?.trim() || "keeneye";
const thaiFdaOryorRequestTimeoutMs =
  Math.max(
    1000,
    Math.min(
      20_000,
      Number(process.env.THAI_FDA_ORYOR_TIMEOUT_MS ?? 2500) || 2500
    )
  );

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeFdaApprovalNumber(value: unknown) {
  const text = cleanText(value, 120);

  if (!text) {
    return null;
  }

  const compact = text.replace(/\s+/g, "");

  return /^[0-9][0-9./-]{5,}$/.test(compact) ? compact : null;
}

function compactFdaApprovalNumber(value: unknown) {
  const normalized = normalizeFdaApprovalNumber(value);

  return normalized ? normalized.replace(/[^0-9A-Zก-๙]+/gi, "") : null;
}

export function fdaApprovalNumberFromText(text: string) {
  const normalizedText = cleanText(text, 1_000_000);

  if (!normalizedText) {
    return null;
  }

  const explicitThai =
    normalizedText.match(
      /(?:เลข\s*(?:อ\.?\s*ย\.?|อย\.?|สารบบอาหาร)|เลขที่\s*(?:อ\.?\s*ย\.?|อย\.?))\s*[:：]?\s*([0-9][0-9./\-\s]{5,})/i
    )?.[1] ?? null;
  const explicitEnglish =
    normalizedText.match(
      /\b(?:Thai\s+FDA|FDA)\.?\s*(?:No\.?|number|registration(?:\s+no\.?)?)?\s*[:：]?\s*([0-9][0-9./\-\s]{5,})/i
    )?.[1] ?? null;

  return normalizeFdaApprovalNumber(explicitThai ?? explicitEnglish);
}

function pushFdaEvidence(
  output: FdaEvidence[],
  evidence: FdaEvidence
) {
  const normalized = normalizeFdaApprovalNumber(evidence.value);

  if (!normalized) {
    return;
  }

  if (
    output.some((item) =>
      item.value === normalized &&
      item.source === evidence.source
    )
  ) {
    return;
  }

  output.push({
    ...evidence,
    value: normalized
  });
}

function cleanSearchText(value: unknown, max = 300) {
  const text = cleanText(value, max);

  return text
    ? text
        .replace(/\([^)]*\)/g, " ")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\b(?:\d+)\s*(?:caps?|tabs?|tablets?|softgels?|ml|g|mg|mcg|iu)\b/gi, " ")
        .replace(/\b(?:capsules?|tablets?|softgels?|tabs?|caplets?)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
    : null;
}

function searchTermKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "");
}

function addIdentifierSearchTerms(
  terms: string[],
  values: readonly string[] | null | undefined,
  max = 2
) {
  let added = 0;

  for (const value of values ?? []) {
    const text = cleanText(value, 120);

    if (!text || text.length < 2) {
      continue;
    }

    const key = searchTermKey(text);

    if (!key || terms.some((term) => searchTermKey(term) === key)) {
      continue;
    }

    terms.push(text);
    added += 1;

    if (added >= max) {
      return;
    }
  }
}

function addSearchTerm(
  terms: string[],
  value: unknown,
  options: Readonly<{ brandName?: string | null }> = {}
) {
  const text = cleanSearchText(value);

  if (!text || text.length < 2) {
    return;
  }

  const candidates = [text];
  const brand = cleanSearchText(options.brandName);

  if (brand) {
    const brandPattern = new RegExp(
      `^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`,
      "i"
    );
    const withoutBrand = text.replace(brandPattern, "").trim();

    if (withoutBrand && withoutBrand.length >= 2 && withoutBrand !== text) {
      candidates.push(withoutBrand);
    }
  }

  for (const candidate of candidates) {
    const key = searchTermKey(candidate);

    if (!key || terms.some((term) => searchTermKey(term) === key)) {
      continue;
    }

    terms.push(candidate);
  }
}

export function thaiFdaOryorSearchTermsForProduct(row: SourceableProductRow) {
  const terms: string[] = [];

  addIdentifierSearchTerms(terms, row.ean13_identifiers, 2);
  addIdentifierSearchTerms(terms, row.manufacturer_sku_identifiers, 2);
  addSearchTerm(terms, row.title, { brandName: row.brand_name });
  for (const title of row.translated_titles ?? []) {
    addSearchTerm(terms, title, { brandName: row.brand_name });
  }

  return terms.slice(0, 6);
}

function productSearchTokens(value: unknown) {
  const text = cleanSearchText(value, 500);

  if (!text) {
    return new Set<string>();
  }

  const ignored = new Set([
    "and",
    "the",
    "with",
    "plus",
    "dietary",
    "supplement",
    "product",
    "flavour",
    "flavor"
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9ก-๙]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1 && !ignored.has(token))
  );
}

function normalizedNameForPrefix(value: unknown) {
  return cleanSearchText(value, 500)
    ?.toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9ก-๙]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? "";
}

function candidateIsCurrent(candidate: ThaiFdaOryorCandidate) {
  const status = cleanText(candidate.cncnm, 500) ?? "";

  return /คงอยู่/.test(status) && !/ยกเลิก|เพิกถอน|หมดอายุ/.test(status);
}

function candidateNames(candidate: ThaiFdaOryorCandidate) {
  return [
    candidate.produceng,
    candidate.productha
  ].filter((value): value is string => Boolean(cleanText(value, 500)));
}

function normalizedIdentifierText(value: unknown) {
  return cleanText(value, 500)
    ?.toUpperCase()
    .replace(/\s+/g, "") ?? "";
}

function candidateIdentifierText(candidate: ThaiFdaOryorCandidate) {
  return [
    candidate.NewCode,
    candidate.URLs,
    candidate.lcnno,
    candidate.produceng,
    candidate.productha
  ]
    .map((value) => cleanText(value, 500))
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function identifierAppearsAsToken(
  text: string,
  identifier: string
) {
  const normalized = identifier.toUpperCase().replace(/\s+/g, "");

  if (!normalized || normalized.length < 3) {
    return false;
  }

  const haystack = text.toUpperCase();
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tokenPattern = new RegExp(`(^|[^A-Z0-9])${escaped}($|[^A-Z0-9])`);

  return tokenPattern.test(haystack);
}

function candidateIdentifierScore(
  row: SourceableProductRow,
  candidate: ThaiFdaOryorCandidate
) {
  const compactCandidateText = normalizedIdentifierText(candidateIdentifierText(candidate));
  const readableCandidateText = candidateIdentifierText(candidate);
  let score = 0;

  for (const ean of row.ean13_identifiers ?? []) {
    const normalized = normalizedIdentifierText(ean);

    if (normalized.length === 13 && compactCandidateText.includes(normalized)) {
      score = Math.max(score, 1.25);
    }
  }

  for (const sku of row.manufacturer_sku_identifiers ?? []) {
    const normalized = normalizedIdentifierText(sku);

    if (
      normalized.length >= 4 &&
      identifierAppearsAsToken(readableCandidateText, normalized)
    ) {
      score = Math.max(score, 0.45);
    }
  }

  return score;
}

function candidateBestScore(
  row: SourceableProductRow,
  candidate: ThaiFdaOryorCandidate
) {
  const approvalNumber = normalizeFdaApprovalNumber(candidate.lcnno);

  if (!approvalNumber) {
    return 0;
  }

  const productNames = [
    row.title,
    ...(row.translated_titles ?? [])
  ].filter((value): value is string => Boolean(cleanText(value, 500)));
  const brandTokens = productSearchTokens(row.brand_name);
  let bestScore = candidateIdentifierScore(row, candidate);

  for (const productName of productNames) {
    const productTokens = [...productSearchTokens(productName)]
      .filter((token) => !brandTokens.has(token));

    if (productTokens.length < 2) {
      continue;
    }

    for (const candidateName of candidateNames(candidate)) {
      const candidateTokens = productSearchTokens(candidateName);
      const overlap = productTokens.filter((token) => candidateTokens.has(token));
      const coverage = overlap.length / productTokens.length;
      const productPrefix = normalizedNameForPrefix(productName);
      const candidatePrefix = normalizedNameForPrefix(candidateName);
      const exactPrefix = Boolean(
        productPrefix &&
        (
          candidatePrefix === productPrefix ||
          candidatePrefix.startsWith(`${productPrefix} `)
        )
      );
      const score =
        coverage +
        (exactPrefix ? 0.55 : 0) +
        candidateIdentifierScore(row, candidate) +
        (candidateIsCurrent(candidate) ? 0.35 : 0);

      bestScore = Math.max(bestScore, score);
    }
  }

  return bestScore;
}

function thaiFdaOryorEvidenceUrl(approvalNumber: string) {
  return `${thaiFdaOryorProductSearchUrl}?serial=${encodeURIComponent(approvalNumber)}`;
}

export function selectThaiFdaOryorEvidence(
  row: SourceableProductRow,
  candidates: readonly ThaiFdaOryorCandidate[]
): FdaEvidence | null {
  const scored = candidates
    .map((candidate) => ({
      approvalNumber: normalizeFdaApprovalNumber(candidate.lcnno),
      candidate,
      score: candidateBestScore(row, candidate)
    }))
    .filter((item) => item.approvalNumber && item.score >= 0.95)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  if (!best?.approvalNumber) {
    return null;
  }

  const nextBest = scored.find((item) =>
    item.approvalNumber !== best.approvalNumber
  );

  if (nextBest && best.score - nextBest.score < 0.25) {
    return null;
  }

  return {
    evidenceUrl: thaiFdaOryorEvidenceUrl(best.approvalNumber),
    metadata: {
      cncnm: cleanText(best.candidate.cncnm, 500),
      ida: cleanText(best.candidate.IDA, 80),
      licen: cleanText(best.candidate.licen, 500),
      productha: cleanText(best.candidate.productha, 500),
      produceng: cleanText(best.candidate.produceng, 500),
      score: best.score,
      thanm: cleanText(best.candidate.thanm, 500),
      typeallow: cleanText(best.candidate.typeallow, 120),
      typepro: cleanText(best.candidate.typepro, 120)
    },
    source: "thai_fda_oryor_api",
    value: best.approvalNumber
  };
}

function deadlineRemainingMs(deadlineAt: number | null) {
  return deadlineAt ? Math.max(0, deadlineAt - Date.now()) : thaiFdaOryorRequestTimeoutMs;
}

async function fetchThaiFdaOryorCandidates(
  keyword: string,
  deadlineAt: number | null = null
) {
  const remainingMs = deadlineRemainingMs(deadlineAt);

  if (remainingMs < 250) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(thaiFdaOryorRequestTimeoutMs, remainingMs)
  );

  try {
    const url =
      `${thaiFdaOryorApiBaseUrl}/productSerial/search?keyword=${encodeURIComponent(keyword)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "th,en-GB;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; MattaNutraProductGovernance/1.0; +https://mattanutra.com)",
        "X-Authorization": thaiFdaOryorAuthorization
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json().catch(() => null);

    return Array.isArray(payload)
      ? payload.filter((item): item is ThaiFdaOryorCandidate => isRecord(item))
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function sourceThaiFdaApprovalFromOryorApi(
  row: SourceableProductRow,
  deadlineAt: number | null = null
) {
  const allCandidates: ThaiFdaOryorCandidate[] = [];

  for (const term of thaiFdaOryorSearchTermsForProduct(row)) {
    if (deadlineRemainingMs(deadlineAt) < 250) {
      break;
    }

    const candidates = await fetchThaiFdaOryorCandidates(term, deadlineAt);

    if (!candidates) {
      continue;
    }

    for (const candidate of candidates.slice(0, 30)) {
      const candidateNumber = compactFdaApprovalNumber(candidate.lcnno);

      if (
        candidateNumber &&
        !allCandidates.some((item) =>
          compactFdaApprovalNumber(item.lcnno) === candidateNumber
        )
      ) {
        allCandidates.push(candidate);
      }
    }
  }

  return selectThaiFdaOryorEvidence(row, allCandidates);
}

function extractFdaEvidenceFromRecord(
  value: unknown,
  output: FdaEvidence[],
  source: string,
  evidenceUrl: string | null,
  depth = 0
) {
  if (depth > 8 || !value) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 80)) {
      extractFdaEvidenceFromRecord(item, output, source, evidenceUrl, depth + 1);
    }
    return;
  }

  if (!isRecord(value)) {
    const text = cleanText(value, 20_000);
    const fdaNumber = text ? fdaApprovalNumberFromText(text) : null;

    if (fdaNumber) {
      pushFdaEvidence(output, {
        evidenceUrl,
        source,
        value: fdaNumber
      });
    }

    return;
  }

  for (const [key, raw] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "");
    const text = cleanText(raw, 20_000);

    if (
      text &&
      [
        "fda",
        "fdano",
        "fdanumber",
        "fdaapprovalnumber",
        "thaifda",
        "thaifdanumber",
        "เลขอย",
        "เลขออย",
        "เลขสารบบอาหาร"
      ].includes(normalizedKey)
    ) {
      const normalized = normalizeFdaApprovalNumber(text) ?? fdaApprovalNumberFromText(text);

      if (normalized) {
        pushFdaEvidence(output, {
          evidenceUrl,
          source,
          value: normalized
        });
      }
    }

    if (text) {
      const fdaNumber = fdaApprovalNumberFromText(text);

      if (fdaNumber) {
        pushFdaEvidence(output, {
          evidenceUrl,
          source,
          value: fdaNumber
        });
      }
    }

    extractFdaEvidenceFromRecord(raw, output, source, evidenceUrl, depth + 1);
  }
}

async function fetchTrustedHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "th,en-GB;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    });

    return response.ok ? await response.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractTrustedFdaApprovalEvidence(input: Readonly<{
  evidenceUrl?: string | null;
  html?: string | null;
  snapshot?: unknown;
}>) {
  const output: FdaEvidence[] = [];
  const evidenceUrl = cleanText(input.evidenceUrl, 2000);

  if (input.snapshot) {
    extractFdaEvidenceFromRecord(
      input.snapshot,
      output,
      "manufacturer_snapshot",
      evidenceUrl
    );
  }

  const html = cleanText(input.html, 1_000_000);

  if (html) {
    const fdaNumber = fdaApprovalNumberFromText(html);

    if (fdaNumber) {
      pushFdaEvidence(output, {
        evidenceUrl,
        source: "manufacturer_visible_text",
        value: fdaNumber
      });
    }
  }

  return output;
}

export async function sourceProductFdaApprovalNumbers(input: Readonly<{
  includeManufacturerEvidence?: boolean;
  limit?: number;
  maxRunMs?: number;
  productId?: string | null;
}> = {}) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const limit = Math.max(1, Math.min(2000, Math.round(input.limit ?? 2000)));
  const maxRunMs = input.maxRunMs
    ? Math.max(1000, Math.min(600_000, Math.round(input.maxRunMs)))
    : null;
  const deadlineAt = maxRunMs ? Date.now() + maxRunMs : null;
  const rows = await sql<Array<{
    brand_name: string | null;
    ean13_identifiers: string[] | null;
    id: string;
    manufacturer_sku_identifiers: string[] | null;
    product_url: string;
    source_snapshot: unknown;
    source_url: string | null;
    title: string;
    translated_titles: string[] | null;
  }>>`
    select
      products.brand_name,
      coalesce(
        array_agg(distinct product_identifiers.identifier_value order by product_identifiers.identifier_value) filter (
          where product_identifiers.identifier_type = 'ean13'
            and product_identifiers.status = 'active'
        ),
        array[]::text[]
      ) as ean13_identifiers,
      products.id::text,
      coalesce(
        array_agg(distinct product_identifiers.identifier_value order by product_identifiers.identifier_value) filter (
          where product_identifiers.identifier_type = 'manufacturer_sku'
            and product_identifiers.status = 'active'
        ),
        array[]::text[]
      ) as manufacturer_sku_identifiers,
      products.product_url,
      products.source_url,
      products.source_snapshot,
      products.title,
      coalesce(
        array_agg(distinct product_translations.title order by product_translations.title) filter (
          where product_translations.status <> 'missing'
            and nullif(product_translations.title, '') is not null
        ),
        array[]::text[]
      ) as translated_titles
    from public.products
    left join public.product_identifiers
      on product_identifiers.product_id = products.id
      and product_identifiers.identifier_type in ('ean13', 'manufacturer_sku')
      and product_identifiers.status = 'active'
    left join public.product_translations
      on product_translations.product_id = products.id
    where ${input.productId ? sql`products.id = ${input.productId}::uuid` : sql`true`}
      and not exists (
        select 1
        from public.product_regulatory_approvals existing_approval
        where existing_approval.product_id = products.id
          and existing_approval.scope_type = 'country'
          and existing_approval.scope_code = 'TH'
          and existing_approval.agency_code = 'TH_FDA'
          and existing_approval.approval_type = 'product_registration'
          and existing_approval.status in ('sourced', 'verified')
      )
    group by products.id
    order by products.updated_at desc
    limit ${limit}
  `;
  let conflicts = 0;
  let failed = 0;
  let missing = 0;
  let scanned = 0;
  let updated = 0;
  let apiMatches = 0;
  let stoppedEarly = false;

  for (const row of rows) {
    if (deadlineRemainingMs(deadlineAt) < 250) {
      stoppedEarly = true;
      break;
    }

    scanned += 1;
    const apiEvidence = await sourceThaiFdaApprovalFromOryorApi(row, deadlineAt);

    if (apiEvidence) {
      try {
        await createProductThaiFdaApproval(sql, {
          evidence: apiEvidence,
          productId: row.id
        });
        apiMatches += 1;
        updated += 1;
      } catch {
        failed += 1;
      }

      continue;
    }

    if (input.includeManufacturerEvidence === false) {
      missing += 1;
      continue;
    }

    if (deadlineRemainingMs(deadlineAt) < 250) {
      stoppedEarly = true;
      break;
    }

    const evidenceUrl = row.source_url ?? row.product_url;
    const html = evidenceUrl ? await fetchTrustedHtml(evidenceUrl) : null;
    const evidence = extractTrustedFdaApprovalEvidence({
      evidenceUrl,
      html,
      snapshot: row.source_snapshot
    });
    const uniqueValues = [...new Set(evidence.map((item) => item.value))];

    if (uniqueValues.length === 0) {
      missing += 1;
      continue;
    }

    if (uniqueValues.length > 1) {
      conflicts += 1;
      continue;
    }

    const selected = evidence.find((item) => item.value === uniqueValues[0]);

    if (!selected) {
      missing += 1;
      continue;
    }

    try {
      await createProductThaiFdaApproval(sql, {
        evidence: selected,
        productId: row.id
      });
      updated += 1;
    } catch {
      failed += 1;
    }
  }

  const remaining = await sql<Array<{ count: string }>>`
    select count(*)::text as count
    from public.products
    where ${input.productId ? sql`products.id = ${input.productId}::uuid` : sql`true`}
      and not exists (
        select 1
        from public.product_regulatory_approvals existing_approval
        where existing_approval.product_id = products.id
          and existing_approval.scope_type = 'country'
          and existing_approval.scope_code = 'TH'
          and existing_approval.agency_code = 'TH_FDA'
          and existing_approval.approval_type = 'product_registration'
          and existing_approval.status in ('sourced', 'verified')
      )
  `;

  return {
    apiMatches,
    conflicts,
    failed,
    missing,
    remainingMissing: Number(remaining[0]?.count ?? 0),
    scanned,
    stoppedEarly,
    updated
  };
}

async function createProductThaiFdaApproval(
  sql: Db,
  input: Readonly<{
    evidence: FdaEvidence;
    productId: string;
  }>
) {
  await upsertProductRegulatoryApproval(sql, {
    agencyCode: "TH_FDA",
    agencyName: "Thai FDA",
    approvalNumber: input.evidence.value,
    approvalType: "product_registration",
    evidenceUrl: input.evidence.evidenceUrl,
    metadata: {
      ...(input.evidence.metadata ?? {}),
      sourceEvidence: input.evidence.source,
      sourcedAt: new Date().toISOString()
    },
    productId: input.productId,
    scopeCode: "TH",
    scopeType: "country",
    source: input.evidence.source,
    status: "verified"
  });

  await sql`
    update public.products
    set
      source_snapshot = coalesce(source_snapshot, '{}'::jsonb) || ${sql.json(toJsonValue({
        fdaSourcing: {
          approvalNumber: input.evidence.value,
          evidenceUrl: input.evidence.evidenceUrl,
          metadata: input.evidence.metadata ?? null,
          source: input.evidence.source,
          sourcedAt: new Date().toISOString()
        }
      }))}::jsonb,
      updated_at = now()
    where id = ${input.productId}::uuid
  `;
}
