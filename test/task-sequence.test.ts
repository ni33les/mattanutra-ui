import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTaskSequenceDependencyPlan } from "../lib/task-service-utils.ts";

describe("task sequence planning", () => {
  it("wires each stage to the previous stage so parallel work can fan in", () => {
    const plan = buildTaskSequenceDependencyPlan([
      {
        tasks: [
          { key: "draft", taskType: "draft_plan", title: "Draft plan" },
          { key: "check", taskType: "safety_check", title: "Safety check" }
        ]
      },
      {
        tasks: [
          { key: "send", taskType: "send_plan", title: "Send plan" }
        ]
      }
    ]);

    assert.deepEqual(
      plan.map((item) => ({
        dependencies: item.dependencies,
        key: item.key
      })),
      [
        { dependencies: [], key: "draft" },
        { dependencies: [], key: "check" },
        {
          dependencies: [
            { key: "draft", type: "complete" },
            { key: "check", type: "complete" }
          ],
          key: "send"
        }
      ]
    );
  });

  it("supports approval dependencies as normal task dependencies", () => {
    const plan = buildTaskSequenceDependencyPlan([
      {
        tasks: [
          { key: "human_review", taskType: "review_plan", title: "Review plan" }
        ]
      },
      {
        dependencyType: "approved",
        tasks: [
          { key: "publish", taskType: "publish_plan", title: "Publish plan" }
        ]
      }
    ]);

    assert.deepEqual(plan[1]?.dependencies, [
      { key: "human_review", type: "approved" }
    ]);
  });

  it("rejects duplicate task keys", () => {
    assert.throws(
      () =>
        buildTaskSequenceDependencyPlan([
          {
            tasks: [
              { key: "same", taskType: "one", title: "One" },
              { key: "same", taskType: "two", title: "Two" }
            ]
          }
        ]),
      /Duplicate task sequence key/
    );
  });

  it("rejects dependency keys that have not been created yet", () => {
    assert.throws(
      () =>
        buildTaskSequenceDependencyPlan([
          {
            tasks: [
              {
                dependsOn: [{ key: "future" }],
                key: "now",
                taskType: "now",
                title: "Now"
              }
            ]
          },
          {
            tasks: [
              { key: "future", taskType: "future", title: "Future" }
            ]
          }
        ]),
      /Unknown task sequence dependency key/
    );
  });
});
