import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import {
  adminClawRequestAllowed,
  adminDashboardOrClawRequestAllowed
} from "../lib/admin-auth.ts";
import { workerRequestAllowed } from "../lib/worker-auth.ts";

const previousAdminClawToken = process.env.ADMIN_CLAW_TOKEN;
const previousAdminDashboardToken = process.env.ADMIN_DASHBOARD_TOKEN;
const previousLegacyTokenAuth = process.env.MATTANUTRA_LEGACY_TOKEN_AUTH;
const previousWorkerToken = process.env.WORKER_API_TOKEN;

describe("admin claw token auth", () => {
  before(() => {
    process.env.ADMIN_CLAW_TOKEN = "test-openclaw-token";
    process.env.ADMIN_DASHBOARD_TOKEN = "test-dashboard-token";
    process.env.MATTANUTRA_LEGACY_TOKEN_AUTH = "allow";
    process.env.WORKER_API_TOKEN = "test-worker-token";
  });

  after(() => {
    if (previousAdminClawToken === undefined) {
      delete process.env.ADMIN_CLAW_TOKEN;
    } else {
      process.env.ADMIN_CLAW_TOKEN = previousAdminClawToken;
    }

    if (previousAdminDashboardToken === undefined) {
      delete process.env.ADMIN_DASHBOARD_TOKEN;
    } else {
      process.env.ADMIN_DASHBOARD_TOKEN = previousAdminDashboardToken;
    }

    if (previousWorkerToken === undefined) {
      delete process.env.WORKER_API_TOKEN;
    } else {
      process.env.WORKER_API_TOKEN = previousWorkerToken;
    }

    if (previousLegacyTokenAuth === undefined) {
      delete process.env.MATTANUTRA_LEGACY_TOKEN_AUTH;
    } else {
      process.env.MATTANUTRA_LEGACY_TOKEN_AUTH = previousLegacyTokenAuth;
    }
  });

  it("rejects requests without the machine token", () => {
    assert.equal(
      adminClawRequestAllowed(new Request("https://example.test/api/tasks")),
      false
    );
  });

  it("rejects requests with the wrong machine token", () => {
    assert.equal(
      adminClawRequestAllowed(
        new Request("https://example.test/api/tasks", {
          headers: { authorization: "Bearer wrong-token" }
        })
      ),
      false
    );
  });

  it("accepts bearer token auth", () => {
    assert.equal(
      adminClawRequestAllowed(
        new Request("https://example.test/api/tasks", {
          headers: { authorization: "Bearer test-openclaw-token" }
        })
      ),
      true
    );
  });

  it("accepts x-admin-claw-token auth", () => {
    assert.equal(
      adminClawRequestAllowed(
        new Request("https://example.test/api/tasks", {
          headers: { "x-admin-claw-token": "test-openclaw-token" }
        })
      ),
      true
    );
  });

  it("allows dashboard or machine auth for admin mutation APIs", () => {
    assert.equal(
      adminDashboardOrClawRequestAllowed(
        new Request("https://example.test/api/admin/supplements/1"),
        "test-dashboard-token"
      ),
      true
    );
    assert.equal(
      adminDashboardOrClawRequestAllowed(
        new Request("https://example.test/api/admin/supplements/1", {
          headers: { authorization: "Bearer test-openclaw-token" }
        })
      ),
      true
    );
  });

  it("keeps worker API auth separate from admin and dashboard tokens", () => {
    assert.equal(
      workerRequestAllowed(
        new Request("https://example.test/api/tasks/reserve", {
          headers: { authorization: "Bearer test-worker-token" }
        })
      ),
      true
    );
    assert.equal(
      workerRequestAllowed(
        new Request("https://example.test/api/tasks/reserve", {
          headers: { authorization: "Bearer test-openclaw-token" }
        })
      ),
      false
    );
    assert.equal(
      workerRequestAllowed(
        new Request("https://example.test/api/tasks/reserve", {
          headers: { "x-admin-dashboard-token": "test-dashboard-token" }
        })
      ),
      false
    );
  });

	  it("can disable legacy shared token auth during rollout cutoff", () => {
	    process.env.MATTANUTRA_LEGACY_TOKEN_AUTH = "deny";

	    try {
      assert.equal(
        adminClawRequestAllowed(
          new Request("https://example.test/api/tasks", {
            headers: { authorization: "Bearer test-openclaw-token" }
          })
        ),
        false
      );
      assert.equal(
        workerRequestAllowed(
          new Request("https://example.test/api/tasks/reserve", {
            headers: { authorization: "Bearer test-worker-token" }
          })
        ),
        false
      );
    } finally {
	      process.env.MATTANUTRA_LEGACY_TOKEN_AUTH = "allow";
	    }
	  });

	  it("denies legacy shared token auth by default", () => {
	    delete process.env.MATTANUTRA_LEGACY_TOKEN_AUTH;

	    try {
	      assert.equal(
	        adminClawRequestAllowed(
	          new Request("https://example.test/api/tasks", {
	            headers: { authorization: "Bearer test-openclaw-token" }
	          })
	        ),
	        false
	      );
	      assert.equal(
	        workerRequestAllowed(
	          new Request("https://example.test/api/tasks/reserve", {
	            headers: { authorization: "Bearer test-worker-token" }
	          })
	        ),
	        false
	      );
	    } finally {
	      process.env.MATTANUTRA_LEGACY_TOKEN_AUTH = "allow";
	    }
	  });
	});

