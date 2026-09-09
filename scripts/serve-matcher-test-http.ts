/** Isolated Node HTTP adapter around the production MCP handlers; no browser build. */
import "../test/helpers/offline-network.mjs";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { fork } from "node:child_process";
import { GET, POST } from "../app/api/mcp/route.ts";
import { GET as QA_GET, POST as QA_POST } from "../app/api/mcp/qa/route.ts";
import { POST as PAY_POST } from "../app/api/mcp/checkout/[checkoutAccess]/pay/route.ts";
import { POST as SESSION_POST } from "../app/api/mcp/checkout/[checkoutAccess]/session/route.ts";
import { warmAgenticCatalogue } from "../lib/agentic/catalogue/warm.ts";
import { refreshAdminSafetyCeilings } from "../lib/agentic/catalogue/load-safety-ceilings.ts";
import { assertReleaseManifestReady } from "../lib/agentic/release-manifest.ts";
import { closeSqlPool } from "../lib/db.ts";
import { isolatedValidationEnvironment } from "./run-dev-advisory-validation.mjs";

isolatedValidationEnvironment(process.env);
const identity = assertReleaseManifestReady();
await warmAgenticCatalogue("dev");
await refreshAdminSafetyCeilings();
const server = createServer(async (incoming, outgoing) => {
  const controller = new AbortController();
  incoming.once("aborted", () => controller.abort());
  outgoing.once("close", () => { if (!outgoing.writableEnded) controller.abort(); });
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("HTTP fixture listener unavailable");
    const url = new URL(incoming.url ?? "/", `http://127.0.0.1:${address.port}`);
    const method = incoming.method ?? "GET";
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) if (value != null) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    const request = new Request(url, { method, headers, signal: controller.signal,
      ...(method === "GET" || method === "HEAD" ? {} : { body: Readable.toWeb(incoming) as ReadableStream, duplex: "half" }) });
    const checkout = /^\/api\/mcp\/checkout\/([^/]+)\/(pay|session)$/.exec(url.pathname);
    let response: Response;
    if (url.pathname === "/api/mcp") response = method === "POST" ? await POST(request) : await GET(request);
    else if (url.pathname === "/api/mcp/qa") response = method === "POST" ? await QA_POST(request) : await QA_GET(request);
    else if (checkout) {
      const context = { params: Promise.resolve({ checkoutAccess: decodeURIComponent(checkout[1]!) }) };
      response = method !== "POST" ? new Response("Method not allowed", { status: 405 }) : checkout[2] === "pay" ? await PAY_POST(request, context) : await SESSION_POST(request, context);
    } else response = new Response("Not found", { status: 404 });
    outgoing.statusCode = response.status;
    for (const [name, value] of response.headers) outgoing.setHeader(name, value);
    if (response.body) Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    if (!outgoing.headersSent) outgoing.writeHead(500, { "content-type": "application/json", connection: "close" });
    outgoing.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});
await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
const address = server.address();
if (!address || typeof address === "string") throw new Error("HTTP fixture listener unavailable");
process.env.SITE_URL = `http://127.0.0.1:${address.port}`;
process.env.NEXT_PUBLIC_SITE_URL = process.env.SITE_URL;
const worker = fork("scripts/matcher-test-task-worker.ts", [], { env: process.env, stdio: ["ignore", "inherit", "inherit", "ipc"] });
const workerIdentity = await new Promise<Record<string, unknown>>((done, reject) => {
  const timer = setTimeout(() => reject(new Error("Isolated executor registration timed out")), 30_000);
  worker.once("error", error => { clearTimeout(timer); reject(error); });
  worker.once("exit", code => { clearTimeout(timer); reject(new Error(`Isolated executor exited ${code}`)); });
  worker.once("message", message => { clearTimeout(timer); done(message as Record<string, unknown>); });
});
if (!workerIdentity.ready || workerIdentity.buildId !== identity.buildId) throw new Error("Isolated executor identity mismatch");
const ready = { ready: true, origin: `http://127.0.0.1:${address.port}`, ...identity, worker: workerIdentity };
process.send?.(ready);
console.log(`MCP_TEST_SERVER_READY:${JSON.stringify(ready)}`);
async function stop() { worker.kill("SIGTERM"); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await closeSqlPool(); process.exit(0); }
process.once("SIGTERM", () => { void stop(); });
process.once("SIGINT", () => { void stop(); });
