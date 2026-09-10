import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertRecordedMcpEvidence, captureMcpTranscript, recordMcpCall, recordMcpCallSync, withRecordedMcpEvidence } from './helpers/mcp-evidence.ts';
import { normalizePublishedClientResult } from '../scripts/published-client-semantics.mjs';
import { frozenPackInput } from './helpers/frozen-pack-input.ts';

const failure = (error: unknown): { result: string; evidence: Record<string, unknown> } => ({ result: 'FAIL', evidence: { error: error instanceof Error ? error.message : String(error) } });
const success = (): { result: string; evidence: Record<string, unknown> } => ({ result: 'PASS', evidence: { originalAssertion: true } });
const endpoint = 'https://fixture.example/api/mcp';
const response = () => ({ status: 'ready', planHandle: 'opaque-plan', revision: 2,
  basket: [{ productId: 'fixed-product', servingsPerDay: 2, unitPriceMinor: 1900 }],
  coverage: [{ currentAmount: 100, deliveredAmount: 50, requestedAmount: 200, remainingGap: 50, coveragePercent: 75 }],
  options: [{ optionId: 'fixed-option', roles: ['closest_dose'], purchaseEligible: true }],
  safetyGuidance: [{ code: 'above_reference', amount: 150, referenceLimit: 100, message: 'Review this exposure with a clinician.' }],
  requirements: { maxProductCount: null as number | null }, nextActions: ['confirm_with_user'] });

async function capture(body = response()) {
  return withRecordedMcpEvidence(async () => {
    await recordMcpCall({ method: 'tools/call', params: { name: 'plan', arguments: { operation: 'create', request: { targets: [{ name: 'A', amount: 200, unit: 'mg' }] } } } }, async () => body);
    return success();
  }, failure);
}

it('MCP-TRANSCRIPT-01: complete request/response evidence is immutable and retains original assertions', async () => {
  const body = response();
  const report = await capture(body);
  const before = JSON.stringify(report);
  assert.equal(report.evidence.originalAssertion, true);
  assert.deepEqual((report.evidence.mcpTranscript as { calls: unknown[] }).calls, [{
    request: { method: 'tools/call', params: { name: 'plan', arguments: { operation: 'create', request: { targets: [{ name: 'A', amount: 200, unit: 'mg' }] } } } },
    response: body, state: 'completed'
  }]);
  body.basket[0]!.servingsPerDay = 99;
  assert.equal(JSON.stringify(report), before);
});

it('MCP-TRANSCRIPT-02: failures preserve earlier responses and the failing call', async () => {
  const report = await withRecordedMcpEvidence(async () => {
    await recordMcpCall({ operation: 'get' }, async () => ({ status: 'ready', revision: 3 }));
    await recordMcpCall({ operation: 'select', expectedRevision: 2 }, async () => { throw new Error('interrupted reply'); });
    return success();
  }, failure);
  assert.equal(report.result, 'FAIL');
  assert.equal(report.evidence.error, 'interrupted reply');
  const calls = (report.evidence.mcpTranscript as { calls: Array<Record<string, unknown>> }).calls;
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0]!.response, { status: 'ready', revision: 3 });
  assert.deepEqual(calls[1]!.error, { name: 'Error', message: 'interrupted reply' });
});

it('MCP-TRANSCRIPT-03: concurrent cases retain their own ordered calls', async () => {
  const reports = await Promise.all(['first', 'second'].map(name => withRecordedMcpEvidence(async () => {
    await Promise.resolve();
    await recordMcpCall({ name, sequence: 1 }, async () => ({ name, sequence: 1 }));
    await recordMcpCall({ name, sequence: 2 }, async () => ({ name, sequence: 2 }));
    return success();
  }, failure)));
  for (const [index, name] of ['first', 'second'].entries()) {
    const calls = (reports[index]!.evidence.mcpTranscript as { calls: Array<{ response: unknown }> }).calls;
    assert.deepEqual(calls.map(row => row.response), [{ name, sequence: 1 }, { name, sequence: 2 }]);
  }
});

