import { randomUUID } from 'node:crypto';
import { createInitialState, getDefinition } from '../../lib/questionnaire/engine';
import { expect, test } from '../helpers/offline-browser';

for (const locale of ['en', 'th', 'zh-CN'] as const) for (const pharmacy of [false, true]) {
  test(`WEB-PREF-BROWSER ${locale} ${pharmacy ? 'pharmacy' : 'ordinary'} resumes past removed preferences and captures unspecified values`, async ({ page }) => {
    const state = createInitialState({ locale, channel: 'web', sessionId: randomUUID() });
    const definition = getDefinition(state);
    const old = { ...state, phase: 'active', turnIndex: definition.turns.findIndex(turn => turn.k === 'budget'),
      answers: { firstName: 'Maya', meds: 'yes', medTypes: ['statin'], budget: 'u1000', maxPills: '1-3', form: 'capsules' } };
    await page.addInitScript(({ state }) => localStorage.setItem(`mn-questionnaire:v1:${state.sessionId}`, JSON.stringify({ version: 1, state, revision: 0,
      captured: null, contactEmail: null, paymentId: null, updatedAt: Date.now() })), { state: old });
    // Capture is inspected at the actual browser transport boundary; persistence
    // and task generation are exercised separately in isolated PostgreSQL.
    await page.route('**/api/assessment', route => route.fulfill({ status: 503, json: { message: 'Controlled capture barrier' } }));
    const path = pharmacy ? '/retail/matcher-v5-isolated-fixture-retailer/quiz' : '/nutrition/quiz';
    await page.goto(`/${locale}${path}?session=${state.sessionId}`);
    await page.getByRole('button', { name: definition.ui.resumeYes, exact: true }).click();
    await expect(page.getByTestId('question-answers')).toBeVisible();
    await page.getByTestId('review-answers-btn').click();
    for (const key of ['budget', 'maxPills', 'form']) await expect(page.locator(`[data-turn-key="${key}"]`)).toHaveCount(0);
    await page.getByTestId('review-answers-btn').click();
    const captured = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/assessment');
    await page.getByTestId('dev-fill-questionnaire').click();
    const body = (await captured).postDataJSON();
    expect(body.answers.budget).toBe(''); expect(body.answers.maxPills).toBe(''); expect(body.answers.form).toBe('');
    expect(body.answers.firstName).toBe('Maya'); expect(body.answers.medTypes).toEqual(['statin']);
    expect(body.pharmacyId).toBe(pharmacy ? 'matcher-v5-isolated-fixture-retailer' : undefined);
    expect(body.answers.inputProvenance.knownFields).not.toContain('budget');
  });
}
