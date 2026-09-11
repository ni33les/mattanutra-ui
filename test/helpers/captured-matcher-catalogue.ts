import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { CatalogueSnapshot } from '../../lib/agentic/catalogue/types.ts';
import type { SafetyReferenceSnapshot } from '../../lib/agentic/catalogue/load-safety-ceilings.ts';

/** Captured retail inputs, never synthetic inventory relabelled as real or a live fallback. */
export function capturedMatcherCatalogue(): { snapshot: CatalogueSnapshot; references: SafetyReferenceSnapshot } {
  const root = new URL('../fixtures/mcp-evidence-images/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  const bytes = gunzipSync(readFileSync(new URL('dev-20260911.json.gz', root)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256,
    'Captured catalogue/reference inputs changed');
  return JSON.parse(bytes.toString());
}
