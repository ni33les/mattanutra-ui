import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pharmacyLineCopy } from "../lib/pharmacy-line-copy.ts";

const { getImageProps } = createRequire(import.meta.url)("next/image") as typeof import("next/image");

test("installed Next preserves every generated QR image prop without an explicit optimization bypass", () => {
  const src = "data:image/png;base64,iVBORw0KGgo=";
  for (const locale of ["en", "th", "zh-CN"] as const) {
    const input = { src, width: 176, height: 176, alt: pharmacyLineCopy[locale].alt };
    const before = getImageProps({ ...input, unoptimized: true });
    const after = getImageProps(input);
    assert.deepEqual(after, before, locale);
    assert.equal(after.props.src, src);
    assert.equal(after.props.srcSet, undefined);
    assert.equal(after.props.width, 176);
    assert.equal(after.props.height, 176);
    assert.equal(after.props.alt, pharmacyLineCopy[locale].alt);
  }
});

test("pharmacy QR relies on the verified data-image handling without a redundant component exemption", () => {
  const source = readFileSync("components/pharmacy/line-connect.tsx", "utf8");
  const image = source.match(/<Image\b[^>]*\/>/)?.[0];
  assert.ok(image, "the prepared QR remains a Next Image");
  assert.match(image, /src=\{prepared\.qrDataUrl\}/);
  assert.match(image, /width=\{176\}/);
  assert.match(image, /height=\{176\}/);
  assert.match(image, /alt=\{c\.alt\}/);
  assert.doesNotMatch(image, /\bunoptimized\b/);
  assert.match(source, /value\.qrDataUrl\?\.startsWith\("data:image\/png;base64,"\)/);
});
