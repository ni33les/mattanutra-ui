import { semanticTestEvent } from "./test-semantic-reporter.mjs";

/** Diagnostic timing stays separate from the stable business/test equality input. */
export default async function* report(source) {
  for await (const event of source) {
    const row = semanticTestEvent(event);
    if (row) yield `${JSON.stringify({ ...row, durationMs: event.data.details?.duration_ms ?? null })}\n`;
  }
}
