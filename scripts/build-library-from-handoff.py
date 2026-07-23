#!/usr/bin/env python3
"""Build visual-knowledge.json from the Thai Landing+Library hand-off (Workstream 1).

Rules:
- Thai HTML is authoritative (no machine translation).
- English HTML from the hand-off is used for EN page nodes (35 articles).
- zh-CN is preserved from the previous payload when present; otherwise falls back
  to English nodes with prior quiz/defaults (no Google Translate).
- library-manifest.json is SSOT for shareImage, nongPose, category, featured, dates.
"""

from __future__ import annotations

import html
import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import Any

import os

REPO_ROOT = Path(__file__).resolve().parents[1]
CONTENT_PATH = REPO_ROOT / "content" / "library" / "visual-knowledge.json"
# Prefer checked-in tl.zip extract (files/ttf-ws1-tl), then env override, then legacy cache.
_DEFAULT_PACKAGE = REPO_ROOT / "files" / "ttf-ws1-tl"
_LEGACY_PACKAGE = (
    REPO_ROOT / ".cache" / "ttf-ws1" / "MattaNutra_TH_Localization_Handoff_2026-07-19"
)
_env_root = os.environ.get("TTF_WS1_ROOT", "").strip()
PACKAGE_ROOT = Path(_env_root) if _env_root else (
    _DEFAULT_PACKAGE if _DEFAULT_PACKAGE.is_dir() else _LEGACY_PACKAGE
)
MANIFEST_PATH = PACKAGE_ROOT / "library-manifest.json"
EXTRACT_HINT = "unzip files/tl.zip and set TTF_WS1_ROOT, or use files/ttf-ws1-tl/"

LOCALES = ("en", "th", "zh-CN")
CANONICAL_REDIRECTS = {
    "coq10-who-is-it-actually-for": "coq10-who-is-it-for",
    "health-check-leave-out-biomarkers": "expensive-health-check-leave-out",
    "omega-3-every-day": "should-you-take-omega-3-every-day",
    "vitamin-d-thailand": "vitamin-d-in-thailand",
}


