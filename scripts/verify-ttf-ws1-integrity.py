#!/usr/bin/env python3
"""Offline Thai integrity gate for Workstream 1.

Compares product surfaces (th.json + visual-knowledge.json) to the extracted
hand-off HTML without requiring a staging deploy.

Usage:
  python3 scripts/extract-ttf-ws1.py --verify
  python3 scripts/verify-ttf-ws1-integrity.py
"""

from __future__ import annotations

import html as html_lib
import json
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PKG = REPO / ".cache/ttf-ws1/MattaNutra_TH_Localization_Handoff_2026-07-19"
TH_JSON = REPO / "content/i18n/locales/th.json"
VK_JSON = REPO / "content/library/visual-knowledge.json"
AUTH = REPO / "files/ttf-ws1/AUTHORITATIVE.json"


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def norm_ws(s: str) -> str:
    s = html_lib.unescape(s)
    s = nfc(s)
    return re.sub(r"\s+", " ", s).strip()


def strip_tags(s: str) -> str:
    s = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", s, flags=re.I)
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    # Remove tags without injecting spaces (Thai has no word spaces; a space
    # around <em> would falsely diverge from product copy).
    s = re.sub(r"<[^>]+>", "", s)
    return norm_ws(s)


def html_title(markup: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", markup, re.I | re.S)
    return strip_tags(m.group(1)) if m else ""


def html_meta_description(markup: str) -> str:
    m = re.search(r'name="description"\s+content="([^"]*)"', markup, re.I)
    if not m:
        m = re.search(r'content="([^"]*)"\s+name="description"', markup, re.I)
    return norm_ws(m.group(1)) if m else ""


def html_h1(markup: str) -> str:
    m = re.search(r"<h1[^>]*>(.*?)</h1>", markup, re.I | re.S)
    return strip_tags(m.group(1)) if m else ""


def node_texts(nodes: list) -> list[str]:
    out: list[str] = []

    def walk(node: dict) -> None:
        if node.get("type") == "text":
            t = node.get("text") or ""
            if t.strip():
                out.append(t)
        for child in node.get("children") or []:
            if isinstance(child, dict):
                walk(child)

    for n in nodes:
        if isinstance(n, dict):
            walk(n)
    return out


def node_h1_text(nodes: list) -> str:
    def text_of(node: dict) -> str:
        if node.get("type") == "text":
            return node.get("text") or ""
        return "".join(text_of(child) for child in node.get("children") or [] if isinstance(child, dict))

    def walk(node: dict) -> str | None:
        if node.get("type") == "element" and node.get("tag") == "h1":
            return text_of(node)
        for child in node.get("children") or []:
            if isinstance(child, dict):
                found = walk(child)
                if found is not None:
                    return found
        return None

    for n in nodes:
        if isinstance(n, dict):
            found = walk(n)
            if found is not None:
                return found
    return ""


def contains_norm(haystack: str, needle: str) -> bool:
    return norm_ws(needle) in norm_ws(haystack) if needle else True


def main() -> int:
    if not PKG.is_dir():
        print("missing extract; run python3 scripts/extract-ttf-ws1.py --verify", file=sys.stderr)
        return 1

    th_cat = json.loads(TH_JSON.read_text(encoding="utf-8"))
    vk = json.loads(VK_JSON.read_text(encoding="utf-8"))
    auth = json.loads(AUTH.read_text(encoding="utf-8"))

    failures: list[str] = []
    checks = 0

    def check(ok: bool, msg: str) -> None:
        nonlocal checks
        checks += 1
        if not ok:
            failures.append(msg)

    # --- volume / featured / assets ---
    check(vk.get("articleCount") == 35, f"articleCount={vk.get('articleCount')} expected 35")
    check(len(vk.get("articles", [])) == 35, f"articles len={len(vk.get('articles', []))}")
    featured = [a["slug"] for a in vk["articles"] if a.get("featured")]
    check(
        featured == auth.get("featuredSlugs"),
        f"featured mismatch {featured} vs {auth.get('featuredSlugs')}",
    )

    image_map = {row["slug"]: row for row in auth["articleImageMap"]}
    for article in vk["articles"]:
        slug = article["slug"]
        row = image_map.get(slug)
        check(row is not None, f"{slug}: missing from authoritative image map")
        if not row:
            continue
        share = REPO / "public" / str(article["shareImage"]).lstrip("/")
        check(share.is_file(), f"{slug}: missing share file {share}")
        check(
            article["shareImage"] == row["shareImage"],
            f"{slug}: shareImage {article['shareImage']} != {row['shareImage']}",
        )
        pose = str(article.get("pose") or "")
        expected_pose = str(row["nongPose"]).removeprefix("nong_").replace("_", "-")
        check(pose == expected_pose, f"{slug}: pose {pose} != {expected_pose}")
        pose_path = REPO / f"public/assets/library/nong/nong-{pose}.webp"
        check(pose_path.is_file(), f"{slug}: missing pose asset {pose_path}")

        th = article["translations"]["th"]
        check(bool(th.get("page", {}).get("nodes")), f"{slug}: empty th page nodes")
        check(bool(th.get("quiz", {}).get("questions")), f"{slug}: empty th quiz")
        check(bool(th.get("title")), f"{slug}: empty th title")

        # character fidelity: hand-off title + h1 present in product
        ref = (PKG / "library/th" / f"{slug}.html").read_text(encoding="utf-8")
        ref_title = re.sub(r"\s*\|\s*.*$", "", html_title(ref)).strip()
        ref_h1 = html_h1(ref)
        product_title = th.get("title") or ""
        body = " ".join(node_texts(th["page"]["nodes"]))
        check(
            norm_ws(product_title) == norm_ws(ref_title)
            or contains_norm(product_title, ref_title)
            or contains_norm(ref_title, product_title),
            f"{slug}: th title drift product={product_title!r} ref={ref_title!r}",
        )
        if ref_h1:
            product_h1 = node_h1_text(th["page"]["nodes"])
            check(
                norm_ws(product_h1) == norm_ws(ref_h1)
                or contains_norm(product_title, ref_h1)
                or contains_norm(body, ref_h1)
                or contains_norm("".join(node_texts(th["page"]["nodes"])), ref_h1),
                f"{slug}: h1 not found in product nodes/title: {ref_h1[:60]!r} product_h1={product_h1[:60]!r}",
            )

        # no dead assessment / .html hrefs in TH
        def walk_hrefs(node: dict) -> None:
            if node.get("type") == "element" and node.get("tag") == "a":
                href = (node.get("attrs") or {}).get("href")
                if isinstance(href, str) and (
                    ".html" in href or "/assessment" in href
                ):
                    failures.append(f"{slug}: bad th href {href}")
            for child in node.get("children") or []:
                if isinstance(child, dict):
                    walk_hrefs(child)

        for node in th["page"]["nodes"]:
            walk_hrefs(node)

    # --- landing chrome locks from hand-off ---
    landing = (PKG / "landing/MattaNutra_Landing_Page_TH_v20_FINAL.html").read_text(
        encoding="utf-8"
    )
    landing_title = html_title(landing)
    landing_desc = html_meta_description(landing)
    check(
        norm_ws(th_cat.get("seo.routes.home.title", "")) == norm_ws(landing_title),
        f"seo.home.title {th_cat.get('seo.routes.home.title')!r} != {landing_title!r}",
    )
    check(
        norm_ws(th_cat.get("seo.routes.home.description", "")) == norm_ws(landing_desc),
        f"seo.home.description drift",
    )
    check(th_cat.get("customer.landing.hero.title") == "เลิกเดา", "hero.title")
    check(th_cat.get("customer.landing.hero.accent") == "เริ่มรู้จริง", "hero.accent")
    check(th_cat.get("customer.landing.hero.primary") == "เริ่มประเมินฟรี", "hero.primary")
    check(
        "แผนอาหารเสริม" in (th_cat.get("customer.landing.hero.intro") or ""),
        "hero.intro missing แผนอาหารเสริม",
    )
    check(
        th_cat.get("customer.landing.faq.items.0.0") == "ข้อมูลของฉันเป็นส่วนตัวไหม?",
        "faq.0 question",
    )

    # library chrome
    lib_th = (PKG / "library/library-th.html").read_text(encoding="utf-8")
    lib_h1 = html_h1(lib_th)
    check(
        norm_ws(th_cat.get("customer.libraryIndex.headerTitle", "")) == norm_ws(lib_h1),
        f"library headerTitle {th_cat.get('customer.libraryIndex.headerTitle')!r} != {lib_h1!r}",
    )
    check(
        th_cat.get("customer.libraryCategories.energyLongevity")
        == "พลังงานและสุขภาพระยะยาว",
        "energyLongevity label",
    )

    # categories count
    check(len(vk.get("categories", [])) == 6, f"categories={len(vk.get('categories', []))}")

    report = {
        "checks": checks,
        "failures": failures,
        "status": "ok" if not failures else "fail",
        "articleCount": vk.get("articleCount"),
        "featured": featured,
    }
    out = REPO / "files/ttf-ws1/STEP_G_VERIFY_REPORT.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
