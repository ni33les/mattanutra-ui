import { createServer, type IncomingMessage, type Server } from "node:http";
import { signalTaskQueue } from "../lib/task-queue-signal.ts";

function envText(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function readJson(request: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        resolve(
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {}
        );
      } catch {
        resolve({});
      }
    });
    request.on("error", () => resolve({}));
  });
}

export function startWorkerWakeServer() {
  const bind = envText("WORKER_WAKE_BIND", "0.0.0.0");
  const requestedPort = Number(envText("WORKER_WAKE_PORT", "0"));
  const server: Server = createServer((request, response) => {
    const path = request.url?.split("?")[0] ?? "";

    if (request.method !== "POST" || (path !== "/wake" && path !== "/")) {
      response.statusCode = 404;
      response.end();
      return;
    }

    void readJson(request).then((body) => {
      const taskType =
        typeof body.taskType === "string" ? body.taskType.trim() : "";
      const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";

      if (taskType) {
        signalTaskQueue({
          taskType,
          ...(taskId ? { taskId } : {})
        });
      }

      response.statusCode = 204;
      response.end();
    });
  });

  return new Promise<{ close: () => void; url: string }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number.isInteger(requestedPort) ? requestedPort : 0, bind, () => {
      const address = server.address();
      const port =
        address && typeof address === "object" ? address.port : requestedPort;
      const advertised =
        envText("WORKER_WAKE_URL") || `http://127.0.0.1:${port}/wake`;

      console.info("[worker] wake server listening", {
        advertised,
        bind,
        port
      });

      resolve({
        close: () => {
          server.close();
        },
        url: advertised.endsWith("/wake") ? advertised : `${advertised.replace(/\/+$/, "")}/wake`
      });
    });
  });
}
