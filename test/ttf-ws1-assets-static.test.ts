import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { nongPoseAsset, type NongPose } from "../lib/library.ts";

type ArticleImageRow = Readonly<{
  category: string;
  featured: boolean;
  nongPose: string;
  shareImage: string;
  slug: string;
}>;

type Authoritative = Readonly<{
  articleImageMap: readonly ArticleImageRow[];
  featuredSlugs: readonly string[];
  newArticleSlugs: readonly string[];
}>;

function publicAssetExists(src: string) {
  return existsSync(new URL(`../public${src}`, import.meta.url));
}

function normalizePose(raw: string): NongPose {
  const token = raw
    .trim()
    .toLowerCase()
    .replace(/^nong[_-]/, "")
    .replaceAll("_", "-");
  return token as NongPose;
}

const authoritative = JSON.parse(
  readFileSync(new URL("../files/ttf-ws1/AUTHORITATIVE.json", import.meta.url), "utf8")
) as Authoritative;

describe("ttf ws1 asset integrity (step B)", () => {
  it("installs a share image and nong pose for every manifest article", () => {
    assert.equal(authoritative.articleImageMap.length, 35);

    const problems: string[] = [];

    for (const row of authoritative.articleImageMap) {
      if (!publicAssetExists(row.shareImage)) {
        problems.push(`${row.slug}: missing share ${row.shareImage}`);
      }

      const pose = normalizePose(row.nongPose);
      const poseSrc = nongPoseAsset(pose);
      if (!publicAssetExists(poseSrc)) {
        problems.push(`${row.slug}: missing pose ${poseSrc} (from ${row.nongPose})`);
      }
    }

    assert.deepEqual(problems, []);
  });

  it("keeps shareImage paths unique per slug and never invents slug-derived names", () => {
    const bySlug = new Map(
      authoritative.articleImageMap.map((row) => [row.slug, row.shareImage])
    );

    // Known non-obvious mappings from the hand-off inventory.
    assert.equal(
      bySlug.get("vitamin-d-in-thailand"),
      "/assets/library/share/share-vitamin-d-thailand.jpg"
    );
    assert.equal(
      bySlug.get("magnesium-for-sleep"),
      "/assets/library/share/share-magnesium-sleep.jpg"
    );
    assert.equal(
      bySlug.get("zinc-supplements-helpful-or-overused"),
      "/assets/library/share/share-zinc-helpful-overused.jpg"
    );
  });

  it("covers the five new article image pairs", () => {
    const bySlug = new Map(
      authoritative.articleImageMap.map((row) => [row.slug, row])
    );

    for (const slug of authoritative.newArticleSlugs) {
      const row = bySlug.get(slug);
      assert.ok(row, slug);
      assert.ok(publicAssetExists(row!.shareImage), row!.shareImage);
      assert.ok(
        publicAssetExists(nongPoseAsset(normalizePose(row!.nongPose))),
        row!.nongPose
      );
    }
  });

  it("lists the curated featured triple", () => {
    assert.deepEqual(authoritative.featuredSlugs, [
      "which-supplements-should-you-take",
      "sleep-support-without-sleeping-pills",
      "vitamin-d-in-thailand"
    ]);
  });
});
