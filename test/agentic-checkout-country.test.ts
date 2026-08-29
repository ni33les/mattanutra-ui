import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panel = readFileSync(
  new URL("../components/retail-checkout/product-basket-checkout-panel.tsx", import.meta.url),
  "utf8"
);

describe("agentic checkout country field", () => {
  it("renders one named enabled country field defaulting to TH", () => {
    assert.match(panel, /name="country"/);
    assert.match(panel, /<select/);
    assert.match(panel, /value=\{checkout\.address\.country\}/);
    assert.match(panel, /country: "TH"/);
    assert.equal(panel.includes('id="countryDisplay"'), false);
  });

  it("does not render an empty hidden-only country field when destination is missing", () => {
    assert.match(panel, /name="country"/);
    assert.equal(panel.includes('type="hidden"') && /name="country"/.test(panel), false);
    assert.match(panel, /address\.country = destinationCountry/);
  });

  it("keeps a named country field on the web checkout", () => {
    assert.match(panel, /name="country"/);
    assert.match(panel, /displayCountryName/);
    assert.match(panel, /name="scenario"/);
    assert.match(panel, /"refund"/);
  });
});
