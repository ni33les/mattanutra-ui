import { catalogueRecordFingerprint } from "@/lib/catalogue-corrections";
import { matcherSafetyCeilings, matcherSafetyReferenceIdentity } from "@/lib/matcher/safety-ceilings";
import type { SafetyCeiling } from "@/lib/matcher/types";
import type { SafetyReferenceIdentity } from "@/lib/matcher/safety-ceilings";

export type ReferenceJobIdentity = Readonly<{
  runtimeRevision: number | null; fingerprint: string; ceilingsFingerprint: string; historicalFixture?: true;
}>;
export type ReferenceJobCompletion<T> = Readonly<{ value: T; referenceIdentity: ReferenceJobIdentity }>;

export function matchesSafetyReferenceIdentity(value: unknown, expected: SafetyReferenceIdentity): value is SafetyReferenceIdentity {
  const row = value as Partial<SafetyReferenceIdentity> | null;
  return Boolean(row && Number.isSafeInteger(row.runtimeRevision) && row.runtimeRevision === expected.runtimeRevision &&
    /^[a-f0-9]{64}$/.test(row.fingerprint ?? "") && row.fingerprint === expected.fingerprint);
}

export function captureReferenceJobIdentity(runtimeRevision: number | undefined, historicalFixture = false): ReferenceJobIdentity {
  const ceilingsFingerprint = catalogueRecordFingerprint(matcherSafetyCeilings());
  const reference = matcherSafetyReferenceIdentity();
  if (runtimeRevision !== undefined && reference?.runtimeRevision === runtimeRevision) return { ...reference, ceilingsFingerprint };
  if (runtimeRevision === undefined && historicalFixture && process.env.NODE_TEST_CONTEXT) return {
    runtimeRevision: null, fingerprint: ceilingsFingerprint, ceilingsFingerprint, historicalFixture: true
  };
  throw new Error("Safety reference identity does not match the catalogue epoch; regenerate matching work");
}

export function validateReferenceJobIdentity(identity: ReferenceJobIdentity, ceilings: readonly SafetyCeiling[], runtimeRevision: number | undefined) {
  if (!identity || identity.ceilingsFingerprint !== catalogueRecordFingerprint(ceilings) ||
      (identity.historicalFixture ? !process.env.NODE_TEST_CONTEXT || runtimeRevision !== undefined :
        runtimeRevision === undefined || identity.runtimeRevision !== runtimeRevision || !/^[a-f0-9]{64}$/.test(identity.fingerprint))) {
    throw new Error("Safety reference identity is missing or changed in worker input");
  }
}

export function checkedReferenceCompletion<T>(reply: ReferenceJobCompletion<T>, expected: ReferenceJobIdentity): T {
  if (!reply?.referenceIdentity || catalogueRecordFingerprint(reply.referenceIdentity) !== catalogueRecordFingerprint(expected)) {
    throw new Error("Safety reference identity changed in worker result");
  }
  return reply.value;
}
