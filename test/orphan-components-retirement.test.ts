import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

test("unreachable former landing, library and supplement widgets leave the maintained source tree", () => {
  const retired = [
    "components/hero-split.tsx",
    "components/chat-channel-cards.tsx",
    "components/blog-section.tsx",
    "components/feature-row.tsx",
    "components/support-feature-section.tsx",
    "components/cta-section.tsx",
    "components/visual-knowledge-actions.tsx",
    "components/admin/supplement-create-modal.tsx"
  ];
  assert.deepEqual(retired.filter(existsSync), []);
});
