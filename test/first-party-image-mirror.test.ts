import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sharp from "sharp";

import {
  fetchAndValidateFirstPartyImage,
  firstPartyImageStorageConfigFromEnv,
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

function imageResponse(bytes: Buffer, contentType: string | null = "image/png") {
  const body = new Uint8Array(bytes.length);
  const headers = new Headers({
    "content-length": String(bytes.length)
  });

  body.set(bytes);

  if (contentType) {
    headers.set("content-type", contentType);
  }

  return new Response(body.buffer, {
    headers,
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

function withEnv<T>(
  patch: Readonly<Record<string, string | undefined>>,
  fn: () => T
) {
  const previous = new Map<string, string | undefined>();

  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);

    if (patch[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = patch[key];
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

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

  it("accepts a missing MIME type when Sharp can decode the image", async () => {
    const bytes = await tinyPng();
    const result = await fetchAndValidateFirstPartyImage({
      fetcher: async () => imageResponse(bytes, null),
      imageUrl: "https://source.example/no-content-type"
    });

    assert.equal(result.ok, true);
    assert.equal(result.contentType, "image/png");
    assert.equal(result.extension, "png");
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

  it("keeps already-uploaded runtime image URLs without fetching or remirroring", async () => {
    const result = await mirrorImageToFirstParty({
      entityId: "product-123",
      fetcher: async () => {
        throw new Error("already-uploaded images should not be fetched");
      },
      imageUrl: "/uploads/dev/content/product.webp",
      namespace: "products",
      uploader: async () => {
        throw new Error("already-uploaded images should not be uploaded");
      }
    });

    assert.deepEqual(result, {
      metadata: null,
      mirrored: false,
      skippedReason: "first_party",
      url: "/uploads/dev/content/product.webp"
    });
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

  it("loads explicit DigitalOcean Spaces credentials from env", () => {
    const config = withEnv(
      {
        DO_SPACES_ACCESS_KEY: undefined,
        DO_SPACES_ACCESS_KEY_ID: "explicit-access",
        DO_SPACES_CDN_ENDPOINT: "https://cdn.example.com",
        DO_SPACES_ENDPOINT: "https://mattanutra.sgp1.digitaloceanspaces.com",
        DO_SPACES_KEY: undefined,
        DO_SPACES_SECRET_KEY: undefined,
        DO_SPACES_SECRET_ACCESS_KEY: "explicit-secret"
      },
      () => firstPartyImageStorageConfigFromEnv()
    );

    assert.equal(config?.accessKeyId, "explicit-access");
    assert.equal(config?.secretAccessKey, "explicit-secret");
    assert.equal(config?.bucket, "mattanutra");
    assert.equal(config?.endpoint, "https://sgp1.digitaloceanspaces.com");
    assert.equal(config?.publicBaseUrl, "https://cdn.example.com");
  });

  it("rejects malformed legacy DigitalOcean Spaces credentials", () => {
    assert.throws(
      () =>
        withEnv(
          {
            DO_SPACES_ACCESS_KEY: undefined,
            DO_SPACES_ACCESS_KEY_ID: undefined,
            DO_SPACES_CDN_ENDPOINT: "https://cdn.example.com",
            DO_SPACES_ENDPOINT: "https://mattanutra.sgp1.digitaloceanspaces.com",
            DO_SPACES_KEY: "only-one-half",
            DO_SPACES_SECRET_KEY: undefined,
            DO_SPACES_SECRET_ACCESS_KEY: undefined
          },
          () => firstPartyImageStorageConfigFromEnv()
        ),
      /DO_SPACES_KEY must include both access and secret/
    );
  });
});
