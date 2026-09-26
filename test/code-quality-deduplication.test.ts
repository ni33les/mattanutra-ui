import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { toJsonValue } from "../lib/assessment-store.ts";
import { cleanNullableText, isUuidValue, numberOrNull } from "../lib/admin-product-helpers.ts";
import { normalizeProductFactKey } from "../lib/product-recommendations.ts";
import { adminCataloguePotentialCandidates } from "../lib/admin-product-coverage-simulation.ts";

// Compile the actual private declarations so both pre-consolidation owners are
// behaviorally exercised without adding test-only production exports. Only I/O
// and the React state hook are controlled; formatting/normalization stays real.
const require = createRequire(import.meta.url);
const sources = new Map<string, ts.SourceFile>();
function source(path: string) {
  if (!sources.has(path)) sources.set(path, ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true));
  return sources.get(path)!;
}
function declaration(path: string, name: string) {
  if (!existsSync(path)) return undefined;
  const file = source(path);
  return file.statements.find((node) =>
    ts.isFunctionDeclaration(node) ? node.name?.text === name :
      ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(file) === name)
  )?.getText(file);
}
function evaluate<T>(path: string, name: string, globals: Record<string, unknown> = {}, extra = ""): T {
  const actual = declaration(path, name);
  assert.ok(actual, `${path}: ${name}`);
  const output = ts.transpileModule(`${extra}\n${actual}`.replace(/\bexport\s+(?=(?:async\s+)?function|const)/g, ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: path
  }).outputText;
  return new Function("require", "exports", ...Object.keys(globals), `${output}\nreturn ${name};`)(require, {}, ...Object.values(globals)) as T;
}

const groups = [
  { name: "product fact replacement", functions: ["replaceProductFacts"], paths: ["lib/admin-products.ts", "lib/admin-product-writes.ts", "lib/admin-product-facts.ts"] },
  { name: "admin session bar", functions: ["AdminSessionBar"], paths: ["components/admin-dashboard.tsx", "components/admin/product-admin-shell.tsx", "components/admin/session-bar.tsx"] },
  { name: "catalogue candidate hash", functions: ["potentialCandidateHash", "adminCataloguePotentialCandidateHash"], paths: ["app/api/admin/product-coverage/catalogue-optimization/shared.ts", "lib/admin-catalogue-optimization-jobs.ts", "lib/admin-catalogue-candidate-hash.ts"] },
  { name: "safety follow-up message", functions: ["safetyFollowupMessage"], paths: ["lib/communications-dispatch.ts", "lib/task-work-items.ts", "lib/safety-followup-message.ts"] }
];
function owners(group: typeof groups[number]) {
  return group.paths.flatMap((path) => group.functions.filter((name) => declaration(path, name)).map((name) => ({ path, name })));
}
for (const group of groups) {
  test(`single owner: ${group.name}`, () => assert.equal(owners(group).length, 1, group.paths.join(", ")));
}

test("fact replacement preserves caller SQL ownership, canonical links, and deletion scope", async () => {
  const validId = "11111111-1111-4111-8111-111111111111";
  const staleId = "22222222-2222-4222-8222-222222222222";
  const aliasId = "33333333-3333-4333-8333-333333333333";
  for (const { path, name } of owners(groups[0])) {
    const replace = evaluate<(sql: unknown, input: Record<string, unknown>) => Promise<void>>(path, name, {
      isUuidValue, normalizeProductFactKey, numberOrNull, cleanNullableText, toJsonValue
    });
    for (const deleteSources of [undefined, [], ["manual"]]) {
      const executed: string[] = [];
      let inserted: Array<Record<string, unknown>> = [];
      const sql = Object.assign((parts: TemplateStringsArray, ...values: unknown[]) => {
        const text = parts.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "");
        return {
          toString: () => text,
          then(resolve: (value: unknown[]) => unknown) {
            executed.push(text);
            return Promise.resolve(text.includes("from public.supplements") ? [{ id: validId }] : []).then(resolve);
          }
        };
      }, {
        json(value: unknown) { inserted = value as typeof inserted; return "JSON_FACTS"; },
        begin() { assert.fail("The helper must use the caller's SQL handle"); },
        end() { assert.fail("The helper must not close the caller's SQL handle"); }
      });
      await replace(sql, {
        productId: "44444444-4444-4444-8444-444444444444", source: "manual", deleteSources,
        facts: [
          { name: " Zinc ", amount: "15", unit: " mg ", supplementId: validId },
          { name: "Magnesium", amount: 100, unit: "mg", supplementId: staleId },
          { name: "Unknown ingredient", amount: 1 }, { name: " " }
        ],
        supplementMatchesByFactName: new Map([[normalizeProductFactKey("Zinc"), { id: aliasId }], [normalizeProductFactKey("Magnesium"), { id: aliasId }]])
      });
      assert.equal(executed.length, 2, path);
      assert.match(executed[1], /with\s+deleted\s+as[\s\S]*delete from public\.product_facts[\s\S]*insert into public\.product_facts/);
      assert.equal(executed[1].includes("and false"), deleteSources === undefined);
      assert.equal(executed[1].includes("and source = any(manual::text[])"), Boolean(deleteSources?.length));
      assert.deepEqual(inserted.map((row) => [row.name, row.supplement_id, row.amount, row.unit]), [
        ["Zinc", validId, 15, "mg"], ["Magnesium", aliasId, 100, "mg"], ["Unknown ingredient", null, 1, null]
      ]);
    }
  }
});

