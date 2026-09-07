/** Shared fixture projection for the full suite and the final release gate. */
export function browserFixtureEnvironment(fixtures, origin) {
  const result = {};
  for (const key of ['REVEAL_VISUAL_SMOKE_URL', 'MOBILE_UX_REVEAL_URL', 'MOBILE_UX_CHECKOUT_URL', 'MOBILE_UX_ORDER_URL']) {
    try {
      if (typeof fixtures[key] !== 'string' || new URL(fixtures[key]).origin !== origin) throw new Error();
    } catch { throw new Error(`Invalid isolated browser fixture ${key}`); }
    result[key] = fixtures[key];
  }
  const key = 'ADMIN_E2E_TARGET_ORGANISATION_ID';
  if (typeof fixtures[key] !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fixtures[key])) {
    throw new Error(`Invalid isolated browser fixture ${key}`);
  }
  result[key] = fixtures[key];
  return result;
}
