import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sharp from "sharp";

import {
  AdminProductImageError,
  localProductImageFallbackAllowed,
  verifyProductImageUrl,
} from "@/lib/admin-product-images";
import { storeFirstPartyImageBytes } from "@/lib/first-party-image-mirror";

async function tinyPng() {
  return sharp({
    create: {
      background: { alpha: 1, b: 255, g: 0, r: 0 },
      channels: 4,
      height: 3,
      width: 2,
    },
  }).png().toBuffer();
}

function imageResponse(bytes: Buffer) {
  const body = new Uint8Array(bytes.length);

  body.set(bytes);

  return new Response(body.buffer, {
    headers: {
      "content-length": String(bytes.length),
      "content-type": "image/png",
    },
    status: 200,
  });
}

describe("admin product images", () => {
  it("stores uploaded bytes under the product namespace", async () => {
    const bytes = await tinyPng();
    const uploadedKeys: string[] = [];
    const result = await storeFirstPartyImageBytes({
      bytes,
      config: {
        accessKeyId: "access",
        bucket: "mattanutra",
        endpoint: "https://sgp1.digitaloceanspaces.com",
        publicBaseUrl: "https://mattanutra.sgp1.cdn.digitaloceanspaces.com",
        region: "sgp1",
        secretAccessKey: "secret",
      },
      contentType: "image/png",
      entityId: "product-123",
      environment: "uat",
      namespace: "products",
      originalUrl: "upload:apigenin.png",
      source: "admin_product_image_upload",
      uploader: async (input) => {
        uploadedKeys.push(input.key);

        return {
          key: input.key,
          url: `https://mattanutra.sgp1.cdn.digitaloceanspaces.com/${input.key}`,
        };
      },
    });

    assert.equal(uploadedKeys.length, 1);
    assert.match(
      uploadedKeys[0] ?? "",
      /^uat\/products\/product-123\/[a-f0-9]{64}\.png$/,
    );
    assert.equal(result.storage, "cloud");
    assert.equal(result.metadata.originalUrl, "upload:apigenin.png");
    assert.equal(result.metadata.source, "admin_product_image_upload");
  });

  it("retries verification while a stored image becomes publicly readable", async () => {
    const bytes = await tinyPng();
    let calls = 0;
    const result = await verifyProductImageUrl({
      fetcher: async () => {
        calls += 1;

        return calls === 1
          ? new Response("not yet", { status: 404 })
          : imageResponse(bytes);
      },
      imageUrl:
        "https://mattanutra.sgp1.cdn.digitaloceanspaces.com/uat/products/product-123/image.png",
      retryDelaysMs: [0, 0],
    });

    assert.equal(calls, 2);
    assert.equal(result.contentType, "image/png");
    assert.equal(result.width, 2);
    assert.equal(result.height, 3);
  });

  it("fails verification without overwriting the product when the stored URL is blocked", async () => {
    await assert.rejects(
      () =>
        verifyProductImageUrl({
          fetcher: async () => new Response("blocked", { status: 403 }),
          imageUrl:
            "https://mattanutra.sgp1.cdn.digitaloceanspaces.com/uat/products/product-123/image.png",
          retryDelaysMs: [0],
        }),
      (error: unknown) => {
        assert.equal(error instanceof AdminProductImageError, true);
        assert.equal((error as AdminProductImageError).code, "image_url_not_readable");
        assert.equal((error as AdminProductImageError).status, 502);

        return true;
      },
    );
  });

  it("keeps local upload fallback out of UAT and production", () => {
    assert.equal(localProductImageFallbackAllowed("dev", "development"), true);
    assert.equal(localProductImageFallbackAllowed("uat", "development"), false);
    assert.equal(localProductImageFallbackAllowed("dev", "production"), false);
  });
});
