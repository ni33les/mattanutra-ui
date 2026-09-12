import assert from 'node:assert/strict';
import { frozenMatchingInput } from './refinement-input.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { Session } from 'node:inspector/promises';
import { createResidentPlanSession, advanceResidentPlanSession } from '../../lib/agentic/plan/matching.ts';
import { setMatcherSafetyCeilings, setMatcherSafetyCeilingsUnavailable } from '../../lib/matcher/safety-ceilings.ts';
const [inputPath, outputPath, profileFlag] = process.argv.slice(2);
assert.ok(inputPath?.startsWith('/') && outputPath?.startsWith('/') && relative(process.cwd(), resolve(outputPath)).startsWith('..'));
const raw = readFileSync(inputPath), frozen = frozenMatchingInput(JSON.parse(raw.toString()));
assert.ok(frozen.state && frozen.snapshot && frozen.references, 'Frozen request, catalogue and reference inputs required');
setMatcherSafetyCeilings(frozen.references.ceilings, frozen.references.identity);
if (frozen.references.unavailable) setMatcherSafetyCeilingsUnavailable();
const profiler = profileFlag === '--profile' ? new Session() : null;
if (profiler) { profiler.connect(); await profiler.post('Profiler.enable'); await profiler.post('Profiler.start'); }
const start = performance.now(), cpu = process.cpuUsage();
// A fresh resident session performs the complete search, bypassing completed-result caches.
const session = createResidentPlanSession(frozen), initializationMs = performance.now() - start;
const chunks = []; let result;
do {
  const t = performance.now(); result = advanceResidentPlanSession(session, { chunkBudget: 4000 });
  chunks.push({ durationMs: performance.now() - t, attempts: result.expansionAttempts, checkpointBytes: result.checkpoint.cursor.byteLength });
  assert.ok(chunks.length <= 17, 'Unexpected extra continuation');
} while (!result.done);
assert.equal(result.expansionAttempts, frozen.state.searchEffort === 'expanded' ? 64000 : 8000, 'Incomplete frozen search budget');
assert.ok(result.result); const durationMs = performance.now() - start, usage = process.cpuUsage(cpu);
let profile;
if (profiler) { profile = (await profiler.post('Profiler.stop')).profile; profiler.disconnect(); }
const semantic = JSON.stringify(result.result), sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
writeFileSync(outputPath, JSON.stringify({ purpose: 'Uncached kernel diagnostic; not native request-to-publication release attestation',
  name: frozen.name, fixtureSha256: sha(raw), completedCacheHit: false, durationMs, initializationMs, cpuMs: (usage.user + usage.system) / 1000,
  chunks, resultSha256: sha(semantic), result: result.result, ...(profile ? { profile } : {}) }, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ name: frozen.name, durationMs, initializationMs, chunks, resultSha256: sha(semantic) }));
