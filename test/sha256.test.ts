import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it, mock } from "node:test";
const portable = await import('@noble/hashes/sha2');
let portableCalls = 0;
mock.module('@noble/hashes/sha2', { namedExports: { ...portable, sha256: (...args: Parameters<typeof portable.sha256>) => { portableCalls++; return portable.sha256(...args); } } });
const { sha256Hex } = await import('../lib/sha256.ts');
const vectors = [
  ["empty", ""],
  ["ASCII option identity", "product-a@1|product-b@3"],
  ["non-ASCII and surrogate encoding", "สุขภาพ 健康 💊 café e\u0301 \ud800"],
  ["stable long canonical input", JSON.stringify(Array.from({ length: 4096 }, (_, index) => ({ id: `product-${index}`, dose: index / 3, label: "แมกนีเซียม 镁" })))]
];

describe("browser and server SHA-256 identity parity", () => {
  for (const [name, value] of vectors) {
    it(`matches Node crypto for ${name}`, () => {
      assert.equal(sha256Hex(value), createHash("sha256").update(value, "utf8").digest("hex"));
    });
  }
  it('PERF-CPU-37 server hashing avoids the portable byte-copy and JavaScript compression loop', () => {
    portableCalls = 0;
    assert.equal(sha256Hex(vectors[3][1]), createHash('sha256').update(vectors[3][1]).digest('hex'));
    assert.equal(portableCalls, 0, 'Node has a native synchronous SHA-256 implementation');
  });
  it('PERF-CPU-38 a browser without Node builtins retains all UTF-8 identity vectors', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'getBuiltinModule'); assert.ok(descriptor);
    let browser: typeof import('../lib/sha256.ts');
    try {
      Object.defineProperty(process, 'getBuiltinModule', { ...descriptor, value: undefined });
      browser = await import(new URL('../lib/sha256.ts?browser-parity', import.meta.url).href);
    } finally { Object.defineProperty(process, 'getBuiltinModule', descriptor); }
    portableCalls = 0;
    for (const [, value] of vectors) assert.equal(browser.sha256Hex(value), createHash('sha256').update(value, 'utf8').digest('hex'));
    assert.equal(portableCalls, vectors.length, 'Browser execution must still use the portable implementation');
  });
});
