import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { AGENTIC_CONTRACT_VERSION } from "../lib/agentic/config.ts";
import { isolatedValidationEnvironment } from "../scripts/run-dev-advisory-validation.mjs";

it("V5-INFRA-05 complete matcher pack uses real isolated HTTP handlers without a browser build", { timeout: 45_000 }, async () => {
  assert.ok(process.env.TEST_DB_URL, "The HTTP adapter regression requires the isolated PostgreSQL catalogue");
  const env = { ...isolatedValidationEnvironment(process.env), AGENTIC_BUILD_ID: JSON.parse(readFileSync(".next/required-server-files.json", "utf8")).config.env.AGENTIC_BUILD_ID, NODE_OPTIONS: "--max-old-space-size=768" };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "--import", "./scripts/register-matcher-http-loader.mjs", "scripts/serve-matcher-test-http.ts"], { env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let logs = "";
  child.stdout.on("data", data => { logs += data.toString(); }); child.stderr.on("data", data => { logs += data.toString(); });
  const exited = once(child, "exit");
  try {
    const identity = await Promise.race([
      once(child, "message").then(([message]) => message as { ready: boolean; origin: string; buildId: string }),
      exited.then(() => { throw new Error(`HTTP adapter exited before readiness: ${logs}`); })
    ]);
    assert.equal(identity.ready, true);
    assert.equal(identity.buildId, env.AGENTIC_BUILD_ID);
    const target = `${identity.origin}/api/mcp`;
    const discovery = await fetch(target, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    assert.equal(discovery.status, 200);
    assert.equal((await discovery.json()).contractVersion, AGENTIC_CONTRACT_VERSION);
    const sse = await fetch(target, { headers: { accept: "text/event-stream" }, signal: AbortSignal.timeout(10_000) });
    assert.equal(sse.status, 405);
    const info = await fetch(target, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "info", arguments: { locale: "th" } } }), signal: AbortSignal.timeout(10_000) });
    assert.equal(info.status, 200);
    assert.equal((await info.json()).result.structuredContent.contractVersion, AGENTIC_CONTRACT_VERSION);
    assert.equal(info.headers.get("x-agentic-build-id"), env.AGENTIC_BUILD_ID);
    // These are ordinary published info calls through the production HTTP
    // handler, which intentionally avoids creating the full store runtime.
    for (const locale of ["en", "th", "zh-CN"]) {
      const callInfo = async (arguments_: Record<string, unknown>) => {
        const response = await fetch(target, {
          method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "info", arguments: { locale, ...arguments_ } } }),
          signal: AbortSignal.timeout(10_000)
        });
        assert.equal(response.status, 200);
        const result = (await response.json()).result;
        assert.equal(result.isError, false);
        assert.equal(result.structuredContent.ok, true);
        return result.structuredContent;
      };
      const guide = await callInfo({ view: "client_guide" });
      assert.equal(typeof guide.clientGuideText, "string", `${locale}: tools-only guide must survive HTTP dispatch`);
      assert.match(guide.clientGuideText, /supplemental/);
      for (const operation of ["create", "get", "revise", "answer", "select"]) {
        const detail = await callInfo({ view: "plan_schema", planOperation: operation });
        assert.equal(detail.planOperation, operation);
        const definition = JSON.parse(detail.planSchemaJson);
        const branches = definition.anyOf ?? [definition];
        assert.ok(branches.length > 0);
        for (const branch of branches) assert.equal(branch.properties.operation.const, operation);
      }
      const overview = await callInfo({});
      assert.equal(overview.clientGuideText, undefined);
      assert.equal(overview.planSchemaJson, undefined);
    }
  } finally {
    child.kill("SIGTERM");
    await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5000))]);
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
  }
});
