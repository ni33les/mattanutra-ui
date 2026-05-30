import {
  arrayValue,
  fetchHtml,
  findProductRecordWithVariants,
  isRecord,
  normalizedUrlWithoutHash,
  parseNextData
} from "./manufacturer-scrape-core.ts";

export function wordpressRenderedText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value) && typeof value.rendered === "string") {
    return value.rendered;
  }

  return "";
}

export function megaWeCareImageUrlsFromApi(record: Record<string, unknown>) {
  const urls: string[] = [];
  const yoast = isRecord(record.yoast_head_json)
    ? record.yoast_head_json
    : {};
  const ogImages = Array.isArray(yoast.og_image) ? yoast.og_image : [];

  for (const image of ogImages) {
    if (isRecord(image) && typeof image.url === "string") {
      urls.push(image.url);
    }
  }

  const embedded = isRecord(record._embedded) ? record._embedded : {};
  const featuredMedia = Array.isArray(embedded["wp:featuredmedia"])
    ? embedded["wp:featuredmedia"]
    : [];

  for (const media of featuredMedia) {
    if (isRecord(media) && typeof media.source_url === "string") {
      urls.push(media.source_url);
    }
  }

  return [...new Set(urls)].filter((url) =>
    /\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url)
  ).slice(0, 8);
}

export function swisseProductVendorFromHtml(html: string, text: string) {
  const vendorJson =
    html.match(/"vendor"\s*:\s*"([^"]+)"/i)?.[1] ??
    html.match(/"brand"\s*:\s*\{\s*"@type"\s*:\s*"Brand"\s*,\s*"name"\s*:\s*"([^"]+)"/i)?.[1] ??
    html.match(/<meta\b[^>]*property=["']product:brand["'][^>]*content=["']([^"']+)["']/i)?.[1];

  if (vendorJson) {
    return cleanHtmlText(vendorJson).slice(0, 200);
  }

  if (/Swisse Skincare/i.test(text)) {
    return "Swisse Skincare";
  }

  return "Swisse";
}

export function swisseSectionFromText(text: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stopPattern =
    "Benefits|Key Ingredients|Directions and Warnings|Directions|Warnings|Where To Buy|Reasons to love us|You may also like|Description";
  const match = text.match(new RegExp(`${escapedHeading}\\s+([\\s\\S]{1,2500}?)(?=\\s+(?:${stopPattern})\\b|$)`, "i"));

  return match?.[1]?.replace(/\s+/g, " ").trim().slice(0, 2000) ?? null;
}

export function swissePriceAmountFromText(text: string) {
  const match = text.match(/(?:sale\s+price|regular\s+price|price)?\s*(?:฿|THB)\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i) ??
    text.match(/(?:sale\s+price|regular\s+price|price)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:฿|THB)/i);
  const parsed = match ? Number(match[1].replace(/,/g, "")) : null;

  return parsed !== null && Number.isFinite(parsed) ? parsed : null;
}

function swisseOfferPlatform(url: string, label: string) {
  const combined = `${url} ${label}`.toLowerCase();

  if (combined.includes("shopee")) {
    return "shopee";
  }

  if (combined.includes("lazada")) {
    return "lazada";
  }

  if (combined.includes("line")) {
    return "line";
  }

  if (combined.includes("tiktok")) {
    return "tiktok";
  }

  return "direct";
}

export function swisseWhereToBuyLinksFromHtml(html: string, sourceUrl: string) {
  const baseUrl = new URL(sourceUrl);
  const canonicalHost = baseUrl.hostname.replace(/^www\./i, "");
  const links: Array<{
    label: string;
    linkType: "direct";
    network: string;
    platform: string;
    priority: number;
    status: "active";
    url: string;
  }> = [];

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1];
    const label = cleanHtmlText(match[2]);
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const combined = `${attrs} ${label}`;

    if (
      !href ||
      /\b(?:sign\s*in|log\s*in|account|cart|checkout|search)\b/i.test(label) ||
      !/where\s*to\s*buy|buy\s+at|shop\s+now|shopee|lazada|line|tiktok/i.test(combined)
    ) {
      continue;
    }

    try {
      const url = new URL(decodeEntities(href), baseUrl).toString();
      const host = new URL(url).hostname.replace(/^www\./i, "");

      if (
        !/^https?:\/\//i.test(url) ||
        host === canonicalHost ||
        /swisse\.co\.th\/(?:collections|pages|blogs|account|cart|search|customer_authentication)/i.test(url)
      ) {
        continue;
      }

      links.push({
        label: label || "Where to buy",
        linkType: "direct",
        network: "swisse_where_to_buy",
        platform: swisseOfferPlatform(url, label),
        priority: Math.max(0, 100 - links.length),
        status: "active",
        url
      });
    } catch {
      // Ignore malformed merchant URLs.
    }
  }

  return [...new Map(links.map((link) => [link.url, link])).values()].slice(0, 8);
}

