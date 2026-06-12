import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const schema = readFileSync(new URL("../db-schema.sql", import.meta.url), "utf8");
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { scripts?: Record<string, string> };
const panya = readFileSync(new URL("../lib/panya.ts", import.meta.url), "utf8");
const adminPanya = readFileSync(
  new URL("../lib/admin-panya.ts", import.meta.url),
  "utf8"
);
const panyaView = readFileSync(
  new URL("../components/admin/panya-view.tsx", import.meta.url),
  "utf8"
);
const dashboard = readFileSync(
  new URL("../components/admin-dashboard.tsx", import.meta.url),
  "utf8"
);
const panyaRoute = readFileSync(
  new URL("../app/api/admin/panya/route.ts", import.meta.url),
  "utf8"
);
const taskResultApplier = readFileSync(
  new URL("../lib/task-result-applier.ts", import.meta.url),
  "utf8"
);
const dashboardContent = readFileSync(
  new URL("../components/admin/dashboard-content.tsx", import.meta.url),
  "utf8"
);
const dashboardContentZh = readFileSync(
  new URL("../components/admin/dashboard-content.zh-CN.json", import.meta.url),
  "utf8"
);
const dashboardPage = readFileSync(
  new URL("../app/[locale]/admin/dashboard/page.tsx", import.meta.url),
  "utf8"
);
const rbac = readFileSync(new URL("../lib/admin-rbac.ts", import.meta.url), "utf8");
const webhook = readFileSync(
  new URL("../app/api/line/webhook/route.ts", import.meta.url),
  "utf8"
);
const panyaAgent = readFileSync(
  new URL("../lib/panya-chat-agent.ts", import.meta.url),
  "utf8"
);
const taskWorker = readFileSync(
  new URL("../lib/task-worker.ts", import.meta.url),
  "utf8"
);
const taskWorkItems = readFileSync(
  new URL("../lib/task-work-items.ts", import.meta.url),
  "utf8"
);
const applyScript = readFileSync(
  new URL("../scripts/apply-panya-schema.ts", import.meta.url),
  "utf8"
);

