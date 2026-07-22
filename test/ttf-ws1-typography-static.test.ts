import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const layout = source("../app/[locale]/layout.tsx");
const css = source("../app/customer.css");

describe("ttf ws1 Thai typography (step F)", () => {
  it("loads Noto Sans Thai and Noto Serif Thai CSS variables", () => {
    assert.match(layout, /Noto_Sans_Thai/);
    assert.match(layout, /Noto_Serif_Thai/);
    assert.match(layout, /--mn-font-thai/);
    assert.match(layout, /--mn-font-thai-serif/);
    assert.match(layout, /thaiSerifFont\.variable/);
  });

  it("keeps Latin fonts first under :lang(th) so brand glyphs stay correct", () => {
    const shell = css.match(
      /:lang\(th\) \.mn-customer-shell\s*\{([\s\S]*?)\n  \}/
    );
    assert.ok(shell, "missing :lang(th) .mn-customer-shell rule");
    assert.match(
      shell[1],
      /font-family:\s*var\(--mn-font-body\),\s*var\(--mn-font-thai\)/
    );
    assert.doesNotMatch(
      shell[1],
      /font-family:\s*var\(--mn-font-thai\),\s*var\(--mn-font-body\)/
    );

    const wordmark = css.match(
      /:lang\(th\) \.mn-customer-shell \.mn-logo-wordmark\s*\{([\s\S]*?)\n  \}/
    );
    assert.ok(wordmark, "missing Thai logo wordmark rule");
    assert.match(
      wordmark[1],
      /font-family:\s*var\(--mn-font-display\),\s*var\(--mn-font-thai-serif\)/
    );
  });

  it("disables synthetic italics for Thai and tunes line-heights", () => {
    assert.match(css, /:lang\(th\) \.mn-customer-shell\s*\{[\s\S]*font-synthesis:\s*none/);
    assert.match(css, /:lang\(th\) \.mn-customer-shell h1\s*\{[\s\S]*line-height:\s*1\.14/);
    assert.match(css, /:lang\(th\) \.mn-customer-shell h2\s*\{[\s\S]*line-height:\s*1\.18/);
    assert.match(
      css,
      /:lang\(th\) \.mn-customer-shell p,[\s\S]*:lang\(th\) \.mn-customer-shell li,[\s\S]*:lang\(th\) \.mn-customer-shell summary\s*\{[\s\S]*line-height:\s*1\.7/
    );
    assert.match(
      css,
      /:lang\(th\) \.mn-customer-shell em,[\s\S]*font-style:\s*normal[\s\S]*font-synthesis:\s*none/
    );
  });
});
