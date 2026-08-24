import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("product admin card layout", () => {
  it("keeps brand, markets, and regulatory approval in distinct card areas", async () => {
    const view = await readFile("components/admin/product-view-ui.tsx", "utf8");
    const detailView = await readFile("components/admin/product-view.tsx", "utf8");
    const route = await readFile("app/api/admin/products/[id]/route.ts", "utf8");
    const writes = await readFile("lib/admin-product-writes.ts", "utf8");
    const productCard = view.slice(
      view.indexOf("export function ProductCard"),
      view.indexOf("export function ProductFactsEditor"),
    );

    assert.match(
      view,
      /row\.brandName\?\.trim\(\) \|\| viewLabels\.notAvailable/,
    );
    assert.match(view, /viewLabels\.markets/);
    assert.match(view, /row\.availableCountryCodes\.map/);
    assert.match(view, /viewLabels\.rrp/);
    assert.match(view, /approvalSummary !== "-"/);
    assert.match(view, /approval\.agencyCode\.replaceAll\("_", " "\)/);
    assert.doesNotMatch(productCard, /viewLabels\.regulatoryApproval/);
    assert.match(view, /mt-3 flex flex-wrap items-center gap-x-4 gap-y-2/);
    assert.doesNotMatch(
      productCard,
      /hidden h-3 w-px bg-gray-200 sm:inline-block/,
    );
    assert.match(
      view,
      /readyCountryPrice\.rrpPriceAmount[\s\S]*readyCountryPrice\.currency/,
    );
    assert.doesNotMatch(view, /RRP \{readyCountryPrice\.rrpPriceAmount/);
    assert.doesNotMatch(
      view,
      /grid divide-y divide-gray-100 bg-white sm:grid-cols-3/,
    );
    assert.doesNotMatch(
      view,
      /overflow-hidden rounded-lg ring-1 ring-gray-200/,
    );
    assert.doesNotMatch(productCard, /sourceTitle/);
    assert.doesNotMatch(detailView, /sourceEvidence\.sourceUrl/);
    assert.doesNotMatch(detailView, /viewLabels\.sourceTitle/);
    assert.doesNotMatch(detailView, /viewLabels\.productName/);
    assert.doesNotMatch(detailView, /viewLabels\.validationBlockers/);
    assert.doesNotMatch(detailView, /draft\.aiCorrectionNotes/);
    assert.doesNotMatch(detailView, /readableToken\(reason\)/);
    assert.match(detailView, /const englishTitle = row\.translations\?\.en\?\.title\?\.trim\(\) \|\| row\.title/);
    assert.match(view, /status: event\.target[\s\S]*AdminProductDetailRow\["translations"\]\[string\]\["status"\]/);
    assert.match(view, /englishTitle \? \{ title: englishTitle \} : \{\}/);
    assert.match(route, /englishTranslationTitle/);
    assert.match(route, /title: effectiveTitle/);
    assert.match(writes, /value\.status === "draft"/);
    assert.doesNotMatch(view, /decisionSummary/);
    assert.doesNotMatch(view, /productDecisionSummary/);
    assert.doesNotMatch(view, /averageClientFit/);
    assert.doesNotMatch(detailView, /recommendationDecisions/);
    assert.doesNotMatch(detailView, /ProductInsightStat/);
    assert.match(view, /function productImageFallbackText/);
    assert.match(view, /ProductImagePreview/);
    assert.match(view, /ProductImageFallback/);
    assert.match(view, /<ProductImagePreview row=\{row\} \/>/);
    assert.match(detailView, /ProductImagePreview/);
    assert.match(detailView, /localImagePreviewUrl/);
    assert.match(detailView, /URL\.revokeObjectURL\(localImagePreviewUrl\)/);
    assert.match(detailView, /onImageLoad=\{handleSavedImageLoad\}/);
    assert.match(detailView, /previewImageUrl=\{localImagePreviewUrl\}/);
    assert.match(detailView, /row=\{draft\}/);
    assert.doesNotMatch(productCard, /row\.platform\.toUpperCase\(\)/);
    assert.doesNotMatch(view, /productStatusLabel\(row\.productKind, locale\)/);
    assert.match(productCard, /viewLabels\.translations/);
    assert.match(productCard, /size-1\.5 rounded-full/);
    assert.doesNotMatch(
      productCard,
      /productTranslationStatusClass\(translation\.status\)/,
    );
    assert.doesNotMatch(productCard, /\{siteLocale\.label\}\{" "\}/);
    assert.doesNotMatch(view, /viewLabels\.source\}: \$\{row\.platform\}/);
    assert.doesNotMatch(
      view,
      /viewLabels\.sourceTitle\}: \$\{localized\.title\.canonicalValue\}/,
    );
    assert.doesNotMatch(
      view,
      /row\.brandName,[\s\S]*regulatoryApprovalSummary\(row\.regulatoryApprovals\)[\s\S]*viewLabels\.markets/,
    );
  });

  it("mirrors dropped product image URLs and supports uploads", async () => {
    const view = await readFile("components/admin/product-view-ui.tsx", "utf8");
    const detailView = await readFile("components/admin/product-view.tsx", "utf8");
    const resolveRoute = await readFile(
      "app/api/admin/products/[id]/image/resolve/route.ts",
      "utf8",
    );
    const uploadRoute = await readFile(
      "app/api/admin/products/[id]/image/upload/route.ts",
      "utf8",
    );
    const localUploadRoute = await readFile(
      "app/uploads/[...path]/route.ts",
      "utf8",
    );
    const dropzone = view.slice(
      view.indexOf("export function ProductImageDropzone"),
      view.indexOf("type ProductCountryApprovalPatch"),
    );

    assert.match(view, /getData\("text\/uri-list"\)/);
    assert.match(view, /getData\("text\/plain"\)/);
    assert.match(dropzone, /event\.dataTransfer\.files\.length > 0/);
    assert.match(dropzone, /uploadImageFile\(file\)/);
    assert.match(dropzone, /image\/resolve/);
    assert.match(dropzone, /image\/upload/);
    assert.match(dropzone, /type="file"/);
    assert.match(dropzone, /viewLabels\.imageUpload/);
    assert.match(dropzone, /viewLabels\.imageUseUrl/);
    assert.match(dropzone, /response\.text\(\)/);
    assert.match(dropzone, /x-request-id/);
    assert.match(dropzone, /failureMessage/);
    assert.match(dropzone, /request \$\{result\.requestId\}/);
    assert.match(dropzone, /lastFailedImageFile/);
    assert.match(dropzone, /lastFailedImageUrl/);
    assert.match(dropzone, /viewLabels\.retry \?\? "Retry"/);
    assert.match(dropzone, /URL\.createObjectURL\(file\)/);
    assert.match(dropzone, /onPreviewImageUrlChange\?\.\(previewUrl\)/);
    assert.match(dropzone, /onPreviewImageUrlChange\?\.\(previewUrl, result\.url\);[\s\S]*onImageUrlChange\(result\.url, result\.row\)/);
    assert.match(view, /fallback=\{preview \?\? brokenFallback\}/);
    assert.match(view, /onLoad=\{\(\) => onImageLoad\?\.\(row\.imageUrl!\)\}/);
    assert.match(view, /row\.imageUrl\.startsWith\("blob:"\)/);
    assert.match(view, /ProductImageBrokenFallback/);
    assert.match(view, /productImageRenderSrc\(row\.imageUrl, row\.updatedAt\)/);
    assert.doesNotMatch(dropzone, /imageFileDropUnsupported/);
    assert.match(dropzone, /draggable=\{true\}/);
    assert.match(dropzone, /event\.dataTransfer\.setData\("text\/uri-list", imageUrl\)/);
    assert.match(dropzone, /viewLabels\.imageCandidates/);
    assert.match(detailView, /<ProductImageDropzone/);
    assert.match(detailView, /accessToken=\{accessToken\}/);
    assert.match(detailView, /productId=\{draft\.id\}/);
    assert.match(detailView, /onPreviewImageUrlChange=\{handleLocalImagePreviewChange\}/);
    assert.match(detailView, /onPreviewImageLoad=\{handleSavedImageLoad\}/);
    assert.match(detailView, /previewImageUrl=\{localImagePreviewUrl\}/);
    assert.match(detailView, /row=\{draft\}/);
    assert.match(detailView, /storedImageUrl=\{draft\.imageUrl\}/);
    assert.match(detailView, /handlePersistedImageChange/);
    assert.match(detailView, /router\.refresh\(\)/);
    assert.match(detailView, /setDraft\(\(currentDraft\) =>/);
    assert.match(detailView, /\.\.\.currentDraft\.imageCandidates/);
    assert.match(detailView, /const imageCandidates = \[/);
    assert.match(detailView, /savedRow[\s\S]*normalizeProductDetailRow/);
    assert.match(resolveRoute, /mirrorImageToFirstParty/);
    assert.match(resolveRoute, /persistVerifiedAdminProductImageUrl/);
    assert.match(resolveRoute, /product_image_url_resolved/);
    assert.match(resolveRoute, /This image host blocks direct imports/);
    assert.match(resolveRoute, /namespace: "products"/);
    assert.match(resolveRoute, /source: "admin_product_image_dropzone"/);
    assert.match(uploadRoute, /uploadAdminProductImage/);
    assert.match(uploadRoute, /result\.row/);
    assert.match(uploadRoute, /result\.image/);
    assert.match(uploadRoute, /maxUploadBytes = 6 \* 1024 \* 1024/);
    assert.match(localUploadRoute, /"public"[\s\S]*"uploads"/);
    assert.match(localUploadRoute, /filePath\.startsWith\(rootPrefix\)/);
    assert.match(localUploadRoute, /uploadCacheControl/);
  });

  it("keeps product list metric counts independent from active filters", async () => {
    const readModel = await readFile("lib/admin-product-read-model.ts", "utf8");
    const listQuery = readModel.slice(
      readModel.indexOf("export async function getAdminProductListData"),
      readModel.indexOf("export async function loadAdminProductRow"),
    );

    assert.match(listQuery, /filtered_count as \(/);
    assert.match(listQuery, /summary_total/);
    assert.match(listQuery, /total: numberOrNull\(stats\?\.summary_total\) \?\? 0/);
    assert.match(
      listQuery,
      /products\.image_url is null or btrim\(products\.image_url\) = '' then 'Missing Image'/,
    );
    assert.doesNotMatch(listQuery, /validation_reasons[\s\S]{0,120}missing_image/);
    assert.doesNotMatch(listQuery, /summary_approved[\s\S]{0,120}over\(\)/);
    assert.doesNotMatch(listQuery, /product_list_base/);
    assert.doesNotMatch(listQuery, /product_recommendation_items/);
    assert.doesNotMatch(listQuery, /jsonb_agg\([\s\S]*product_regulatory_approvals/);
  });

  it("keeps recommendation telemetry out of product admin surfaces", async () => {
    const view = await readFile("components/admin/product-view-ui.tsx", "utf8");
    const detailView = await readFile("components/admin/product-view.tsx", "utf8");
    const helpers = await readFile("components/admin/product-view-helpers.ts", "utf8");
    const readModel = await readFile("lib/admin-product-read-model.ts", "utf8");
    const detailReadPath = readModel.slice(
      readModel.indexOf("export async function getAdminProductDetailData"),
      readModel.indexOf("export async function getAdminProductsData")
    );

    assert.doesNotMatch(view, /ProductInsightStat/);
    assert.doesNotMatch(view, /chosenPlanCount|nearMissCount|averageProductCoveragePercent/);
    assert.doesNotMatch(detailView, /Recommendation decisions|decisionStats/);
    assert.doesNotMatch(helpers, /productDecisionSummary|averageClientFit|nearMisses/);
    assert.doesNotMatch(detailReadPath, /getProductDecisionStatsByProduct|decisionStats/);
  });

  it("keeps product image metrics based on the image URL field", async () => {
    const helpers = await readFile("components/admin/product-view-helpers.ts", "utf8");
    const mapper = await readFile("lib/admin-product-mappers.ts", "utf8");

    assert.match(helpers, /metric === "productsMissingImages"[\s\S]*!row\.imageUrl\?\.trim\(\)/);
    assert.match(helpers, /counts\.missingImage \+= !row\.imageUrl\?\.trim\(\) \? 1 : 0/);
    assert.match(mapper, /validationLabel\(validation, row\.image_url\)/);
    assert.match(mapper, /!hasProductImageUrl\(imageUrl\)[\s\S]*return "Missing Image"/);
  });

  it("keeps product form editable on the product detail page", async () => {
    const detailView = await readFile("components/admin/product-view.tsx", "utf8");
    const helpers = await readFile("components/admin/product-view-helpers.ts", "utf8");
    const route = await readFile("app/api/admin/products/[id]/route.ts", "utf8");
    const readModel = await readFile("lib/admin-product-read-model.ts", "utf8");
    const mapper = await readFile("lib/admin-product-mappers.ts", "utf8");
    const writes = await readFile("lib/admin-product-writes.ts", "utf8");

    assert.match(helpers, /export const productForms = productFormValues/);
    assert.match(helpers, /productForm: "Form"/);
    assert.match(detailView, /productForm: row\.productForm/);
    assert.match(detailView, /value=\{draft\.productForm\}/);
    assert.match(detailView, /productForms\.map/);
    assert.match(route, /parseProductForm\(body\.productForm\)/);
    assert.match(route, /body\.productForm !== undefined && !productForm/);
    assert.match(readModel, /products\.source_snapshot ->> 'productForm'/);
    assert.match(mapper, /productForm,/);
    assert.match(writes, /productForm,/);
    assert.match(writes, /input\.productForm !== undefined \? \{ productForm: input\.productForm \} : \{\}/);
    assert.doesNotMatch(writes, /product_form =/);
  });

  it("shows matching readiness on the product detail page", async () => {
    const detailView = await readFile("components/admin/product-view.tsx", "utf8");
    const helpers = await readFile("components/admin/product-view-helpers.ts", "utf8");
    const readiness = await readFile("lib/product-matching-readiness.ts", "utf8");

    assert.match(detailView, /productMatchingReadiness/);
    assert.match(detailView, /ProductMatchingReadinessPanel/);
    assert.match(detailView, /labels\.matchingReadiness/);
    assert.match(detailView, /labels\.matchingCanMatch/);
    assert.match(detailView, /labels\.matchingCannotMatchYet/);
    assert.match(detailView, /labels\.matchingNeedsWork/);
    assert.match(helpers, /matchingReadiness: "Matching readiness"/);
    assert.match(helpers, /matchingCanMatch: "Can match"/);
    assert.match(helpers, /matchingCannotMatchYet: "Cannot match yet"/);
    assert.match(helpers, /matchingReady: "Ready"/);
    assert.match(readiness, /brandStatus === "approved"/);
    assert.match(readiness, /input\.status === "approved"/);
    assert.match(readiness, /validation\?\.status === "pass"/);
    assert.match(readiness, /input\.labelStatus === "parsed"/);
    assert.match(readiness, /hasCompatibleCountryAvailability/);
  });

  it("saves product edits and selected state through one save action", async () => {
    const detailView = await readFile("components/admin/product-view.tsx", "utf8");
    const helpers = await readFile("components/admin/product-view-helpers.ts", "utf8");
    const route = await readFile("app/api/admin/products/[id]/route.ts", "utf8");
    const barrel = await readFile("lib/admin-products.ts", "utf8");
    const writes = await readFile("lib/admin-product-writes.ts", "utf8");
    const backHrefUsages = detailView.match(/href=\{backHref\}/g) ?? [];

    assert.match(route, /export async function DELETE/);
    assert.match(route, /deleteIgnoredAdminProduct/);
    assert.match(barrel, /deleteIgnoredAdminProduct/);
    assert.match(detailView, /method: "DELETE"/);
    assert.match(detailView, /type ProductStateAction = "approved" \| "ignored" \| "pending_review"/);
    assert.doesNotMatch(detailView, /function saveProductState/);
    assert.doesNotMatch(detailView, /onSaveState/);
    assert.match(detailView, /const \[stateSelection, setStateSelection\]/);
    assert.match(detailView, /function selectProductState/);
    assert.match(detailView, /function draftWithSelectedState/);
    assert.match(detailView, /async function handleSaveChanges/);
    assert.doesNotMatch(detailView, /handleProductStateAction/);
    assert.match(detailView, /import \{ ArrowLeft, Plus \} from "lucide-react";/);
    assert.doesNotMatch(detailView, /<span className="isolate inline-flex rounded-md shadow-xs">/);
    assert.doesNotMatch(detailView, /rounded-l-md[\s\S]*rounded-r-md/);
    assert.match(detailView, /aria-label=\{viewLabels\.stateAction\}/);
    assert.doesNotMatch(detailView, /aria-label=\{viewLabels\.saveState\}/);
    assert.match(detailView, /selectProductState\(event\.target\.value as ProductStateAction\)/);
    assert.match(detailView, /value=\{selectedState\}/);
    assert.doesNotMatch(detailView, /stateSaveDisabled/);
    assert.doesNotMatch(detailView, /viewLabels\.saveState/);
    assert.match(detailView, /onClick=\{\(\) => void handleSaveChanges\(\)\}/);
    assert.match(detailView, /await onSave\(nextDraft\)/);
    assert.doesNotMatch(
      detailView,
      />\s*\{saving \? viewLabels\.saving : viewLabels\.saveState\}\s*<\/button>/,
    );
    assert.match(detailView, /value="pending_review"[\s\S]*viewLabels\.statePendingReview/);
    assert.match(detailView, /value="approved"[\s\S]*viewLabels\.stateApproved/);
    assert.match(detailView, /value="ignored"[\s\S]*viewLabels\.stateIgnored/);
    assert.doesNotMatch(detailView, /value="deleted"/);
    assert.match(detailView, /status: selectedState/);
    assert.match(detailView, /currentBusinessState === "ignored"/);
    assert.match(detailView, /async function handleIgnoredProductDelete/);
    assert.match(detailView, /currentBusinessState === "ignored" \? \(/);
    assert.match(detailView, /onClick=\{\(\) => void handleIgnoredProductDelete\(\)\}/);
    assert.match(detailView, /\{viewLabels\.deleteAction\}/);
    assert.match(detailView, /if \(await onDelete\(draft\)\) \{\s*onClose\(\);/);
    assert.doesNotMatch(detailView, /window\.confirm/);
    assert.doesNotMatch(detailView, /deleteIgnoredConfirm/);
    assert.doesNotMatch(detailView, /const deleteTarget: AdminProductDetailRow/);
    assert.doesNotMatch(detailView, /const productIgnored = await applyIgnoredState/);
    assert.match(detailView, /statusMessage/);
    assert.match(detailView, /viewLabels\.backToProducts/);
    assert.match(detailView, /viewLabels\.saveChanges/);
    assert.match(detailView, /hover:underline/);
    assert.match(detailView, /labelStatus: row\.facts\.length > 0 \? "parsed" : row\.labelStatus/);
    assert.match(detailView, /await onImportDecision\(nextDraft, "approve_product", null, reviewerNoteText\)/);
    assert.match(detailView, /await onImportDecision\(nextDraft, "ignore_import", null, reviewerNoteText\)/);
    assert.ok(backHrefUsages.length >= 2);
    assert.ok(
      detailView.lastIndexOf("viewLabels.saveChanges") <
        detailView.lastIndexOf("viewLabels.backToProducts"),
    );
    assert.doesNotMatch(
      detailView,
      /onClick=\{onClose\}[\s\S]{0,200}\{viewLabels\.backToProducts\}/,
    );
    assert.doesNotMatch(detailView, /sticky bottom-0/);
    assert.doesNotMatch(detailView, /if \(await onSave\(ignoredDraft\)\) \{\s*onClose\(\);/);
    assert.doesNotMatch(detailView, /if \(await onSave\(approvedDraft\)\) \{\s*onClose\(\);/);
    assert.doesNotMatch(helpers, /deleteIgnoredConfirm/);
    assert.match(helpers, /deleteAction/);
    assert.match(helpers, /saveChanges/);
    assert.match(helpers, /productSaved/);
    assert.match(helpers, /stateAction/);
    assert.match(helpers, /stateApproved/);
    assert.match(helpers, /stateIgnored/);
    assert.match(helpers, /statePendingReview/);
    assert.doesNotMatch(
      detailView,
      /<label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">[\s\S]{0,120}\{viewLabels\.stateAction\}/,
    );
    assert.match(writes, /export async function deleteIgnoredAdminProduct/);
    assert.match(writes, /products\.status = 'ignored'/);
    assert.match(writes, /existing\.status !== "deleted"/);
    assert.match(writes, /status = 'deleted'/);
    assert.match(writes, /availability_status = 'unavailable'/);
    assert.match(writes, /#deleted#/);
    assert.match(writes, /originalNormalizedUrl/);
    assert.match(writes, /ignored_product_soft_deleted/);
    assert.match(writes, /product_soft_deleted/);
    assert.doesNotMatch(writes, /delete from public\.products/);
    assert.doesNotMatch(writes, /delete from public\.product_recommendation_items/);
    assert.doesNotMatch(writes, /delete from public\.product_recommendation_decisions/);
    assert.doesNotMatch(writes, /delete from public\.retail_customer_order_lines/);
    assert.doesNotMatch(writes, /delete from public\.retail_order_allocations/);
    assert.doesNotMatch(writes, /delete from public\.retail_stock_movements/);
    assert.doesNotMatch(writes, /delete from public\.product_versions/);
  });

  it("soft-deletes products with recommendation history and hides them from active product surfaces", async () => {
    const productStatusTypes = await readFile("lib/product-recommendation-types.ts", "utf8");
    const adminProductTypes = await readFile("lib/admin-product-types.ts", "utf8");
    const schema = await readFile("db-schema.sql", "utf8");
    const schemaScript = await readFile("scripts/apply-product-soft-delete-schema.ts", "utf8");
    const deployDev = await readFile("scripts/deploy-dev.mjs", "utf8");
    const deployUat = await readFile("scripts/deploy-uat.mjs", "utf8");
    const rebuildUat = await readFile("scripts/rebuild-uat-db.mjs", "utf8");
    const rebuildPrd = await readFile("scripts/rebuild-prd-db.mjs", "utf8");
    const readModel = await readFile("lib/admin-product-read-model.ts", "utf8");
    const catalogueCsv = await readFile("lib/product-catalogue-csv.ts", "utf8");
    const createRoute = await readFile("app/api/admin/products/route.ts", "utf8");
    const detailRoute = await readFile("app/api/admin/products/[id]/route.ts", "utf8");

    assert.match(productStatusTypes, /\| "deleted"/);
    assert.match(adminProductTypes, /"deleted"/);
    assert.match(schema, /products_status_check[\s\S]*'deleted'::text/);
    assert.match(schemaScript, /products_status_check/);
    assert.match(schemaScript, /status in \('approved', 'deleted', 'ignored', 'pending_review'\)/);
    assert.match(deployDev, /products:soft-delete:schema:apply/);
    assert.match(deployUat, /products:soft-delete:schema:apply/);
    assert.match(rebuildUat, /products:soft-delete:schema:apply/);
    assert.match(rebuildPrd, /products:soft-delete:schema:apply/);
    assert.match(readModel, /where products\.status <> 'deleted'/);
    assert.match(catalogueCsv, /products\.status not in \('ignored', 'deleted'\)/);
    assert.match(createRoute, /status === "deleted"/);
    assert.match(detailRoute, /status === "deleted"/);
  });

  it("uses a top-right close control for the product country approval dialog", async () => {
    const view = await readFile("components/admin/product-view-ui.tsx", "utf8");
    const countryManager = view.slice(
      view.indexOf("export function ProductCountryManager"),
      view.indexOf("type ProductIdentifierType"),
    );

    assert.match(countryManager, /<X aria-hidden=\{true\}/);
    assert.match(countryManager, /aria-label=\{pricingLabels\?\.cancel \?\? "Close"\}/);
    assert.match(countryManager, /setApprovalDialog\(null\);\s*return;/);
    assert.match(countryManager, /onClick=\{\(\) => void saveApprovalDialog\(\)\}/);
    assert.doesNotMatch(
      countryManager,
      /\{pricingLabels\?\.cancel \?\? "Cancel"\}/,
    );
  });

  it("renders a matcher profile preview directly under product facts", async () => {
    const detailView = await readFile("components/admin/product-view.tsx", "utf8");
    const matcher = await readFile("lib/product-matching-profile.ts", "utf8");

    assert.match(detailView, /ProductMatchingProfilePanel/);
    assert.match(detailView, /buildProductMatchingProfile\(row\)/);
    assert.match(detailView, /labels\.matchingProfile/);
    assert.match(detailView, /labels\.matcherItem/);
    assert.match(detailView, /labels\.matcherDose/);
    assert.match(detailView, /labels\.matcherSource/);
    assert.match(detailView, /labels\.matcherStatus/);
    assert.ok(
      detailView.indexOf("<ProductFactsEditor") <
        detailView.indexOf("<ProductMatchingProfilePanel"),
    );
    assert.match(matcher, /export function buildProductMatchingProfile/);
    assert.match(matcher, /displayName: "Omega-3"/);
    assert.match(matcher, /productFactAliasKeys/);
    assert.match(matcher, /factComparableAmount/);
  });

  it("keeps approved products matchable by approving pending brands", async () => {
    const writes = await readFile("lib/admin-product-writes.ts", "utf8");
    const search = await readFile("lib/admin-product-search.ts", "utf8");
    const coverage = await readFile("lib/admin-product-coverage.ts", "utf8");

    assert.match(search, /candidate\.brandStatus === "approved"/);
    assert.match(coverage, /product\.brandStatus === "approved"/);
    assert.match(writes, /const effectiveProductStatus =/);
    assert.match(writes, /effectiveProductStatus === "approved"/);
    assert.match(writes, /update public\.product_brands/);
    assert.match(writes, /and status = 'pending_review'/);
    assert.match(writes, /brandAutoApproved/);
  });

  it("keeps product fact dose edits as decimal drafts while typing", async () => {
    const view = await readFile("components/admin/product-view-ui.tsx", "utf8");
    const factsEditor = view.slice(
      view.indexOf("export function ProductFactsEditor"),
      view.indexOf("function productFactIssueMessages"),
    );

    assert.match(factsEditor, /amountDrafts/);
    assert.match(factsEditor, /function parsedCompleteDecimal/);
    assert.match(factsEditor, /inputMode="decimal"/);
    assert.match(factsEditor, /step="any"/);
    assert.match(factsEditor, /type="text"/);
    assert.match(factsEditor, /setAmountDrafts/);
    assert.match(factsEditor, /if \(parsed !== undefined\)/);
    assert.match(factsEditor, /\\d\*\\\.\\d\+/);
    assert.match(factsEditor, /confidence: "high"/);
    assert.doesNotMatch(factsEditor, /confidence: "moderate"/);
    assert.doesNotMatch(factsEditor, /Number\(event\.target\.value\)/);
  });
});
