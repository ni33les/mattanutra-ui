import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const hygiene = JSON.parse(
  readFileSync(new URL("./agentic/det-v3/pack-hygiene.json", import.meta.url), "utf8")
) as {
  checksPerRun: number;
  journeysPerRun: number;
  clock: string;
  retryPolicy: string;
  hashes: Record<string, string>;
};

describe("v3.0 pack hygiene lock", () => {
  it("HYGIENE-01 locked hashes and inventory stay pinned", () => {
    assert.equal(hygiene.checksPerRun, 54);
    assert.equal(hygiene.journeysPerRun, 7);
    assert.equal(hygiene.clock, "2026-09-02T00:00:00.000Z");
    assert.equal(hygiene.retryPolicy, "none");
    assert.equal(
      hygiene.hashes.qaPackV3,
      "76e7b2763f75a9c1418fe8651b26ad81bc71d1de9fd4c2a6b6f6800d4435b2f8"
    );
    assert.equal(
      hygiene.hashes.acceptanceRunner,
      "4e88c9bef7c80ea9e9bd38599c9eb4d90367659b185526d54b03689ee14a1320"
    );
    assert.equal(
      hygiene.hashes.lockEntry,
      "d8d0ad9f2e0d3ad64176a52041ec9671f4c341cfdf49180ad3da8f6292f92eee"
    );
  });
});
