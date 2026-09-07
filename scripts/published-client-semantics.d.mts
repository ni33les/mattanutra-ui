export const CLIENT_NORMALIZATION: Readonly<{
  discarded: readonly string[];
  opaqueIdentityFields: readonly string[];
  eventIdentities: string;
  identityMapping: string;
  jsonText: string;
  clockFields: readonly string[];
  checkoutUrls: string;
  preserved: string;
}>;
export function normalizePublishedClientResult(input: unknown, endpoint: string | URL): unknown;
