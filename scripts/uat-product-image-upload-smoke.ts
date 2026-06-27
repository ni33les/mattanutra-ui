import postgres from "postgres";
import sharp from "sharp";

const targetBaseUrl = (
  process.env.UAT_SITE_URL || "https://uat.mattanutra.com"
).replace(/\/+$/, "");
const productId = process.env.UAT_PRODUCT_IMAGE_SMOKE_PRODUCT_ID?.trim() ?? "";
const accessToken =
  process.env.UAT_ADMIN_DASHBOARD_TOKEN?.trim() ||
  process.env.ADMIN_DASHBOARD_TOKEN?.trim() ||
  "";
const connection =
  process.env.UAT_DB_URL?.trim() || process.env.DB_URL?.trim() || "";
const keepImage = process.argv.includes("--keep-image");
const allowRealProduct = process.argv.includes("--allow-real-product");
const retryDelaysMs = [0, 500, 1500, 3000, 5000] as const;

type ProductSnapshot = Readonly<{
  id: string;
  image_url: string | null;
  source_snapshot: unknown;
  status: string | null;
  title: string | null;
}>;

function requireValue(value: string, message: string) {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tinyPng() {
  return sharp({
    create: {
      background: { alpha: 1, b: 33, g: 99, r: 230 },
      channels: 4,
      height: 4,
      width: 4
    }
  }).png().toBuffer();
}

async function verifyPublicImageUrl(url: string) {
  let lastError = "";

  for (const [index, delayMs] of retryDelaysMs.entries()) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "image/*,*/*;q=0.8"
        }
      });
      const contentType = response.headers.get("content-type") ?? "";

      if (response.ok && contentType.toLowerCase().startsWith("image/")) {
        return {
          attempts: index + 1,
          contentType
        };
      }

      lastError = `status=${response.status} content-type=${contentType || "unknown"}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`Uploaded smoke image is not publicly readable: ${lastError}`);
}

function assertDurableImageUrl(imageUrl: string) {
  if (imageUrl.startsWith("/uploads/")) {
    throw new Error(`Upload returned non-durable local URL: ${imageUrl}`);
  }

  if (!/^https:\/\//i.test(imageUrl)) {
    throw new Error(`Upload returned non-HTTPS image URL: ${imageUrl}`);
  }
}

async function uploadSmokeImage(input: Readonly<{
  bytes: Buffer;
  productId: string;
}>) {
  const formData = new FormData();
  const fileBuffer = new ArrayBuffer(input.bytes.length);

  new Uint8Array(fileBuffer).set(input.bytes);

  formData.set(
    "file",
    new File([fileBuffer], "uat-product-image-smoke.png", {
      type: "image/png"
    })
  );
  formData.set("accessToken", accessToken);

  const response = await fetch(
    `${targetBaseUrl}/api/admin/products/${input.productId}/image/upload`,
    {
      body: formData,
      headers: {
        "x-admin-dashboard-token": accessToken
      },
      method: "POST"
    }
  );
  const text = await response.text();
  const payload = text ? JSON.parse(text) as { row?: { imageUrl?: string | null }; url?: string } : {};

  if (!response.ok) {
    throw new Error(`Upload API failed status=${response.status}: ${text}`);
  }

  const imageUrl = payload.url ?? payload.row?.imageUrl ?? "";

  if (!imageUrl) {
    throw new Error(`Upload API did not return an image URL: ${text}`);
  }

  return {
    imageUrl,
    payload
  };
}

async function main() {
  requireValue(productId, "Set UAT_PRODUCT_IMAGE_SMOKE_PRODUCT_ID to a dedicated ignored or pending test product.");
  requireValue(accessToken, "Set UAT_ADMIN_DASHBOARD_TOKEN or ADMIN_DASHBOARD_TOKEN.");
  requireValue(connection, "Set UAT_DB_URL, or DB_URL pointing at the UAT database.");

  process.env.DB_URL = connection;
  process.env.MATTANUTRA_ENV = "uat";

  const sql = postgres(connection, {
    max: 1,
    prepare: false
  });
  let previous: ProductSnapshot | null = null;
  let uploadedImageUrl: string | null = null;

  try {
    const databaseRows = await sql<Array<{ database: string }>>`
      select current_database() as database
    `;
    const databaseName = String(databaseRows[0]?.database ?? "");

    if (!/uat|mattanutra-uat/i.test(databaseName)) {
      throw new Error(`Refusing to run UAT image smoke against database ${databaseName}.`);
    }

    const productRows = await sql<Array<ProductSnapshot>>`
      select id::text, title, status, image_url, source_snapshot
      from public.products
      where id = ${productId}
      limit 1
    `;

    previous = productRows[0] ?? null;

    if (!previous) {
      throw new Error(`Smoke product ${productId} was not found.`);
    }

    const allowedStatuses = new Set(["ignored", "pending_review"]);

    if (!allowRealProduct && !allowedStatuses.has(previous.status ?? "")) {
      throw new Error(
        `Smoke product ${productId} has status ${previous.status ?? "unknown"}. Use a dedicated ignored/pending product, or pass --allow-real-product.`
      );
    }

    const upload = await uploadSmokeImage({
      bytes: await tinyPng(),
      productId
    });

    uploadedImageUrl = upload.imageUrl;
    assertDurableImageUrl(uploadedImageUrl);
    const publicRead = await verifyPublicImageUrl(uploadedImageUrl);

    const storedRows = await sql<Array<{ image_url: string | null }>>`
      select image_url
      from public.products
      where id = ${productId}
      limit 1
    `;
    const storedImageUrl = storedRows[0]?.image_url ?? null;

    if (storedImageUrl !== uploadedImageUrl) {
      throw new Error(
        `DB image_url mismatch. api=${uploadedImageUrl} db=${storedImageUrl ?? "null"}`
      );
    }

    const {
      getAdminProductDetailData,
      getAdminProductListData
    } = await import("@/lib/admin-products");
    const detailData = await getAdminProductDetailData(productId, "all");

    if (detailData?.row.imageUrl !== uploadedImageUrl) {
      throw new Error(
        `Detail read model mismatch. expected=${uploadedImageUrl} actual=${detailData?.row.imageUrl ?? "null"}`
      );
    }

    const listData = await getAdminProductListData({
      limit: 50,
      search: previous.title ?? productId
    });
    const listRow = listData.rows.find((row) => row.id === productId);

    if (listRow?.imageUrl !== uploadedImageUrl) {
      throw new Error(
        `List read model mismatch. expected=${uploadedImageUrl} actual=${listRow?.imageUrl ?? "missing"}`
      );
    }

    console.log(JSON.stringify({
      database: databaseName,
      durable: true,
      imageUrl: uploadedImageUrl,
      productId,
      publicRead,
      readModels: {
        detail: true,
        list: true
      },
      restored: !keepImage
    }, null, 2));
  } finally {
    if (previous && !keepImage) {
      await sql`
        update public.products
        set
          image_url = ${previous.image_url},
          source_snapshot = ${previous.source_snapshot == null ? null : JSON.stringify(previous.source_snapshot)}::jsonb,
          updated_at = now()
        where id = ${productId}
      `;
    }

    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
