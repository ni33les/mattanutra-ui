import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  adminClawRequestAllowed,
  adminDashboardOrClawRequestAllowed
} from "../lib/admin-auth.ts";

const previousAdminClawToken = process.env.ADMIN_CLAW_TOKEN;
const previousAdminDashboardToken = process.env.ADMIN_DASHBOARD_TOKEN;

describe("admin claw token auth", () => {
  before(() => {
    process.env.ADMIN_CLAW_TOKEN = "test-openclaw-token";
    process.env.ADMIN_DASHBOARD_TOKEN = "test-dashboard-token";
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
});
