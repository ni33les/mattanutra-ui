import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import sourceCatalog from "../content/i18n/source/en.json" with { type: "json" };
import zhCnCatalog from "../content/i18n/locales/zh-CN.json" with { type: "json" };
import zhCnRtfMatrix from "../content/i18n/reconciliation/zh-CN-rtf.json" with { type: "json" };
import { zhCn as assessmentZhCn } from "../components/assessment-flow-copy-zh-cn.ts";
import { assessmentUiCopy } from "../components/assessment-flow-copy.ts";
import {
  assertCatalogComplete,
  catalogIntegrityReport,
  getNamespace,
  t,
  tStatus
} from "../lib/i18n-messages.ts";

describe("central ICU i18n catalog", () => {
  it("keeps every public runtime locale complete and ICU-valid", () => {
    const report = assertCatalogComplete();

    assert.equal(report.findings.length, 0);
    assert.ok(report.messageCount >= 60);
  });

  it("formats ICU catalog copy with fallback status", () => {
    assert.equal(
      t("zh-CN", "seo.routes.nutritionReveal.title"),
      "知量方案预览 | MattaNutra"
    );
    assert.equal(
      t("zh-CN", "outbound.panya.quota.standard", { limit: 12 }),
      "你今天已用完 12 条 Panya 消息。你仍可查看方案和订单；如果需要持续跟进和调整，Living Protocol 会解锁更深入的支持。"
    );

    const status = tStatus("zh-CN", "customer.nutritionPublicShell.reveal.primary");

    assert.equal(status.fallbackUsed, false);
    assert.equal(status.missing, false);
    assert.equal(status.locale, "zh-CN");
  });

  it("hydrates namespace-shaped copy for component convenience", () => {
    const namespace = getNamespace("zh-CN", "customer.nutritionPublicShell") as {
      reveal: {
        primary: string;
        title: string;
      };
    };

    assert.equal(namespace.reveal.primary, "生成我的知量方案");
    assert.equal(namespace.reveal.title, "知道什么真正适合你的身体");
  });

  it("keeps SEO and reveal fallback copy in the central catalog", () => {
    assert.equal(
      sourceCatalog["seo.routes.home.title"].namespace,
      "seo.routes"
    );
    assert.equal(
      zhCnCatalog["customer.revealFallbacks.foodSupportNote"],
      "{name} 可通过食物层面支持 {requirements}"
    );
  });

  it("ships translator workflow scripts with stable CSV contract and validation", () => {
    const exportScript = readFileSync(
      new URL("../scripts/export-i18n-catalog.ts", import.meta.url),
      "utf8"
    );
    const importScript = readFileSync(
      new URL("../scripts/import-i18n-catalog.ts", import.meta.url),
      "utf8"
    );
    const packageJson = readFileSync(
      new URL("../package.json", import.meta.url),
      "utf8"
    );

    assert.match(exportScript, /"currentTranslation"/);
    assert.match(exportScript, /"glossaryTerms"/);
    assert.match(importScript, /extractIcuVariables/);
    assert.match(importScript, /missing required .* translation after import/);
    assert.match(packageJson, /"i18n:export"/);
    assert.match(packageJson, /"i18n:import-db-content"/);
    assert.match(packageJson, /"i18n:rtf-audit"/);
    assert.equal(catalogIntegrityReport().findings.length, 0);
  });

  it("rejects translator CSV imports with missing ICU placeholders", () => {
    const dir = mkdtempSync(join(tmpdir(), "mattanutra-i18n-"));
    const file = join(dir, "bad.csv");

    writeFileSync(
      file,
      [
        "id,currentTranslation",
        "outbound.panya.quota.standard,缺少变量的翻译"
      ].join("\n")
    );

    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--import",
        "./scripts/register-ts-path-loader.mjs",
        "scripts/import-i18n-catalog.ts",
        "--locale",
        "zh-CN",
        "--file",
        file,
        "--dry-run"
      ],
      {
        cwd: new URL("..", import.meta.url),
        encoding: "utf8"
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ICU placeholders/);
    assert.match(result.stderr, /limit/);
  });

  it("keeps the supplied zh-CN RTF reconciliation complete and drift-proof", () => {
    const validStatuses = new Set([
      "implemented_catalog",
      "implemented_db_seed",
      "not_in_product",
      "superseded_by_current_copy"
    ]);
    const zhCatalog = zhCnCatalog as Record<string, string>;

    assert.equal(zhCnRtfMatrix.locale, "zh-CN");
    assert.equal(zhCnRtfMatrix.rows.length, 215);

    for (const row of zhCnRtfMatrix.rows) {
      assert.ok(validStatuses.has(row.status), `${row.rowHash} has final status`);

      if (row.status === "implemented_catalog" || row.status === "implemented_db_seed") {
        const catalogChecks =
          "catalogChecks" in row
            ? row.catalogChecks ?? []
            : (row.catalogIds ?? []).map((id) => ({ id, zhCN: row.zhCN }));

        assert.ok(catalogChecks.length > 0, `${row.rowHash} has catalog checks`);

        for (const check of catalogChecks) {
          assert.equal(
            zhCatalog[check.id],
            check.zhCN,
            `${check.id} matches approved RTF Mandarin`
          );
        }
      }

      if (row.status === "implemented_db_seed") {
        assert.ok((row.dbSeedRefs ?? []).length > 0, `${row.rowHash} has DB seed references`);
      }

      if (row.status === "not_in_product" || row.status === "superseded_by_current_copy") {
        assert.match(row.reason ?? "", /\S/, `${row.rowHash} has a reconciliation reason`);
      }
    }

    assert.equal(zhCnCatalog["customer.landing.hero.title"], "停止猜测，");
    assert.equal(zhCnCatalog["customer.landing.hero.accent"], "开始知量。");
    assert.equal(zhCnCatalog["customer.landing.questionnaire.cta"], "免费测我的健康评分");
    assert.equal(zhCnCatalog["customer.landing.journal.browse"], "浏览知识库");
    assert.equal(zhCnCatalog["customer.landing.final.quote"], "Mattaññutā 知量，知健康。");
    assert.equal(zhCnCatalog["customer.titleBar.links.3.1"], "知识库");
    assert.equal(zhCnCatalog["customer.landing.results.fallback.2.name"], "Wanida P.（วนิดา）");
    assert.deepEqual(
      sourceCatalog["customer.landing.practice.steps.0.0"].approvedGlossaryOverrides,
      [
        {
          locale: "zh-CN",
          reason:
            "The supplied conversion-optimized Mandarin RTF intentionally uses “告诉我们” here instead of repeating the MattaNutra brand name.",
          term: "MattaNutra"
        }
      ]
    );
  });

  it("keeps the live zh-CN quiz intro aligned with the supplied Mandarin brief", () => {
    assert.equal(assessmentZhCn.about.title, "全是关于你");
    assert.equal(
      assessmentZhCn.about.subtitle,
      "先了解你的基本情况。几步轻触即可开始。这将为你的知量方案奠定基础。"
    );
    assert.equal(
      assessmentZhCn.about.honestyBody,
      "没有对错之分，只有真实的答案。回答越诚实，你的知量方案就越精准，也越能安全地配合你正在服用的产品。"
    );
    assert.equal(
      assessmentUiCopy["zh-CN"].resume.body,
      "留下邮箱，我们会发送专属链接，方便你随时回来继续（仅用于此目的）。"
    );
  });
});
