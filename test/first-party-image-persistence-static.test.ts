import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("first-party image persistence wiring", () => {
  it("mirrors external image URLs before storing product, import, and content render fields", async () => {
    const [
      productWrites,
      adminProducts,
      productImports,
      blog,
      diagnosticsRoute
    ] = await Promise.all([
      readFile("lib/admin-product-writes.ts", "utf8"),
      readFile("lib/admin-products.ts", "utf8"),
      readFile("lib/admin-product-imports.ts", "utf8"),
      readFile("lib/blog.ts", "utf8"),
      readFile("app/api/admin/products/diagnostics/route.ts", "utf8")
    ]);

    assert.match(productWrites, /mirrorImageToFirstParty/);
    assert.match(productWrites, /products\.image_url/);
    assert.match(productWrites, /productImageMirror/);
    assert.match(productWrites, /source_snapshot/);

    assert.match(adminProducts, /mirrorImageUrlListToFirstParty/);
    assert.match(adminProducts, /product_imports\.image_urls/);
    assert.match(adminProducts, /productImageMirrors/);
    assert.match(productImports, /mirrorImageUrlListToFirstParty/);
    assert.match(productImports, /product_imports\.image_urls/);

    assert.match(blog, /mirrorBlogPostImages/);
    assert.match(blog, /blog_posts\.image_url/);
    assert.match(blog, /blog_posts\.social_image_url/);
    assert.match(blog, /testimonials\.author_image_url/);
    assert.match(blog, /imageMirrors/);

    assert.match(diagnosticsRoute, /externalProductImageUrlCount/);
    assert.match(diagnosticsRoute, /FIRST_PARTY_IMAGE_SQL_REGEX/);
  });
});