describe("Panya customer agent architecture", () => {
  it("stores governed config and atomic daily usage in first-class schema", () => {
    assert.match(schema, /CREATE TABLE public\.panya_config_versions/);
    assert.match(schema, /CREATE TABLE public\.panya_daily_usage/);
    assert.match(schema, /panya_daily_usage_unique_day_idx/);
    assert.match(schema, /panya_daily_usage_entitlement_check[\s\S]*living_protocol[\s\S]*right_amount_formula[\s\S]*unpaid/);
    assert.match(schema, /COMMENT ON TABLE public\.panya_config_versions/);
    assert.match(applyScript, /create table if not exists public\.panya_config_versions/);
    assert.match(applyScript, /create table if not exists public\.panya_daily_usage/);
    assert.match(packageJson.scripts?.["panya:schema:apply"] ?? "", /apply-panya-schema\.ts/);
  });

  it("keeps the Panya admin page platform-only and dashboard-backed", () => {
    const agentRoleBlock = /export const agentRolePermissions = \{([\s\S]*?)\n\} as const/.exec(rbac)?.[1] ?? "";

    assert.match(rbac, /"panya\.read"/);
    assert.match(rbac, /"panya\.write"/);
    assert.match(rbac, /view !== "financials" && view !== "panya" && view !== "settlements"/);
    assert.doesNotMatch(agentRoleBlock, /"panya\.write"/);
    assert.match(dashboard, /AdminPanyaView/);
    assert.match(dashboard, /panyaData: AdminPanyaData/);
    assert.match(dashboardPage, /getAdminPanyaData/);
    assert.doesNotMatch(
      dashboardContent,
      /marketing: \[[^\]]*name: "Panya", view: "panya"[^\]]*\]/
    );
    assert.match(dashboardContent, /panyaTitle: "Panya"/);
    assert.match(dashboardContent, /panyaNavigation: \[/);
    assert.match(dashboardContent, /name: "Configuration"[\s\S]*panyaSection: "configuration"[\s\S]*view: "panya"/);
    assert.match(dashboardContent, /name: "Conversations"[\s\S]*panyaSection: "conversations"[\s\S]*view: "panya"/);
    assert.doesNotMatch(
      dashboardContent,
      /administration: \[[^\]]*name: "Panya", view: "panya"[^\]]*\]/
    );
    assert.doesNotMatch(
      dashboardContentZh,
      /"marketing": \[[^\]]*"name": "Panya",\s*"view": "panya"[^\]]*\]/
    );
    assert.match(dashboardContentZh, /"panyaTitle": "Panya"/);
    assert.match(dashboardContentZh, /"panyaNavigation": \[/);
    assert.match(adminPanya, /context\.effectiveOrganisation\.type !== "platform"/);
    assert.match(panyaView, /Customer agent control room/);
    assert.match(adminPanya, /from public\.retail_checkout_payments/);
    assert.doesNotMatch(adminPanya, /retail_customer_orders\.plan_id/);
    assert.match(adminPanya, /sendAdminPanyaConversationReply/);
    assert.match(adminPanya, /messageType: "panya_admin_reply"/);
    assert.match(adminPanya, /queueCustomerChatCommunicationDispatchTask/);
    assert.match(panyaRoute, /action === "send_reply"/);
    assert.match(panyaView, /conversationHref\(conversation\.threadKey\)/);
    assert.match(panyaView, /Reply as MattaNutra/);
    assert.match(panyaView, /Send LINE reply/);
    assert.match(panyaView, /adminTaskVisibilityHref/);
    assert.match(panyaView, /activeSection/);
    assert.match(dashboard, /panyaSection: "configuration" \| "conversations"/);
    assert.match(dashboardPage, /panyaSectionParam/);
    assert.match(dashboardPage, /query\.section/);
    assert.match(panyaView, /conversationFilter/);
    assert.match(panyaView, /onMetricSelect/);
    assert.match(panyaView, /visibleConversations/);
    assert.match(panyaView, /xl:grid-cols-\[minmax\(18rem,0\.42fr\)_minmax\(0,1fr\)\]/);
    assert.match(panyaView, /Permanent customer communication archive/);
    assert.match(panyaView, /Conversation detail/);
    assert.match(panyaView, /message\.escalated/);
    assert.match(panyaView, /bg-red-50 text-red-700 ring-red-200/);
  });

  it("enforces quota before queuing a Panya reply task from LINE", () => {
    assert.match(webhook, /checkAndRecordPanyaUserMessage/);
    assert.match(webhook, /queuePanyaQuotaLimitReply/);
    assert.match(webhook, /panyaQuotaBlocked/);
    assert.match(webhook, /enforcePlanChatLimit: false/);
    assert.match(panya, /on conflict \(conversation_key, usage_day\) do update/);
    assert.match(panya, /where public\.panya_daily_usage\.user_message_count < excluded\.quota_limit/);
    assert.match(panya, /eventName: "panya_quota_allowed"/);
    assert.match(panya, /eventName: "panya_quota_blocked"/);
  });

  it("uses governed tool policy and recurring check-ins without sending raw text to BPM", () => {
    assert.match(panyaAgent, /getActivePanyaConfig/);
    assert.match(panyaAgent, /panyaToolContext/);
    assert.match(panyaAgent, /dailyMessageLimit/);
    assert.match(panyaAgent, /plan\.planUrl/);
    assert.doesNotMatch(panyaAgent, /paid_plan/);
    assert.match(taskWorkItems, /buildAssessmentResultsUrl/);
    assert.match(taskWorkItems, /planUrl: buildAssessmentResultsUrl\(locale, task\.planId\)/);
    assert.match(taskWorkItems, /selectedPlanLabel: selectedPlanLabel\(row\.selected_plan\)/);
    assert.match(panya, /request_living_protocol_refinement/);
    assert.match(panya, /generate_upgrade_guidance/);
    assert.match(panya, /schedulePanyaCheckInForPlan/);
    assert.match(panya, /queueDuePanyaCheckIn/);
    assert.match(taskWorker, /action\.action_type === "panya_checkin"/);
    assert.match(taskWorker, /queueDuePanyaCheckIn/);
    assert.match(panya, /eventName: "panya_checkin_queued"/);
  });

  it("creates visible human escalation tasks from Panya decisions", () => {
    assert.match(taskResultApplier, /taskType: "customer_chat_escalation"/);
    assert.match(taskResultApplier, /actorType: "human"/);
    assert.match(taskResultApplier, /requiredCapabilities: \[AGENT_CAPABILITIES\.humanReview\]/);
    assert.match(taskResultApplier, /visibility: "admin"/);
    assert.match(taskResultApplier, /panyaConversationUrl/);
    assert.match(taskResultApplier, /conversationThreadKey/);
  });
});
