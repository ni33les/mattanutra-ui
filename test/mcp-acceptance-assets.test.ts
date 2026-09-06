import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/verify-mcp-acceptance-assets.py", import.meta.url));
const fixture = "synthetic verifier fixture; not official acceptance evidence\n";
const digest = createHash("sha256").update(fixture).digest("hex");
const invoke = `
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('asset_verifier', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
payload = json.load(sys.stdin)
print(json.dumps(module.verify_asset_directory(Path(payload['directory']), Path(payload['directory']), payload['manifest'])))
`;

for (const scenario of ["verified", "missing", "hash_mismatch", "invalid_archive", "ambiguous_artifacts"] as const) {
  it(`PREP-ASSET-${scenario} validates actual bytes and unambiguous ZIP evidence`, () => {
    const directory = mkdtempSync(join(tmpdir(), "mcp-assets-"));
    try {
      const name = scenario === "invalid_archive" || scenario === "ambiguous_artifacts" ? "evidence.zip" : "runner.py";
      const kind = name.endsWith(".zip") ? "evidence" : "file";
      if (scenario === "ambiguous_artifacts") {
        execFileSync("python3", ["-B", "-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('a/artifacts.json',sys.argv[2]); z.writestr('b/artifacts.json',sys.argv[2]); z.close()", join(directory, name), fixture]);
      } else if (scenario !== "missing") {
        writeFileSync(join(directory, name), scenario === "hash_mismatch" ? "changed" : fixture);
      }
      const report = JSON.parse(execFileSync("python3", ["-B", "-c", invoke, script], {
        input: JSON.stringify({ directory, manifest: { assets: [{ name, kind, sha256: digest }] } }),
        encoding: "utf8"
      }));
      assert.equal(report.ok, scenario === "verified");
      assert.equal(report.assets.length, 1);
      assert.equal(report.assets[0].status, scenario);
      assert.equal(report.assets[0].expectedSha256, digest);
      if (scenario === "verified") assert.equal(report.assets[0].actualSha256, digest);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

it("PREP-ASSET-zip_member hashes the inner artifacts.json rather than the ZIP container", () => {
  const directory = mkdtempSync(join(tmpdir(), "mcp-assets-"));
  try {
    execFileSync("python3", ["-B", "-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('run/artifacts.json',sys.argv[2]); z.writestr('README.md','extra file'); z.close()", join(directory, "evidence.zip"), fixture]);
    const report = JSON.parse(execFileSync("python3", ["-B", "-c", invoke, script], {
      input: JSON.stringify({ directory, manifest: { assets: [{ name: "evidence.zip", kind: "evidence", sha256: digest }] } }),
      encoding: "utf8"
    }));
    assert.equal(report.ok, true);
    assert.equal(report.assets[0].actualSha256, digest);
    assert.equal(report.assets[0].member, "run/artifacts.json");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("PREP-ASSET-cli refuses absent official assets with a nonzero status and all six omissions", () => {
  const directory = mkdtempSync(join(tmpdir(), "mcp-assets-"));
  try {
    const result = spawnSync("python3", ["-B", script, "--assets-dir", directory, "--evidence-dir", directory], { encoding: "utf8" });
    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.assets.length, 6);
    assert.equal(report.assets.every((item: { status: string }) => item.status === "missing"), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