const candidate = {
  id: "product-a", status: "pending_review", brandStatus: "pending_review", title: "Zinc", brandName: "Example",
  currency: "THB", availabilityStatus: "in_stock", platform: "manual", priceAmount: 120, productKind: "supplement",
  facts: [{ name: "Zinc", normalizedName: "zinc", amount: 15, comparableAmount: 15000, confidence: "high", itemType: "supplement", unit: "mg" }]
};
test("catalogue hash preserves frozen bytes, ordering, status, dose and price identity", () => {
  const hashes = owners(groups[2]).map(({ path, name }) => evaluate<(input: unknown[]) => string>(path, name, { createHash, adminCataloguePotentialCandidates }));
  for (const hash of hashes) {
    assert.equal(hash([]), "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945");
    assert.equal(hash([candidate]), "dbc802d7a3dafb308289be449b251d5863e300168dc70b3809d74d0c306345e2");
    assert.equal(hash([candidate, { ...candidate, id: "product-b" }]), hash([{ ...candidate, id: "product-b" }, candidate]));
    assert.equal(hash([candidate, { ...candidate, id: "ignored", status: "ignored" }]), hash([candidate]));
    for (const changed of [{ status: "approved" }, { brandStatus: "approved" }, { priceAmount: 121 }, { facts: [{ ...candidate.facts[0], amount: 16 }] }]) {
      assert.notEqual(hash([{ ...candidate, ...changed }]), hash([candidate]));
    }
  }
});

test("safety follow-up keeps exact single, grouped and multilingual item text", () => {
  for (const { path, name } of owners(groups[3])) {
    const message = evaluate<(input: Record<string, unknown>) => string>(path, name);
    assert.equal(message({ supplementName: "Zinc", decision: "approve", clientDose: "15 mg" }), "Your human safety review for Zinc is complete. The reviewed dose is 15 mg. Your nutrition plan has been updated.");
    assert.equal(message({ supplementName: "锌", decision: "approve" }), "Your human safety review for 锌 is complete. Your nutrition plan has been updated.");
    assert.equal(message({ supplementName: "สังกะสี", decision: "disapprove" }), "Your human safety review for สังกะสี is complete. We have removed that suggestion from your nutrition plan.");
    assert.equal(message({ supplementName: "ignored", decision: "disapprove", reviewedItems: [{ supplementName: "Zinc", decision: "approve", clientDose: "15 mg" }] }), "Your human safety review for Zinc is complete. The reviewed dose is 15 mg. Your nutrition plan has been updated.");
    assert.equal(message({ supplementName: "ignored", decision: "reviewed", reviewedItems: [
      { supplementName: "Zinc", decision: "approve", clientDose: "15 mg" },
      { supplementName: "Magnesium", decision: "disapprove" },
      { supplementName: "วิตามิน", decision: "reviewed" }
    ] }), "Your human safety review is complete. We have updated your nutrition plan after reviewing 3 supplements: Zinc approved at 15 mg; Magnesium removed; วิตามิน reviewed.");
  }
});

function button(node: ReactNode): { onClick: () => Promise<void> } | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; onClick: () => Promise<void> }>(child)) continue;
    if (child.type === "button") return child.props;
    const found = button(child.props.children);
    if (found) return found;
  }
}
test("session bar preserves localized effective role and impersonation controls", async () => {
  for (const { path, name } of owners(groups[1])) {
    const calls: unknown[] = [];
    const state: unknown[] = [];
    let reloads = 0;
    let reject = false;
    const SessionBar = evaluate<(props: Record<string, unknown>) => ReactNode>(path, name, {
      useState: () => [false, (value: unknown) => state.push(value)],
      fetch: async (...args: unknown[]) => { calls.push(args); if (reject) throw new Error("offline"); },
      window: { location: { reload: () => { reloads += 1; } } }
    }, [declaration(path, "sessionRoleLabels"), declaration("components/admin/dashboard-shared.tsx", "classNames"), declaration("components/admin/dashboard-shared.tsx", "adminLocaleTextClass")].join("\n"));
    const context = {
      role: "retail_admin", actorMembership: { role: "platform_owner" }, actorPerson: { displayName: "Owner" },
      effectivePerson: { displayName: "Retail user" }, effectiveOrganisation: { name: "Pharmacy", currency: "THB" }, assumedPerson: null
    };
    const labels = { access: { actor: "Actor", assumed: "Assumed", session: "Session", stopAssuming: "Stop assuming" } };
    for (const [locale, roleLabel] of [["en", "Retail Admin"], ["th", "แอดมินร้านค้า"], ["zh-CN", "零售管理员"]]) {
      const normal = SessionBar({ context, labels, locale });
      assert.match(renderToStaticMarkup(normal), new RegExp(roleLabel));
      assert.equal(button(normal), undefined);
      const assumed = SessionBar({ context: { ...context, assumedPerson: {} }, labels, locale });
      assert.match(renderToStaticMarkup(assumed), /Pharmacy/);
      assert.match(renderToStaticMarkup(assumed), /Actor: Owner/);
      const stop = button(assumed); assert.ok(stop);
      await stop.onClick();
      assert.deepEqual(calls.at(-1), ["/api/admin/impersonation/stop", { credentials: "same-origin", method: "POST" }]);
    }
    assert.deepEqual(state, [true, true, true]);
    assert.equal(reloads, 3);
    reject = true;
    const stop = button(SessionBar({ context: { ...context, assumedPerson: {} }, labels, locale: "en" }));
    await assert.rejects(stop!.onClick(), /offline/);
    assert.equal(reloads, 4, "failed stop requests still refresh the effective session");
  }
});
