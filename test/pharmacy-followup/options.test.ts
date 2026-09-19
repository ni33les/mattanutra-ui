import assert from "node:assert/strict";
import test from "node:test";
import { getQuestionnaireDefinition } from "../../lib/questionnaire/definition.ts";
import { copies } from "../../components/assessment-flow-copy.ts";

const negative = new Set(["none", "no", "nolimit"]);
for (const locale of ["en", "th", "zh-CN"] as const) {
  test(`PHARM-FOLLOWUP-OPTIONS ${locale}: negative chat and classic options precede affirmative choices`, () => {
    let checked = 0;
    for (const turn of getQuestionnaireDefinition(locale).turns) {
      const opts = turn.opts ?? [];
      if (!opts.some(o => negative.has(o.v))) continue;
      checked++;
      assert.ok(negative.has(opts[0].v), `chat ${turn.k}: None/No must come first`);
    }
    function inspect(value: unknown, path: string) {
      if (Array.isArray(value)) {
        const opts = value as {value?: string}[];
        if (opts.some(o => negative.has(o?.value ?? ""))) {
          checked++;
          assert.ok(negative.has(opts[0].value ?? ""), `classic ${path}: None/No must come first`);
        }
      } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) inspect(child, `${path}.${key}`);
      }
    }
    inspect(copies[locale], locale);
    assert.ok(checked >= 20, "Both real questionnaire definitions must be inspected");
  });
}
