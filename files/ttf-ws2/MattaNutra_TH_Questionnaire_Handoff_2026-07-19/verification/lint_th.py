# -*- coding: utf-8 -*-
"""
MattaNutra Thai VK lint — encodes the Thai Glossary & Style Guide as machine-checkable rules.
Usage:  python3 _lint_th.py [file.html ...]      (default: all of th/library/*.html)
Exit code 1 if any ERROR-level rule fails.
"""
import sys, re, json, glob, subprocess, os
from bs4 import BeautifulSoup

# ---------------------------------------------------------------- glossary rules
# term -> (severity, max_allowed, note)   max_allowed=0 means never
BANNED = {
    "ภาวะโรค":        ("ERROR", 0, "use โรคประจำตัว / ภาวะสุขภาพ / the specific diagnosis"),
    "ไกด์":           ("ERROR", 0, "Nong Matta is ผู้ช่วย, never ไกด์"),
    "เม็ดยา":         ("ERROR", 0, "supplements are not ยา — use ผลิตภัณฑ์ / อาหารเสริม"),
    "คอขวด":          ("ERROR", 0, "literal 'bottleneck' — use ข้อจำกัด"),
    "สกุลเงินพลังงาน": ("ERROR", 0, "literal ATP 'energy currency' metaphor"),
    "เห็ดไลอ้อนส์เมน": ("ERROR", 0, "locked term is เห็ดหัวลิง (Ian, 19 Jul 2026)"),
    "โดยอัตโนมัติ":    ("WARN",  0, "usually literal 'automatically' — rephrase"),
    "ลักษณะ":         ("WARN",  2, "blanket 'pattern' — prefer สาเหตุ / รูปแบบอาการ / ปัจจัย"),
    "ภาพรวม":         ("WARN",  1, "generic 'profile' — prefer ปัจจัยของแต่ละคน / name the factors"),
    "ถูกพูดถึง":       ("WARN",  2, "passive 'is discussed' — rephrase actively"),
    "สมเหตุสมผล":     ("WARN",  3, "overused 'reasonable' — vary"),
    "การช่วย":        ("WARN",  4, "mechanical nominalisation of 'support'"),
    "บริบทความปลอดภัย":("WARN", 0, "literal 'safety context' — use ข้อควรระวังด้านความปลอดภัย"),
    "ช่องว่างของอาหาร":("WARN", 0, "literal 'diet gap' — use การได้รับสารอาหารไม่เพียงพอ"),
    # --- locked style-guide forms (Ian, 19 Jul 2026) ---
    "บี 12":          ("ERROR", 0, "locked spelling: บี12 / วิตามินบี12 (no space)"),
    # NOTE: น้องมัตตะบอกว่า is CORRECT on quote cards (direct speech) and must NOT be flagged.
    # The locked rule prohibits ไกด์ as Nong Matta's ROLE TITLE only -> น้องมัตตะ · ผู้ช่วย
    # Register map: role badge = น้องมัตตะ · ผู้ช่วย | quote card = น้องมัตตะบอกว่า
    #               advice quote = น้องมัตตะแนะนำว่า | source label = คำแนะนำจากน้องมัตตะ
    #               image alt = น้องมัตตะกำลัง…
    "น้องมัตตะ · ไกด์": ("ERROR", 0, "role title must be น้องมัตตะ · ผู้ช่วย"),
    "การตรวจแล็บ":     ("ERROR", 0, "locked term: การตรวจทางห้องปฏิบัติการ"),
    "มุมมองจาก MattaNutra": ("ERROR", 0, "locked label: มุมมองเฉพาะจาก MattaNutra"),
    # --- Style Guide v4 §3 locked brand terms / §5 terminology ---
    "บทความสุขภาพแบบเข้าใจง่าย": ("ERROR", 0, "v4 §3 locked term is ความรู้ฉบับเข้าใจง่าย"),
    "การทนต่อยา":     ("ERROR", 0, "v4 §5: use การทนต่อผลิตภัณฑ์ / ผลข้างเคียง"),
    "อาหารเสริมสารอาหาร": ("ERROR", 0, "v4 §5: use อาหารที่เสริมวิตามินและแร่ธาตุ"),
    "ลักษณะของคุณ":   ("ERROR", 0, "v4 §8: hidden copy must use คำตอบของคุณบ่งชี้ว่า…"),
    "กิจวัตร":        ("WARN",  3, "v4 §6: vary with แผน / การรับประทานเป็นประจำ / ตารางการใช้"),
}
DOUBLED = ["ควรควร","แต่แต่","และและ","มันมัน","ที่ที่ ","การการ ",
           "เคอร์คูมินเคอร์คูมิน","สังกะสีสังกะสี","ครีเอทีนครีเอทีน","คอลลาเจนคอลลาเจน"]
