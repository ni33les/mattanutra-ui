#!/usr/bin/env python3
"""Build MattaNutra Library content from the final Visual Knowledge zip packages."""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import sys
import time
import zipfile
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

import requests


REPO_ROOT = Path(__file__).resolve().parents[1]
LIBRARY_DIR = REPO_ROOT / "files" / "library"
CONTENT_PATH = REPO_ROOT / "content" / "library" / "visual-knowledge.json"
PUBLIC_LIBRARY = REPO_ROOT / "public" / "assets" / "library"
TRANSLATION_CACHE = REPO_ROOT / ".cache" / "library-translation-cache.json"
LOCALES = ("en", "th", "zh-CN")
TARGET_TRANSLATE_LOCALES = ("th", "zh-CN")
GOOGLE_LOCALES = {"th": "th", "zh-CN": "zh"}
ARTICLE_ZIP_RE = re.compile(r"\.zip$", re.IGNORECASE)
VOID_TAGS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}
SKIP_TAGS = {"script", "style"}
RENDER_TAGS = {
    "a",
    "article",  # zip stance/missing-card/package wrappers
    "aside",
    "b",
    "button",
    "details",
    "div",
    "em",
    "footer",
    "figcaption",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "i",
    "li",
    "main",
    "ol",
    "p",
    "section",
    "small",
    "span",
    "strong",
    "summary",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
}
CANONICAL_REDIRECTS = {
    "coq10-who-is-it-actually-for": "coq10-who-is-it-for",
    "health-check-leave-out-biomarkers": "expensive-health-check-leave-out",
    "omega-3-every-day": "should-you-take-omega-3-every-day",
    "vitamin-d-thailand": "vitamin-d-in-thailand",
}
MISSING_LIBRARY_SLUGS = {
    "gut-health-supplements",
    "vitamin-c-daily-essential",
}
PHASES = {
    1: [
        "should-you-take-magnesium-every-day",
        "glycinate-vs-citrate",
        "magnesium-for-sleep",
        "signs-you-may-be-low-in-magnesium",
        "vitamin-d-in-thailand",
        "which-supplements-should-you-take",
    ],
    2: [
        "do-you-really-need-a-multivitamin",
        "should-you-take-omega-3-every-day",
        "vitamin-d-magnesium-zinc",
        "coq10-who-is-it-for",
        "zinc-supplements-helpful-or-overused",
        "sleep-support-without-sleeping-pills",
    ],
    3: [
        "magnesium-glycine-theanine-gaba-sleep-support",
        "why-stress-changes-your-supplement-needs",
        "curcumin-when-is-it-worth-taking",
        "joint-supplements-glucosamine-collagen-curcumin",
        "how-much-turmeric-equals-150mg-curcumin",
        "rhodiola-energy-support-or-stress-support",
    ],
    4: [
        "rhodiola-vs-caffeine-coffee",
        "collagen-skin-joints-or-hype",
        "brain-supplements-real-reason-routine",
        "is-creatine-just-for-bodybuilders",
        "citicoline-vs-alpha-gpc",
        "blood-test-personalise-supplements",
    ],
    5: [
        "blood-panel-personalise-supplements-cost",
        "expensive-health-check-nutrition",
        "expensive-health-check-leave-out",
        "food4me-study-personalised-nutrition",
        "do-you-need-a-probiotic",
        "lions-mane-supplement-worth-it",
    ],
}
ALL_PHASE_SLUGS = [slug for slugs in PHASES.values() for slug in slugs]


@dataclass
class HtmlNode:
    tag: str | None = None
    attrs: dict[str, str] = field(default_factory=dict)
    children: list["HtmlNode"] = field(default_factory=list)
    text: str | None = None


class TreeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = HtmlNode(tag="root")
        self.stack = [self.root]
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in SKIP_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        node = HtmlNode(
            tag=tag,
            attrs={key.lower(): value or "" for key, value in attrs},
        )
        self.stack[-1].children.append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in SKIP_TAGS:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.skip_depth:
            return
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        if not data or not data.strip():
            return
        collapsed = re.sub(r"\s+", " ", data)
        if data[:1].isspace():
            collapsed = f" {collapsed.lstrip()}"
        if data[-1:].isspace():
            collapsed = f"{collapsed.rstrip()} "
        self.stack[-1].children.append(HtmlNode(text=collapsed))