export function vistraSectionFromText(text: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stopPattern =
    "ส่วนประกอบ|วิธี(?:การ)?รับประทาน|ข้อมูลสำหรับผู้แพ้อาหาร|คำเตือน|เลขสารระบบอาหาร|หมวดหมู่|แชร์|สินค้าที่เกี่ยวข้อง";
  const match = text.match(new RegExp(`${escapedHeading}\\s+([\\s\\S]{1,2500}?)(?=\\s+(?:${stopPattern})\\b|$)`, "i"));

  return match?.[1]?.replace(/\s+/g, " ").trim().slice(0, 2000) ?? null;
}

export function vistraThaiTitleFromText(title: string, text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const titleIndex = compact.toLowerCase().indexOf(title.toLowerCase());
  const afterTitle = titleIndex >= 0 ? compact.slice(titleIndex + title.length) : compact;
  const match = afterTitle.match(
    /([ก-๙0-9\s"'()\-+]{8,180}?ผลิตภัณฑ์เสริมอาหาร[ก-๙0-9\s"'()\-+]*)\s+(?=ส่วนประกอบ|คุณสมบัติ|วิธี|เลขสารระบบอาหาร|หมวดหมู่)/i
  );

  return match ? cleanHtmlText(match[1]).slice(0, 500) : null;
}

export function vistraCategoryTagsFromText(text: string) {
  const match = text.match(/หมวดหมู่\s*[:：]?\s*(.+?)(?=\s+(?:แชร์|Share|ป้ายกำกับ|Tag|สินค้าที่เกี่ยวข้อง|$))/i)?.[1];

  return match
    ? match
      .split(/[,،|/]/)
      .map((tag) => cleanHtmlText(tag).slice(0, 120))
      .filter(Boolean)
      .slice(0, 12)
    : [];
}

export function dhcSectionFromText(text: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stopPattern =
    "注意書き|成分・原材料|栄養成分表示|原材料名|アレルギー物質|健康食品について|レビュー|関連する商品|関連カテゴリ";
  const match = text.match(new RegExp(`${escapedHeading}\\s+([\\s\\S]{1,2500}?)(?=\\s+(?:${stopPattern})\\b|$)`, "i"));

  return match?.[1]?.replace(/\s+/g, " ").trim().slice(0, 2000) ?? null;
}

export function dhcPriceAmountFromHtml(html: string) {
  const jsonLdPrice = jsonLdProductRecordsFromHtml(html)
    .map((record) => isRecord(record.offers) ? record.offers.price : null)
    .find((price) => typeof price === "string" || typeof price === "number");
  const parsed = Number(String(jsonLdPrice ?? "").replace(/,/g, ""));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function productVariantImageUrlsFromNextData(html: string, sourceUrl: string) {
  const pageUrl = new URL(sourceUrl);

  if (pageUrl.hostname.replace(/^www\./i, "") !== "blackmores.com.au") {
    return [];
  }

  const data = parseNextData(html);
  const productRecord = findProductRecordWithVariants(data);
  const productVariants = arrayValue(productRecord?.productVariants);
  const imageUrls: string[] = [];
  const sortedVariants = [...productVariants].sort((first, second) => {
    const firstRecord = isRecord(first) ? first : {};
    const secondRecord = isRecord(second) ? second : {};

    if (firstRecord.default === true && secondRecord.default !== true) {
      return -1;
    }

    if (secondRecord.default === true && firstRecord.default !== true) {
      return 1;
    }

    return String(firstRecord.name ?? "").localeCompare(
      String(secondRecord.name ?? "")
    );
  });

  for (const variant of sortedVariants) {
    const variantRecord = isRecord(variant) ? variant : {};
    const imageGallery = isRecord(variantRecord.imageGallery)
      ? variantRecord.imageGallery
      : {};
    const images = arrayValue(imageGallery.images).sort((first, second) => {
      const firstIndex = Number(isRecord(first) ? first.index : 0);
      const secondIndex = Number(isRecord(second) ? second.index : 0);

      return (
        (Number.isFinite(firstIndex) ? firstIndex : 0) -
        (Number.isFinite(secondIndex) ? secondIndex : 0)
      );
    });

    for (const image of images) {
      const url = isRecord(image) && typeof image.url === "string"
        ? image.url
        : "";

      if (url && /\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url)) {
        imageUrls.push(url);
      }
    }
  }

  return [...new Set(imageUrls)].slice(0, 8);
}

export function blackmoresProductRecordFromHtml(html: string) {
  return findProductRecordWithVariants(parseNextData(html));
}

export function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, "\"")
    .replace(/&ldquo;/gi, "\"")
    .replace(/&ndash;/gi, "-")
    .replace(/&mdash;/gi, "-")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16))
    );
}