it('MCP-TRANSCRIPT-04: equal PASS flags cannot conceal dose, advice, price, coverage, option or state drift', async () => {
  const baseline = await capture();
  for (const mutation of [
    (body: ReturnType<typeof response>) => { body.basket[0]!.servingsPerDay = 3; },
    (body: ReturnType<typeof response>) => { body.basket[0]!.unitPriceMinor = 1901; },
    (body: ReturnType<typeof response>) => { body.coverage[0]!.remainingGap = 51; },
    (body: ReturnType<typeof response>) => { body.coverage[0]!.currentAmount = 0; },
    (body: ReturnType<typeof response>) => { body.safetyGuidance[0]!.referenceLimit = 151; },
    (body: ReturnType<typeof response>) => { body.safetyGuidance[0]!.message = 'No concern'; },
    (body: ReturnType<typeof response>) => { body.options[0]!.optionId = 'different-option'; },
    (body: ReturnType<typeof response>) => { body.options[0]!.purchaseEligible = false; },
    (body: ReturnType<typeof response>) => { body.requirements.maxProductCount = 1; },
    (body: ReturnType<typeof response>) => { body.status = 'failed'; }
  ]) {
    const changed = response(); mutation(changed);
    const result = await capture(changed);
    assert.equal(result.result, baseline.result);
    assert.notDeepEqual(result.evidence, baseline.evidence);
  }
});

it('MCP-TRANSCRIPT-05: optional published normalization preserves business values and identity relationships', async () => {
  const raw = await capture();
  const changed = response(); changed.planHandle = 'different-generated-handle';
  const other = await capture(changed);
  assert.notDeepEqual(raw.evidence, other.evidence, 'Raw evidence retains actual generated identities');
  assert.deepEqual(normalizePublishedClientResult(raw.evidence, endpoint), normalizePublishedClientResult(other.evidence, endpoint));
  changed.basket[0]!.servingsPerDay = 3;
  assert.notDeepEqual(normalizePublishedClientResult(raw.evidence, endpoint), normalizePublishedClientResult((await capture(changed)).evidence, endpoint));
});

it('MCP-TRANSCRIPT-06: an unawaited call fails acceptance with its pending request preserved', async () => {
  let finish: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  try {
    const report = await withRecordedMcpEvidence(async () => {
      pending = recordMcpCall({ operation: 'create' }, () => new Promise<void>(resolve => { finish = resolve; }));
      return success();
    }, failure);
    assert.equal(report.result, 'FAIL');
    assert.match(String(report.evidence.error), /unfinished MCP call/);
    assert.deepEqual((report.evidence.mcpTranscript as { calls: unknown[] }).calls, [{ request: { operation: 'create' }, state: 'pending' }]);
  } finally { finish?.(); await pending; }
});

