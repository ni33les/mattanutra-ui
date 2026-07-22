Workstream 1 fixtures (Thai Landing + Library)
==============================================

Source of truth: files/ttf.zip (do not re-author Thai from memory).
Extract (gitignored): python3 scripts/extract-ttf-ws1.py --verify
  -> .cache/ttf-ws1/MattaNutra_TH_Localization_Handoff_2026-07-19/

AUTHORITATIVE.json  — freeze list + per-article image map (share + pose).
BASELINE.json       — product state before the WS1 port.

Rules:
- Thai copy is authoritative; never retype or machine-translate it.
- Respect i18n / RBAC / agents / tasks architecture (see plan).
- Images per article come from library-manifest.json shareImage + nongPose.

Step G: python3 scripts/verify-ttf-ws1-integrity.py  (offline Thai integrity)