describe("API auth boundaries", () => {
  it("keeps worker task APIs on worker-only auth", async () => {
    const workerApiRoutes = [
      "app/api/tasks/reserve/route.ts",
      "app/api/tasks/[id]/comment/route.ts",
      "app/api/tasks/[id]/complete/route.ts",
      "app/api/tasks/[id]/fail/route.ts",
      "app/api/tasks/[id]/renew/route.ts",
      "app/api/tasks/[id]/spawn/route.ts",
      "app/api/workers/heartbeat/route.ts",
      "app/api/workers/register/route.ts"
    ];

    for (const file of workerApiRoutes) {
      const source = await readFile(file, "utf8");

      assert.match(
        source,
        /requireWorkerAccess/,
        `${file} must resolve a worker agent principal`
      );
      assert.doesNotMatch(
        source,
        /adminDashboardOrClawRequestAllowed/,
        `${file} must not accept dashboard/admin mutation tokens`
      );
    }
  });

  it("keeps OpenClaw/admin integration reads off public access", async () => {
    const openClawRoutes = [
      "app/api/blog/posts/route.ts",
      "app/api/blog/posts/[idOrSlug]/route.ts",
      "app/api/blog/testimonials/route.ts",
      "app/api/blog/testimonials/[id]/route.ts",
      "app/api/communications/channels/route.ts",
      "app/api/communications/channels/[id]/route.ts",
      "app/api/communications/messages/route.ts",
      "app/api/communications/messages/[id]/route.ts",
      "app/api/cron/route.ts",
      "app/api/openclaw/plans/[planId]/context/route.ts",
      "app/api/openclaw/plans/[planId]/messages/route.ts",
      "app/api/openclaw/plans/[planId]/refine/route.ts",
      "app/api/tasks/[id]/route.ts"
    ];

    for (const file of openClawRoutes) {
      const source = await readFile(file, "utf8");

      assert.match(
        source,
        /requireOpenClawAccess/,
        `${file} must resolve an OpenClaw agent principal`
      );
    }
  });

  it("lets the dashboard token read admin query data without making it public", async () => {
    const source = await readFile("app/api/admin/query/[view]/route.ts", "utf8");

    assert.match(
      source,
      /adminDashboardOrClawRequestAllowed/,
      "admin query data must accept the dashboard token used by the admin UI"
    );
    assert.match(
      source,
      /searchParams\.get\("access_token"\)/,
      "admin query data must read the access_token preserved in dashboard links"
    );
    assert.match(
      source,
      /openClawUnauthorized/,
      "admin query data must still reject unauthenticated requests"
    );
  });

  it("keeps communication send actions limited to worker or OpenClaw callers", async () => {
    const sendActionRoutes = [
      "app/api/communications/send/route.ts",
      "app/api/communications/messages/[id]/dispatch/route.ts"
    ];

    for (const file of sendActionRoutes) {
      const source = await readFile(file, "utf8");

      assert.match(
        source,
        /requireOpenClawAccess/,
        `${file} must accept protected OpenClaw callers`
      );
      assert.match(
        source,
        /requireWorkerAccess/,
        `${file} must accept protected worker callers`
      );
      assert.doesNotMatch(
        source,
        /adminDashboardOrClawRequestAllowed/,
        `${file} must not accept dashboard tokens for provider sends`
      );
    }
  });
});