def text_content(node: HtmlNode) -> str:
    if node.text is not None:
        return node.text
    return "".join(text_content(child) for child in node.children)


def walk(node: HtmlNode):
    yield node
    for child in node.children:
        yield from walk(child)


def find_first(node: HtmlNode, predicate) -> HtmlNode | None:
    for child in walk(node):
        if predicate(child):
            return child
    return None


def find_all(node: HtmlNode, predicate) -> list[HtmlNode]:
    return [child for child in walk(node) if predicate(child)]


def parse_html_document(markup: str) -> HtmlNode:
    parser = TreeParser()
    parser.feed(markup)
    parser.close()
    return parser.root


def attr(node: HtmlNode | None, name: str) -> str | None:
    if not node:
        return None
    value = node.attrs.get(name)
    return value.strip() if value and value.strip() else None


def meta_content(root: HtmlNode, *, name: str | None = None, prop: str | None = None) -> str | None:
    def matches(node: HtmlNode) -> bool:
        if node.tag != "meta":
            return False
        if name is not None:
            return node.attrs.get("name") == name
        if prop is not None:
            return node.attrs.get("property") == prop
        return False

    return attr(find_first(root, matches), "content")


def canonical_url(root: HtmlNode) -> str | None:
    node = find_first(
        root,
        lambda item: item.tag == "link" and item.attrs.get("rel") == "canonical",
    )
    return attr(node, "href")


def slug_from_url(value: str) -> str:
    return value.rstrip("/").split("/")[-1]


def strip_title(value: str) -> str:
    return html.unescape(value).replace("| The MattaNutra Library", "").strip()


