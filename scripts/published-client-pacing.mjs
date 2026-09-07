/** Client-side request scheduling only: never changes or retries a request. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const delay = milliseconds => new Promise(done => setTimeout(done, milliseconds));
export const PUBLIC_RPC_INTERVAL_MS = 1050;

export function createPacedRequest(send, { now = () => performance.now(), sleep = delay } = {}) {
  // Pace the first request too: separate sequential journey processes share
  // the same public rate window and must not burst at process boundaries.
  let nextStart = now() + PUBLIC_RPC_INTERVAL_MS;
  let queue = Promise.resolve();
  return (...args) => {
    const result = queue.then(async () => {
      while (now() < nextStart) await sleep(Math.ceil(nextStart - now()));
      nextStart = now() + PUBLIC_RPC_INTERVAL_MS;
      return send(...args);
    });
    // A failure is returned exactly once to its caller; it does not trigger
    // a replay or prevent a later explicit caller action from being paced.
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
}

export async function clearPublicRateWindow(sleep = delay) {
  for (const milliseconds of [60_000, 1000]) await sleep(milliseconds);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== "--clear-window") throw new Error("Usage: published-client-pacing.mjs --clear-window");
  console.log("Waiting 61 seconds for the previous public request window to expire.");
  await clearPublicRateWindow();
  console.log("Public request window cleared; run the paced client matrix.");
}