it('MCP-TRANSCRIPT-07: all maintained selective-evidence packs attach actual harness calls', () => {
  const packs = ['agentic-com-pack.test.ts', 'agentic-cv-fix-pack.test.ts'];
  for (const name of packs) {
    const source = readFileSync(new URL(name, import.meta.url), 'utf8');
    assert.match(source, /withRecordedMcpEvidence\(/, `${name} must retain per-case transcripts`);
    if (name !== 'agentic-com-pack.test.ts') assert.match(source, /import \{ (?:handleJsonRpc|handleCompletedJsonRpc as handleJsonRpc) \} from "\.\/helpers\/(?:recording-mcp-dispatcher|completed-mcp-client)\.ts"/);
  }
  const commercial = readFileSync(new URL('./helpers/com-fixtures.ts', import.meta.url), 'utf8');
  assert.match(commercial, /import \{ (?:handleJsonRpc|handleCompletedJsonRpc as handleJsonRpc) \} from "\.\/(?:recording-mcp-dispatcher|completed-mcp-client)\.ts"/);
  const fix = readFileSync(new URL('./agentic-cv-fix-pack.test.ts', import.meta.url), 'utf8');
  assert.match(fix, /import \{ completedPlanTool as planTool \} from "\.\/helpers\/completed-mcp-client\.ts"/,
    'Direct plan-service cases must capture their matching results too');
  const det = readFileSync(new URL('./agentic-det-pack.test.ts', import.meta.url), 'utf8');
  assert.match(det, /captureMcpTranscript\(/);
  assert.match(det, /import \{ completedPlanTool as planTool \} from "\.\/helpers\/completed-mcp-client\.ts"/);
  assert.match(det, /import \{ matchPlan, evaluateSafety \} from "\.\/helpers\/recording-mcp-dispatcher\.ts"/);
  assert.match(readFileSync(new URL('../scripts/mcp-matcher-pack-report.mjs', import.meta.url), 'utf8'), /matcher:canonicalDetReport/);
  const current=readFileSync(new URL('./simple-plan/documented-harness.ts',import.meta.url),'utf8');assert.match(current,/captureMcpTranscript\(/);assert.match(current,/recording-mcp-dispatcher/);
});

it('MCP-TRANSCRIPT-08: real dispatcher and direct-plan adapters capture public payloads without runtime secrets', async () => {
  const originalBuildId = process.env.AGENTIC_BUILD_ID;
  process.env.AGENTIC_BUILD_ID = '0123456789012345678901234567890123456789';
  const { beginComRun, createComRuntime, endComRun } = await import('./helpers/com-fixtures.ts');
  const { handleJsonRpc, planTool } = await import('./helpers/recording-mcp-dispatcher.ts');
  beginComRun();
  try {
    const runtime = createComRuntime();
    let listed: unknown;
    let rejected: unknown;
    const report = await withRecordedMcpEvidence(async () => {
      listed = await handleJsonRpc(runtime, { id: 1, method: 'tools/list', jsonrpc: '2.0' });
      rejected = await planTool({ config: runtime.config, now: runtime.now!, scope: runtime.scope,
        store: runtime.store, payload: { operation: 'get', planHandle: 'invalid-fixture-handle' } });
      return success();
    }, failure);
    assert.equal(report.result, 'PASS');
    const calls = (report.evidence.mcpTranscript as { calls: Array<{ request: unknown; response: unknown }> }).calls;
    assert.equal(calls.length, 2);
    assert.equal(JSON.stringify(calls[0]!.response), JSON.stringify(listed), 'Compare the complete JSON wire payload');
    assert.equal(JSON.stringify(calls[1]!.response), JSON.stringify(rejected));
    assert.deepEqual(calls[1]!.request, { method: 'plan', payload: { operation: 'get', planHandle: 'invalid-fixture-handle' } });
    assert.equal(JSON.stringify(report).includes(runtime.config.capabilitySecret), false);
  } finally {
    endComRun();
    if (originalBuildId === undefined) delete process.env.AGENTIC_BUILD_ID;
    else process.env.AGENTIC_BUILD_ID = originalBuildId;
  }
});

it('MCP-TRANSCRIPT-09: report scopes capture full synchronous matcher results and preserve partial failures', async () => {
  const completed = await captureMcpTranscript(async () => recordMcpCallSync({ method: 'matcher.matchPlan', state: { targets: [{ amount: 100 }] } }, response));
  assert.deepEqual(completed.transcript.calls[0]!.response, response());
  await assert.rejects(captureMcpTranscript(async () => {
    recordMcpCallSync({ method: 'matcher.matchPlan' }, response);
    throw new Error('pin failed');
  }), error => {
    const failure = error as Error & { mcpTranscript: { calls: unknown[] } };
    assert.equal(failure.message, 'pin failed');
    assert.equal(failure.mcpTranscript.calls.length, 1);
    return true;
  });
});

it('MCP-TRANSCRIPT-10: DET canonical reports compare complete values even when scores and selected IDs stay equal', async () => {
  const { canonicalDetReport } = await import('./agentic-det-pack.test.ts');
  const captured = await captureMcpTranscript(async () => recordMcpCallSync({ method: 'matcher.matchPlan' }, response));
  const base = { catalog: { catalogueVersion: 'fixed', productCount: 1, supplementCount: 1 }, cases: [],
    scores: { matching: 10, safety: 10, efficiency: 10 }, mcpTranscript: captured.transcript,
    efficiency: { agenticUsesWeb400: false, budgetMs: 3000, fixtureInBasket: false, freezeOk: true,
      liveMissIsEmptyRetail: true, packTimeToReady400: 3400, pinKeptOption: true, pinWithoutRematch: true, pollAfterSeconds: 3 } };
  for (const key of ['dose', 'price', 'advice']) {
    const changed = structuredClone(base);
    const body = changed.mcpTranscript.calls[0]!.response as ReturnType<typeof response>;
    if (key === 'dose') body.basket[0]!.servingsPerDay = 3;
    if (key === 'price') body.basket[0]!.unitPriceMinor = 2000;
    if (key === 'advice') body.safetyGuidance[0]!.message = 'No concern';
    assert.notEqual(canonicalDetReport(base), canonicalDetReport(changed), key);
  }
});

it('MCP-TRANSCRIPT-11: paired acceptance reuses exact captured catalogues and checks input immutability', async () => {
  const inputs: Record<string, unknown> = {};
  let loads = 0;
  const load = async () => ({ catalogueId: `observed-${++loads}`, referenceLimit: 100, prices: [1900] });
  const first = await frozenPackInput(inputs, 'det', load);
  const before = JSON.stringify(inputs);
  const second = await frozenPackInput(inputs, 'det', load);
  assert.equal(first, second);
  assert.equal(loads, 1);
  assert.equal(before, JSON.stringify(inputs));
  second.prices[0] = 1901;
  assert.notEqual(before, JSON.stringify(inputs), 'Mutating a reused fixture must invalidate the input attestation');
  const runner = readFileSync(new URL('../scripts/run-mcp-matcher-pack-twice.mjs', import.meta.url), 'utf8');
  assert.equal(runner.match(/runPackOnce\(inputs\)/g)?.length, 2);
  assert.match(runner, /!unchangedInputs/);
});

it('MCP-TRANSCRIPT-12: a paired gate rejects omitted transcripts instead of accepting identical PASS flags', async () => {
  const captured = await capture();
  assert.doesNotThrow(() => assertRecordedMcpEvidence({ cases: [captured] }, 'fixture'));
  assert.throws(() => assertRecordedMcpEvidence({ cases: [success()] }, 'fixture'), /complete MCP request\/response evidence is missing/);
  assert.throws(() => assertRecordedMcpEvidence({ cases: [captured, success()] }, 'fixture'), /evidence is missing/);
  assert.throws(() => assertRecordedMcpEvidence({ mcpTranscript: { version: 1, calls: [] } }, 'fixture'), /evidence is missing/);
});

it('MCP-TRANSCRIPT-13: paired catalogue validation detects changed prices and facts without treating the observation clock as drift', async () => {
  const { freezeKey } = await import('./agentic-det-pack.test.ts');
  const { sampleValueSnapshot } = await import('./agentic/value/sample-catalogue.ts');
  const snapshot = sampleValueSnapshot();
  assert.ok(snapshot.products.length > 0, 'The maintained catalogue must contain a real fixture precondition');
  const base = freezeKey({ snapshot, ceilings: [] });
  assert.equal(freezeKey({ snapshot: { ...snapshot, availabilityAsOf: 'different-observation-clock' }, ceilings: [] }), base);
  const changed = structuredClone(snapshot);
  const product = changed.products[0]!;
  assert.notEqual(freezeKey({ snapshot: { ...changed, products: [{ ...product, unitPriceMinor: product.unitPriceMinor + 1 }, ...changed.products.slice(1)] }, ceilings: [] }), base);
  assert.notEqual(freezeKey({ snapshot: { ...changed, products: [{ ...product, orderable: !product.orderable }, ...changed.products.slice(1)] }, ceilings: [] }), base);
});
