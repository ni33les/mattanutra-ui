import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sharp from "sharp";

import {
  adminProductImageStorageDiagnostics,
  AdminProductImageError,
  localProductImageFallbackAllowed,
  persistVerifiedAdminProductImageUrl,
  uploadAdminProductImage,
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

  it("keeps local upload fallback limited to non-production environments", () => {
    assert.equal(localProductImageFallbackAllowed("dev", "development"), true);
    assert.equal(localProductImageFallbackAllowed("dev", "production"), false);
    assert.equal(localProductImageFallbackAllowed("uat", "production"), false);
    assert.equal(localProductImageFallbackAllowed("prd", "production"), false);
    assert.equal(localProductImageFallbackAllowed("production", "production"), false);
  });

  it("rejects non-durable local upload URLs outside local development", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previousMattaNutraEnv = env.MATTANUTRA_ENV;
    const previousNodeEnv = env.NODE_ENV;

    env.MATTANUTRA_ENV = "uat";
    env.NODE_ENV = "production";

    try {
      await assert.rejects(
        () =>
          persistVerifiedAdminProductImageUrl({
            changeNote: "test",
            imageUrl: "/uploads/uat/products/product-123/image.png",
            productId: "00000000-0000-4000-8000-000000000001",
            source: "upload",
            storage: "local",
          }),
        (error: unknown) => {
          assert.equal(error instanceof AdminProductImageError, true);
          assert.equal((error as AdminProductImageError).code, "non_durable_image_url");
          assert.equal((error as AdminProductImageError).status, 400);

          return true;
        },
      );
    } finally {
      if (previousMattaNutraEnv === undefined) {
        delete env.MATTANUTRA_ENV;
      } else {
        env.MATTANUTRA_ENV = previousMattaNutraEnv;
      }

      if (previousNodeEnv === undefined) {
        delete env.NODE_ENV;
      } else {
        env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("surfaces malformed Spaces credentials as a storage configuration error", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previousEnv = new Map<string, string | undefined>();

    for (const key of [
      "DO_SPACES_ACCESS_KEY",
      "DO_SPACES_ACCESS_KEY_ID",
      "DO_SPACES_CDN_ENDPOINT",
      "DO_SPACES_ENDPOINT",
      "DO_SPACES_KEY",
      "DO_SPACES_KEY_ID",
      "DO_SPACES_SECRET_ACCESS_KEY",
      "DO_SPACES_SECRET_KEY",
      "MATTANUTRA_ENV",
      "NODE_ENV",
    ]) {
      previousEnv.set(key, env[key]);
    }

    delete env.DO_SPACES_ACCESS_KEY;
    delete env.DO_SPACES_ACCESS_KEY_ID;
    env.DO_SPACES_CDN_ENDPOINT = "https://cdn.example.com";
    env.DO_SPACES_ENDPOINT = "https://mattanutra.sgp1.digitaloceanspaces.com";
    env.DO_SPACES_KEY = "only-one-half";
    delete env.DO_SPACES_KEY_ID;
    delete env.DO_SPACES_SECRET_ACCESS_KEY;
    delete env.DO_SPACES_SECRET_KEY;
    env.MATTANUTRA_ENV = "uat";
    env.NODE_ENV = "production";

    try {
      await assert.rejects(
        async () =>
          uploadAdminProductImage({
            bytes: await tinyPng(),
            contentType: "image/png",
            originalFileName: "product.png",
            productId: "00000000-0000-4000-8000-000000000001",
          }),
        (error: unknown) => {
          assert.equal(error instanceof AdminProductImageError, true);
          assert.equal(
            (error as AdminProductImageError).code,
            "image_storage_credentials_invalid",
          );
          assert.match(
            (error as AdminProductImageError).message,
            /storage credentials are invalid/i,
          );

          return true;
        },
      );
    } finally {
      for (const [key, value] of previousEnv) {
        if (value === undefined) {
          delete env[key];
        } else {
          env[key] = value;
        }
      }
    }
  });

  it("reports storage diagnostics without exposing credential values", () => {
    const env = process.env as Record<string, string | undefined>;
    const previousEnv = new Map<string, string | undefined>();

    for (const key of [
      "DO_SPACES_ACCESS_KEY",
      "DO_SPACES_ACCESS_KEY_ID",
      "DO_SPACES_CDN_ENDPOINT",
      "DO_SPACES_ENDPOINT",
      "DO_SPACES_KEY",
      "DO_SPACES_KEY_ID",
      "DO_SPACES_SECRET_ACCESS_KEY",
      "DO_SPACES_SECRET_KEY",
      "MATTANUTRA_ENV",
      "NODE_ENV",
    ]) {
      previousEnv.set(key, env[key]);
    }

    env.DO_SPACES_ACCESS_KEY_ID = "access-value";
    env.DO_SPACES_CDN_ENDPOINT = "https://cdn.example.com";
    env.DO_SPACES_ENDPOINT = "https://mattanutra.sgp1.digitaloceanspaces.com";
    delete env.DO_SPACES_KEY;
    delete env.DO_SPACES_KEY_ID;
    delete env.DO_SPACES_SECRET_ACCESS_KEY;
    delete env.DO_SPACES_SECRET_KEY;
    env.MATTANUTRA_ENV = "uat";
    env.NODE_ENV = "production";

    try {
      const diagnostics = adminProductImageStorageDiagnostics();
      const text = JSON.stringify(diagnostics);

      assert.equal(diagnostics.readiness, "malformed");
      assert.equal(diagnostics.credentialMode, "partial_explicit");
      assert.match(text, /DO_SPACES_ACCESS_KEY_ID/);
      assert.doesNotMatch(text, /access-value/);
    } finally {
      for (const [key, value] of previousEnv) {
        if (value === undefined) {
          delete env[key];
        } else {
          env[key] = value;
        }
      }
    }
  });

  it("reports DigitalOcean key id plus key credentials as explicit without exposing values", () => {
    const env = process.env as Record<string, string | undefined>;
    const previousEnv = new Map<string, string | undefined>();

    for (const key of [
      "DO_SPACES_ACCESS_KEY",
      "DO_SPACES_ACCESS_KEY_ID",
      "DO_SPACES_CDN_ENDPOINT",
      "DO_SPACES_ENDPOINT",
      "DO_SPACES_KEY",
      "DO_SPACES_KEY_ID",
      "DO_SPACES_SECRET_ACCESS_KEY",
      "DO_SPACES_SECRET_KEY",
      "MATTANUTRA_ENV",
      "NODE_ENV",
    ]) {
      previousEnv.set(key, env[key]);
    }

    delete env.DO_SPACES_ACCESS_KEY;
    delete env.DO_SPACES_ACCESS_KEY_ID;
    env.DO_SPACES_CDN_ENDPOINT = "https://cdn.example.com";
    env.DO_SPACES_ENDPOINT = "https://mattanutra.sgp1.digitaloceanspaces.com";
    env.DO_SPACES_KEY = "secret-value";
    env.DO_SPACES_KEY_ID = "access-value";
    delete env.DO_SPACES_SECRET_ACCESS_KEY;
    delete env.DO_SPACES_SECRET_KEY;
    env.MATTANUTRA_ENV = "uat";
    env.NODE_ENV = "production";

    try {
      const diagnostics = adminProductImageStorageDiagnostics();
      const text = JSON.stringify(diagnostics);

      assert.equal(diagnostics.readiness, "configured");
      assert.equal(diagnostics.credentialMode, "explicit");
      assert.match(text, /DO_SPACES_KEY_ID/);
      assert.doesNotMatch(text, /access-value/);
      assert.doesNotMatch(text, /secret-value/);
    } finally {
      for (const [key, value] of previousEnv) {
        if (value === undefined) {
          delete env[key];
        } else {
          env[key] = value;
        }
      }
    }
  });
});
