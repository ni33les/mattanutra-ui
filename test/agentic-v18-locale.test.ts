import { catalogueRecordFingerprint } from "../lib/catalogue-corrections.ts";
import { after } from "node:test";
import { closeSqlPool } from "../lib/db.ts";
import { CURRENT_CONTRACT_SCHEMA_CHECKSUM } from "./helpers/current-contract-lock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { AGENTIC_SCHEMA_CHECKSUM } from "../lib/agentic/info.ts";
import { publicBasketItem } from "../lib/agentic/public-mapper.ts";
import type { BasketItem, CoverageRow } from "../lib/agentic/plan/types.ts";
import { deferred, frozenSnapshot } from "./agentic/v16/harness.ts";
import { matcherSafetyCeilings, setMatcherSafetyCeilings, matcherSafetyReferenceIdentity } from "../lib/matcher/safety-ceilings.ts";
let previousCeilings: ReturnType<typeof matcherSafetyCeilings>;
let previousIdentity: ReturnType<typeof matcherSafetyReferenceIdentity>;
import {
  canonicalizeOpaque,
  firstForbiddenDiff,
  isClosedAllowlistPath,
  isPermittedPresentationPath,
  jsonPointerDiff,
  atPointer,
  asRecord
} from "./agentic/v18/diff.ts";
import {
  beginV18Run,
  basketOf,
  canonicalHashOf,
  compactOf,
  coverageOf,
  createReady,
  createV18Runtime,
  endV18Run,
  freezeRealThailandCatalogue,
  hasThaiScript,
  domainPlanCreate,
  selectionReasons,
  serialize
} from "./agentic/v18/harness.ts";
import {
  F_READY_EN,
  F_READY_TH,
  V18_CLOCK,
  V18_LOCK_HASH,
  V18_NL_DEF_HASH,
  V18_NL_EXCLUSION,
  V18_PACK_HASH,
  V18_RUNNER_HASH,
  V18_STABLE_MESSAGE,
  V18_TEST_IDS,
  v18Key
} from "./agentic/v18/manifest.ts";

function magLine(): { item: BasketItem; coverage: CoverageRow[] } {
  const item: BasketItem = {
    availabilityAsOf: V18_CLOCK,
    contributionSupplementIds: ["sup_mg"],
    currency: "THB",
    dailyPills: 1,
    daysOfSupply: 30,
    deliveryWindow: null,
    fixture: false,
    form: "capsule",
    imageUrl: null,
    incidentalNutrientNames: [],
    incidentalNutrients: [],
    incompleteCommercialFacts: false,
    lineTotalMinor: 15900,
    pillsPerServing: 1,
    productId: "prd_mg",
    productName: "Magnesium",
    quantity: 1,
    requestedNutrientNames: ["Magnesium"],
    retailerSku: "sku_prd_mg",
    sellerId: "seller_mg",
    sellerName: "Seller",
    servingsPerDay: 1,
    source: "retail",
    stockStatus: "in_stock",
    unitPriceMinor: 15900
  };
  const coverage: CoverageRow[] = [
    {
      contributors: [
        {
          amount: 301.5,
          productId: "prd_mg",
          productName: "Magnesium",
          source: "selected",
          unit: "mg"
        }
      ],
      coveragePercent: 100,
      currentAmount: 0,
      deliveredAmount: 301.5,
      name: "Magnesium",
      percentOfUpperLimit: null,
      remainingGap: 0,
      requestedAmount: 300,
      status: "covered",
      supplementId: "sup_mg",
      totalExposureAmount: 301.5,
      unit: "mg",
      upperLimitAmount: null
    }
  ];
  return { item, coverage };
}

function localeDiff(en: Record<string, unknown>, th: Record<string, unknown>) {
  return jsonPointerDiff(canonicalizeOpaque(en), canonicalizeOpaque(th));
}

