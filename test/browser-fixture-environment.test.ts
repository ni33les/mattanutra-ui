import assert from 'node:assert/strict';
import { it } from 'node:test';
import { browserFixtureEnvironment } from '../scripts/browser-fixture-environment.mjs';

const origin = 'http://127.0.0.1:3100';
const fixtures = {
  REVEAL_VISUAL_SMOKE_URL: `${origin}/en/nutrition/reveal?plan=fixture`,
  MOBILE_UX_REVEAL_URL: `${origin}/en/nutrition/reveal?plan=fixture`,
  MOBILE_UX_CHECKOUT_URL: `${origin}/en/basket/checkout?plan=fixture`,
  MOBILE_UX_ORDER_URL: `${origin}/en/order/track/fixture`,
  ADMIN_E2E_TARGET_ORGANISATION_ID: '550e8400-e29b-41d4-a716-446655440000'
};
it('V5-BROWSER-ENV-01 passes the preprovisioned admin target with every current browser URL', () => {
  assert.deepEqual(browserFixtureEnvironment(fixtures, origin), fixtures);
});
it('V5-BROWSER-ENV-02 refuses missing or malformed admin identity instead of silently mutating the catalogue', () => {
  const oldFixtures: Record<string, unknown> = { ...fixtures };
  delete oldFixtures.ADMIN_E2E_TARGET_ORGANISATION_ID;
  assert.throws(() => browserFixtureEnvironment(oldFixtures, origin), /ADMIN_E2E_TARGET_ORGANISATION_ID/);
  assert.throws(() => browserFixtureEnvironment({ ...fixtures, ADMIN_E2E_TARGET_ORGANISATION_ID: 'another-tenant' }, origin), /ADMIN_E2E_TARGET_ORGANISATION_ID/);
});
it('V5-BROWSER-ENV-03 retains isolated-origin validation for all page fixtures', () => {
  for (const key of ['REVEAL_VISUAL_SMOKE_URL', 'MOBILE_UX_REVEAL_URL', 'MOBILE_UX_CHECKOUT_URL', 'MOBILE_UX_ORDER_URL']) {
    assert.throws(() => browserFixtureEnvironment({ ...fixtures, [key]: 'https://uat.example.test/reveal' }, origin), new RegExp(key));
  }
});