export function textFromHtml(html: string) {
  return decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

export function cleanHtmlText(html: string) {
  return textFromHtml(html).replace(/\s+/g, " ").trim();
}

export function titleFromHtml(html: string) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  return textFromHtml(h1 ?? title ?? "Imported product").slice(0, 240);
}

export function metaContent(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "i")
  ];

  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];

    if (value) {
      return cleanHtmlText(value);
    }
  }

  return null;
}

export function descriptionFromHtml(html: string, text: string) {
  const meta =
    metaContent(html, "description") ??
    metaContent(html, "og:description") ??
    metaContent(html, "twitter:description");

  if (meta) {
    return meta.slice(0, 4000);
  }

  return text
    .split(/(?<=[.!?])\s+/)
    .find((sentence) => sentence.length > 80 && sentence.length < 600)
    ?.slice(0, 4000) ?? null;
}

export function localizedProductNamesFromText(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const pairedMatch = compact.match(
    /ชื่อผลิตภัณฑ์\s*\(ไทย\)\s*[:：]\s*(.+?)\s+ชื่อผลิตภัณฑ์\s*\(อังกฤษ\)\s*[:：]\s*(.+?)(?=\s+(?:เลขทะเบียน|รูปแบบ|ส่วนประกอบ|คุณสมบัติ|วิธีรับประทาน|คำเตือน|$))/i
  );

  if (pairedMatch) {
    return {
      titleEn: cleanHtmlText(pairedMatch[2]).slice(0, 500) || null,
      titleTh: cleanHtmlText(pairedMatch[1]).slice(0, 500) || null
    };
  }

  return {
    titleEn:
      compact
        .match(/ชื่อผลิตภัณฑ์\s*\(อังกฤษ\)\s*[:：]\s*(.+?)(?=\s+(?:เลขทะเบียน|รูปแบบ|ส่วนประกอบ|คุณสมบัติ|วิธีรับประทาน|คำเตือน|$))/i)?.[1]
        ? cleanHtmlText(
          compact.match(/ชื่อผลิตภัณฑ์\s*\(อังกฤษ\)\s*[:：]\s*(.+?)(?=\s+(?:เลขทะเบียน|รูปแบบ|ส่วนประกอบ|คุณสมบัติ|วิธีรับประทาน|คำเตือน|$))/i)?.[1] ?? ""
        ).slice(0, 500)
        : null,
    titleTh:
      compact
        .match(/ชื่อผลิตภัณฑ์\s*\(ไทย\)\s*[:：]\s*(.+?)(?=\s+(?:ชื่อผลิตภัณฑ์|เลขทะเบียน|รูปแบบ|ส่วนประกอบ|คุณสมบัติ|วิธีรับประทาน|คำเตือน|$))/i)?.[1]
        ? cleanHtmlText(
          compact.match(/ชื่อผลิตภัณฑ์\s*\(ไทย\)\s*[:：]\s*(.+?)(?=\s+(?:ชื่อผลิตภัณฑ์|เลขทะเบียน|รูปแบบ|ส่วนประกอบ|คุณสมบัติ|วิธีรับประทาน|คำเตือน|$))/i)?.[1] ?? ""
        ).slice(0, 500)
        : null
  };
}

