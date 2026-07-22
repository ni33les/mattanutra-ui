#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_deployment.py — prove the deployed Thai pages still say what we shipped.

WHY THIS EXISTS
---------------
Thai has no spaces between words. A dropped or merged character is invisible to
anyone on the team who does not read Thai, and it survives code review, visual
QA and every automated check that looks at markup rather than text. This script
extracts every string a person can read — body text, <title>, meta description,
Open Graph / Twitter copy and image alt text — and compares them character for
character against the reference file in this package.

Identical  -> the Thai survived the port intact.
Different  -> something rewrote, reformatted or re-typed the copy. Stop and look.

It deliberately ignores markup, classes, indentation and whitespace runs, so IT
is free to restructure templates, swap components or change the framework. Only
the words a Thai customer reads are compared — on the page, in a Google result,
in a LINE share preview, or through a screen reader.

USAGE
    # 1. checksum the package as shipped (already done; MANIFEST.sha256 included)
    python3 verify_deployment.py --checksum .

    # 2. confirm the files you received are the files we sent
    python3 verify_deployment.py --check MANIFEST.sha256

    # 3. after deploying to staging, compare live pages against the references
    python3 verify_deployment.py --compare staging-map.json

staging-map.json is simply {"<reference file>": "<deployed URL>", ...}
A starter map covering all 37 Thai pages ships as staging-map.example.json.

Exit code 0 = pass, 1 = differences found.
"""
import sys, os, re, json, html, hashlib, argparse, difflib, unicodedata

SKIP_DIRS = {'.git', '__pycache__', 'node_modules'}


# ---------------------------------------------------------------- text extract
def _norm(s):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', html.unescape(s))).strip()


def reader_text(markup: str) -> str:
    """
    Every piece of Thai a person can end up reading, in a stable order.

    Body text alone is NOT enough. A first draft of this script compared only
    text nodes and gave a clean PASS on a page whose meta description had lost a
    character — because meta, og: and alt copy live in ATTRIBUTES. Those strings
    are what a customer reads in a Google result, in a LINE share preview, and
    through a screen reader, so they are compared too.
    """
    # --- attribute-borne copy -------------------------------------------------
    fields = []
    t = re.search(r'<title[^>]*>(.*?)</title>', markup, re.S | re.I)
    fields.append(('title', _norm(t.group(1)) if t else ''))
    for name in ('description', 'twitter:title', 'twitter:description'):
        m = re.search(rf'<meta[^>]+(?:name|property)="{re.escape(name)}"[^>]*>', markup, re.I)
        v = re.search(r'content="([^"]*)"', m.group(0)) if m else None
        fields.append((name, _norm(v.group(1)) if v else ''))
    for prop in ('og:title', 'og:description', 'og:image', 'og:url'):
        m = re.search(rf'<meta[^>]+property="{re.escape(prop)}"[^>]*>', markup, re.I)
        v = re.search(r'content="([^"]*)"', m.group(0)) if m else None
        fields.append((prop, _norm(v.group(1)) if v else ''))
    for i, alt in enumerate(re.findall(r'<img[^>]*\balt="([^"]*)"', markup, re.I)):
        fields.append((f'alt[{i}]', _norm(alt)))

    # --- body text ------------------------------------------------------------
    s = re.sub(r'<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->', ' ',
               markup, flags=re.S | re.I)
    s = re.sub(r'<[^>]+>', ' ', s)
    body = _norm(s)

    return '\n'.join(f'{k}\t{v}' for k, v in fields) + '\nBODY\t' + body


# kept for callers/tests that only want the rendered copy
def visible_text(markup: str) -> str:
    s = re.sub(r'<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->', ' ',
               markup, flags=re.S | re.I)
    return _norm(re.sub(r'<[^>]+>', ' ', s))


# ---------------------------------------------------------------- checksums
def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def walk(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in sorted(filenames):
            if fn == 'MANIFEST.sha256':
                continue
            full = os.path.join(dirpath, fn)
            yield full, os.path.relpath(full, root).replace(os.sep, '/')


def cmd_checksum(root):
    lines = [f"{sha256(full)}  {rel}" for full, rel in walk(root)]
    out = os.path.join(root, 'MANIFEST.sha256')
    open(out, 'w').write('\n'.join(lines) + '\n')
    print(f"{len(lines)} files checksummed -> {out}")
    return 0


def cmd_check(manifest):
    # Paths in the manifest are relative to the tree that was checksummed, which is
    # not necessarily the folder the manifest sits in. Resolve against the manifest's
    # directory first, then walk up — so verification/MANIFEST.sha256 still works.
    here = os.path.dirname(os.path.abspath(manifest)) or '.'
    first = None
    for line in open(manifest):
        if line.strip():
            first = line.strip().split('  ', 1)[1]; break
    root = here
    if first:
        probe = here
        for _ in range(3):
            if os.path.exists(os.path.join(probe, first)):
                root = probe; break
            probe = os.path.dirname(probe) or '.'
    bad = missing = ok = 0
    for line in open(manifest):
        line = line.strip()
        if not line:
            continue
        want, rel = line.split('  ', 1)
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            print(f"MISSING  {rel}"); missing += 1; continue
        if sha256(path) != want:
            print(f"CHANGED  {rel}"); bad += 1
        else:
            ok += 1
    print(f"\n{ok} unchanged, {bad} changed, {missing} missing")
    return 1 if (bad or missing) else 0


# ---------------------------------------------------------------- comparison
def fetch(url):
    from urllib.request import urlopen, Request
    req = Request(url, headers={'User-Agent': 'MattaNutra-verify/1.0'})
    with urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')


def cmd_compare(mapfile):
    pairs = json.load(open(mapfile, encoding='utf-8'))
    root = os.path.dirname(os.path.abspath(mapfile)) or '.'
    failures = 0
    for ref, url in pairs.items():
        refpath = ref if os.path.isabs(ref) else os.path.join(root, ref)
        if not os.path.exists(refpath):
            print(f"SKIP     {ref} (reference not found)"); continue
        try:
            live = fetch(url)
        except Exception as e:
            print(f"FETCH ERR {url}: {e}"); failures += 1; continue

        a = reader_text(open(refpath, encoding="utf-8").read())
        b = reader_text(live)
        if a == b:
            print(f"PASS     {os.path.basename(ref)}")
            continue

        failures += 1
        print(f"\nDIFFER   {os.path.basename(ref)}  <->  {url}")
        sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
        shown = 0
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == 'equal' or shown >= 8:
                continue
            shown += 1
            ctx = 40
            print(f"   …{a[max(0,i1-ctx):i1]}")
            print(f"   REFERENCE: {a[i1:i2][:120]!r}")
            print(f"   DEPLOYED : {b[j1:j2][:120]!r}\n")
        if shown >= 8:
            print("   (further differences suppressed)")

    print(f"\n{len(pairs) - failures}/{len(pairs)} pages identical")
    if failures:
        print("\nA difference does NOT always mean corruption — a deliberate copy "
              "change will also show here. Confirm each one with a Thai reader "
              "before accepting it.")
    return 1 if failures else 0


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument('--checksum', metavar='DIR', help='write MANIFEST.sha256 for DIR')
    g.add_argument('--check',    metavar='MANIFEST', help='verify files against a manifest')
    g.add_argument('--compare',  metavar='MAP.json', help='compare deployed URLs to references')
    a = p.parse_args()
    if a.checksum: sys.exit(cmd_checksum(a.checksum))
    if a.check:    sys.exit(cmd_check(a.check))
    if a.compare:  sys.exit(cmd_compare(a.compare))


if __name__ == '__main__':
    main()
