import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("first-party image backfill", () => {
  it("ships a dry-run-first migration command with DB target guards", async () => {
    const [packageJson, scriptSource, librarySource] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("scripts/mirror-first-party-images.ts", "utf8"),
      readFile("lib/first-party-image-backfill.ts", "utf8")
    ]);

    assert.match(packageJson, /images:mirror:first-party/);
    assert.match(scriptSource, /hasArg\("apply"\)/);
    assert.match(scriptSource, /assertFirstPartyImageMirrorDatabaseTarget/);
    assert.match(scriptSource, /defaultFirstPartyImageBackfillReportPath/);
    assert.match(librarySource, /public\.products/);
    assert.match(librarySource, /public\.product_imports/);
    assert.match(librarySource, /public\.blog_posts/);
    assert.match(librarySource, /public\.testimonials/);
    assert.match(librarySource, /byHost/);
    assert.match(librarySource, /dryRunCandidates/);
    assert.match(librarySource, /productImageMirror/);
    assert.match(librarySource, /productImageMirrors/);
    assert.match(librarySource, /mirrorImageToFirstParty/);
    assert.match(librarySource, /DO_SPACES_ENDPOINT/);
    assert.doesNotMatch(librarySource, /delete\s+from\s+public\./i);
  });
});