function imagePriority(url: string) {
  if (/\/sliced-images\/global\/products\//i.test(url)) {
    return 0;
  }

  if (/\/media\/product\/img-/i.test(url)) {
    return 0;
  }

  if (/\/media\/product\/social-thmb/i.test(url)) {
    return 1;
  }

  if (/\/media\/product\//i.test(url)) {
    return 2;
  }

  if (/\/products\/[^/?]+\.(?:avif|jpe?g|png|webp)/i.test(url)) {
    return 3;
  }

  if (/\/tile-(?:new-)?/i.test(url)) {
    return 8;
  }

  if (/logo|ico-|icon|btn|share|bullet|banner|privacy-options|woman-holding|woman-running|three-products-straight/i.test(url)) {
    return 10;
  }

  return 5;
}

function centrumProductImageUrlsFromHtml(html: string, sourceUrl: string) {
  const pageUrl = new URL(sourceUrl);

  if (pageUrl.hostname.replace(/^www\./i, "") !== "centrum.com") {
    return [];
  }

  const carouselStart = html.search(/class=["'][^"']*\bproduct-img\b[^"']*["']/i);
  const carouselHtml = carouselStart >= 0
    ? html.slice(carouselStart, html.indexOf("</script>", carouselStart) > carouselStart
      ? html.indexOf("</script>", carouselStart)
      : Math.min(html.length, carouselStart + 12_000))
    : "";
  const matches = [
    ...carouselHtml.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)
  ];
  const baseUrl = new URL(sourceUrl);
  const productSlugTokens = new Set(
    pageUrl.pathname
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1 && !["and", "the", "plus"].includes(token)) ?? []
  );

  return [...new Set(matches.flatMap((match) => {
    try {
      const url = new URL(decodeEntities(match[1]), baseUrl).toString();

      if (!/\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url) || imagePriority(url) >= 10) {
        return [];
      }

      const urlTokens = new Set(
        decodeURIComponent(url)
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((token) => token.length > 1)
      );
      const matchingTokens = [...productSlugTokens].filter((token) => urlTokens.has(token)).length;
      const isProductAsset = /\/sliced-images\/global\/products\/|\/products\//i.test(url);

      return isProductAsset || matchingTokens >= 2 ? [url] : [];
    } catch {
      return [];
    }
  }))]
    .sort((first, second) => imagePriority(first) - imagePriority(second))
    .slice(0, 8);
}

export function imageUrlsFromHtml(html: string, sourceUrl: string) {
  const matches = [
    ...html.matchAll(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)
  ];
  const baseUrl = new URL(sourceUrl);
  const structuredProductImages = productVariantImageUrlsFromNextData(
    html,
    sourceUrl
  );
  const centrumProductImages = centrumProductImageUrlsFromHtml(html, sourceUrl);
  const htmlImageUrls = matches.flatMap((match) => {
    try {
      return [new URL(decodeEntities(match[1]), baseUrl).toString()];
    } catch {
      return [];
    }
  });

  return [...new Set([...structuredProductImages, ...centrumProductImages, ...htmlImageUrls].filter((url) =>
    /\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url) &&
    imagePriority(url) < 10
  ))]
    .sort((first, second) => imagePriority(first) - imagePriority(second))
    .slice(0, 8);
}

export function jsonLdProductRecordsFromHtml(html: string) {
  const records: Record<string, unknown>[] = [];

  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeEntities(match[1] ?? "")) as unknown;
      const values = Array.isArray(parsed) ? parsed : [parsed];

      for (const value of values) {
        if (isRecord(value) && value["@type"] === "Product") {
          records.push(value);
        }
      }
    } catch {
      // Ignore malformed analytics JSON-LD.
    }
  }

  return records;
}

export function productJsonLdImagesFromHtml(html: string, sourceUrl: string) {
  const baseUrl = new URL(sourceUrl);

  return [...new Set(jsonLdProductRecordsFromHtml(html).flatMap((record) => {
    const image = record.image;
    const images = Array.isArray(image) ? image : [image];

    return images.flatMap((value) => {
      if (typeof value !== "string") {
        return [];
      }

      try {
        return [new URL(decodeEntities(value), baseUrl).toString()];
      } catch {
        return [];
      }
    });
  }).filter((url) => /\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url)))];
}