describe("v1.8 TECH-04 locale/business boundary", () => {
  before(async () => {
    await freezeRealThailandCatalogue();
  });

  beforeEach(() => {
    beginV18Run();
    previousCeilings=matcherSafetyCeilings();previousIdentity=matcherSafetyReferenceIdentity();
    const magnesium=frozenSnapshot()?.supplements.find(row=>row.name === "Magnesium");assert.ok(magnesium);
    const ceilings=[{subjectId:magnesium.supplementId,name:"Magnesium",maxAmount:350,maxUnit:"mg" as const,sourceScope:"supplemental" as const,lifeStage:"adult" as const}];
    setMatcherSafetyCeilings(ceilings,{runtimeRevision:frozenSnapshot()!.runtimeRevision!,fingerprint:catalogueRecordFingerprint(ceilings)});
  });

  afterEach(() => {
    endV18Run();
    setMatcherSafetyCeilings(previousCeilings,previousIdentity);
  });

  it("DEV-HYGIENE-01 locked QA v3.0 hashes", () => {
    const hygiene = JSON.parse(
      readFileSync(new URL("./agentic/det-v3/pack-hygiene.json", import.meta.url), "utf8")
    ) as { hashes: Record<string, string> };
    assert.equal(hygiene.hashes.qaPackV3, V18_PACK_HASH);
    assert.equal(hygiene.hashes.acceptanceRunner, V18_RUNNER_HASH);
    assert.equal(hygiene.hashes.lockEntry, V18_LOCK_HASH);
    assert.equal(V18_NL_DEF_HASH, "574b78411253f20a7f52a23ade7350a6277d632d14555775c5043bbbd05accca");
    assert.deepEqual([...V18_NL_EXCLUSION], ["/checks/TECH-07"]);
    assert.equal(AGENTIC_SCHEMA_CHECKSUM, CURRENT_CONTRACT_SCHEMA_CHECKSUM);
    assert.equal(V18_TEST_IDS.length, 11);
  });

  it("DEV-LOC-001 Thai locale must not mutate the basket", async () => {
    const en = await createReady("qa-v3:l8:loc001-en", "en", v18Key("loc001", 1, "en"));
    const th = await createReady("qa-v3:l8:loc001-th", "th", v18Key("loc001", 1, "th"));
    assert.equal(en.result.ok, true);
    assert.equal(th.result.ok, true);
    assert.equal(en.result.status, "ready");
    assert.equal(th.result.status, "ready");
    assert.equal(canonicalHashOf(th.result), canonicalHashOf(en.result));
    assert.deepEqual(coverageOf(th.result), coverageOf(en.result));
    assert.equal(th.result.candidateKey, en.result.candidateKey);
    assert.equal(th.result.estimatedOrderTotalMinor, en.result.estimatedOrderTotalMinor);
    assert.deepEqual(th.result.orderSchedule, en.result.orderSchedule);
    const pointer = firstForbiddenDiff(localeDiff(en.result, th.result));
    assert.deepEqual(
      basketOf(th.result),
      basketOf(en.result),
      `first differing pointer ${pointer ?? "/"} en=${JSON.stringify(
        atPointer(en.result, pointer ?? "/basket/0/selectionReason/message")
      )} th=${JSON.stringify(atPointer(th.result, pointer ?? "/basket/0/selectionReason/message"))}`
    );
  });

  it("DEV-LOC-002 selection reason is a stable agent contract", async () => {
    const { item, coverage } = magLine();
    const enUnit = publicBasketItem(item, "en", { nameById: new Map(), names: new Set(["magnesium"]), supplementIds: new Set(["sup_mg"]) }, coverage);
    const thUnit = publicBasketItem(item, "th", { nameById: new Map(), names: new Set(["magnesium"]), supplementIds: new Set(["sup_mg"]) }, coverage);
    assert.equal(asRecord(thUnit.selectionReason).code, asRecord(enUnit.selectionReason).code);
    assert.equal(asRecord(thUnit.selectionReason).messageKey, asRecord(enUnit.selectionReason).messageKey);
    assert.deepEqual(asRecord(thUnit.selectionReason).requestedNames, asRecord(enUnit.selectionReason).requestedNames);
    assert.deepEqual(
      asRecord(thUnit.selectionReason).requestedSupplementIds,
      asRecord(enUnit.selectionReason).requestedSupplementIds
    );
    assert.equal(asRecord(enUnit.selectionReason).message, V18_STABLE_MESSAGE);
    assert.equal(asRecord(thUnit.selectionReason).message, V18_STABLE_MESSAGE);

    const en = await createReady("qa-v3:l8:loc002-en", "en", v18Key("loc002", 1, "en"));
    const th = await createReady("qa-v3:l8:loc002-th", "th", v18Key("loc002", 1, "th"));
    const enReasons = selectionReasons(en.result);
    const thReasons = selectionReasons(th.result);
    assert.equal(thReasons.length, enReasons.length);
    for (let index = 0; index < enReasons.length; index += 1) {
      assert.equal(thReasons[index]?.code, enReasons[index]?.code);
      assert.equal(thReasons[index]?.messageKey, enReasons[index]?.messageKey);
      assert.deepEqual(thReasons[index]?.requestedNames, enReasons[index]?.requestedNames);
      assert.deepEqual(thReasons[index]?.requestedSupplementIds, enReasons[index]?.requestedSupplementIds);
      assert.equal(thReasons[index]?.message, enReasons[index]?.message);
    }
    const message = `This product covers Magnesium at ${coverageOf(en.result)[0]?.deliveredAmount} mg per day.`;
    assert.equal(enReasons[0]?.message, message);
    assert.equal(thReasons[0]?.message, message);
  });

  it("DEV-LOC-003 only approved presentation paths may differ", async () => {
    for (const prefix of ["", "/compactDecision"]) {
      assert.equal(isPermittedPresentationPath(`${prefix}/matchingExplanation/message`), true);
      assert.equal(isPermittedPresentationPath(`${prefix}/matchingExplanation/reasonCode`), false);
      assert.equal(isPermittedPresentationPath(`${prefix}/preferenceAssessment/0/message`), true);
      for (const field of ["actual", "preferred", "delta", "percent", "status", "prominent"]) {
        assert.equal(isPermittedPresentationPath(`${prefix}/preferenceAssessment/0/${field}`), false);
      }
    }
    const en = await createReady("qa-v3:l8:loc003-en", "en", v18Key("loc003", 1, "en"));
    const th = await createReady("qa-v3:l8:loc003-th", "th", v18Key("loc003", 1, "th"));
    const paths = localeDiff(en.result, th.result);
    const presentation = paths.filter((path) => isPermittedPresentationPath(path));
    assert.ok(presentation.length > 0, `expected compactDecision presentation diff, got ${paths.join(",")}`);
    const leaked = paths.filter((path) => !isClosedAllowlistPath(path));
    assert.deepEqual(leaked, [], `unexpected locale paths ${leaked.join(",")}`);
    assert.equal(firstForbiddenDiff(paths), null, `forbidden ${firstForbiddenDiff(paths)}`);

    const en2 = await createReady("qa-v3:l8:loc003-en-b", "en", v18Key("loc003", 2, "en"));
    const th2 = await createReady("qa-v3:l8:loc003-th-b", "th", v18Key("loc003", 2, "th"));
    assert.deepEqual(localeDiff(en2.result, th2.result), paths);
  });

  it("DEV-LOC-004 localized compact decision remains useful", async () => {
    const en = await createReady("qa-v3:l8:loc004-en", "en", v18Key("loc004", 1, "en"));
    const th = await createReady("qa-v3:l8:loc004-th", "th", v18Key("loc004", 1, "th"));
    const enC = compactOf(en.result);
    const thC = compactOf(th.result);
    assert.equal(enC.status, thC.status);
    assert.equal(enC.candidateKey, thC.candidateKey);
    assert.deepEqual(enC.cost, thC.cost);
    assert.ok(String(enC.why ?? "").length > 0);
    assert.ok(String(thC.why ?? "").length > 0);
    assert.ok(Array.isArray(enC.what) && enC.what.length > 0);
    assert.ok(Array.isArray(thC.what) && thC.what.length > 0);
    assert.ok(String(enC.when ?? "").length > 0);
    assert.ok(String(thC.when ?? "").length > 0);
    assert.equal(hasThaiScript({ what: thC.what, why: thC.why, when: thC.when }), true);

    const th2 = await createReady("qa-v3:l8:loc004-th-b", "th", v18Key("loc004", 2, "th"));
    assert.deepEqual(compactOf(th2.result).what, thC.what);
    assert.equal(compactOf(th2.result).why, thC.why);
    assert.equal(compactOf(th2.result).when, thC.when);
  });

  it("DEV-MUT-001 every mutation changes its documented dependency", async () => {
    const baseline = await createReady("qa-v3:l8:mut001-base", "en", v18Key("mut001", 1, "base"));
    const dose = await createReady("qa-v3:l8:mut001-dose", "en", v18Key("mut001", 1, "dose"), {
      ...F_READY_EN,
      targets: [{ ...F_READY_EN.targets[0], amount: 301 }]
    });
    const stock = await createReady("qa-v3:l8:mut001-stock", "en", v18Key("mut001", 1, "stock"), {
      ...F_READY_EN,
      currentSupplements: [
        { dailyAmount: 300, daysRemaining: 10, name: "Magnesium", unit: "mg" }
      ]
    });
    const optional = await createReady("qa-v3:l8:mut001-opt", "en", v18Key("mut001", 1, "opt"), {
      ...F_READY_EN,
      targets: [{ ...F_READY_EN.targets[0], importance: "optional" }]
    });
    const safety = await createReady("qa-v3:l8:mut001-safe", "en", v18Key("mut001", 1, "safe"), {
      ...F_READY_EN,
      currentSupplements: [
        { dailyAmount: 350, daysRemaining: 30, name: "Magnesium", unit: "mg" }
      ]
    });
    const thai = await createReady("qa-v3:l8:mut001-th", "th", v18Key("mut001", 1, "th"));

    assert.equal(coverageOf(dose.result)[0]?.requestedAmount, 301);
    assert.equal(coverageOf(stock.result)[0]?.currentAmount, 300);
    assert.equal(coverageOf(optional.result)[0]?.importance, "optional");
    assert.notEqual(safety.result.status, "blocked");
    assert.ok((safety.result.safetyGuidance as Array<{ action: string; exposure: number; threshold: number }>).some(
      row => row.action === "review" && row.exposure === 350 && row.threshold === 350
    ), "the same real exposure and limit remain visible as advice");
    assert.equal(((safety.result.questions as Array<{ questionId: string }> | undefined) ?? []).some(row => row.questionId === "q_safety_ack"), false);
    assert.equal(canonicalHashOf(thai.result), canonicalHashOf(baseline.result));
    assert.deepEqual(basketOf(thai.result), basketOf(baseline.result));
    assert.deepEqual(coverageOf(thai.result), coverageOf(baseline.result));
  });

  it("DEV-MUT-002 locale cannot alter matching, safety or economics", async () => {
    const en = await createReady("qa-v3:l8:mut002-en", "en", v18Key("mut002", 1, "en"));
    const th = await createReady("qa-v3:l8:mut002-th", "th", v18Key("mut002", 1, "th"));
    const pick = (plan: Record<string, unknown>) => ({
      products: basketOf(plan).map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        lineTotalMinor: item.lineTotalMinor
      })),
      shipping: plan.shippingMinor ?? null,
      total: plan.estimatedOrderTotalMinor ?? null,
      coverage: coverageOf(plan).map((row) => ({
        deliveredAmount: row.deliveredAmount,
        currentAmount: row.currentAmount,
        totalExposureAmount: row.totalExposureAmount,
        upperLimitAmount: row.upperLimitAmount,
        percentOfUpperLimit: row.percentOfUpperLimit
      })),
      schedule: plan.orderSchedule ?? null,
      claimIds: plan.claimIds ?? null,
      canonical: {
        matcherVersion: asRecord(plan.canonical).matcherVersion ?? null,
        packVersion: asRecord(plan.canonical).packVersion ?? null,
        contractVersion: asRecord(plan.canonical).contractVersion ?? null,
        hash: asRecord(plan.canonical).hash ?? null
      }
    });
    assert.deepEqual(pick(th.result), pick(en.result));
  });

  it("DEV-MUT-003 field-diff allowlist is closed", () => {
    const en = {
      basket: [{ selectionReason: { message: V18_STABLE_MESSAGE } }],
      compactDecision: { what: ["en"], why: "en", when: "en", cost: { currency: "THB" } }
    };
    const th = {
      basket: [{ selectionReason: { message: "สินค้านี้ให้ Magnesium 301.5 mg ต่อวัน" } }],
      compactDecision: { what: ["th"], why: "th", when: "th", cost: { currency: "THB" } }
    };
    const paths = localeDiff(en, th);
    assert.equal(paths.includes("/basket/0/selectionReason/message"), true);
    assert.equal(firstForbiddenDiff(paths), "/basket/0/selectionReason/message");
    for (const field of ["message", "uncertainty"]) assert.equal(isClosedAllowlistPath(`/compactDecision/advice/0/${field}`), true);
    for (const field of ["exposure", "threshold", "code", "severity", "sourceScope"]) {
      assert.equal(isClosedAllowlistPath(`/compactDecision/advice/0/${field}`), false, field);
    }
    assert.equal(isClosedAllowlistPath("/compactDecision/status"), false);
    assert.equal(isClosedAllowlistPath("/canonical/hash"), false);
  });

  it("DEV-DET-001 same-locale replay is byte-identical", async () => {
    for (const locale of ["en", "th"] as const) {
      const { runtime } = createV18Runtime(`qa-v3:l8:det001-${locale}`);
      const key = v18Key("det001", 1, locale);
      const first = await domainPlanCreate(runtime, key, locale === "th" ? F_READY_TH : F_READY_EN);
      await domainPlanCreate(runtime, v18Key("det001", 1, `${locale}-other`), locale === "th" ? F_READY_TH : F_READY_EN);
      const replay = await domainPlanCreate(runtime, key, locale === "th" ? F_READY_TH : F_READY_EN);
      assert.equal(serialize(replay), serialize(first));
    }
  });

  it("DEV-DET-002 fresh-key locale results are stable", async () => {
    for (const locale of ["en", "th"] as const) {
      const tuples: string[] = [];
      for (let index = 0; index < 10; index += 1) {
        const created = await createReady(
          `qa-v3:l8:det002-${locale}-${index}`,
          locale,
          v18Key("det002", 1, `${locale}${index}`)
        );
        tuples.push(
          serialize({
            hash: canonicalHashOf(created.result),
            candidateKey: created.result.candidateKey ?? null,
            basket: created.result.basket ?? null,
            coverage: created.result.coverage ?? null,
            orderSchedule: created.result.orderSchedule ?? null,
            reasons: selectionReasons(created.result)
          })
        );
      }
      assert.equal(new Set(tuples).size, 1, locale);
    }
  });

  it("DEV-DET-003 concurrency cannot leak locale", async () => {
    const hold = deferred();
    const english = Array.from({ length: 10 }, (_, index) => {
      const { runtime } = createV18Runtime(`qa-v3:l8:det003-en-${index}`);
      return hold.promise.then(() => domainPlanCreate(runtime, v18Key("det003", 1, `en${index}`), F_READY_EN));
    });
    const thai = Array.from({ length: 10 }, (_, index) => {
      const { runtime } = createV18Runtime(`qa-v3:l8:det003-th-${index}`);
      return hold.promise.then(() => domainPlanCreate(runtime, v18Key("det003", 1, `th${index}`), F_READY_TH));
    });
    hold.resolve();
    const [enResults, thResults] = await Promise.all([Promise.all(english), Promise.all(thai)]);
    for (const result of [...enResults, ...thResults]) {
      assert.equal(selectionReasons(result)[0]?.message,
        `This product covers Magnesium at ${coverageOf(result)[0]?.deliveredAmount} mg per day.`);
    }
    for (const result of thResults) {
      assert.equal(hasThaiScript(compactOf(result)), true);
    }
    const secondHold = deferred();
    const again = Array.from({ length: 10 }, (_, index) => {
      const { runtime } = createV18Runtime(`qa-v3:l8:det003-th-b-${index}`);
      return secondHold.promise.then(() => domainPlanCreate(runtime, v18Key("det003", 2, `th${index}`), F_READY_TH));
    });
    secondHold.resolve();
    const thAgain = await Promise.all(again);
    assert.equal(canonicalHashOf(thAgain[0]!), canonicalHashOf(thResults[0]!));
    assert.deepEqual(basketOf(thAgain[0]!), basketOf(thResults[0]!));
  });
});

if (process.env.NODE_TEST_CONTEXT) after(closeSqlPool);
