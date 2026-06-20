import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sharp from "sharp";

import {
  fetchAndValidateFirstPartyImage,
  firstPartyImageStorageKey,
  mirrorImageToFirstParty,
  type FirstPartyImageStorageConfig
} from "@/lib/first-party-image-mirror";
import { isFirstPartyImageUrl } from "@/lib/first-party-image-rules";

async function tinyPng() {
  return sharp({
    create: {
      background: { alpha: 1, b: 0, g: 0, r: 255 },
      channels: 4,
      height: 3,
      width: 2
    }
  }).png().toBuffer();
}

function imageResponse(bytes: Buffer, contentType = "image/png") {
  const body = new Uint8Array(bytes.length);

  body.set(bytes);

  return new Response(body.buffer, {
    headers: {
      "content-length": String(bytes.length),
      "content-type": contentType
    },
    status: 200
  });
}

const fakeSpacesConfig: FirstPartyImageStorageConfig = {
  accessKeyId: "access",
  bucket: "mattanutra",
  endpoint: "https://sgp1.digitaloceanspaces.com",
  publicBaseUrl: "https://mattanutra.sgp1.cdn.digitaloceanspaces.com",
  region: "sgp1",
  secretAccessKey: "secret"
};

describe("first-party image mirroring", () => {
  it("validates a real image with dimensions, hash, and content type", async () => {
    const bytes = await tinyPng();
    const result = await fetchAndValidateFirstPartyImage({
      fetcher: async () => imageResponse(bytes),
      imageUrl: "https://source.example/product.png"
    });

    assert.equal(result.ok, true);
    assert.equal(result.contentType, "image/png");
    assert.equal(result.extension, "png");
    assert.equal(result.height, 3);
    assert.equal(result.width, 2);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
  });

  it("rejects oversized images before downloading when content-length is too large", async () => {
    const result = await fetchAndValidateFirstPartyImage({
      fetcher: async () =>
        new Response(Buffer.from("too big"), {
          headers: {
            "content-length": "9999",
            "content-type": "image/png"
          },
          status: 200
        }),
      imageUrl: "https://source.example/large.png",
      maxBytes: 10
    });

    assert.deepEqual(result, {
      detail: "Image is too large: 9999 bytes.",
      ok: false,
      reason: "image_too_large"
    });
  });

  it("rejects invalid MIME types", async () => {
    const result = await fetchAndValidateFirstPartyImage({
      fetcher: async () =>
        new Response("<html></html>", {
          headers: { "content-type": "text/html" },
          status: 200
        }),
      imageUrl: "https://source.example/not-image"
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_mime");
  });

  it("rejects bytes that Sharp cannot decode", async () => {
    const result = await fetchAndValidateFirstPartyImage({
      fetcher: async () => imageResponse(Buffer.from("not an image")),
      imageUrl: "https://source.example/broken.png"
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "decode_failed");
  });

  it("times out slow image fetches", async () => {
    const result = await fetchAndValidateFirstPartyImage({
      fetcher: async (_url, init) =>
        new Promise((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
          setTimeout(() => resolve(imageResponse(Buffer.from("late"))), 100);
        }),
      imageUrl: "https://source.example/slow.png",
      timeoutMs: 1
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "fetch_failed");
  });

  it("stores duplicate image bytes under the same deterministic key", async () => {
    const bytes = await tinyPng();
    const uploadedKeys: string[] = [];
    const upload = async (input: { key: string }) => {
      uploadedKeys.push(input.key);

      return {
        key: input.key,
        url: `${fakeSpacesConfig.publicBaseUrl}/${input.key}`
      };
    };
    const input = {
      config: fakeSpacesConfig,
      entityId: "product-123",
      environment: "prd",
      fetcher: async () => imageResponse(bytes),
      imageUrl: "https://source.example/product.png",
      namespace: "products",
      uploader: upload
    } as const;
    const first = await mirrorImageToFirstParty(input);
    const second = await mirrorImageToFirstParty(input);

    assert.equal(first.mirrored, true);
    assert.equal(second.mirrored, true);
    assert.equal(uploadedKeys.length, 2);
    assert.equal(uploadedKeys[0], uploadedKeys[1]);
    assert.match(uploadedKeys[0] ?? "", /^prd\/products\/product-123\/[a-f0-9]{64}\.png$/);
    assert.equal(first.url, second.url);
    assert.equal(first.metadata?.originalUrl, "https://source.example/product.png");
    assert.equal(isFirstPartyImageUrl(first.url), true);
  });

  it("builds environment-scoped Spaces keys", () => {
    const key = firstPartyImageStorageKey({
      entityId: "abc 123",
      environment: "uat",
      extension: "webp",
      namespace: "product imports",
      sha256: "a".repeat(64)
    });

    assert.equal(
      key,
      `uat/product-imports/abc-123/${"a".repeat(64)}.webp`
    );
  });
});