def load_zip_builder():
    path = REPO_ROOT / "scripts" / "build-library-from-zips.py"
    spec = importlib.util.spec_from_file_location("build_library_from_zips", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    # Prevent running main()
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def strip_title(value: str) -> str:
    text = html.unescape(value)
    for suffix in (
        "| The MattaNutra Library",
        "| คลังความรู้ MattaNutra",
        "| MattaNutra Library",
        "| MattaNutra",
    ):
        text = text.replace(suffix, "")
    return text.strip()


def normalize_pose(raw: str) -> str:
    token = raw.strip().lower()
    if token.startswith("nong_"):
        token = token[len("nong_") :]
    elif token.startswith("nong-"):
        token = token[len("nong-") :]
    return token.replace("_", "-")


def identity_memory() -> dict[str, dict[str, dict[str, str]]]:
    return {}


def parse_quiz_from_markup(markup: str, locale: str, defaults: dict[str, Any]) -> dict[str, Any]:
    """Extract mini-check questions from article HTML; keep static result chrome.

    Supports both legacy `.quiz` blocks and newer `.check-wrap .mini` blocks used
    by the hand-off VK31–35 pages.
    """
    title = defaults.get("title")
    hint = defaults.get("hint")

    title_match = re.search(
        r'class="[^"]*\b(?:quiz|mini-head|mini)\b[^"]*"[\s\S]*?<h2[^>]*>(.*?)</h2>',
        markup,
        flags=re.I | re.S,
    )
    if not title_match:
        title_match = re.search(r"<h2[^>]*>(.*?Mini-check.*?|.*?เช็กสั้น.*?)</h2>", markup, flags=re.I | re.S)
    if title_match:
        title = re.sub(r"<[^>]+>", "", html.unescape(title_match.group(1))).strip()

    hint_match = re.search(
        r'class="[^"]*\bhint\b[^"]*"[^>]*>(.*?)</p>',
        markup,
        flags=re.I | re.S,
    )
    if not hint_match:
        # mini-head companion paragraph
        hint_match = re.search(
            r"<h2[^>]*>.*?</h2>\s*<p>(.*?)</p>",
            markup,
            flags=re.I | re.S,
        )
    if hint_match:
        hint = re.sub(r"<[^>]+>", "", html.unescape(hint_match.group(1))).strip()

    questions: list[dict[str, Any]] = []

    # Pattern A: buttons with data-q + data-val
    for block in re.finditer(
        r'<div class="q"[^>]*>(.*?)</div>\s*(?=<div class="q"|</div>\s*<div[^>]*result|</div>\s*</div>)',
        markup,
        flags=re.I | re.S,
    ):
        chunk = block.group(0)
        qid_m = re.search(r'data-q="([^"]+)"', chunk)
        qid = qid_m.group(1) if qid_m else None

        q_match = re.search(r"<p>(.*?)</p>", chunk, flags=re.I | re.S)
        if not q_match:
            q_match = re.search(r"<span>(.*?)</span>", chunk, flags=re.I | re.S)
        if not q_match:
            # e.g. <div><b>1.</b> Question text</div>
            q_match = re.search(
                r'<div class="q"[^>]*>\s*<div>(.*?)</div>',
                chunk,
                flags=re.I | re.S,
            )
        if not q_match:
            continue
        question = re.sub(r"<[^>]+>", "", html.unescape(q_match.group(1))).strip()
        question = re.sub(r"^\d+\.\s*", "", question).strip()

        options: list[dict[str, str]] = []
        for btn in re.finditer(r"<button([^>]*)>(.*?)</button>", chunk, flags=re.I | re.S):
            attrs, label_html = btn.group(1), btn.group(2)
            val_m = re.search(r'data-val="([^"]*)"', attrs)
            label = re.sub(r"<[^>]+>", "", html.unescape(label_html)).strip()
            if not label:
                continue
            if val_m:
                value = val_m.group(1)
            else:
                # Yes/No order fallback
                lowered = label.lower()
                if lowered in {"yes", "ใช่", "是"}:
                    value = "yes"
                elif lowered in {"no", "ไม่ใช่", "ไม่", "否"}:
                    value = "no"
                else:
                    value = f"opt{len(options) + 1}"
            options.append({"label": label, "value": value})

        if question and options:
            questions.append(
                {
                    "id": qid or f"q{len(questions) + 1}",
                    "question": question,
                    "options": options,
                }
            )

    if not questions:
        questions = defaults.get("questions") or []

    return {
        "title": title or defaults.get("title") or "Mini-check",
        "hint": hint or defaults.get("hint") or "",
        "questions": questions,
        "resultTitle": defaults.get("resultTitle")
        or {
            "en": "Nong Matta's read",
            "th": "น้องมัตตะอ่านภาพรวมว่า",
            "zh-CN": "Nong Matta 的判断",
        }[locale],
        "resultBody": defaults.get("resultBody")
        or {
            "en": "Use the full assessment to check dose, timing, safety and fit before choosing supplements.",
            "th": "ใช้แบบประเมินฉบับเต็มเพื่อตรวจขนาด เวลาใช้ ความปลอดภัย และความเหมาะสมก่อนเลือกอาหารเสริม",
            "zh-CN": "请用完整评估检查剂量、时间、安全性和适配度，再决定补充剂。",
        }[locale],
        "cta": defaults.get("cta")
        or {
            "en": "Start designing your Right Amount",
            "th": "เริ่มออกแบบปริมาณที่พอดีของคุณ",
            "zh-CN": "开始设计你的知量方案",
        }[locale],
    }


def extract_faqs(markup: str) -> list[dict[str, str]]:
    payloads = []
    for match in re.finditer(
        r'<script\s+type=["\']application/ld\+json["\']\s*>(.*?)</script>',
        markup,
        flags=re.I | re.S,
    ):
        raw = html.unescape(match.group(1).strip())
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            payloads.append(value)
    faqs: list[dict[str, str]] = []
    for payload in payloads:
        if payload.get("@type") != "FAQPage":
            continue
        for item in payload.get("mainEntity") or []:
            if not isinstance(item, dict):
                continue
            answer = item.get("acceptedAnswer") or {}
            if not isinstance(answer, dict):
                continue
            q = item.get("name")
            a = answer.get("text")
            if isinstance(q, str) and isinstance(a, str):
                faqs.append({"question": q, "answer": a})
    return faqs


def extract_about_citations(markup: str) -> tuple[list[str], list[str], str, str]:
    about: list[str] = []
    citations: list[str] = []
    date_published = ""
    date_modified = ""
    for match in re.finditer(
        r'<script\s+type=["\']application/ld\+json["\']\s*>(.*?)</script>',
        markup,
        flags=re.I | re.S,
    ):
        raw = html.unescape(match.group(1).strip())
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(value, dict) or value.get("@type") != "Article":
            continue
        date_published = str(value.get("datePublished") or date_published)
        date_modified = str(value.get("dateModified") or date_modified or date_published)
        about_val = value.get("about") or []
        if isinstance(about_val, str):
            about = [about_val]
        elif isinstance(about_val, list):
            about = [str(item) for item in about_val]
        cit = value.get("citation") or []
        if isinstance(cit, str):
            citations = [cit]
        elif isinstance(cit, list):
            citations = [str(item) for item in cit]
    return about, citations, date_published, date_modified


def find_main(root, zb) -> Any:
    return zb.find_first(
        root,
        lambda item: item.tag == "main"
        and (
            item.attrs.get("id") in {"main", "content"}
            or "wrap" in item.attrs.get("class", "").split()
        ),
    )


def build_nodes_for_locale(
    zb,
    markup: str,
    locale: str,
    slug: str,
    dimensions: dict[str, tuple[int, int]],
) -> list[dict[str, Any]]:
    # Patch localize path: allow any slug by temporarily expanding ALL_PHASE_SLUGS
    if slug not in zb.ALL_PHASE_SLUGS:
        zb.ALL_PHASE_SLUGS = list(zb.ALL_PHASE_SLUGS) + [slug]

    root = zb.parse_html_document(markup)
    main_node = find_main(root, zb)
    if not main_node:
        raise SystemExit(f"{slug} {locale}: missing <main>")

    # Identity localization: empty memory + empty cache + override localized_text
    original_localized = zb.localized_text

    def identity_text(text: str, loc: str, article_slug: str, memory, cache) -> str:
        # Preserve exact text from HTML (only normalize via clean for whitespace in attrs path;
        # body text nodes should stay as in source — use original text, not re-typed).
        return text

    zb.localized_text = identity_text  # type: ignore[assignment]
    try:
        nodes = [
            payload
            for child in main_node.children
            if (
                payload := zb.node_to_payload(
                    child, locale, slug, identity_memory(), {}, dimensions
                )
            )
        ]
    finally:
        zb.localized_text = original_localized
    return nodes



def rewrite_node_hrefs(zb, nodes: list[dict], locale: str, known_slugs: set[str]) -> list[dict]:
    """Second-pass href cleanup for relative .html and missing library targets."""

    def fix_href(href: str) -> str | None:
        if not isinstance(href, str) or not href:
            return href
        if href == "#":
            return href
        # relative html / bare slug
        clean = href.strip()
        library_slug = zb.library_href_slug(clean)
        if library_slug:
            canonical = zb.canonical_library_slug(library_slug)
            if canonical in known_slugs:
                return f"/{locale}/library/{canonical}"
            if library_slug in zb.MISSING_LIBRARY_SLUGS or canonical in zb.MISSING_LIBRARY_SLUGS:
                return None  # drop link
        return zb.localize_href(clean, locale)

    def rewrite(node: dict) -> dict | None:
        if node.get("type") == "text":
            return node
        if node.get("type") == "image":
            return node
        if node.get("type") == "icon":
            return node
        if node.get("type") == "fragment":
            children = [c for child in node.get("children", []) if (c := rewrite(child))]
            return {"type": "fragment", "children": children} if children else None
        if node.get("type") == "element":
            attrs = dict(node.get("attrs") or {})
            children_in = node.get("children") or []
            if node.get("tag") == "a" and isinstance(attrs.get("href"), str):
                fixed = fix_href(attrs["href"])
                if fixed is None:
                    # unwrap to fragment of children
                    children = [c for child in children_in if (c := rewrite(child))]
                    return {"type": "fragment", "children": children} if children else None
                attrs["href"] = fixed
            children = [c for child in children_in if (c := rewrite(child))]
            return {
                "type": "element",
                "tag": node.get("tag"),
                "attrs": attrs,
                "children": children,
            }
        return node

    return [c for node in nodes if (c := rewrite(node))]


def build_translation(
    zb,
    markup: str,
    locale: str,
    slug: str,
    dimensions: dict[str, tuple[int, int]],
    existing_article: dict[str, Any] | None,
) -> dict[str, Any]:
    root = zb.parse_html_document(markup)
    title_node = zb.find_first(root, lambda item: item.tag == "title")
    raw_title = zb.text_content(title_node) if title_node else slug
    title = strip_title(raw_title)
    description = zb.meta_content(root, name="description") or title
    nodes = build_nodes_for_locale(zb, markup, locale, slug, dimensions)
    nodes = rewrite_node_hrefs(zb, nodes, locale, set(zb.ALL_PHASE_SLUGS))
    blocks = zb.collect_blocks_from_nodes(nodes)
    excerpt = ""
    for block in blocks:
        if block["type"] == "paragraph":
            excerpt = block["text"]
            break
    if not excerpt:
        excerpt = description

    existing_quiz = (existing_article or {}).get("translations", {}).get(locale, {}).get(
        "quiz"
    )
    defaults = existing_quiz if isinstance(existing_quiz, dict) else zb.existing_quiz(
        existing_article, locale
    )
    quiz = parse_quiz_from_markup(markup, locale, defaults)
    faqs = extract_faqs(markup)

    return {
        "blocks": blocks,
        "description": description,
        "excerpt": excerpt,
        "faqs": faqs,
        "imageAlt": title,
        "page": {"nodes": nodes},
        "quiz": quiz,
        "seoTitle": title,
        "title": title,
    }


def clone_translation_with_locale_hrefs(
    zb,
    source: dict[str, Any],
    locale: str,
    slug: str,
) -> dict[str, Any]:
    """Deep-copy EN nodes and re-localize hrefs for zh-CN fallback."""

    def rewrite(node: dict[str, Any]) -> dict[str, Any]:
        if node.get("type") == "text":
            return {"type": "text", "text": node.get("text", "")}
        if node.get("type") == "image":
            return dict(node)
        if node.get("type") == "icon":
            return dict(node)
        if node.get("type") == "fragment":
            return {
                "type": "fragment",
                "children": [rewrite(child) for child in node.get("children", [])],
            }
        if node.get("type") == "element":
            attrs = dict(node.get("attrs") or {})
            if isinstance(attrs.get("href"), str):
                attrs["href"] = zb.localize_href(attrs["href"], locale)
            return {
                "type": "element",
                "tag": node.get("tag"),
                "attrs": attrs,
                "children": [rewrite(child) for child in node.get("children", [])],
            }
        return dict(node)

    nodes = [rewrite(node) for node in source.get("page", {}).get("nodes", [])]
    quiz = source.get("quiz") or zb.existing_quiz(None, locale)
    return {
        "blocks": source.get("blocks") or [],
        "description": source.get("description") or source.get("title") or slug,
        "excerpt": source.get("excerpt") or source.get("description") or "",
        "faqs": source.get("faqs") or [],
        "imageAlt": source.get("imageAlt") or source.get("title") or slug,
        "page": {"nodes": nodes},
        "quiz": quiz if locale == "en" else zb.existing_quiz(None, locale),
        "seoTitle": source.get("seoTitle") or source.get("title") or slug,
        "title": source.get("title") or slug,
    }


def main() -> int:
    if not PACKAGE_ROOT.is_dir() or not MANIFEST_PATH.is_file():
        print(f"missing hand-off extract. Run: {EXTRACT_HINT}", file=sys.stderr)
        return 1

    zb = load_zip_builder()
    # Expand phase list so localize_href accepts all hand-off slugs
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    articles_meta = manifest["articles"]
    all_slugs = [row["slug"] for row in articles_meta]
    zb.ALL_PHASE_SLUGS = list(dict.fromkeys(list(zb.ALL_PHASE_SLUGS) + all_slugs))
    # Expand redirects for known hand-off / source filename drift
    extra_redirects = {
        "should-you-take-omega3-every-day": "should-you-take-omega-3-every-day",
        "rhodiola-energy-or-stress": "rhodiola-energy-support-or-stress-support",
        "do-you-need-a-blood-test-to-personalise-supplements": "blood-test-personalise-supplements",
        "gut-health-supplements": "gut-health-supplements-when-make-sense",
    }
    zb.CANONICAL_REDIRECTS = {**zb.CANONICAL_REDIRECTS, **extra_redirects}
    # Keep truly missing pages as soft-removed related links
    zb.MISSING_LIBRARY_SLUGS = {
        "vitamin-c-daily-essential",
    }

    existing = {}
    if CONTENT_PATH.is_file():
        existing = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
    existing_by_slug = {
        a["slug"]: a
        for a in existing.get("articles", [])
        if isinstance(a, dict) and isinstance(a.get("slug"), str)
    }

    dimensions: dict[str, tuple[int, int]] = {}
    articles: list[dict[str, Any]] = []

    # Prefer hand-off category labels; keep zh-CN from previous when slug matches
    old_cat_zh = {
        c["slug"]: c.get("labels", {}).get("zh-CN")
        for c in existing.get("categories", [])
        if isinstance(c, dict)
    }
    categories = []
    for cat in manifest.get("categories", []):
        slug = cat["id"]
        labels = {
            "en": cat["label"]["en"],
            "th": cat["label"]["th"],
            "zh-CN": old_cat_zh.get(slug)
            or cat["label"]["en"],  # temporary EN until dedicated zh
        }
        categories.append({"slug": slug, "labels": labels})

    for index, row in enumerate(articles_meta):
        slug = row["slug"]
        en_path = PACKAGE_ROOT / "library" / "en" / f"{slug}.html"
        th_path = PACKAGE_ROOT / "library" / "th" / f"{slug}.html"
        if not en_path.is_file() or not th_path.is_file():
            raise SystemExit(f"missing hand-off HTML for {slug}")

        en_markup = en_path.read_text(encoding="utf-8")
        th_markup = th_path.read_text(encoding="utf-8")
        existing_article = existing_by_slug.get(slug)

        about, citations, art_published, art_modified = extract_about_citations(en_markup)
        date_published = row.get("datePublished") or art_published or "2026-07-06"
        date_modified = row.get("dateModified") or art_modified or date_published

        pose = normalize_pose(row.get("nongPose") or "thinking")
        share_image = row.get("shareImage") or f"/assets/library/share/share-{slug}.jpg"
        # Ensure public path form
        if not share_image.startswith("/"):
            share_image = "/" + share_image.lstrip("./")

        en_tr = build_translation(
            zb, en_markup, "en", slug, dimensions, existing_article
        )
        th_tr = build_translation(
            zb, th_markup, "th", slug, dimensions, existing_article
        )

        # Prefer manifest titles/excerpts for index SSOT (authoritative bilingual)
        if row.get("title", {}).get("en"):
            en_tr["title"] = row["title"]["en"]
            en_tr["seoTitle"] = row["title"]["en"]
        if row.get("title", {}).get("th"):
            th_tr["title"] = row["title"]["th"]
            th_tr["seoTitle"] = row["title"]["th"]
        if row.get("excerpt", {}).get("en"):
            en_tr["description"] = row["excerpt"]["en"]
            en_tr["excerpt"] = row["excerpt"]["en"]
        if row.get("excerpt", {}).get("th"):
            th_tr["description"] = row["excerpt"]["th"]
            th_tr["excerpt"] = row["excerpt"]["th"]

        if existing_article and "zh-CN" in existing_article.get("translations", {}):
            zh_tr = existing_article["translations"]["zh-CN"]
            # If node count wildly off, rebuild href-localized EN clone as structure base
            en_nodes = en_tr.get("page", {}).get("nodes", [])
            zh_nodes = zh_tr.get("page", {}).get("nodes", [])
            if not isinstance(zh_nodes, list) or not zh_nodes:
                zh_tr = clone_translation_with_locale_hrefs(zb, en_tr, "zh-CN", slug)
            else:
                # keep zh as-is (prior content); only ensure quiz object shape
                if not isinstance(zh_tr.get("quiz"), dict):
                    zh_tr = {**zh_tr, "quiz": zb.existing_quiz(existing_article, "zh-CN")}
        else:
            zh_tr = clone_translation_with_locale_hrefs(zb, en_tr, "zh-CN", slug)
            # New articles: keep EN mini-check structure for zh-CN until a zh source exists.
            zh_tr["quiz"] = en_tr["quiz"]

        redirects = []
        for source, target in CANONICAL_REDIRECTS.items():
            if target == slug:
                redirects.append(source)

        articles.append(
            {
                "about": about,
                "batch": 1 + (index // 10),
                "canonicalSlug": slug,
                "categorySlug": row.get("category") or "foundations",
                "citations": citations,
                "dateModified": date_modified,
                "datePublished": date_published,
                "featured": bool(row.get("featured")),
                "nongPose": pose,
                "pose": pose,
                "redirects": redirects,
                "shareImage": share_image,
                "slug": slug,
                "sourceHtmlFile": f"library/en/{slug}.html",
                "sourceHtml": f"library/th/{slug}.html",
                "sourcePackage": "files/ttf.zip",
                "translations": {
                    "en": en_tr,
                    "th": th_tr,
                    "zh-CN": zh_tr,
                },
            }
        )
        print(f"built {slug} (en_nodes={len(en_tr['page']['nodes'])} th_nodes={len(th_tr['page']['nodes'])})")

    payload = {
        "generatedFrom": "files/ttf.zip#ws1-handoff",
        "articleCount": len(articles),
        "categories": categories,
        "canonicalRedirects": CANONICAL_REDIRECTS,
        "articles": articles,
    }
    CONTENT_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONTENT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {CONTENT_PATH.relative_to(REPO_ROOT)} with {len(articles)} articles")
    featured = [a["slug"] for a in articles if a.get("featured")]
    print("featured", featured)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
