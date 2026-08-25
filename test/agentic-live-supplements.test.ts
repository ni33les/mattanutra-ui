import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  acceptedUnitsFor,
  buildContributionIndex,
  catalogueSupplementFromLiveRow,
  isLiveSupplementAllowed,
  overlayFixtureSupplementAliases
} from "../lib/agentic/catalogue/live-supplements.ts";
import { publicSupplementId } from "../lib/agentic/contract/ids.ts";

describe("live country-aware supplements for matching", () => {
  it("keeps allowed supplements and drops blocked or deleted ones", () => {
    const allowed = catalogueSupplementFromLiveRow({
      aliases: ["Ashwaganda"],
      deleted: false,
      factUnits: ["mg"],
      maxUnit: "mg",
      name: "Ashwagandha",
      status: "allowed",
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });
    const blocked = catalogueSupplementFromLiveRow({
      aliases: [],
      deleted: false,
      factUnits: ["mg"],
      maxUnit: "mg",
      name: "Ashwagandha",
      status: "blocked",
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });
    const deleted = catalogueSupplementFromLiveRow({
      aliases: [],
      deleted: true,
      factUnits: ["mg"],
      maxUnit: "mg",
      name: "Ashwagandha",
      status: "allowed",
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });

    assert.equal(isLiveSupplementAllowed({ deleted: false, status: "allowed" }), true);
    assert.ok(allowed);
    assert.equal(allowed.name, "Ashwagandha");
    assert.equal(
      allowed.supplementId,
      publicSupplementId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    );
    assert.equal(blocked, null);
    assert.equal(deleted, null);
  });

  it("maps product facts onto the live supplement list, including new names", () => {
    const ashwagandha = catalogueSupplementFromLiveRow({
      aliases: ["Withania"],
      deleted: false,
      factUnits: ["mg"],
      maxUnit: "mg",
      name: "Ashwagandha",
      status: "allowed",
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });
    assert.ok(ashwagandha);
    const index = buildContributionIndex([ashwagandha]);
    assert.equal(
      index.get("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      ashwagandha.supplementId
    );
    assert.equal(index.get("ashwagandha"), ashwagandha.supplementId);
    assert.equal(index.get("withania"), ashwagandha.supplementId);
  });

  it("keeps Algae omega-3 as an alias of live Omega-3", () => {
    const omega = overlayFixtureSupplementAliases([
      {
        acceptedUnits: ["mg"],
        aliases: ["EPA"],
        name: "Omega-3",
        supplementId: "sup_22222222222222222222222222222222",
        uuid: "22222222-2222-2222-2222-222222222222"
      }
    ]);
    assert.equal(omega[0]?.aliases.includes("Algae omega-3"), true);
    assert.equal(omega[0]?.acceptedUnits.includes("g"), true);
  });

  it("expands labelled units so mg/g and IU/mcg stay interchangeable", () => {
    assert.deepEqual(acceptedUnitsFor("mg", []), ["g", "mg"]);
    assert.equal(acceptedUnitsFor("IU", []).includes("mcg"), true);
    assert.equal(acceptedUnitsFor(null, []).includes("mg"), true);
  });

  it("flushes matching caches when admin supplements or products change", async () => {
    const supplements = await readFile("lib/admin-supplements.ts", "utf8");
    const products = await readFile("lib/admin-product-writes.ts", "utf8");
    const availability = await readFile(
      "lib/supplement-country-availability.ts",
      "utf8"
    );
    const live = await readFile("lib/agentic/catalogue/live.ts", "utf8");
    const info = await readFile("lib/agentic/info.ts", "utf8");

    assert.match(supplements, /flushMatchingCatalogueCaches\(\)/);
    assert.match(supplements, /insert into public\.supplement_country_availability/);
    assert.match(products, /flushMatchingCatalogueCaches\(\)/);
    assert.match(availability, /supplement_country_availability table_rule/);
    assert.match(live, /loadLiveSupplementsForCountry/);
    assert.match(info, /recognisedNamesForMarkets/);
  });
});
