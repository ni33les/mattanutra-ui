import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { significantCvEvidence } from './impl-evidence.ts';
import { recordMcpCall, withRecordedMcpEvidence } from '../../helpers/mcp-evidence.ts';

const failure = (error: unknown): { result: string; evidence: Record<string, unknown> } => ({ result: 'FAIL', evidence: { error: String(error) } });
const response = (dose: number) => ({ planHandle: 'generated-plan', revision: 1,
  basket: [{ productId: 'fixed-product', servingsPerDay: dose, unitPriceMinor: 1900 }],
  advice: [{ code: 'above_reference_limit', amount: dose * 100, referenceLimit: 100 }] });

it('CV-TRANSCRIPT-01: every response affects replay even when a multi-call case retains only hash-count evidence', async () => {
  const run = (dose: number) => withRecordedMcpEvidence(async () => {
    await recordMcpCall({ operation: 'create', idempotencyKey: 'generated-first' }, async () => response(1));
    await recordMcpCall({ operation: 'create', idempotencyKey: 'generated-second' }, async () => response(dose));
    return { result: 'PASS', evidence: { acceptance: { response: { size: 1 } }, assertions: [{ id: 'unique', pass: true }] } };
  }, failure);
  const first = await run(2), second = await run(3);
  assert.deepEqual(first.evidence.acceptance, second.evidence.acceptance);
  assert.equal(first.result, second.result);
  assert.notDeepEqual(significantCvEvidence(first.evidence), significantCvEvidence(second.evidence));
});

it('CV-TRANSCRIPT-02: the actual shared value harness records every public plan request and response', async () => {
  const { callPlan, closeSession, openSession } = await import('./impl-harness.ts');
  const { sampleValueSnapshot } = await import('./sample-catalogue.ts');
  const { catalogueSnapshotId } = await import('../../../lib/agentic/catalogue/freeze.ts');
  const snapshot = sampleValueSnapshot();
  const session = openSession({ snapshot, countryCode: 'TH', currency: 'THB', productCount: snapshot.products.length,
    supplementCount: snapshot.supplements.length, catalogueVersion: snapshot.catalogueVersion,
    candidateSetHash: 'fixed-candidates', fingerprint: catalogueSnapshotId(snapshot), buildId: 'fixture-build', retailerId: 'fixture-retailer' });
  try {
    const responses: unknown[] = [];
    const payloads = [{ operation: 'get', planHandle: 'invalid-first' }, { operation: 'get', planHandle: 'invalid-second' }];
    const result = await withRecordedMcpEvidence(async () => {
      for (const payload of payloads) responses.push(await callPlan(session, payload));
      return { result: 'PASS', evidence: { count: responses.length } };
    }, failure);
    assert.equal(result.result, 'PASS');
    const transcript = result.evidence.mcpTranscript as { calls: Array<{ request: unknown; response: unknown }> };
    assert.equal(transcript.calls.length, 2);
    assert.deepEqual(transcript.calls.map(row => row.request), payloads.map(payload => ({ method: 'plan', payload })));
    assert.deepEqual(transcript.calls.map(row => row.response), responses);
    assert.equal(JSON.stringify(result).includes(session.config.capabilitySecret), false);
  } finally { closeSession(); }
});

it('CV-TRANSCRIPT-03: all value packs retain per-case calls including nested full matcher reports', () => {
  for (const file of ['agentic-cv-impl-pack.test.ts', 'agentic-cv-r2-pack.test.ts', 'agentic-cv-r3-pack.test.ts', 'agentic-cv-r4-pack.test.ts']) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(source, /withRecordedMcpEvidence\(work/, file);
    if (file.includes('-impl-') || file.includes('-r2-')) {
      assert.match(source, /import \{ handleJsonRpc \} from "\.\/helpers\/recording-mcp-dispatcher\.ts"/, file);
      assert.match(source, /envelopeFor\(session, \{ det: true \}, report, assertions, runIndex\)/, `${file}: nested DET must retain complete results`);
    }
  }
});

it('CV-TRANSCRIPT-04: transcript normalization preserves generated identity relationships and every business value', () => {
  const transcript = (handle: string, dose = 2) => ({ mcpTranscript: { version: 1, calls: [
    { request: { operation: 'create' }, response: { ...response(dose), planHandle: handle }, state: 'completed' },
    { request: { operation: 'get', planHandle: handle }, response: { ...response(dose), planHandle: handle }, state: 'completed' }
  ] } });
  const first = transcript('first-generated-handle');
  assert.deepEqual(significantCvEvidence(first), significantCvEvidence(transcript('second-generated-handle')));
  assert.notDeepEqual(significantCvEvidence(first), significantCvEvidence(transcript('second-generated-handle', 3)));
  const broken = transcript('second-generated-handle'); broken.mcpTranscript.calls[1]!.request.planHandle = 'unrelated-handle';
  assert.notDeepEqual(significantCvEvidence(first), significantCvEvidence(broken));
});
