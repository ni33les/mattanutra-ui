import "./offline-network.mjs";
import assert from "node:assert/strict";
import { test as base } from "@playwright/test";

/** Shared isolation for every browser spec, including pages opened by reference tests. */
export const test = base.extend<{ offlineRequests: void }>({
  serviceWorkers: "block",
  offlineRequests: [async ({ context, baseURL }, use) => {
    const app = new URL(baseURL!);
    assert.equal(app.origin, "http://127.0.0.1:3100", "Browser tests require the isolated application on http://127.0.0.1:3100");
    await context.route("**/*", route => {
      const target = new URL(route.request().url());
      // Reference HTML and its assets come from the checked-in handoff archive.
      return ["file:", "data:", "blob:"].includes(target.protocol) || target.origin === app.origin
        ? route.continue()
        : route.abort("blockedbyclient");
    });
    await use();
  }, { auto: true }]
});

export { expect, type Locator, type Page } from "@playwright/test";
