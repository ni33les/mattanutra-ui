import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { sha256Hex } from "../lib/sha256.ts";

describe("browser and server SHA-256 identity parity", () => {
  for (const [name, value] of [
    ["empty", ""],
    ["ASCII option identity", "product-a@1|product-b@3"],
    ["non-ASCII and surrogate encoding", "สุขภาพ 健康 💊 café e\u0301 \ud800"],
    ["stable long canonical input", JSON.stringify(Array.from({ length: 4096 }, (_, index) => ({ id: `product-${index}`, dose: index / 3, label: "แมกนีเซียม 镁" })))]
  ]) {
    it(`matches Node crypto for ${name}`, () => {
      assert.equal(sha256Hex(value), createHash("sha256").update(value, "utf8").digest("hex"));
    });
  }
});
