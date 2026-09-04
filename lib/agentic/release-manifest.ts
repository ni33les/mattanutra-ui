import { createHash } from "node:crypto";
import {
  AGENTIC_CONTRACT_VERSION,
  type AgenticEnvironment
} from "@/lib/agentic/config";
import { AGENTIC_TOOL_SCHEMAS } from "@/lib/agentic/contract";
import {
  RESEARCH_VERSION,
  RESPONSIBILITY_VERSION
} from "@/lib/agentic/discovery/versions";
import { canonicalHash, canonicalJson } from "@/lib/agentic/value/canonical";

export const RELEASE_MANIFEST_VERSION = "ident-1.0";
export const BUILD_ID_PATTERN = /^[0-9a-f]{40}$/;
export const SCHEMA_CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;
export const TEST_RELEASE_BUILD_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

export type ReleaseManifest = Readonly<{
  buildId: string;
  canonicalVersion: string;
  contractVersion: string;
  manifestVersion: string;
  researchVersion: string;
  responsibilityVersion: string;
  schemaChecksum: string;
}>;

export type ReleaseManifestDiagnostic =
  | "release_manifest.build_id_absent"
  | "release_manifest.build_id_malformed"
  | "release_manifest.schema_absent"
  | "release_manifest.schema_checksum_malformed"
  | "release_manifest.schema_checksum_mismatch";

export class ReleaseManifestError extends Error {
  readonly diagnostic: ReleaseManifestDiagnostic;

  constructor(diagnostic: ReleaseManifestDiagnostic, message: string) {
    super(message);
    this.diagnostic = diagnostic;
    this.name = "ReleaseManifestError";
  }
}

export function servedSchemaBundle() {
  return {
    contractVersion: AGENTIC_CONTRACT_VERSION,
    tools: AGENTIC_TOOL_SCHEMAS
  };
}

export function computeSchemaChecksum(bundle: unknown = servedSchemaBundle()) {
  return canonicalHash(bundle);
}

export function pipelineBuildId() {
  const injected =
    process.env.AGENTIC_BUILD_ID?.trim() ||
    process.env.COMMIT_SHA?.trim() ||
    process.env.COMMIT_HASH?.trim() ||
    "";
  if (injected) {
    return injected.toLowerCase();
  }
  if (process.env.NODE_TEST_CONTEXT) {
    return TEST_RELEASE_BUILD_ID;
  }
  return "";
}

export function buildReleaseManifest(input: Readonly<{
  buildId?: string;
  schemaBundle?: unknown;
  schemaChecksum?: string;
}> = {}): ReleaseManifest {
  const bundle = input.schemaBundle ?? servedSchemaBundle();
  const schemaChecksum = input.schemaChecksum ?? computeSchemaChecksum(bundle);
  return Object.freeze({
    buildId: (input.buildId ?? pipelineBuildId()).toLowerCase(),
    canonicalVersion: "cv-1.4",
    contractVersion: AGENTIC_CONTRACT_VERSION,
    manifestVersion: RELEASE_MANIFEST_VERSION,
    researchVersion: RESEARCH_VERSION,
    responsibilityVersion: RESPONSIBILITY_VERSION,
    schemaChecksum
  });
}

export function validateReleaseManifest(
  manifest: ReleaseManifest,
  input: Readonly<{ schemaBundle?: unknown; skipRecompute?: boolean }> = {}
) {
  if (!manifest.buildId) {
    throw new ReleaseManifestError(
      "release_manifest.build_id_absent",
      "Authoritative buildId is required before serving public info."
    );
  }
  if (!BUILD_ID_PATTERN.test(manifest.buildId)) {
    throw new ReleaseManifestError(
      "release_manifest.build_id_malformed",
      "buildId must be a 40-character lowercase git SHA."
    );
  }
  if (!manifest.schemaChecksum) {
    throw new ReleaseManifestError(
      "release_manifest.schema_absent",
      "Authoritative schemaChecksum is required before serving public info."
    );
  }
  if (!SCHEMA_CHECKSUM_PATTERN.test(manifest.schemaChecksum)) {
    throw new ReleaseManifestError(
      "release_manifest.schema_checksum_malformed",
      "schemaChecksum must be a 64-character lowercase SHA-256 hex digest."
    );
  }
  if (!input.skipRecompute) {
    const expected = computeSchemaChecksum(input.schemaBundle ?? servedSchemaBundle());
    if (manifest.schemaChecksum !== expected) {
      throw new ReleaseManifestError(
        "release_manifest.schema_checksum_mismatch",
        "schemaChecksum does not match the served MCP schema bundle."
      );
    }
  }
  return manifest;
}

let cachedManifest: ReleaseManifest | null = null;

export function resetReleaseManifestForTests() {
  cachedManifest = null;
}

export function releaseManifest() {
  if (cachedManifest) {
    return cachedManifest;
  }
  cachedManifest = validateReleaseManifest(buildReleaseManifest());
  return cachedManifest;
}

export function assertReleaseManifestReady(environment?: AgenticEnvironment) {
  void environment;
  return releaseManifest();
}

export function permuteJsonKeyOrder<T>(value: T, salt = 1): T {
  return permuteValue(value, salt) as T;
}

function permuteValue(value: unknown, salt: number): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => permuteValue(item, salt + 1));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, nested]) => [key, permuteValue(nested, salt + 1)] as const
    );
    entries.sort(([left], [right]) =>
      salt % 2 === 0 ? left.localeCompare(right) : right.localeCompare(left)
    );
    return Object.fromEntries(entries);
  }
  return value;
}

export function fingerprintReleaseIdentity(manifest: ReleaseManifest) {
  return createHash("sha256")
    .update(
      canonicalJson({
        buildId: manifest.buildId,
        contractVersion: manifest.contractVersion,
        schemaChecksum: manifest.schemaChecksum
      })
    )
    .digest("hex");
}