EN_OK = {"MattaNutra","Mahidol","Princeton","Stanford","Harvard","Medicine","Science","Technology",
         "LINE","Facebook","Health","Score","HealthScore","CoQ","GABA","ATP","Oura","Right","Amount"}

def visible_text(soup):
    s = BeautifulSoup(str(soup), "html.parser")
    for t in s(["script","style"]): t.decompose()
    return re.sub(r"\s+"," ", s.get_text(" "))

def lint(path):
    h = open(path, encoding="utf-8").read()
    soup = BeautifulSoup(h, "html.parser")
    errs, warns = [], []

    # --- glossary terms (visible + hidden copy alike)
    for term,(sev,mx,note) in BANNED.items():
        c = h.count(term)
        if c > mx:
            (errs if sev=="ERROR" else warns).append(f"{term} x{c} (max {mx}) — {note}")

    # --- doubled words from find-and-replace editing
    for d in DOUBLED:
        if d in h: errs.append(f"doubled word: {d!r}")

    # --- phrase duplication in visible text
    txt = visible_text(soup)
    for m in re.finditer(r"(\S{8,26})\s+\1", txt):
        warns.append(f"possible phrase duplication: {m.group(0)[:60]!r}")

    # --- stray punctuation nodes after inline tags (English sentence structure)
    for m in re.finditer(r"</(b|em|strong|i)>(\s*[,.;]\s)", h):
        errs.append(f"punctuation node after inline tag: {h[m.start()-24:m.end()+18]!r}")

    # --- semicolon runs in visible Thai (English list structure)
    if re.search(r"[฀-๿][^<>]{0,40};\s*[฀-๿]", txt):
        errs.append("semicolon used as list separator in Thai copy")

    # --- JSON-LD
    ld = 0
    for t in soup.find_all("script", type="application/ld+json"):
        try: json.loads(t.string); ld += 1
        except Exception as e: errs.append(f"JSON-LD parse error: {e}")
    # Article pages ship 3 blocks (Article + FAQPage + BreadcrumbList). The Library
    # index ships 1 CollectionPage that nests WebSite / BreadcrumbList / ItemList,
    # which is correct for that page type — so expect by type, not a fixed count.
    is_index = 'CollectionPage' in h
    want = 1 if is_index else 3
    if ld != want:
        errs.append(f"expected {want} JSON-LD block(s) for a "
                    f"{'Library index' if is_index else 'VK article'}, found {ld}")

    # --- JS syntax
    for i,sc in enumerate(re.findall(r"<script(?![^>]*ld\+json)[^>]*>(.*?)</script>", h, re.S)):
        if not sc.strip(): continue
        open("/tmp/_lint.js","w").write(sc)
        r = subprocess.run(["node","--check","/tmp/_lint.js"], capture_output=True, text=True)
        if r.returncode: errs.append(f"JS syntax error in script {i}: {r.stderr.splitlines()[-1][:70]}")

    # --- skip link + target
    sk = soup.find("a", class_="skip")
    if not sk: errs.append("missing skip link")
    elif f'id="{sk["href"][1:]}"' not in h: errs.append(f"skip link target {sk['href']} not found")

    # --- internal route validity ---------------------------------------------
    # Three separate defect waves shipped with correctly-translated Thai pointing
    # at routes that do not exist: /th/assessment (104 links), /th/about (9) and
    # /th/search (18). All were invisible to editorial review, which reads the
    # Thai and not the href. Routes below were confirmed against the live site
    # on 19 Jul 2026; anything else must be justified before it ships.
    KNOWN_PREFIXES = (
        "/th", "/en", "/zh-CN",
        "/th/library", "/en/library", "/zh-CN/library",
        "/th/nutrition/quiz", "/en/nutrition/quiz",
        "/th/terms", "/th/privacy", "/en/terms", "/en/privacy",
        "/assets/", "/v11/", "/v15/", "/cdn-cgi/",
    )
    KNOWN_SLUGS = set()
    _mf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "library-manifest.json")
    if os.path.exists(_mf):
        KNOWN_SLUGS = {a["slug"] for a in json.load(open(_mf, encoding="utf-8"))["articles"]}
    for url in set(re.findall(r"https://(?:www\.)?mattanutra\.com(/[^\"'\s>)]*)", h)):
        path = url.split("#")[0].split("?")[0].rstrip("/") or "/th"
        m = re.match(r"^/(?:th|en|zh-CN)/library/([a-z0-9-]+)$", path)
        if m:
            if KNOWN_SLUGS and m.group(1) not in KNOWN_SLUGS:
                errs.append(f"link to unknown article slug: {m.group(1)}")
            continue
        if not any(path == p.rstrip("/") or path.startswith(p) for p in KNOWN_PREFIXES):
            errs.append(f"link to unrecognised route: {path} "
                        f"(confirm it exists before shipping)")

    # Relative hrefs were NOT covered by the absolute-URL check above, which is how
    # 8 more dead links survived (href="gut-health-supplements.html" and similar).
    for u in set(re.findall(r'href="(?!https?:|#|mailto:|tel:|/)([^"]+)"', h)):
        base = os.path.basename(u.split("#")[0].split("?")[0])
        if not base.endswith(".html"):
            continue
        if KNOWN_SLUGS and base[:-5] not in KNOWN_SLUGS:
            errs.append(f"relative link to unknown article: {u}")

    # --- hreflang Chinese route consistency
    # Confirmed against the live site 19 Jul 2026: the production Chinese route is /zh-CN/
    # (live language switcher links /zh-CN/library/<slug>). The earlier /zh/ lock was wrong.
    if re.search(r"mattanutra\.com/zh/", h): errs.append("Chinese path must be /zh-CN/ (confirmed against live site 19 Jul 2026)")

    # --- duplicate element IDs
    ids = [t["id"] for t in soup.find_all(id=True)]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup: errs.append(f"duplicate element IDs: {sorted(dup)}")

    # --- visible English leakage (citations are allowed in citebox)
    cb = BeautifulSoup(str(soup), "html.parser")
    for t in cb(["script","style"]): t.decompose()
    for t in cb.select(".citebox, .cite, .src, .source-list"): t.decompose()
    leak = sorted({w for w in re.findall(r"[A-Za-z][A-Za-z\-]{4,}", visible_text(cb)) if w not in EN_OK})
    if leak: warns.append(f"visible English: {leak[:8]}")

    return errs, warns

def main():
    files = sys.argv[1:] or sorted(glob.glob("th/library/*.html"))
    tot_e = 0
    for f in files:
        e,w = lint(f)
        tot_e += len(e)
        name = os.path.basename(f)
        if e or w:
            print(f"\n=== {name}")
            for x in e: print(f"  ERROR  {x}")
            for x in w: print(f"  warn   {x}")
        else:
            print(f"PASS  {name}")
    print(f"\n{len(files)} file(s) checked — {tot_e} error(s)")
    sys.exit(1 if tot_e else 0)

if __name__ == "__main__":
    main()
