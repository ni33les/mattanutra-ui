const encoder = new TextEncoder();

const DEFAULT_SNAPSHOT_INTERVAL_MS = 10_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

function sseEvent(name: string, data: unknown) {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sseComment(comment: string) {
  return encoder.encode(`: ${comment}\n\n`);
}

export function streamAdminSnapshots<T>({
  eventName,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  load,
  request,
  snapshotIntervalMs = DEFAULT_SNAPSHOT_INTERVAL_MS
}: Readonly<{
  eventName: string;
  heartbeatIntervalMs?: number;
  load: () => Promise<T>;
  request: Request;
  snapshotIntervalMs?: number;
}>) {
  let closed = false;
  let streaming = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;

  function stop() {
    closed = true;
    clearInterval(interval);
    clearInterval(heartbeat);
  }

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      stop();
    },
    start(controller) {
      async function sendSnapshot() {
        if (closed || streaming) {
          return;
        }

        streaming = true;

        try {
          const data = await load();

          if (!closed) {
            controller.enqueue(sseEvent(eventName, data));
          }
        } catch (error) {
          if (!closed) {
            controller.enqueue(
              sseEvent("error", {
                message:
                  error instanceof Error
                    ? error.message
                    : "Unable to stream admin data"
              })
            );
          }
        } finally {
          streaming = false;
        }
      }

      void sendSnapshot();

      interval = setInterval(() => {
        void sendSnapshot();
      }, snapshotIntervalMs);

      heartbeat = setInterval(() => {
        if (!closed) {
          controller.enqueue(sseComment("heartbeat"));
        }
      }, heartbeatIntervalMs);

      request.signal.addEventListener("abort", () => {
        stop();

        try {
          controller.close();
        } catch {
          // The client may have already closed the stream.
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    }
  });
}
