import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const reviewQueue = readFileSync(
  new URL("../lib/admin-review-queue.ts", import.meta.url),
  "utf8"
);
const humanReviewExpiry = readFileSync(
  new URL("../lib/human-review-task-expiry.ts", import.meta.url),
  "utf8"
);
const cronRoute = readFileSync(
  new URL("../app/api/cron/route.ts", import.meta.url),
  "utf8"
);
const reviewView = readFileSync(
  new URL("../components/admin/review-queue-view.tsx", import.meta.url),
  "utf8"
);
const reviewHelpers = readFileSync(
  new URL("../components/admin/review-queue-helpers.ts", import.meta.url),
  "utf8"
);
const reviewRoute = readFileSync(
  new URL("../app/api/admin/review-tasks/[id]/route.ts", import.meta.url),
  "utf8"
);
const retailStockReorderAdvice = readFileSync(
  new URL("../lib/admin-retail-stock-reorder-advice.ts", import.meta.url),
  "utf8"
);
const retailOperationTasks = readFileSync(
  new URL("../lib/admin-retail-operation-tasks.ts", import.meta.url),
  "utf8"
);
const retailStockSideEffects = readFileSync(
  new URL("../lib/admin-retail-stock-side-effects.ts", import.meta.url),
  "utf8"
);
const panyaTaskApplier = readFileSync(
  new URL("../lib/task-result-applier.ts", import.meta.url),
  "utf8"
);

describe("human review queue coverage", () => {
  it("loads generic human review tasks into the Review screen", () => {
    assert.match(reviewQueue, /GENERIC_HUMAN_REVIEW_EXCLUDED_TASK_TYPES/);
    assert.match(reviewQueue, /tasks\.actor_type = 'human'/);
    assert.match(reviewQueue, /customer_chat_escalation|generic_human_task/);
    assert.match(reviewQueue, /not \(tasks\.task_type = any\(\$\{\[\.\.\.REVIEW_TASK_TYPES\]\}::text\[\]\)\)/);
    assert.doesNotMatch(humanReviewExpiry, /task_type <> any/);
    assert.match(humanReviewExpiry, /GENERIC_HUMAN_REVIEW_EXPIRY_DAYS = 3/);
    assert.match(humanReviewExpiry, /created_at \+ \(\$\{GENERIC_HUMAN_REVIEW_EXPIRY_DAYS\}::int \* interval '1 day'\) <= now\(\)/);
    assert.match(humanReviewExpiry, /human_review_task_expired/);
    assert.match(reviewQueue, /completeGenericHumanReviewTask/);
    assert.match(reviewRoute, /action !== "complete_human_task"/);
    assert.match(reviewRoute, /completeGenericHumanReviewTask/);
  });

  it("runs human review expiry from the cron endpoint", () => {
    assert.match(cronRoute, /expireOverdueGenericHumanReviewTasks/);
    assert.match(cronRoute, /humanReviewTasks/);
  });

  it("renders a generic human task modal and task-review filter", () => {
    assert.match(reviewView, /GenericHumanReviewTaskModal/);
    assert.match(reviewView, /action: "complete_human_task"/);
    assert.match(reviewView, /outcome/);
    assert.match(reviewView, /labels\.reviewQueue\.taskItem/);
    assert.match(reviewView, /id: "reviewsTask"/);
    assert.match(reviewHelpers, /row\.itemType === "task"/);
    assert.match(reviewHelpers, /labels\.reviewQueue\.taskReview/);
  });

  it("keeps stockout review medium priority with a three-day expiry", () => {
    assert.match(retailOperationTasks, /function humanReviewDueAt\(days = 3\)/);
    assert.match(retailStockSideEffects, /taskType: "retail_stock_low_stock_review"/);
    assert.match(retailStockSideEffects, /title: "Review retail stockout"/);
    assert.match(retailStockSideEffects, /priorityScore: 360/);
    assert.match(retailStockReorderAdvice, /riskLevel === "out_of_stock"[\s\S]*\? 360/);
    assert.match(retailOperationTasks, /scheduledFor: new Date\(\)/);
    assert.match(panyaTaskApplier, /dueAt: new Date\(Date\.now\(\) \+ 3 \* 24 \* 60 \* 60 \* 1000\)[\s\S]*taskType: "customer_chat_escalation"/);
  });
});