def parse_json_ld(markup: str) -> list[dict[str, Any]]:
    payloads: list[dict[str, Any]] = []
    for match in re.finditer(
        r'<script\s+type=["\']application/ld\+json["\']\s*>(.*?)</script>',
        markup,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        raw = html.unescape(match.group(1).strip())
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            payloads.append(value)
    return payloads


def first_json_ld(payloads: list[dict[str, Any]], kind: str) -> dict[str, Any] | None:
    for payload in payloads:
        if payload.get("@type") == kind:
            return payload
    return None


def normalize_nong_name(name: str) -> str:
    return name.replace("_", "-").replace("nong-", "nong-", 1)


def normalize_asset_basename(name: str) -> str:
    return name.replace("_", "-")


def asset_public_path(src: str, slug: str) -> str:
    file_name = normalize_asset_basename(Path(src).name)
    if file_name.startswith("nong-"):
        return f"/assets/library/nong/{file_name}"
    if file_name.startswith("share-"):
        return f"/assets/library/share/{file_name}"
    if file_name in {"mattanutra-logo.webp", "mattanutra-logo-web.jpg", "mattanutra-logo-web.webp"}:
        return f"/assets/library/brand/{file_name}"
    return f"/assets/library/articles/{slug}/{file_name}"


def copy_zip_asset(zf: zipfile.ZipFile, member: str, slug: str) -> None:
    file_name = normalize_asset_basename(Path(member).name)
    if not file_name.lower().endswith((".webp", ".jpg", ".jpeg", ".png")):
        return
    if file_name.startswith("nong-"):
        out = PUBLIC_LIBRARY / "nong" / file_name
    elif file_name.startswith("share-"):
        out = PUBLIC_LIBRARY / "share" / file_name
    elif file_name in {"mattanutra-logo.webp", "mattanutra-logo-web.jpg", "mattanutra-logo-web.webp"}:
        out = PUBLIC_LIBRARY / "brand" / file_name
    else:
        out = PUBLIC_LIBRARY / "articles" / slug / file_name
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists() and file_name.startswith("share-"):
        return
    out.write_bytes(zf.read(member))


def install_transparent_nong_assets() -> None:
    zip_path = LIBRARY_DIR / "nong_matta_transparent_assets.zip"
    if not zip_path.exists():
        raise SystemExit("missing nong_matta_transparent_assets.zip")
    target = PUBLIC_LIBRARY / "nong"
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        for member in zf.namelist():
            if not member.startswith("mattanutra_library_assets/nong_") or not member.endswith(".webp"):
                continue
            out_name = normalize_asset_basename(Path(member).name)
            (target / out_name).write_bytes(zf.read(member))


def image_dimensions(public_src: str, cache: dict[str, tuple[int, int]]) -> tuple[int, int]:
    if public_src in cache:
        return cache[public_src]
    file_path = REPO_ROOT / "public" / public_src.lstrip("/")
    if not file_path.exists():
        cache[public_src] = (1000, 1000)
        return cache[public_src]
    script = (
        "const sharp=require('sharp');"
        f"sharp({json.dumps(str(file_path))}).metadata().then(m=>console.log(`${{m.width||1000}} ${{m.height||1000}}`));"
    )
    result = subprocess.check_output(["node", "-e", script], cwd=REPO_ROOT, text=True).strip()
    width, height = (int(part) for part in result.split())
    cache[public_src] = (width, height)
    return cache[public_src]


def load_existing_payload() -> dict[str, Any]:
    if not CONTENT_PATH.exists():
        return {"articles": []}
    return json.loads(CONTENT_PATH.read_text())


def build_translation_memory(existing: dict[str, Any]) -> dict[str, dict[str, dict[str, str]]]:
    memory: dict[str, dict[str, dict[str, str]]] = {}

    def remember_node_texts(
        slug: str,
        locale: str,
        en_node: dict[str, Any],
        loc_node: dict[str, Any],
    ) -> None:
        if en_node.get("type") == "text" and loc_node.get("type") == "text":
            en_text = en_node.get("text")
            loc_text = loc_node.get("text")
            if isinstance(en_text, str) and isinstance(loc_text, str):
                memory[slug][locale][clean_text(en_text)] = loc_text
            return
        en_children = en_node.get("children", [])
        loc_children = loc_node.get("children", [])
        if not isinstance(en_children, list) or not isinstance(loc_children, list):
            return
        for en_child, loc_child in zip(en_children, loc_children):
            if isinstance(en_child, dict) and isinstance(loc_child, dict):
                remember_node_texts(slug, locale, en_child, loc_child)

    for article in existing.get("articles", []):
        slug = article.get("slug")
        translations = article.get("translations", {})
        if not isinstance(slug, str) or "en" not in translations:
            continue
        memory[slug] = {"th": {}, "zh-CN": {}}
        en = translations.get("en", {})
        for locale in TARGET_TRANSLATE_LOCALES:
            loc = translations.get(locale, {})
            for key in ("title", "description", "excerpt", "seoTitle", "imageAlt"):
                if en.get(key) and loc.get(key):
                    memory[slug][locale][clean_text(en[key])] = loc[key]
            for en_block, loc_block in zip(en.get("blocks", []), loc.get("blocks", [])):
                if en_block.get("text") and loc_block.get("text"):
                    memory[slug][locale][clean_text(en_block["text"])] = loc_block["text"]
            en_nodes = en.get("page", {}).get("nodes", [])
            loc_nodes = loc.get("page", {}).get("nodes", [])
            if isinstance(en_nodes, list) and isinstance(loc_nodes, list):
                for en_node, loc_node in zip(en_nodes, loc_nodes):
                    if isinstance(en_node, dict) and isinstance(loc_node, dict):
                        remember_node_texts(slug, locale, en_node, loc_node)
            for en_faq, loc_faq in zip(en.get("faqs", []), loc.get("faqs", [])):
                for key in ("question", "answer"):
                    if en_faq.get(key) and loc_faq.get(key):
                        memory[slug][locale][clean_text(en_faq[key])] = loc_faq[key]
            en_quiz = en.get("quiz", {})
            loc_quiz = loc.get("quiz", {})
            for key in ("title", "hint", "resultTitle", "resultBody", "cta"):
                if en_quiz.get(key) and loc_quiz.get(key):
                    memory[slug][locale][clean_text(en_quiz[key])] = loc_quiz[key]
            for en_q, loc_q in zip(en_quiz.get("questions", []), loc_quiz.get("questions", [])):
                if en_q.get("question") and loc_q.get("question"):
                    memory[slug][locale][clean_text(en_q["question"])] = loc_q["question"]
                for en_opt, loc_opt in zip(en_q.get("options", []), loc_q.get("options", [])):
                    if en_opt.get("label") and loc_opt.get("label"):
                        memory[slug][locale][clean_text(en_opt["label"])] = loc_opt["label"]
    return memory


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def load_translate_cache() -> dict[str, str]:
    if TRANSLATION_CACHE.exists():
        return json.loads(TRANSLATION_CACHE.read_text())
    return {}


def save_translate_cache(cache: dict[str, str]) -> None:
    TRANSLATION_CACHE.parent.mkdir(parents=True, exist_ok=True)
    TRANSLATION_CACHE.write_text(
        json.dumps(cache, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    )


def translate_text(
    text: str,
    locale: str,
    slug: str,
    memory: dict[str, dict[str, dict[str, str]]],
    cache: dict[str, str],
) -> str:
    cleaned = clean_text(text)
    if not cleaned:
        return text
    if locale == "en":
        return text
    if cleaned in memory.get(slug, {}).get(locale, {}):
        return memory[slug][locale][cleaned]
    key = f"{locale}:{cleaned}"
    if key in cache:
        return cache[key]
    params = {
        "client": "gtx",
        "sl": "en",
        "tl": GOOGLE_LOCALES[locale],
        "dt": "t",
        "q": cleaned,
    }
    last_error: Exception | None = None
    payload = None
    for attempt in range(4):
        try:
            response = requests.get(
                "https://translate.googleapis.com/translate_a/single",
                params=params,
                timeout=25,
            )
            response.raise_for_status()
            payload = response.json()
            break
        except Exception as error:  # noqa: BLE001 - this is a best-effort external translator.
            last_error = error
            time.sleep(0.4 * (attempt + 1))
    if payload is None:
        raise RuntimeError(f"translation failed for {locale}:{cleaned}") from last_error
    translated = "".join(part[0] for part in payload[0] if part and part[0]).strip()
    translated = translated.replace("แมตต้านูทรา", "MattaNutra")
    translated = translated.replace("马塔努特拉", "MattaNutra")
    translated = translated.replace("诺恩·马塔", "Nong Matta")
    translated = translated.replace("น้องมัทตะ", "น้องมัตตะ")
    cache[key] = translated or cleaned
    save_translate_cache(cache)
    time.sleep(0.035)
    return cache[key]


def localized_text(
    text: str,
    locale: str,
    slug: str,
    memory: dict[str, dict[str, dict[str, str]]],
    cache: dict[str, str],
) -> str:
    if locale == "en":
        return text
    return translate_text(text, locale, slug, memory, cache)


def html_href_slug(href: str) -> str | None:
    clean_href = href.strip().split("#", 1)[0].split("?", 1)[0]

    if "://" in clean_href:
        return None

    if clean_href.endswith(".html"):
        return Path(clean_href).stem

    return None


def library_href_slug(href: str) -> str | None:
    clean_href = href.strip()
    clean_href = clean_href.replace("https://www.mattanutra.com", "")
    clean_href = clean_href.replace("https://mattanutra.com", "")
    clean_href = clean_href.split("#", 1)[0].split("?", 1)[0]

    html_slug = html_href_slug(clean_href)
    if html_slug:
        return html_slug

    match = re.match(r"^/(?:en|th|zh-CN|zh)?/?library/([^/]+)$", clean_href)
    if match:
        return match.group(1)

    return None


def canonical_library_slug(slug: str) -> str:
    return CANONICAL_REDIRECTS.get(slug, slug)


def is_missing_library_href(href: str) -> bool:
    slug = library_href_slug(href)

    return bool(slug in MISSING_LIBRARY_SLUGS)


def localize_href(href: str, locale: str) -> str:
    if not href:
        return href
    href = href.replace("https://www.mattanutra.com", "")
    href = href.replace("https://mattanutra.com", "")
    href = href or "/"
    library_slug = library_href_slug(href)
    if library_slug:
        canonical_slug = canonical_library_slug(library_slug)
        if canonical_slug in ALL_PHASE_SLUGS:
            return f"/{locale}/library/{canonical_slug}"
    href = re.sub(r"^/(en|th|zh-CN|zh)(?=/|$)", f"/{locale}", href)
    href = href.replace("/assessment", "/nutrition/quiz")
    if href == "/":
        return f"/{locale}"
    if href.startswith("#"):
        return href
    if href.startswith("/"):
        if not re.match(r"^/(en|th|zh-CN)(/|$)", href):
            return f"/{locale}{href}"
        return href
    return href


def renderable_attrs(
    attrs: dict[str, str],
    locale: str,
    slug: str,
    memory: dict[str, dict[str, dict[str, str]]],
    cache: dict[str, str],
) -> dict[str, str | bool]:
    output: dict[str, str | bool] = {}
    for key, value in attrs.items():
        if key == "data-val" and value == "":
            continue
        if key in {
            "class",
            "id",
            "data-copy",
            "data-q",
            "data-share",
            "data-val",
            "aria-label",
            "role",
        }:
            out_key = "className" if key == "class" else key
            output[out_key] = value
        elif key == "href":
            output["href"] = localize_href(value, locale)
        elif key == "open":
            output["open"] = True
        elif key == "alt":
            output["alt"] = localized_text(value, locale, slug, memory, cache)
    return output


def node_to_payload(
    node: HtmlNode,
    locale: str,
    slug: str,
    memory: dict[str, dict[str, dict[str, str]]],
    cache: dict[str, str],
    dimensions: dict[str, tuple[int, int]],
    inside_related: bool = False,
) -> dict[str, Any] | None:
    if node.text is not None:
        text = localized_text(node.text, locale, slug, memory, cache)
        return {"type": "text", "text": text}
    if node.tag is None:
        return None
    if node.tag == "img":
        raw_src = node.attrs.get("src", "")
        src = asset_public_path(raw_src, slug)
        width, height = image_dimensions(src, dimensions)
        return {
            "type": "image",
            "alt": localized_text(node.attrs.get("alt", ""), locale, slug, memory, cache),
            "className": node.attrs.get("class", ""),
            "height": height,
            "src": src,
            "width": width,
        }
    if node.tag == "svg":
        shapes: list[dict[str, str]] = []
        for child in node.children:
            if child.tag is None:
                continue
            if child.tag == "path" and child.attrs.get("d"):
                shapes.append({"type": "path", "d": child.attrs["d"]})
            elif child.tag == "circle" and child.attrs.get("r"):
                shapes.append(
                    {
                        "type": "circle",
                        "cx": child.attrs.get("cx", "0"),
                        "cy": child.attrs.get("cy", "0"),
                        "r": child.attrs["r"],
                    }
                )
            elif child.tag == "rect":
                shapes.append(
                    {
                        "type": "rect",
                        "x": child.attrs.get("x", "0"),
                        "y": child.attrs.get("y", "0"),
                        "width": child.attrs.get("width", "0"),
                        "height": child.attrs.get("height", "0"),
                    }
                )
            # Nested groups / multi-path icons
            elif child.children:
                for grand in child.children:
                    if grand.tag == "path" and grand.attrs.get("d"):
                        shapes.append({"type": "path", "d": grand.attrs["d"]})
                    elif grand.tag == "circle" and grand.attrs.get("r"):
                        shapes.append(
                            {
                                "type": "circle",
                                "cx": grand.attrs.get("cx", "0"),
                                "cy": grand.attrs.get("cy", "0"),
                                "r": grand.attrs["r"],
                            }
                        )
        view_box = (
            node.attrs.get("viewbox")
            or node.attrs.get("viewBox")
            or "0 0 24 24"
        )
        return {
            "type": "icon",
            "className": node.attrs.get("class", "ic"),
            "viewBox": view_box,
            "shapes": shapes,
        }
    node_classes = node.attrs.get("class", "").split()
    child_inside_related = inside_related or "related" in node_classes
    if node.tag == "a" and is_missing_library_href(node.attrs.get("href", "")):
        if inside_related:
            return None
        children = [
            child_payload
            for child in node.children
            if (
                child_payload := node_to_payload(
                    child,
                    locale,
                    slug,
                    memory,
                    cache,
                    dimensions,
                    child_inside_related,
                )
            )
        ]
        return {"type": "fragment", "children": children} if children else None
    if node.tag not in RENDER_TAGS:
        children = [
            child_payload
            for child in node.children
            if (
                child_payload := node_to_payload(
                    child,
                    locale,
                    slug,
                    memory,
                    cache,
                    dimensions,
                    child_inside_related,
                )
            )
        ]
        if not children:
            return None
        # Preserve structural classes (e.g. rare tags) as a div so CSS modules still match.
        if node.attrs.get("class"):
            return {
                "type": "element",
                "tag": "div",
                "attrs": renderable_attrs(node.attrs, locale, slug, memory, cache),
                "children": children,
            }
        return {"type": "fragment", "children": children}
    children = [
        child_payload
        for child in node.children
        if (
            child_payload := node_to_payload(
                child,
                locale,
                slug,
                memory,
                cache,
                dimensions,
                child_inside_related,
            )
        )
    ]
    return {
        "type": "element",
        "tag": node.tag,
        "attrs": renderable_attrs(node.attrs, locale, slug, memory, cache),
        "children": children,
    }


def collect_blocks_from_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, str]]:
    blocks: list[dict[str, str]] = []

    def visit(node: dict[str, Any]) -> None:
        if node.get("type") != "element":
            for child in node.get("children", []):
                visit(child)
            return
        tag = node.get("tag")
        text = clean_text(node_text(node))
        if text:
            if tag == "h1":
                blocks.append({"type": "heading1", "text": text})
            elif tag == "h2":
                blocks.append({"type": "heading2", "text": text})
            elif tag in {"h3", "h4", "summary"}:
                blocks.append({"type": "heading3", "text": text})
            elif tag == "li":
                blocks.append({"type": "listItem", "text": text})
            elif tag == "p":
                blocks.append({"type": "paragraph", "text": text})
        if tag in {"h1", "h2", "h3", "h4", "summary", "li", "p"}:
            return
        for child in node.get("children", []):
            visit(child)

    for item in nodes:
        visit(item)
    deduped: list[dict[str, str]] = []
    seen = set()
    for block in blocks:
        key = (block["type"], block["text"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(block)
    return deduped


def node_text(node: dict[str, Any]) -> str:
    if node.get("type") == "text":
        return node.get("text", "")
    return "".join(node_text(child) for child in node.get("children", []))


def translated_faqs(
    faqs: list[dict[str, str]],
    locale: str,
    slug: str,
    memory: dict[str, dict[str, dict[str, str]]],
    cache: dict[str, str],
) -> list[dict[str, str]]:
    return [
        {
            "question": localized_text(faq["question"], locale, slug, memory, cache),
            "answer": localized_text(faq["answer"], locale, slug, memory, cache),
        }
        for faq in faqs
    ]


def existing_quiz(existing_article: dict[str, Any] | None, locale: str) -> dict[str, Any]:
    quiz = (existing_article or {}).get("translations", {}).get(locale, {}).get("quiz")
    if isinstance(quiz, dict) and quiz.get("questions"):
        return quiz
    yes_no = {
        "en": ("Yes", "No"),
        "th": ("ใช่", "ไม่ใช่"),
        "zh-CN": ("是", "否"),
    }[locale]
    return {
        "title": {"en": "Mini-check", "th": "เช็กสั้น ๆ", "zh-CN": "快速自查"}[locale],
        "hint": {
            "en": "Answer the questions for a personalised-style suggestion.",
            "th": "ตอบคำถามเพื่อดูแนวทางแบบเฉพาะบุคคล",
            "zh-CN": "回答几个问题，获得个性化风格的提示。",
        }[locale],
        "questions": [],
        "resultTitle": {
            "en": "Nong Matta's read",
            "th": "น้องมัตตะอ่านภาพรวมว่า",
            "zh-CN": "Nong Matta 的判断",
        }[locale],
        "resultBody": {
            "en": "Use the full assessment to check dose, timing, safety and fit before choosing supplements.",
            "th": "ใช้แบบประเมินฉบับเต็มเพื่อตรวจขนาด เวลาใช้ ความปลอดภัย และความเหมาะสมก่อนเลือกอาหารเสริม",
            "zh-CN": "请用完整评估检查剂量、时间、安全性和适配度，再决定补充剂。",
        }[locale],
        "cta": {
            "en": "Start designing your Right Amount",
            "th": "เริ่มออกแบบปริมาณที่พอดีของคุณ",
            "zh-CN": "开始设计你的知量方案",
        }[locale],
    }


def existing_by_slug(existing: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        article["slug"]: article
        for article in existing.get("articles", [])
        if isinstance(article, dict) and isinstance(article.get("slug"), str)
    }


def article_zip_paths() -> list[Path]:
    paths = [
        path
        for path in sorted(LIBRARY_DIR.glob("*.zip"))
        if ARTICLE_ZIP_RE.search(path.name) and path.name != "nong_matta_transparent_assets.zip"
    ]
    if len(paths) != 30:
        raise SystemExit(f"expected 30 article zips, found {len(paths)}")
    return paths


def main() -> None:
    existing = load_existing_payload()
    existing_articles = existing_by_slug(existing)
    memory = build_translation_memory(existing)
    cache = load_translate_cache()
    dimensions: dict[str, tuple[int, int]] = {}
    install_transparent_nong_assets()
    articles: list[dict[str, Any]] = []
    redirects: dict[str, str] = {}
    slugs: set[str] = set()

    for zip_path in article_zip_paths():
        with zipfile.ZipFile(zip_path) as zf:
            html_members = [member for member in zf.namelist() if member.endswith(".html")]
            if len(html_members) != 1:
                raise SystemExit(f"{zip_path.name}: expected exactly one html file")
            html_member = html_members[0]
            markup = zf.read(html_member).decode("utf-8", "replace")
            root = parse_html_document(markup)
            canonical = canonical_url(root)
            if not canonical:
                raise SystemExit(f"{zip_path.name}: missing canonical URL")
            canonical_slug = slug_from_url(canonical)
            file_slug = Path(html_member).stem
            if file_slug != canonical_slug:
                redirects[file_slug] = canonical_slug
            if canonical_slug in slugs:
                raise SystemExit(f"duplicate canonical slug: {canonical_slug}")
            slugs.add(canonical_slug)
            for member in zf.namelist():
                copy_zip_asset(zf, member, canonical_slug)
            title_node = find_first(root, lambda item: item.tag == "title")
            title = strip_title(text_content(title_node) if title_node else canonical_slug)
            description = meta_content(root, name="description") or title
            share_url = meta_content(root, prop="og:image")
            if not share_url:
                raise SystemExit(f"{zip_path.name}: missing og:image")
            share_image = f"/assets/library/share/{Path(share_url).name}"
            share_path = REPO_ROOT / "public" / share_image.lstrip("/")
            if not share_path.exists():
                raise SystemExit(f"{zip_path.name}: missing share image {share_image}")
            json_ld = parse_json_ld(markup)
            article_json = first_json_ld(json_ld, "Article") or {}
            faq_json = first_json_ld(json_ld, "FAQPage") or {}
            date_published = str(article_json.get("datePublished") or "2026-07-06")
            date_modified = str(article_json.get("dateModified") or date_published)
            citations = article_json.get("citation") or []
            if isinstance(citations, str):
                citations = [citations]
            if not isinstance(citations, list):
                citations = []
            about = article_json.get("about") or []
            if isinstance(about, str):
                about = [about]
            if not isinstance(about, list):
                about = []
            main_node = find_first(
                root,
                lambda item: item.tag == "main"
                and (item.attrs.get("id") == "main" or "wrap" in item.attrs.get("class", "").split()),
            )
            if not main_node:
                raise SystemExit(f"{zip_path.name}: missing main content")
            existing_article = existing_articles.get(canonical_slug)
            category = (existing_article or {}).get("categorySlug") or "foundations"
            pose = (existing_article or {}).get("pose") or "thinking"
            faqs = []
            for item in faq_json.get("mainEntity", []) if isinstance(faq_json, dict) else []:
                if not isinstance(item, dict):
                    continue
                answer = item.get("acceptedAnswer", {})
                if not isinstance(answer, dict):
                    answer = {}
                question_text = item.get("name")
                answer_text = answer.get("text")
                if isinstance(question_text, str) and isinstance(answer_text, str):
                    faqs.append({"question": question_text, "answer": answer_text})
            nodes_by_locale: dict[str, list[dict[str, Any]]] = {}
            translations: dict[str, dict[str, Any]] = {}
            for locale in LOCALES:
                nodes = [
                    payload
                    for child in main_node.children
                    if (payload := node_to_payload(child, locale, canonical_slug, memory, cache, dimensions))
                ]
                nodes_by_locale[locale] = nodes
                blocks = collect_blocks_from_nodes(nodes)
                localized_title = localized_text(title, locale, canonical_slug, memory, cache)
                localized_description = localized_text(description, locale, canonical_slug, memory, cache)
                lead = next(
                    (
                        clean_text(node_text(block))
                        for block in nodes
                        if block.get("type") == "element"
                        for block in [block]
                        if "hero" in str(block.get("attrs", {}).get("className", ""))
                    ),
                    "",
                )
                excerpt = ""
                for block in blocks:
                    if block["type"] == "paragraph":
                        excerpt = block["text"]
                        break
                translations[locale] = {
                    "blocks": blocks,
                    "description": localized_description,
                    "excerpt": excerpt or localized_description,
                    "faqs": translated_faqs(faqs, locale, canonical_slug, memory, cache),
                    "imageAlt": localized_title,
                    "page": {"nodes": nodes},
                    "quiz": existing_quiz(existing_article, locale),
                    "seoTitle": localized_title,
                    "title": localized_title,
                }
            articles.append(
                {
                    "about": [str(item) for item in about],
                    "batch": next(index for index, batch in PHASES.items() if canonical_slug in batch),
                    "canonicalSlug": canonical_slug,
                    "categorySlug": category,
                    "citations": [str(item) for item in citations],
                    "dateModified": date_modified,
                    "datePublished": date_published,
                    "nongPose": pose,
                    "pose": pose,
                    "redirects": [
                        source for source, target in redirects.items() if target == canonical_slug
                    ],
                    "shareImage": share_image,
                    "slug": canonical_slug,
                    "sourceHtmlFile": html_member,
                    "sourceHtml": html_member,
                    "sourcePackage": zip_path.name,
                    "translations": translations,
                }
            )

    missing_phase_slugs = sorted(set(ALL_PHASE_SLUGS) - slugs)
    extra_slugs = sorted(slugs - set(ALL_PHASE_SLUGS))
    if missing_phase_slugs or extra_slugs:
        raise SystemExit(
            f"phase slug mismatch; missing={missing_phase_slugs} extra={extra_slugs}"
        )
    categories = existing.get("categories") or []
    articles.sort(key=lambda item: (item["batch"], ALL_PHASE_SLUGS.index(item["slug"])))
    payload = {
        "generatedFrom": "files/library/*.zip",
        "articleCount": len(articles),
        "categories": categories,
        "canonicalRedirects": CANONICAL_REDIRECTS,
        "articles": articles,
    }
    CONTENT_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONTENT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    save_translate_cache(cache)
    print(f"wrote {CONTENT_PATH.relative_to(REPO_ROOT)} with {len(articles)} articles")


if __name__ == "__main__":
    main()