export function supplementFactsUrlFromHtml(html: string, sourceUrl: string) {
  const baseUrl = new URL(sourceUrl);
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const attrs = match[1];
    const text = cleanHtmlText(match[2]);

    if (!/supplement facts|nutrition facts|ข้อมูล/i.test(`${attrs} ${text}`)) {
      continue;
    }

    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];

    if (!href) {
      continue;
    }

    try {
      return new URL(decodeEntities(href), baseUrl).toString();
    } catch {
      return null;
    }
  }

  return null;
}

const haleonPdfUrlsByPage = new Map<string, Promise<string[]>>();

function tokenSet(value: string) {
  return new Set(
    decodeEntities(value)
      .toLowerCase()
      .replace(/%20/g, " ")
      .split(/[^a-z0-9]+/)
      .filter((token) =>
        token.length > 1 &&
        ![
          "centrum",
          "products",
          "product",
          "supplement",
          "supplements",
          "vitamin",
          "vitamins",
          "multivitamin",
          "multivitamins",
          "tablets",
          "tablet",
          "gummies",
          "gummy",
          "plus",
          "the",
          "and",
          "for"
        ].includes(token)
      )
  );
}

async function haleonPdfUrls(indexUrl: string) {
  const normalized = normalizedUrlWithoutHash(indexUrl, new URL(indexUrl));
  const existing = haleonPdfUrlsByPage.get(normalized);

  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const html = await fetchHtml(normalized);
    const baseUrl = new URL(normalized);

    return [...new Set([...html.matchAll(/(?:href|src)=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)]
      .flatMap((match) => {
        try {
          return [new URL(decodeEntities(match[1]), baseUrl).toString()];
        } catch {
          return [];
        }
      }))];
  })();

  haleonPdfUrlsByPage.set(normalized, promise);

  return promise;
}

function scoreLabelPdfForProduct(input: Readonly<{
  pdfUrl: string;
  productTitle: string;
  sourceUrl: string;
}>) {
  const productUrl = new URL(input.sourceUrl);
  const slug = productUrl.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const productTokens = tokenSet(`${slug} ${input.productTitle}`);
  const pdfTokens = tokenSet(input.pdfUrl);
  let score = 0;

  for (const token of productTokens) {
    if (pdfTokens.has(token)) {
      score += token.length >= 4 ? 2 : 1;
    }
  }

  if (/women|woman|female|prenatal|postnatal|maternal|menopause/i.test(input.productTitle) &&
    /women|woman|prenatal|postnatal|maternal|menopause/i.test(input.pdfUrl)) {
    score += 4;
  }

  if (/\bmen\b|male|prostate/i.test(input.productTitle) && /\bmen\b|male|prostate/i.test(input.pdfUrl)) {
    score += 4;
  }

  if (/(?:50|35)-?plus|50\+|35\+/i.test(input.productTitle) &&
    /(?:50|35)-?plus|50\+|35\+/i.test(input.pdfUrl)) {
    score += 3;
  }

  if (/kids|children/i.test(input.productTitle) && /kids|children/i.test(input.pdfUrl)) {
    score += 4;
  }

  if (/liquid/i.test(input.productTitle) && /liquid/i.test(input.pdfUrl)) {
    score += 5;
  }

  if (/omega/i.test(input.productTitle) && /omega/i.test(input.pdfUrl)) {
    score += 5;
  }

  return score;
}

export async function centrumSupplementFactsUrl(input: Readonly<{
  html: string;
  productTitle: string;
  sourceUrl: string;
}>) {
  const direct = supplementFactsUrlFromHtml(input.html, input.sourceUrl);

  if (direct && /\.pdf(?:\?|$)/i.test(direct)) {
    return direct;
  }

  const indexUrl = direct && /haleon\.info/i.test(direct)
    ? direct
    : "https://haleon.info/en-us/Centrum";
  const pdfUrls = await haleonPdfUrls(indexUrl);
  const ranked = pdfUrls
    .map((pdfUrl) => ({
      pdfUrl,
      score: scoreLabelPdfForProduct({
        pdfUrl,
        productTitle: input.productTitle,
        sourceUrl: input.sourceUrl
      })
    }))
    .sort((first, second) => second.score - first.score || first.pdfUrl.localeCompare(second.pdfUrl));

  return ranked[0] && ranked[0].score >= 4 ? ranked[0].pdfUrl : direct;
}
